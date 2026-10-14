import { Router, type IRouter } from "express";
import { eq, count, avg, sql } from "drizzle-orm";
import { db, bookingsTable, hallsTable, usersTable, reviewsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { completeExpiredBookings } from "./bookings";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await completeExpiredBookings();
  const [totalBookings] = await db.select({ count: count() }).from(bookingsTable);
  const [pending] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending"));
  const [approved] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "approved"));
  const [rejected] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "rejected"));
  const [cancelled] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "cancelled"));
  const [completed] = await db.select({ count: count() }).from(bookingsTable).where(eq(bookingsTable.status, "completed"));
  const [totalHalls] = await db.select({ count: count() }).from(hallsTable);
  const [available] = await db.select({ count: count() }).from(hallsTable).where(eq(hallsTable.status, "available"));
  const [maintenance] = await db.select({ count: count() }).from(hallsTable).where(eq(hallsTable.status, "maintenance"));
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [{ avgHours }] = await db
    .select({ avgHours: sql<string | null>`avg(extract(epoch from (${bookingsTable.updatedAt} - ${bookingsTable.createdAt})) / 3600)` })
    .from(bookingsTable)
    .where(sql`${bookingsTable.status} <> 'pending'`);
  res.json({
    totalBookings: Number(totalBookings.count),
    pendingBookings: Number(pending.count),
    approvedBookings: Number(approved.count),
    rejectedBookings: Number(rejected.count),
    cancelledBookings: Number(cancelled.count),
    completedBookings: Number(completed.count),
    totalHalls: Number(totalHalls.count),
    availableHalls: Number(available.count),
    maintenanceHalls: Number(maintenance.count),
    totalUsers: Number(totalUsers.count),
    avgResponseHours: avgHours !== null ? Number(avgHours) : null,
  });
});

router.get("/dashboard/top-halls", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const limit = Number(req.query.limit) || 5;
  const result = await db
    .select({
      hallId: bookingsTable.hallId,
      hallName: hallsTable.name,
      bookingCount: count(bookingsTable.id),
    })
    .from(bookingsTable)
    .innerJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .groupBy(bookingsTable.hallId, hallsTable.name)
    .orderBy(sql`count(${bookingsTable.id}) DESC`)
    .limit(limit);
  res.json(result.map(r => ({
    ...r,
    bookingCount: Number(r.bookingCount),
    utilizationRate: Math.min(100, (Number(r.bookingCount) / 30) * 100),
  })));
});

router.get("/dashboard/top-departments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const limit = Number(req.query.limit) || 5;
  const result = await db
    .select({
      userId: bookingsTable.userId,
      departmentName: usersTable.departmentName,
      bookingCount: count(bookingsTable.id),
    })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(eq(usersTable.role, "requesting_department"))
    .groupBy(bookingsTable.userId, usersTable.departmentName)
    .orderBy(sql`count(${bookingsTable.id}) DESC`)
    .limit(limit);
  res.json(result.map(r => ({
    userId: r.userId,
    departmentName: r.departmentName ?? "Unknown",
    bookingCount: Number(r.bookingCount),
  })));
});

router.get("/dashboard/bookings-by-activity", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const result = await db
    .select({ activityType: bookingsTable.activityType, count: count() })
    .from(bookingsTable)
    .groupBy(bookingsTable.activityType)
    .orderBy(sql`count(*) DESC`);
  res.json(result.map(r => ({ activityType: r.activityType, count: Number(r.count) })));
});

router.get("/dashboard/utilization", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const halls = await db.select().from(hallsTable);
  const result = [];
  for (const hall of halls) {
    const [{ bookedDays }] = await db
      .select({ bookedDays: count() })
      .from(bookingsTable)
      .where(
        sql`${bookingsTable.hallId} = ${hall.id} AND ${bookingsTable.status} NOT IN ('rejected', 'cancelled', 'emergency_cancelled')`
      );
    const totalDays = 30;
    result.push({
      hallId: hall.id,
      hallName: hall.name,
      utilizationRate: Math.min(100, Math.round((Number(bookedDays) / totalDays) * 100)),
      totalDays,
      bookedDays: Number(bookedDays),
    });
  }
  res.json(result);
});

router.get("/dashboard/pending-requests", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [{ pendingCount }] = await db.select({ pendingCount: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending"));
  res.json({ pendingCount: Number(pendingCount), avgWaitHours: null, overdueCount: 0 });
});

export default router;
