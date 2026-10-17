import { Router, type IRouter } from "express";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db, bookingsTable, hallsTable, usersTable, reviewsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";
import { getOptions, saveOptions } from "../lib/options";
import { ARCHIVABLE, archiveAllEligible, archiveBookings, completeExpiredBookings, lastEndStamp, unarchiveBookings } from "../lib/archive";
import { serializeBooking } from "./bookings";

const router: IRouter = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

/** Search the archive. Filters: q, hallId, status, department, from, to (booking dates), limit, offset. */
router.get("/bookings/archive", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const conds: SQL[] = [sql`${bookingsTable.archivedAt} IS NOT NULL`];
  const isDept = req.user!.role === "requesting_department";
  if (isDept) conds.push(eq(bookingsTable.userId, req.user!.id));
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (q) {
    const like = `%${q}%`;
    const asId = Number(q.replace(/^#/, ""));
    conds.push(sql`(${bookingsTable.reason} ILIKE ${like} OR ${bookingsTable.activityType} ILIKE ${like} OR ${bookingsTable.manualDepartmentName} ILIKE ${like}
      OR ${usersTable.departmentName} ILIKE ${like} OR ${usersTable.username} ILIKE ${like} OR ${hallsTable.nameAr} ILIKE ${like} OR ${hallsTable.name} ILIKE ${like}
      OR ${bookingsTable.coordinatorName} ILIKE ${like}${Number.isInteger(asId) && asId > 0 ? sql` OR ${bookingsTable.id} = ${asId}` : sql``})`);
  }
  const hallId = Number(req.query.hallId);
  if (Number.isInteger(hallId) && hallId > 0) conds.push(eq(bookingsTable.hallId, hallId));
  const status = String(req.query.status ?? "");
  if (status === "cancelled") conds.push(sql`${bookingsTable.status} IN ('cancelled','emergency_cancelled')`);
  else if ((ARCHIVABLE as readonly string[]).includes(status)) conds.push(eq(bookingsTable.status, status as never));
  const dept = String(req.query.department ?? "").trim();
  if (dept && !isDept) conds.push(sql`COALESCE(NULLIF(${bookingsTable.manualDepartmentName}, ''), ${usersTable.departmentName}, ${usersTable.username}) = ${dept}`);
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (DATE_RE.test(from)) conds.push(sql`${lastEndStamp} >= ${from}`);
  if (DATE_RE.test(to)) conds.push(sql`${bookingsTable.startDate} <= ${to}`);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const base = db
    .select({ booking: bookingsTable, hall: hallsTable, user: usersTable, review: reviewsTable })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .leftJoin(reviewsTable, eq(reviewsTable.bookingId, bookingsTable.id))
    .where(and(...conds));
  const rows = await base.orderBy(sql`${bookingsTable.startDate} DESC, ${bookingsTable.startTime} DESC`).limit(limit).offset(offset);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(and(...conds));

  // Filter choices drawn from the whole archive (not just this page).
  const scope = isDept ? [sql`${bookingsTable.archivedAt} IS NOT NULL`, eq(bookingsTable.userId, req.user!.id)] : [sql`${bookingsTable.archivedAt} IS NOT NULL`];
  const facets = await db
    .selectDistinct({ hallId: hallsTable.id, hall: sql<string>`COALESCE(${hallsTable.nameAr}, ${hallsTable.name})`, dept: sql<string>`COALESCE(NULLIF(${bookingsTable.manualDepartmentName}, ''), ${usersTable.departmentName}, ${usersTable.username})` })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(and(...scope));

  res.json({
    total: n,
    limit,
    offset,
    items: rows.map(({ booking, hall, user, review }) => {
      const { passwordHash: _p, ...u } = (user ?? {}) as Record<string, unknown>;
      return serializeBooking({ ...booking, hall, user: u, review: review ? { ...review, createdAt: review.createdAt.toISOString() } : undefined });
    }),
    halls: Array.from(new Map(facets.filter((f) => f.hallId).map((f) => [f.hallId, { id: f.hallId, name: f.hall }])).values()).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    departments: isDept ? [] : Array.from(new Set(facets.map((f) => f.dept).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar")),
  });
});

/** How many active-list bookings could be archived right now (for the "archive all" button). */
router.get("/bookings/archive/summary", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await completeExpiredBookings();
  const conds: SQL[] = [sql`${bookingsTable.archivedAt} IS NULL`, sql`${bookingsTable.status} IN ('completed','cancelled','emergency_cancelled','rejected')`];
  if (req.user!.role === "requesting_department") conds.push(eq(bookingsTable.userId, req.user!.id));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bookingsTable).where(and(...conds));
  const archivedConds: SQL[] = [sql`${bookingsTable.archivedAt} IS NOT NULL`];
  if (req.user!.role === "requesting_department") archivedConds.push(eq(bookingsTable.userId, req.user!.id));
  const [{ a }] = await db.select({ a: sql<number>`count(*)::int` }).from(bookingsTable).where(and(...archivedConds));
  const o = await getOptions();
  res.json({ eligible: n, archived: a, autoArchiveDays: o.booking.autoArchiveDays });
});

/** Archive: { ids: [...] } or { all: true, olderThanDays?: N }. */
router.post("/bookings/archive", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await completeExpiredBookings();
  const by = { id: req.user!.id, role: req.user!.role };
  const n = req.body?.all === true
    ? await archiveAllEligible(by, Math.max(0, Number(req.body?.olderThanDays) || 0))
    : await archiveBookings(ids(req.body?.ids), by);
  await logAudit(req.user!.id, req.user!.username, "archive_bookings", "booking", undefined, `${n} booking(s)`, clientIp(req));
  res.json({ archived: n });
});

router.post("/bookings/unarchive", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const n = await unarchiveBookings(ids(req.body?.ids), { id: req.user!.id, role: req.user!.role });
  await logAudit(req.user!.id, req.user!.username, "unarchive_bookings", "booking", undefined, `${n} booking(s)`, clientIp(req));
  res.json({ restored: n });
});

/** Auto-archive setting is managed by the relations manager as well as the admin. */
router.put("/bookings/archive/settings", requireAuth, requireRole("admin", "relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const days = Math.min(3650, Math.max(0, Math.round(Number(req.body?.autoArchiveDays) || 0)));
  const saved = await saveOptions({ booking: { autoArchiveDays: days } });
  await logAudit(req.user!.id, req.user!.username, "update_settings", "auto_archive", undefined, String(days), clientIp(req));
  res.json({ autoArchiveDays: saved.booking.autoArchiveDays });
});

export default router;
