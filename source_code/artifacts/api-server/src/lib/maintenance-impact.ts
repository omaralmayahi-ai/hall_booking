import { and, eq, ne, sql } from "drizzle-orm";
import { db, bookingsTable, hallsTable, maintenanceNotesTable, notificationsTable, usersTable, hallAssetsTable } from "@workspace/db";
import { findConflict, findMaintenanceBlock, occurrences, slotsOverlap, type Slot } from "./booking-rules";
import { addDays, hhmm, localDate } from "./time";
import { getOptions } from "./options";

type Note = typeof maintenanceNotesTable.$inferSelect;
type Booking = typeof bookingsTable.$inferSelect;

/** The period during which a maintenance note makes the hall unusable. */
export async function blockWindow(note: Note): Promise<Slot> {
  if (note.blockStartDate) {
    return {
      startDate: note.blockStartDate,
      endDate: note.blockEndDate || note.blockStartDate,
      startTime: note.blockStartTime || "00:00",
      endTime: note.blockEndTime || "23:59",
    };
  }
  const days = (await getOptions()).maintenance.affectedWindowDays;
  const today = localDate();
  return { startDate: today, endDate: addDays(today, days), startTime: "00:00", endTime: "23:59" };
}

/** Active bookings of the hall that fall inside the maintenance window (future occurrences only). */
export async function findAffectedBookings(note: Note): Promise<Booking[]> {
  const window = await blockWindow(note);
  const today = localDate();
  const rows = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.hallId, note.hallId), sql`${bookingsTable.status} IN ('pending','approved','partially_approved')`));
  return rows.filter((b) => {
    const future = occurrences(b).some((o) => o.end >= today);
    return future && slotsOverlap(b, window);
  });
}

/** Other halls that are free for the whole booking (all occurrences) and big enough. */
export async function suggestAlternatives(booking: Booking, limit = 3) {
  const halls = await db
    .select()
    .from(hallsTable)
    .where(and(eq(hallsTable.status, "available"), ne(hallsTable.id, booking.hallId)));
  const need = booking.attendees ?? 0;
  const candidates = halls.filter((h) => h.capacity >= need).sort((a, b) => a.capacity - b.capacity);
  const out: { id: number; name: string; capacity: number; location: string }[] = [];
  for (const h of candidates) {
    const slot: Slot = booking;
    if (await findConflict(h.id, slot, booking.id)) continue;
    if (await findMaintenanceBlock(h.id, slot)) continue;
    out.push({ id: h.id, name: h.nameAr || h.name, capacity: h.capacity, location: h.locationAr || h.location });
    if (out.length >= limit) break;
  }
  return out;
}

function describeSlot(b: Booking) {
  const range = b.endDate !== b.startDate ? `${b.startDate} إلى ${b.endDate}` : b.startDate;
  return `${range} من الساعة ${hhmm(b.startTime)} إلى ${hhmm(b.endTime)}${b.isRecurring ? ` متكرر ${b.recurringWeeks} أسبوع` : ""}`;
}

/**
 * Tell the owners of affected bookings (and the relations managers) that the hall is under maintenance,
 * including up to three free alternative halls for each booking.
 */
export async function notifyAffected(note: Note, affected: Booking[]) {
  if (!affected.length) return [];
  const opts = await getOptions();
  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, note.hallId));
  const hallName = hall?.nameAr || hall?.name || "";
  const managers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "relations_manager"), eq(usersTable.isActive, true)));
  const report = [];
  for (const b of affected) {
    const alternatives = await suggestAlternatives(b);
    report.push({ bookingId: b.id, alternatives });
    if (!opts.notifications.notifyAffectedOnMaintenance) continue;
    const altText = alternatives.length
      ? ` القاعات البديلة المتاحة: ${alternatives.map((a) => `${a.name} (${a.capacity} شخص)`).join("، ")}.`
      : " لا توجد قاعة بديلة متاحة في نفس الموعد حالياً.";
    const isManagerBooking = managers.some((m) => m.id === b.userId);
    if (!isManagerBooking) {
      await db.insert(notificationsTable).values({
        userId: b.userId,
        title: "Hall maintenance affects your booking",
        titleAr: "صيانة في القاعة تؤثر على حجزك",
        message: `${hallName} is under maintenance during your booking ${describeSlot(b)}.`,
        messageAr: `ستكون ${hallName} تحت الصيانة خلال موعد حجزك ${describeSlot(b)}. سيتواصل معكم مدير العلاقات لنقل الحجز.${altText}`,
        type: "system",
        relatedBookingId: b.id,
      });
    }
  }
  if (managers.length) {
    await db.insert(notificationsTable).values(
      managers.map((m) => ({
        userId: m.id,
        title: "Bookings affected by maintenance",
        titleAr: "حجوزات متأثرة بالصيانة",
        message: `${affected.length} booking(s) in ${hallName} are affected by maintenance.`,
        messageAr: `يوجد ${affected.length} حجز في ${hallName} يتعارض مع أعمال الصيانة — راجع صفحة الصيانة لنقلها إلى قاعات بديلة.`,
        type: "system" as const,
      })),
    );
  }
  return report;
}

