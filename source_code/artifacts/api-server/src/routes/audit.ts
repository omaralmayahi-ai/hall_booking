import { Router, type IRouter } from "express";
import { eq, and, gte, lte, SQL } from "drizzle-orm";
import { db, auditLogsTable, sessionsTable, usersTable } from "@workspace/db";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { count, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/audit/logs", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListAuditLogsQueryParams.safeParse(req.query);
  const conditions: SQL[] = [];
  let page = 1, limit = 50;
  if (params.success) {
    if (params.data.userId) conditions.push(eq(auditLogsTable.userId, params.data.userId));
    if (params.data.action) conditions.push(eq(auditLogsTable.action, params.data.action));
    if (params.data.from) conditions.push(gte(auditLogsTable.createdAt, new Date(params.data.from)));
    if (params.data.to) conditions.push(lte(auditLogsTable.createdAt, new Date(params.data.to)));
    if (params.data.page) page = params.data.page;
    if (params.data.limit) limit = params.data.limit;
  }
  const offset = (page - 1) * limit;
  const [{ total }] = conditions.length
    ? await db.select({ total: count() }).from(auditLogsTable).where(and(...conditions))
    : await db.select({ total: count() }).from(auditLogsTable);
  const data = conditions.length
    ? await db.select().from(auditLogsTable).where(and(...conditions)).orderBy(sql`${auditLogsTable.createdAt} DESC`).limit(limit).offset(offset)
    : await db.select().from(auditLogsTable).orderBy(sql`${auditLogsTable.createdAt} DESC`).limit(limit).offset(offset);
  res.json({
    data: data.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    total: Number(total),
    page,
    limit,
  });
});

router.get("/audit/sessions", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min
  const sessions = await db
    .select({ session: sessionsTable, user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(gte(sessionsTable.lastActivity, cutoff));
  // One row per user (most recent activity), sessions of disabled users excluded
  const latest = new Map<number, (typeof sessions)[number]>();
  for (const row of sessions) {
    if (!row.user.isActive) continue;
    const prev = latest.get(row.user.id);
    if (!prev || prev.session.lastActivity < row.session.lastActivity) latest.set(row.user.id, row);
  }
  res.json([...latest.values()].map(({ session, user }) => ({
    userId: user.id,
    username: user.username,
    role: user.role,
    departmentName: user.departmentName,
    lastLogin: session.lastActivity.toISOString(),
    ipAddress: session.ipAddress,
    isOnline: true,
  })));
});

export default router;
