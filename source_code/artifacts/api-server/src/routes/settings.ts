import { Router, type IRouter } from "express";
import { eq, inArray, ne } from "drizzle-orm";
import {
  db,
  platformSettingsTable,
  holidaysTable,
  usersTable,
  bookingsTable,
  waitlistTable,
  reviewsTable,
  notificationsTable,
  sessionsTable,
  passwordResetRequestsTable,
  auditLogsTable,
  maintenanceNotesTable,
  hallsTable,
  hallAssetsTable,
  maintenanceSchedulesTable,
} from "@workspace/db";
import {
  UpdateSettingsBody,
  CreateHolidayBody,
  DeleteHolidayParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";
import { isValidDate, isValidTime } from "../lib/time";
import { getOptions, saveOptions, invalidateOptionsCache } from "../lib/options";
import { syncScheduleState } from "../lib/backups";
import { saveCustomIcon, resetIcon, hasCustomIcon, iconVersion } from "../lib/branding";

const router: IRouter = Router();

/* Backups before a reset are optional now: the client offers one (routes/backups.ts). */

async function deleteBookingsCascade(bookingIds: number[]): Promise<{ bookings: number; reviews: number; waitlist: number }> {
  if (bookingIds.length === 0) return { bookings: 0, reviews: 0, waitlist: 0 };
  const deletedReviews = await db.delete(reviewsTable).where(inArray(reviewsTable.bookingId, bookingIds)).returning({ id: reviewsTable.id });
  const deletedWaitlist = await db.delete(waitlistTable).where(inArray(waitlistTable.bookingId, bookingIds)).returning({ id: waitlistTable.id });
  const deletedBookings = await db.delete(bookingsTable).where(inArray(bookingsTable.id, bookingIds)).returning({ id: bookingsTable.id });
  return { bookings: deletedBookings.length, reviews: deletedReviews.length, waitlist: deletedWaitlist.length };
}

async function deleteAccountsCascade(userIds: number[]): Promise<Record<string, number>> {
  if (userIds.length === 0) {
    return { users: 0, bookings: 0, reviews: 0, waitlist: 0, notifications: 0, sessions: 0, passwordResetRequests: 0 };
  }
  const userBookings = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(inArray(bookingsTable.userId, userIds));
  const bookingIds = userBookings.map(b => b.id);
  const bookingCascade = await deleteBookingsCascade(bookingIds);
  // Disassociate remaining rows that reference these users via nullable FKs
  // before deleting the users, to avoid FK violations.
  await db.update(bookingsTable).set({ approvedBy: null }).where(inArray(bookingsTable.approvedBy, userIds));
  await db.update(auditLogsTable).set({ userId: null }).where(inArray(auditLogsTable.userId, userIds));
  const deletedReviewsByUser = await db.delete(reviewsTable).where(inArray(reviewsTable.userId, userIds)).returning({ id: reviewsTable.id });
  const deletedWaitlistByUser = await db.delete(waitlistTable).where(inArray(waitlistTable.userId, userIds)).returning({ id: waitlistTable.id });
  const deletedNotifications = await db.delete(notificationsTable).where(inArray(notificationsTable.userId, userIds)).returning({ id: notificationsTable.id });
  const deletedSessions = await db.delete(sessionsTable).where(inArray(sessionsTable.userId, userIds)).returning({ id: sessionsTable.id });
  const deletedPasswordResets = await db.delete(passwordResetRequestsTable).where(inArray(passwordResetRequestsTable.userId, userIds)).returning({ id: passwordResetRequestsTable.id });
  const deletedUsers = await db.delete(usersTable).where(inArray(usersTable.id, userIds)).returning({ id: usersTable.id });
  return {
    users: deletedUsers.length,
    bookings: bookingCascade.bookings,
    reviews: deletedReviewsByUser.length + bookingCascade.reviews,
    waitlist: deletedWaitlistByUser.length + bookingCascade.waitlist,
    notifications: deletedNotifications.length,
    sessions: deletedSessions.length,
    passwordResetRequests: deletedPasswordResets.length,
  };
}

async function getOrCreateSettings() {
  const [settings] = await db.select().from(platformSettingsTable);
  if (settings) return settings;
  const [created] = await db.insert(platformSettingsTable).values({}).returning();
  return created;
}

router.get("/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({ ...settings, updatedAt: settings.updatedAt.toISOString() });
});

