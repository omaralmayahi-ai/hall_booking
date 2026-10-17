import { Router, type IRouter } from "express";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, notificationsTable, usersTable } from "@workspace/db";
import {
  ListNotificationsQueryParams,
  SendNotificationBody,
  MarkNotificationReadParams,
  DeleteNotificationParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";

const router: IRouter = Router();

function serializeNotification(n: typeof notificationsTable.$inferSelect) {
  return { ...n, createdAt: n.createdAt.toISOString() };
}

router.get("/notifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListNotificationsQueryParams.safeParse(req.query);
  const conditions = [eq(notificationsTable.userId, req.user!.id)];
  if (params.success && params.data.unread) {
    conditions.push(eq(notificationsTable.isRead, false));
  }
  const notifications = await db.select().from(notificationsTable).where(and(...conditions)).orderBy(desc(notificationsTable.createdAt)).limit(200);
  res.json(notifications.map(serializeNotification));
});

router.post("/notifications", requireAuth, requireRole("admin", "relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = SendNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { targetRole, targetUserId: rawTarget, ...notifData } = parsed.data;
  // Older clients sent `userId` instead of `targetUserId`.
  const targetUserId = rawTarget ?? (Number.isInteger(Number(req.body?.userId)) && Number(req.body?.userId) > 0 ? Number(req.body.userId) : undefined);
  const type = req.body?.type === "system" ? ("system" as const) : ("general" as const);
  const batchId = randomUUID();
  if (!notifData.title?.trim() || !notifData.message?.trim()) {
    res.status(400).json({ error: "يرجى إدخال عنوان ونص الإشعار" });
    return;
  }
  let recipients: number[] = [];
  if (targetUserId) {
    const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, targetUserId));
    if (!u) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    recipients = [u.id];
  } else if (targetRole && targetRole !== "all") {
    const users = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.role, targetRole as any), eq(usersTable.isActive, true)));
    recipients = users.map(u => u.id);
  } else {
    const users = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isActive, true));
    recipients = users.map(u => u.id);
  }
  const clip = (v: string | null | undefined, n: number) => (v == null ? v : v.slice(0, n));
  if (recipients.length) {
    await db.insert(notificationsTable).values(recipients.map((userId) => ({
      ...notifData,
      title: clip(notifData.title, 200)!,
      titleAr: clip(notifData.titleAr, 200),
      message: clip(notifData.message, 2000)!,
      messageAr: clip(notifData.messageAr, 2000),
      userId,
      type,
      batchId,
      sentBy: req.user!.id,
    })));
  }
  await logAudit(req.user!.id, req.user!.username, "send_notification", "notification", undefined, `${recipients.length} recipients`, clientIp(req));
  res.status(201).json({ sent: recipients.length });
});

/** History of manually sent notifications with delivery / read counts. */
router.get("/notifications/sent", requireAuth, requireRole("admin", "relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db
    .select({
      batchId: notificationsTable.batchId,
      title: sql<string>`max(${notificationsTable.titleAr})`,
      message: sql<string>`max(${notificationsTable.messageAr})`,
      type: sql<string>`max(${notificationsTable.type}::text)`,
      sentBy: sql<number>`max(${notificationsTable.sentBy})`,
      createdAt: sql<string>`min(${notificationsTable.createdAt})`,
      recipients: sql<number>`count(*)::int`,
      read: sql<number>`count(*) filter (where ${notificationsTable.isRead})::int`,
    })
    .from(notificationsTable)
    .where(isNotNull(notificationsTable.batchId))
    .groupBy(notificationsTable.batchId)
    .orderBy(sql`min(${notificationsTable.createdAt}) desc`)
    .limit(50);
  const senders = await db.select({ id: usersTable.id, username: usersTable.username, departmentName: usersTable.departmentName }).from(usersTable);
  res.json(
    rows.map((r) => {
      const s = senders.find((u) => u.id === Number(r.sentBy));
      const raw = r.createdAt as unknown;
      const at = raw instanceof Date ? raw : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(raw)) ? String(raw) : `${String(raw).replace(" ", "T")}Z`);
      return { ...r, createdAt: at.toISOString(), sender: s?.departmentName || s?.username || "" };
    }),
  );
});

router.patch("/notifications/:id/read", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db.update(notificationsTable).set({ isRead: true }).where(
    and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, req.user!.id))
  ).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeNotification(updated));
});

router.patch("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, req.user!.id));
  res.json({ success: true });
});

/** Delete every notification the user has already read. */
router.post("/notifications/clear-read", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const deleted = await db.delete(notificationsTable).where(
    and(eq(notificationsTable.userId, req.user!.id), eq(notificationsTable.isRead, true))
  ).returning({ id: notificationsTable.id });
  res.json({ deleted: deleted.length });
});

router.delete("/notifications/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteNotificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(notificationsTable).where(
    and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, req.user!.id))
  ).returning();
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

export default router;
