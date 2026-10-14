import { Router, type IRouter } from "express";
import { eq, ilike, and, inArray, or, SQL } from "drizzle-orm";
import {
  db,
  usersTable,
  bookingsTable,
  reviewsTable,
  waitlistTable,
  notificationsTable,
  sessionsTable,
  passwordResetRequestsTable,
  auditLogsTable,
} from "@workspace/db";
import {
  ListUsersQueryParams,
  CreateUserBody,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
  ToggleUserStatusParams,
} from "@workspace/api-zod";
import { hashPassword, logAudit, checkPasswordPolicy, deleteUserSessions, clientIp } from "../lib/auth";
import { requireAuth, requireRole, publicUser, type AuthenticatedRequest } from "../middlewares/auth";

const USERNAME_RE = /^[A-Za-z0-9_.\-\u0600-\u06FF]{3,50}$/;

const router: IRouter = Router();

const serializeUser = publicUser;

router.get("/users", requireAuth, requireRole("admin", "relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.user!.role === "relations_manager") {
    // Managers only need the list of active departments (e.g. to address notifications).
    const depts = await db.select().from(usersTable).where(and(eq(usersTable.role, "requesting_department"), eq(usersTable.isActive, true)));
    res.json(depts.map((u) => ({
      id: u.id, username: u.username, role: u.role, departmentName: u.departmentName, phoneNumber: u.phoneNumber,
      isActive: u.isActive, isPrimary: false, lastLogin: null, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString(),
    })));
    return;
  }
  const params = ListUsersQueryParams.safeParse(req.query);
  const conditions: SQL[] = [];
  if (params.success) {
    if (params.data.role) conditions.push(eq(usersTable.role, params.data.role as any));
    if (params.data.search) {
      const term = `%${params.data.search.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      conditions.push(or(ilike(usersTable.username, term), ilike(usersTable.departmentName, term))!);
    }
    if (params.data.active !== undefined) conditions.push(eq(usersTable.isActive, params.data.active));
  }
  const users = conditions.length
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);
  users.sort((a, b) => a.id - b.id);
  res.json(users.map(serializeUser));
});

router.post("/users", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const username = rest.username.trim();
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: "اسم المستخدم يجب أن يكون من 3 إلى 50 حرفاً (حروف وأرقام و . _ - فقط)" });
    return;
  }
  const policyError = await checkPasswordPolicy(password);
  if (policyError) {
    res.status(400).json({ error: policyError });
    return;
  }
  const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
  if (dup) {
    res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" });
    return;
  }
  const passwordHash = hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ ...rest, username, role: rest.role as any, passwordHash, mustChangePassword: true })
    .returning();
  await logAudit(req.user!.id, req.user!.username, "create_user", "user", user.id, `Created user: ${user.username}`, clientIp(req));
  res.status(201).json(serializeUser(user));
});

router.get("/users/:id", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user));
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.isPrimary && req.user!.id !== existing.id) {
    res.status(403).json({ error: "Cannot modify primary admin" });
    return;
  }
  const { password, ...rest } = parsed.data;
  if (existing.isPrimary && rest.role && rest.role !== "admin") {
    res.status(403).json({ error: "لا يمكن تغيير صلاحية مدير النظام الرئيسي" });
    return;
  }
  if (existing.id === req.user!.id && rest.isActive === false) {
    res.status(400).json({ error: "لا يمكنك تعطيل حسابك" });
    return;
  }
  if (rest.username !== undefined) {
    const username = rest.username.trim();
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({ error: "اسم المستخدم غير صالح" });
      return;
    }
    const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
    if (dup && dup.id !== existing.id) {
      res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" });
      return;
    }
    rest.username = username;
  }
  if (password) {
    const policyError = await checkPasswordPolicy(password);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      ...rest,
      role: (rest.role as any) ?? existing.role,
      ...(password
        ? { passwordHash: hashPassword(password), mustChangePassword: existing.id !== req.user!.id, failedLoginCount: 0, lockedUntil: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (password || rest.isActive === false || (rest.role && rest.role !== existing.role)) {
    await deleteUserSessions(updated.id, existing.id === req.user!.id ? req.token : undefined);
  }
  await logAudit(req.user!.id, req.user!.username, "update_user", "user", updated.id, password ? "password changed by admin" : undefined, clientIp(req));
  res.json(serializeUser(updated));
});

router.delete("/users/:id", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.isPrimary || existing.id === req.user!.id) {
    res.status(403).json({ error: "لا يمكن حذف مدير النظام الرئيسي أو حسابك الحالي" });
    return;
  }
  const userId = params.data.id;
  await db.transaction(async (tx) => {
    const ownedBookings = await tx
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(eq(bookingsTable.userId, userId));
    const ownedBookingIds = ownedBookings.map((b) => b.id);

    await tx.update(bookingsTable).set({ approvedBy: null }).where(eq(bookingsTable.approvedBy, userId));

    if (ownedBookingIds.length > 0) {
      await tx.delete(reviewsTable).where(inArray(reviewsTable.bookingId, ownedBookingIds));
      await tx.delete(waitlistTable).where(inArray(waitlistTable.bookingId, ownedBookingIds));
    }
    await tx.delete(reviewsTable).where(eq(reviewsTable.userId, userId));
    await tx.delete(waitlistTable).where(eq(waitlistTable.userId, userId));
    await tx.delete(bookingsTable).where(eq(bookingsTable.userId, userId));
    await tx.delete(notificationsTable).where(eq(notificationsTable.userId, userId));
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
    await tx.delete(passwordResetRequestsTable).where(eq(passwordResetRequestsTable.userId, userId));
    await tx.update(auditLogsTable).set({ userId: null }).where(eq(auditLogsTable.userId, userId));
    await tx.delete(usersTable).where(eq(usersTable.id, userId));
  });
  await logAudit(req.user!.id, req.user!.username, "delete_user", "user", userId, `Deleted user: ${existing.username}`, clientIp(req));
  res.sendStatus(204);
});

router.patch("/users/:id/toggle-status", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ToggleUserStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.isPrimary || existing.id === req.user!.id) {
    res.status(403).json({ error: "لا يمكن تعطيل مدير النظام الرئيسي أو حسابك الحالي" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ isActive: !existing.isActive, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!updated.isActive) await deleteUserSessions(updated.id);
  await logAudit(req.user!.id, req.user!.username, updated.isActive ? "activate_user" : "deactivate_user", "user", updated.id, undefined, clientIp(req));
  res.json(serializeUser(updated));
});

export default router;