/** Switch the hall to "maintenance" (open-ended blocking notes only). Returns true when the status changed. */
export async function applyHallBlock(note: Note): Promise<boolean> {
  if (!note.blocksHall || note.blockStartDate || note.status === "resolved") return false;
  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, note.hallId));
  if (!hall) return false;
  if (hall.status === "available") {
    await db.update(hallsTable).set({ status: "maintenance", updatedAt: new Date() }).where(eq(hallsTable.id, hall.id));
    await db.update(maintenanceNotesTable).set({ hallStatusSet: true }).where(eq(maintenanceNotesTable.id, note.id));
    return true;
  }
  // Hall already held by another automatic block: share it, so the hall reopens only when all are resolved.
  // (A hall put in maintenance/disabled by hand is left alone.)
  const [held] = await db
    .select({ id: maintenanceNotesTable.id })
    .from(maintenanceNotesTable)
    .where(and(eq(maintenanceNotesTable.hallId, hall.id), eq(maintenanceNotesTable.hallStatusSet, true), sql`${maintenanceNotesTable.status} <> 'resolved'`));
  if (held && hall.status === "maintenance") {
    await db.update(maintenanceNotesTable).set({ hallStatusSet: true }).where(eq(maintenanceNotesTable.id, note.id));
  }
  return false;
}

/** Return the hall to "available" once no other open note holds it in maintenance. */
export async function releaseHallBlock(note: Note): Promise<boolean> {
  if (!note.hallStatusSet) return false;
  await db.update(maintenanceNotesTable).set({ hallStatusSet: false }).where(eq(maintenanceNotesTable.id, note.id));
  const others = await db
    .select({ id: maintenanceNotesTable.id })
    .from(maintenanceNotesTable)
    .where(
      and(
        eq(maintenanceNotesTable.hallId, note.hallId),
        eq(maintenanceNotesTable.hallStatusSet, true),
        ne(maintenanceNotesTable.id, note.id),
        sql`${maintenanceNotesTable.status} <> 'resolved'`,
      ),
    );
  if (others.length) return false;
  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, note.hallId));
  if (hall?.status !== "maintenance") return false;
  await db.update(hallsTable).set({ status: "available", updatedAt: new Date() }).where(eq(hallsTable.id, note.hallId));
  return true;
}

/** Keep the linked asset's condition in step with its maintenance notes. */
export async function syncAssetStatus(note: Note) {
  if (!note.assetId) return;
  if (note.status === "resolved") {
    const open = await db
      .select({ id: maintenanceNotesTable.id })
      .from(maintenanceNotesTable)
      .where(and(eq(maintenanceNotesTable.assetId, note.assetId), sql`${maintenanceNotesTable.status} <> 'resolved'`));
    if (!open.length) {
      await db
        .update(hallAssetsTable)
        .set({ status: "working", lastCheckedAt: localDate(), updatedAt: new Date() })
        .where(and(eq(hallAssetsTable.id, note.assetId), ne(hallAssetsTable.status, "retired")));
    }
  } else if (!note.scheduleId) {
    // A reported fault (not routine preventive work) means the item needs repair.
    await db
      .update(hallAssetsTable)
      .set({ status: note.priority === "urgent" ? "out_of_service" : "needs_repair", updatedAt: new Date() })
      .where(eq(hallAssetsTable.id, note.assetId));
  }
}
