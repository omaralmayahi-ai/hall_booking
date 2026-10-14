import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, passwordResetRequestsTable } from "@workspace/db";
import {
  LoginBody,
  ChangePasswordBody,
  CreatePasswordResetRequestBody,
  ResolvePasswordResetRequestBody,
  ResolvePasswordResetRequestParams,
} from "@workspace/api-zod";
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  deleteUserSessions,
  logAudit,
  clientIp,
  checkPasswordPolicy,
  registerFailedLogin,
  LOCKOUT_MINUTES,
} from "../lib/auth";
import { requireAuth, requireRole, publicUser, type AuthenticatedRequest } from "../middlewares/auth";
import { loginLimiter, resetRequestLimiter } from "../middlewares/security";

const router: IRouter = Router();

// Constant-cost dummy hash so unknown usernames take as long as known ones.
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الدخول غير مكتملة" });
    return;
  }
  const username = parsed.data.username.trim();
  const { password } = parsed.data;
  const ip = clientIp(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user) {
    verifyPassword(password, DUMMY_HASH);
    await logAudit(null, username.slice(0, 64), "login_failed", "user", undefined, "unknown username", ip);
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    res.status(423).json({ error: `تم قفل الحساب مؤقتاً بسبب محاولات دخول فاشلة متكررة. حاول بعد ${minutes} دقيقة` });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    const locked = await registerFailedLogin(user.id, user.failedLoginCount);
    await logAudit(user.id, user.username, locked ? "account_locked" : "login_failed", "user", user.id, undefined, ip);
    res.status(locked ? 423 : 401).json({
      error: locked
        ? `تم قفل الحساب لمدة ${LOCKOUT_MINUTES} دقيقة بسبب محاولات دخول فاشلة متكررة`
        : "اسم المستخدم أو كلمة المرور غير صحيحة",
    });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "الحساب معطّل، يرجى مراجعة مدير النظام" });
    return;
  }
  // Legacy / weak passwords: let the user in, but force them to choose a compliant password.
  const weak = (await checkPasswordPolicy(password)) !== null;
  const token = await createSession(user.id, ip);
  const [updated] = await db
    .update(usersTable)
    .set({
      lastLogin: new Date(),
      lastLoginIp: ip,
      failedLoginCount: 0,
      lockedUntil: null,
      ...(weak ? { mustChangePassword: true } : {}),
    })
    .where(eq(usersTable.id, user.id))
    .returning();
  await logAudit(user.id, user.username, "login", "user", user.id, undefined, ip);
  res.json({ user: publicUser(updated), token });
});

router.post("/auth/logout", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.token) await deleteSession(req.token);
  await logAudit(req.user!.id, req.user!.username, "logout", "user", req.user!.id, undefined, clientIp(req));
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  res.json(publicUser(req.user!));
});

router.post("/auth/change-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير مكتملة" });
    return;
  }
  const user = req.user!;
  if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تختلف عن الحالية" });
    return;
  }
  const policyError = await checkPasswordPolicy(parsed.data.newPassword);
  if (policyError) {
    res.status(400).json({ error: policyError });
    return;
  }
  await db
    .update(usersTable)
    .set({
      passwordHash: hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));
  // Sign out every other device
  await deleteUserSessions(user.id, req.token);
  await logAudit(user.id, user.username, "change_password", "user", user.id, undefined, clientIp(req));
  res.json({ success: true });
});

router.get("/auth/password-reset-requests", requireAuth, requireRole("admin"), async (_req: AuthenticatedRequest, res): Promise<void> => {
  const requests = await db
    .select({
      id: passwordResetRequestsTable.id,
      userId: passwordResetRequestsTable.userId,
      username: usersTable.username,
      departmentName: usersTable.departmentName,
      reason: passwordResetRequestsTable.reason,
      status: passwordResetRequestsTable.status,
      createdAt: passwordResetRequestsTable.createdAt,
      resolvedAt: passwordResetRequestsTable.resolvedAt,
    })
    .from(passwordResetRequestsTable)
    .innerJoin(usersTable, eq(passwordResetRequestsTable.userId, usersTable.id))
    .orderBy(passwordResetRequestsTable.createdAt);
  res.json(
    requests.map((r) => ({
      ...r,
      newPassword: null, // never returned — passwords are not stored
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    })),
  );
});

router.post("/auth/password-reset-requests", resetRequestLimiter, async (req, res): Promise<void> => {
  const parsed = CreatePasswordResetRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "يرجى إدخال اسم المستخدم" });
    return;
  }
  // Generic response either way — avoids revealing which usernames exist.
  const generic = { success: true, message: "تم إرسال الطلب إلى مدير النظام، سيتم التواصل معك" };
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, parsed.data.username.trim()));
  if (!user || !user.isActive) {
    res.status(201).json(generic);
    return;
  }
  const pending = await db
    .select({ id: passwordResetRequestsTable.id, status: passwordResetRequestsTable.status })
    .from(passwordResetRequestsTable)
    .where(eq(passwordResetRequestsTable.userId, user.id));
  if (!pending.some((p) => p.status === "pending")) {
    await db.insert(passwordResetRequestsTable).values({ userId: user.id, reason: parsed.data.reason?.slice(0, 500) });
    await logAudit(user.id, user.username, "password_reset_requested", "user", user.id, undefined, clientIp(req));
  }
  res.status(201).json(generic);
});

router.patch(
  "/auth/password-reset-requests/:id/resolve",
  requireAuth,
  requireRole("admin"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const params = ResolvePasswordResetRequestParams.safeParse(req.params);
    const parsed = ResolvePasswordResetRequestBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "بيانات غير صالحة" });
      return;
    }
    const [prr] = await db.select().from(passwordResetRequestsTable).where(eq(passwordResetRequestsTable.id, params.data.id));
    if (!prr) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    if (prr.status !== "pending") {
      res.status(409).json({ error: "تمت معالجة هذا الطلب مسبقاً" });
      return;
    }
    const policyError = await checkPasswordPolicy(parsed.data.newPassword);
    if (policyError) {
      res.status(400).json({ error: policyError });
      return;
    }
    await db
      .update(usersTable)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        mustChangePassword: true, // user must choose their own password on next login
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, prr.userId));
    await deleteUserSessions(prr.userId);
    const [updated] = await db
      .update(passwordResetRequestsTable)
      .set({ status: "resolved", newPassword: null, resolvedAt: new Date() })
      .where(eq(passwordResetRequestsTable.id, params.data.id))
      .returning();
    await logAudit(req.user!.id, req.user!.username, "password_reset_resolved", "user", prr.userId, undefined, clientIp(req));
    res.json({
      ...updated,
      newPassword: null,
      createdAt: updated.createdAt.toISOString(),
      resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
    });
  },
);

export default router;
