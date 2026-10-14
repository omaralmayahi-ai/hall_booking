import { and, eq, sql } from "drizzle-orm";
import {
  db,
  bookingsTable,
  hallsTable,
  maintenanceNotesTable,
  maintenanceSchedulesTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";
import { getOptions } from "./options";
import { occurrences } from "./booking-rules";
import { addDays, hhmm, localDate } from "./time";
import { activityLabel } from "./reports";
import { applyHallBlock, findAffectedBookings, notifyAffected } from "./maintenance-impact";

const VALID_CATEGORIES = ["electrical", "plumbing", "hvac", "furniture", "technology", "cleaning", "structural", "other"];

/** Create the maintenance task of every preventive schedule that is due (within its lead time) and roll it forward. */
export async function runScheduledMaintenance(): Promise<number> {
  const today = localDate();
  const schedules = await db.select().from(maintenanceSchedulesTable).where(eq(maintenanceSchedulesTable.isActive, true));
  let created = 0;
  for (const s of schedules) {
    let due = s.nextDueDate;
    let guard = 0;
    // Skip occurrences that are already in the past (server was off) — only the next upcoming one is created.
    while (due < today && guard++ < 1000) due = addDays(due, s.intervalDays);
    if (addDays(due, -s.leadDays) > today) {
      if (due !== s.nextDueDate) await db.update(maintenanceSchedulesTable).set({ nextDueDate: due }).where(eq(maintenanceSchedulesTable.id, s.id));
      continue;
    }
    const [exists] = await db
      .select({ id: maintenanceNotesTable.id })
      .from(maintenanceNotesTable)
      .where(and(eq(maintenanceNotesTable.scheduleId, s.id), eq(maintenanceNotesTable.blockStartDate, due)));
    if (!exists) {
      const [note] = await db
        .insert(maintenanceNotesTable)
        .values({
          hallId: s.hallId,
          assetId: s.assetId,
          scheduleId: s.id,
          title: s.title,
          category: (VALID_CATEGORIES.includes(s.category) ? s.category : "other") as any,
          priority: "medium",
          description: s.notes?.trim() || `صيانة دورية: ${s.title}`,
          scheduledDate: new Date(`${due}T${s.blockStartTime || "08:00"}:00`),
          blocksHall: s.blocksHall,
          blockStartDate: due,
          blockEndDate: due,
          blockStartTime: s.blockStartTime,
          blockEndTime: s.blockEndTime,
        })
        .returning();
      created++;
      if (note.blocksHall) {
        await applyHallBlock(note);
        await notifyAffected(note, await findAffectedBookings(note));
      }
    }
    await db
      .update(maintenanceSchedulesTable)
      .set({ nextDueDate: addDays(due, s.intervalDays), updatedAt: new Date() })
      .where(eq(maintenanceSchedulesTable.id, s.id));
  }
  if (created) logger.info({ created }, "Preventive maintenance tasks created");
  return created;
}

/** Remind booking owners (and managers, when preparation is needed) ahead of each upcoming occurrence. */
export async function runBookingReminders(): Promise<number> {
  const opts = await getOptions();
  if (!opts.notifications.reminderEnabled) return 0;
  const now = new Date();
  const horizon = new Date(now.getTime() + opts.notifications.reminderHoursBefore * 3_600_000);
  const today = localDate(now);
  const lastDay = localDate(horizon);
  const rows = await db
    .select({ booking: bookingsTable, hall: hallsTable })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .where(
      and(
        sql`${bookingsTable.status} IN ('approved','partially_approved')`,
        sql`(${bookingsTable.isRecurring} = true OR (${bookingsTable.startDate} <= ${lastDay} AND ${bookingsTable.endDate} >= ${today}))`,
      ),
    );
  const managers = opts.notifications.remindManagersForPreparation
    ? await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.role, "relations_manager"), eq(usersTable.isActive, true)))
    : [];
  let sent = 0;
  for (const { booking: b, hall } of rows) {
    const occ = occurrences(b).find((o) => {
      const startAt = new Date(`${o.start}T${hhmm(b.startTime)}:00`);
      return startAt > now && startAt <= horizon;
    });
    if (!occ || b.reminderSentFor === occ.start) continue;
    const hallName = hall?.nameAr || hall?.name || "";
    const when = `${occ.start} الساعة ${hhmm(b.startTime)}`;
    await db.insert(notificationsTable).values({
      userId: b.userId,
      title: "Booking reminder",
      titleAr: "تذكير بموعد حجز",
      message: `Reminder: ${hallName} on ${occ.start} at ${hhmm(b.startTime)}`,
      messageAr: `تذكير: لديكم حجز في ${hallName} بتاريخ ${when} (${activityLabel(b.activityType)}).`,
      type: "system",
      relatedBookingId: b.id,
    });
    const prep: string[] = [];
    if (b.needsCatering && b.cateringApproved !== false) prep.push("ضيافة");
    if (b.needsMeals && b.mealsApproved !== false) prep.push("وجبات");
    if (b.seatingLayout) prep.push(`ترتيب ${b.seatingLayout}`);
    if (b.requestedItems?.length) prep.push(b.requestedItems.join("، "));
    const toManagers = managers.filter((m) => m.id !== b.userId);
    if (prep.length && toManagers.length) {
      await db.insert(notificationsTable).values(
        toManagers.map((m) => ({
          userId: m.id,
          title: "Hall preparation reminder",
          titleAr: "تذكير بتجهيز قاعة",
          message: `Prepare ${hallName} for ${occ.start}`,
          messageAr: `يرجى تجهيز ${hallName} بتاريخ ${when}: ${prep.join(" — ")}.`,
          type: "system" as const,
          relatedBookingId: b.id,
        })),
      );
    }
    await db.update(bookingsTable).set({ reminderSentFor: occ.start }).where(eq(bookingsTable.id, b.id));
    sent++;
  }
  if (sent) logger.info({ sent }, "Booking reminders sent");
  return sent;
}

let timer: NodeJS.Timeout | null = null;

export function startBackgroundJobs(): void {
  const tick = () => {
    runScheduledMaintenance().catch((err) => logger.error({ err }, "Preventive maintenance job failed"));
    runBookingReminders().catch((err) => logger.error({ err }, "Booking reminder job failed"));
  };
  setTimeout(tick, 5_000);
  timer = setInterval(tick, 10 * 60 * 1000);
  timer.unref?.();
}