router.patch("/settings", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  if ((d.workingHoursStart && !isValidTime(d.workingHoursStart)) || (d.workingHoursEnd && !isValidTime(d.workingHoursEnd))) {
    res.status(400).json({ error: "صيغة ساعات الدوام غير صحيحة" });
    return;
  }
  if (d.workingHoursStart && d.workingHoursEnd && d.workingHoursEnd <= d.workingHoursStart) {
    res.status(400).json({ error: "نهاية الدوام يجب أن تكون بعد بدايته" });
    return;
  }
  if (d.passwordMinLength !== undefined && (d.passwordMinLength < 6 || d.passwordMinLength > 64)) {
    res.status(400).json({ error: "الحد الأدنى لطول كلمة المرور يجب أن يكون بين 6 و 64" });
    return;
  }
  if (d.logoUrl && !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(d.logoUrl) && !/^\/[\w\-./]+$/.test(d.logoUrl)) {
    res.status(400).json({ error: "صيغة الشعار غير مدعومة (PNG / JPG / WEBP / GIF)" });
    return;
  }
  const settings = await getOrCreateSettings();
  await logAudit(req.user!.id, req.user!.username, "update_settings", "settings", settings.id, undefined, clientIp(req));
  const [updated] = await db.update(platformSettingsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(platformSettingsTable.id, settings.id)).returning();
  res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
});

/** Advanced options (identity, appearance defaults, booking rules, reminders, display, print). */
router.get("/settings/options", requireAuth, requireRole("admin", "relations_manager"), async (_req, res): Promise<void> => {
  res.json({ ...(await getOptions()), icon: { custom: hasCustomIcon(), version: iconVersion() } });
});

router.put("/settings/options", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const saved = await saveOptions(req.body);
  syncScheduleState(saved.backup);
  await logAudit(req.user!.id, req.user!.username, "update_settings", "settings_options", undefined, Object.keys(req.body ?? {}).join(","), clientIp(req));
  res.json({ ...saved, icon: { custom: hasCustomIcon(), version: iconVersion() } });
});

router.put("/settings/icon", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const error = saveCustomIcon(req.body ?? {});
  if (error) {
    res.status(400).json({ error });
    return;
  }
  await logAudit(req.user!.id, req.user!.username, "update_settings", "platform_icon", undefined, "custom", clientIp(req));
  res.json({ custom: true, version: iconVersion() });
});

router.delete("/settings/icon", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  resetIcon();
  await logAudit(req.user!.id, req.user!.username, "update_settings", "platform_icon", undefined, "default", clientIp(req));
  res.json({ custom: false, version: iconVersion() });
});

router.get("/settings/holidays", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const holidays = await db.select().from(holidaysTable).orderBy(holidaysTable.date);
  res.json(holidays.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
});

router.post("/settings/holidays", requireAuth, requireRole("relations_manager", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateHolidayBody.safeParse(req.body);
  if (!parsed.success || !isValidDate(parsed.data.date)) {
    res.status(400).json({ error: "بيانات العطلة غير صالحة" });
    return;
  }
  const [holiday] = await db.insert(holidaysTable).values(parsed.data).returning();
  res.status(201).json({ ...holiday, createdAt: holiday.createdAt.toISOString() });
});

router.delete("/settings/holidays/:id", requireAuth, requireRole("relations_manager", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteHolidayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(holidaysTable).where(eq(holidaysTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/settings/factory-reset/notifications", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const deleted = await db.delete(notificationsTable).returning({ id: notificationsTable.id });
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "notifications", undefined, `Deleted ${deleted.length} notifications`, clientIp(req));
  res.json({ message: "تم ضبط مصنع الإشعارات بنجاح", deletedCounts: { notifications: deleted.length } });
});

router.post("/settings/factory-reset/reviews", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const deleted = await db.delete(reviewsTable).returning({ id: reviewsTable.id });
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "reviews", undefined, `Deleted ${deleted.length} reviews`, clientIp(req));
  res.json({ message: "تم ضبط مصنع التقييمات بنجاح", deletedCounts: { reviews: deleted.length } });
});

