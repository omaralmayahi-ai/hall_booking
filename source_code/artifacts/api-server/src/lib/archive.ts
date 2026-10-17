import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db, bookingsTable, hallsTable, notificationsTable, reviewsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { getOptions } from "./options";
import { addDays, localDate, localStamp } from "./time";

/** Statuses that can be archived: the booking is over one way or another. */
export const ARCHIVABLE = ["completed", "cancelled", "emergency_cancelled", "rejected"] as const;

/** "YYYY-MM-DD HH:MM" of the very last occurrence (weekly repeats included). */
export const lastEndStamp = sql<string>`(CASE WHEN ${bookingsTable.isRecurring} THEN to_char(${bookingsTable.endDate}::date + (GREATEST(COALESCE(${bookingsTable.recurringWeeks}, 1), 1) - 1) * 7, 'YYYY-MM-DD') ELSE ${bookingsTable.endDate} END) || ' ' || substr(${bookingsTable.endTime}, 1, 5)`;

/** Approved bookings whose last occurrence has ended become "completed". */
export async function completeExpiredBookings(): Promise<void> {
  await db
    .update(bookingsTable)
    .set({ status: "completed", updatedAt: new Date() })
    .where(and(sql`${bookingsTable.status} IN ('approved', 'partially_approved')`, sql`${lastEndStamp} < ${localStamp()}`));
}

export function archivableCondition(): SQL {
  return and(isNull(bookingsTable.archivedAt), inArray(bookingsTable.status, [...ARCHIVABLE]))!;
}

/** Archive bookings by id (only archivable ones; departments only their own). Returns the count. */
export async function archiveBookings(ids: number[], by: { id: number; role: string }): Promise<number> {
  if (!ids.length) return 0;
  const conds: SQL[] = [inArray(bookingsTable.id, ids.slice(0, 5000)), archivableCondition()];
  if (by.role === "requesting_department") conds.push(eq(bookingsTable.userId, by.id));
  const rows = await db.update(bookingsTable).set({ archivedAt: new Date(), archivedBy: by.id }).where(and(...conds)).returning({ id: bookingsTable.id });
  return rows.length;
}

/** Archive every archivable booking (optionally only those that ended more than N days ago). */
export async function archiveAllEligible(by: { id: number | null; role: string }, olderThanDays = 0): Promise<number> {
  const conds: SQL[] = [archivableCondition()];
  if (by.role === "requesting_department" && by.id) conds.push(eq(bookingsTable.userId, by.id));
  if (olderThanDays > 0) conds.push(sql`${lastEndStamp} < ${addDays(localDate(), -olderThanDays) + " 00:00"}`);
  const rows = await db.update(bookingsTable).set({ archivedAt: new Date(), archivedBy: by.id }).where(and(...conds)).returning({ id: bookingsTable.id });
  return rows.length;
}

export async function unarchiveBookings(ids: number[], by: { id: number; role: string }): Promise<number> {
  if (!ids.length) return 0;
  const conds: SQL[] = [inArray(bookingsTable.id, ids.slice(0, 5000)), sql`${bookingsTable.archivedAt} IS NOT NULL`];
  if (by.role === "requesting_department") conds.push(eq(bookingsTable.userId, by.id));
  const rows = await db.update(bookingsTable).set({ archivedAt: null, archivedBy: null }).where(and(...conds)).returning({ id: bookingsTable.id });
  return rows.length;
}

/** Background: auto-archive after N days (options.booking.autoArchiveDays, 0 = off). */
export async function runAutoArchive(): Promise<number> {
  const o = await getOptions();
  const days = o.booking.autoArchiveDays;
  if (!days || days < 1) return 0;
  await completeExpiredBookings();
  const n = await archiveAllEligible({ id: null, role: "system" }, days);
  if (n) logger.info({ n, days }, "Bookings auto-archived");
  return n;
}

/** Background: invite the department to rate the hall once its booking has ended (once per booking). */
export async function runReviewInvites(): Promise<number> {
  await completeExpiredBookings();
  const rows = await db
    .select({ b: bookingsTable, hall: hallsTable, role: usersTable.role, reviewId: reviewsTable.id })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(hallsTable.id, bookingsTable.hallId))
    .leftJoin(usersTable, eq(usersTable.id, bookingsTable.userId))
    .leftJoin(reviewsTable, eq(reviewsTable.bookingId, bookingsTable.id))
    .where(and(eq(bookingsTable.status, "completed"), eq(bookingsTable.reviewPrompted, false)))
    .limit(200);
  let sent = 0;
  for (const { b, hall, role, reviewId } of rows) {
    // Only bookings a department made itself; direct bookings by the relations manager are not invited.
    if (role === "requesting_department" && !reviewId && !b.manualDepartmentName) {
      const hallName = hall?.nameAr || hall?.name || "القاعة";
      await db.insert(notificationsTable).values({
        userId: b.userId,
        title: "Rate the hall",
        titleAr: "قيّم القاعة",
        message: `Your booking at ${hallName} has ended. Please rate the hall.`,
        messageAr: `انتهى حجزكم في ${hallName}. يسعدنا تقييمكم للقاعة من صفحة «حجوزاتي».`,
        type: "system",
        relatedBookingId: b.id,
      });
      sent++;
    }
    await db.update(bookingsTable).set({ reviewPrompted: true }).where(eq(bookingsTable.id, b.id));
  }
  return sent;
}