router.post("/settings/factory-reset/audit-log", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const deleted = await db.delete(auditLogsTable).returning({ id: auditLogsTable.id });
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "audit_log", undefined, `Deleted ${deleted.length} audit log entries`, clientIp(req));
  res.json({ message: "تم ضبط مصنع سجل الأحداث بنجاح", deletedCounts: { auditLogs: deleted.length } });
});

router.post("/settings/factory-reset/bookings", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const allBookings = await db.select({ id: bookingsTable.id }).from(bookingsTable);
  const counts = await deleteBookingsCascade(allBookings.map(b => b.id));
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "bookings", undefined, `Deleted ${counts.bookings} bookings`, clientIp(req));
  res.json({ message: "تم ضبط مصنع الطلبات بنجاح", deletedCounts: counts });
});

router.post("/settings/factory-reset/completed-bookings", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const completedBookings = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.status, "completed"));
  const counts = await deleteBookingsCascade(completedBookings.map(b => b.id));
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "completed_bookings", undefined, `Deleted ${counts.bookings} completed bookings`, clientIp(req));
  res.json({ message: "تم ضبط مصنع الحجوزات المكتملة بنجاح", deletedCounts: counts });
});

router.post("/settings/factory-reset/accounts", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const nonPrimaryUsers = await db.select({ id: usersTable.id }).from(usersTable).where(ne(usersTable.isPrimary, true));
  const counts = await deleteAccountsCascade(nonPrimaryUsers.map(u => u.id));
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "accounts", undefined, `Deleted ${counts.users} accounts`, clientIp(req));
  res.json({ message: "تم ضبط مصنع الحسابات بنجاح", deletedCounts: counts });
});

router.post("/settings/factory-reset/full", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const nonPrimaryUsers = await db.select({ id: usersTable.id }).from(usersTable).where(ne(usersTable.isPrimary, true));
  const accountCounts = await deleteAccountsCascade(nonPrimaryUsers.map(u => u.id));
  const deletedMaintenance = await db.delete(maintenanceNotesTable).returning({ id: maintenanceNotesTable.id });
  await db.delete(maintenanceSchedulesTable);
  const deletedAssets = await db.delete(hallAssetsTable).returning({ id: hallAssetsTable.id });
  const deletedAuditLogs = await db.delete(auditLogsTable).returning({ id: auditLogsTable.id });
  const deletedHalls = await db.delete(hallsTable).returning({ id: hallsTable.id });
  const deletedHolidays = await db.delete(holidaysTable).returning({ id: holidaysTable.id });
  const settings = await getOrCreateSettings();
  await db
    .update(platformSettingsTable)
    .set({
      companyName: "Hall Booking Platform",
      companyNameAr: "منصة حجز القاعات",
      logoUrl: null,
      footerText: null,
      footerTextAr: null,
      primaryColor: "#1e40af",
      defaultLanguage: "ar",
      workingHoursStart: "07:00",
      workingHoursEnd: "15:00",
      passwordMinLength: 6,
      passwordRequireSpecial: false,
      passwordExpiryDays: null,
      overdueRequestHours: 24,
      twoFactorEnabled: false,
      options: {},
      updatedAt: new Date(),
    })
    .where(eq(platformSettingsTable.id, settings.id));
  invalidateOptionsCache();
  resetIcon();

  const deletedCounts = {
    ...accountCounts,
    maintenanceNotes: deletedMaintenance.length,
    assets: deletedAssets.length,
    auditLogs: deletedAuditLogs.length,
    halls: deletedHalls.length,
    holidays: deletedHolidays.length,
  };
  await logAudit(req.user!.id, req.user!.username, "factory_reset", "full", undefined, `Full factory reset performed`, clientIp(req));
  res.json({ message: "تمت إعادة ضبط المصنع الشاملة بنجاح", deletedCounts });
});

export default router;
