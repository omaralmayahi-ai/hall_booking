import { completeExpiredBookings } from "../lib/archive";
import { Router, type IRouter } from "express";
import { eq, and, SQL } from "drizzle-orm";
import { db, bookingsTable, hallsTable, usersTable, waitlistTable, notificationsTable, reviewsTable } from "@workspace/db";
import {
  ListBookingsQueryParams,
  CreateBookingBody,
  GetBookingParams,
  UpdateBookingParams,
  UpdateBookingBody,
  CancelBookingParams,
  CancelBookingBody,
  ApproveBookingParams,
  ApproveBookingBody,
  RejectBookingParams,
  RejectBookingBody,
  EmergencyCancelBookingParams,
  EmergencyCancelBookingBody,
  ChangeBookingStatusParams,
  ChangeBookingStatusBody,
  JoinWaitlistParams,
  LeaveWaitlistParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { sql } from "drizzle-orm";
import { validateBooking, MAX_RECURRING_WEEKS } from "../lib/booking-rules";
import { withLock } from "../lib/mutex";
import { localStamp } from "../lib/time";
import { logAudit, clientIp } from "../lib/auth";

/** Tell users on a booking's waitlist that the slot has been released. */
async function notifyWaitlist(bookingId: number) {
  const entries = await db.select().from(waitlistTable).where(eq(waitlistTable.bookingId, bookingId));
  if (!entries.length) return;
  await db.insert(notificationsTable).values(
    entries.map((e) => ({
      userId: e.userId,
      title: "Hall slot released",
      titleAr: "أصبح موعد القاعة متاحاً",
      message: "A booking you were waiting for has been released — you can now request the hall.",
      messageAr: "تم إلغاء حجز كنت في قائمة انتظاره، يمكنك الآن تقديم طلب حجز للقاعة.",
      type: "general" as const,
      relatedBookingId: bookingId,
    })),
  );
  await db.delete(waitlistTable).where(eq(waitlistTable.bookingId, bookingId));
}

const BLOCKED_DEPT_EDIT = "لا يمكن تعديل الحجز بعد معالجته";

/** Fields added in v2 that are not part of the generated request schema. */
function readRequirements(body: any): { attendees?: number | null; requestedItems?: string[]; seatingLayout?: string | null } {
  const out: { attendees?: number | null; requestedItems?: string[]; seatingLayout?: string | null } = {};
  if (body && "attendees" in body) {
    const n = Number(body.attendees);
    out.attendees = body.attendees === null || body.attendees === "" || !Number.isFinite(n) || n <= 0 ? null : Math.min(Math.round(n), 100000);
  }
  if (body && Array.isArray(body.requestedItems)) {
    out.requestedItems = Array.from(new Set(body.requestedItems.filter((x: unknown) => typeof x === "string").map((x: string) => x.trim().slice(0, 80)).filter(Boolean))).slice(0, 40) as string[];
  }
  if (body && "seatingLayout" in body) {
    out.seatingLayout = typeof body.seatingLayout === "string" && body.seatingLayout.trim() ? body.seatingLayout.trim().slice(0, 80) : null;
  }
  return out;
}

async function notifyManagers(values: Omit<typeof notificationsTable.$inferInsert, "userId">) {
  const managers = await db.select({ id: usersTable.id }).from(usersTable).where(
    and(eq(usersTable.role, "relations_manager"), eq(usersTable.isActive, true)),
  );
  if (managers.length) {
    await db.insert(notificationsTable).values(managers.map((m) => ({ ...values, userId: m.id })));
  }
}

const router: IRouter = Router();

export function serializeBooking(b: any) {
  return {
    ...b,
    startDate: b.startDate,
    endDate: b.endDate,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
    archivedAt: b.archivedAt instanceof Date ? b.archivedAt.toISOString() : b.archivedAt ?? null,
    hall: b.hall ? {
      ...b.hall,
      images: (b.hall.images || []).map((url: string, idx: number) => ({ id: idx + 1, url })),
      createdAt: b.hall.createdAt instanceof Date ? b.hall.createdAt.toISOString() : b.hall.createdAt,
      updatedAt: b.hall.updatedAt instanceof Date ? b.hall.updatedAt.toISOString() : b.hall.updatedAt,
    } : undefined,
    user: b.user ? {
      ...b.user,
      passwordHash: undefined,
      failedLoginCount: undefined,
      lockedUntil: undefined,
      lastLogin: b.user.lastLogin instanceof Date ? b.user.lastLogin.toISOString() : b.user.lastLogin,
      createdAt: b.user.createdAt instanceof Date ? b.user.createdAt.toISOString() : b.user.createdAt,
      updatedAt: b.user.updatedAt instanceof Date ? b.user.updatedAt.toISOString() : b.user.updatedAt,
    } : undefined,
  };
}

export { completeExpiredBookings };

async function getBookingWithDetails(id: number) {
  const result = await db
    .select({
      booking: bookingsTable,
      hall: hallsTable,
      user: usersTable,
      review: reviewsTable,
    })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .leftJoin(reviewsTable, eq(reviewsTable.bookingId, bookingsTable.id))
    .where(eq(bookingsTable.id, id));
  if (!result[0]) return null;
  const { booking, hall, user, review } = result[0];
  const { passwordHash: _, ...userPublic } = user ?? {} as any;
  return serializeBooking({
    ...booking,
    hall,
    user: userPublic,
    review: review ? { ...review, createdAt: review.createdAt.toISOString() } : undefined,
  });
}

router.get("/bookings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await completeExpiredBookings();
  const params = ListBookingsQueryParams.safeParse(req.query);
  const conditions: SQL[] = [];
  if (req.user!.role === "requesting_department") {
    conditions.push(eq(bookingsTable.userId, req.user!.id));
  }
  // Archived bookings live in the archive view (GET /bookings/archive) unless explicitly asked for.
  if (req.query.archived !== "include") conditions.push(sql`${bookingsTable.archivedAt} IS NULL`);
  if (params.success) {
    if (params.data.status) conditions.push(eq(bookingsTable.status, params.data.status as any));
    if (params.data.hallId) conditions.push(eq(bookingsTable.hallId, params.data.hallId));
    if (params.data.userId) conditions.push(eq(bookingsTable.userId, params.data.userId));
    if (params.data.from) conditions.push(sql`${bookingsTable.startDate} >= ${params.data.from}`);
    if (params.data.to) conditions.push(sql`${bookingsTable.endDate} <= ${params.data.to}`);
  }
  const rows = conditions.length
    ? await db.select({ booking: bookingsTable, hall: hallsTable, user: usersTable, review: reviewsTable })
        .from(bookingsTable)
        .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
        .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
        .leftJoin(reviewsTable, eq(reviewsTable.bookingId, bookingsTable.id))
        .where(and(...conditions))
        .orderBy(sql`${bookingsTable.createdAt} DESC`)
    : await db.select({ booking: bookingsTable, hall: hallsTable, user: usersTable, review: reviewsTable })
        .from(bookingsTable)
        .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
        .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
        .leftJoin(reviewsTable, eq(reviewsTable.bookingId, bookingsTable.id))
        .orderBy(sql`${bookingsTable.createdAt} DESC`);
  res.json(rows.map(({ booking, hall, user, review }) => {
    const { passwordHash: _, ...userPublic } = user ?? {} as any;
    return serializeBooking({
      ...booking,
      hall,
      user: userPublic,
      review: review ? { ...review, createdAt: review.createdAt.toISOString() } : undefined,
    });
  }));
});

router.post("/bookings", requireAuth, requireRole("requesting_department", "relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الحجز غير مكتملة" });
    return;
  }
  const data = parsed.data;
  const isManagerBooking = req.user!.role === "relations_manager";
  if (isManagerBooking && !data.manualDepartmentName?.trim()) {
    res.status(400).json({ error: "يرجى تحديد اسم الجهة الطالبة" });
    return;
  }
  if (!data.activityType?.trim() || !data.reason?.trim()) {
    res.status(400).json({ error: "يرجى تحديد نوع النشاط وسبب الحجز" });
    return;
  }
  const slot = {
    startDate: data.startDate,
    endDate: data.endDate || data.startDate,
    startTime: data.startTime.slice(0, 5),
    endTime: data.endTime.slice(0, 5),
    isRecurring: !!data.isRecurring,
    recurringWeeks: data.isRecurring ? Math.min(data.recurringWeeks ?? 1, MAX_RECURRING_WEEKS) : null,
  };
  const reqs = readRequirements(req.body);
  const result = await withLock(`hall:${data.hallId}`, async () => {
    const check = await validateBooking(data.hallId, slot, {
      strict: !isManagerBooking,
      extras: { ...data, attendees: reqs.attendees },
    });
    if (!check.ok) return check;
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        ...data,
        ...slot,
        ...reqs,
        activityType: data.activityType.trim().slice(0, 200),
        reason: data.reason.trim().slice(0, 2000),
        notes: data.notes?.slice(0, 2000),
        manualDepartmentName: isManagerBooking ? data.manualDepartmentName!.trim().slice(0, 200) : null,
        userId: req.user!.id,
        ...(isManagerBooking
          ? {
              status: "approved" as const,
              approvedBy: req.user!.id,
              cateringApproved: data.needsCatering ? true : null,
              mealsApproved: data.needsMeals ? true : null,
            }
          : {}),
      })
      .returning();
    return { ok: true as const, booking };
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const booking = result.booking;
  await logAudit(req.user!.id, req.user!.username, "create_booking", "booking", booking.id, undefined, clientIp(req));
  if (!isManagerBooking) {
    await notifyManagers({
      title: "New Booking Request",
      titleAr: "طلب حجز جديد",
      message: `New booking request from ${req.user!.departmentName || req.user!.username}`,
      messageAr: `طلب حجز جديد من ${req.user!.departmentName || req.user!.username}`,
      type: "booking_pending",
      relatedBookingId: booking.id,
    });
  }
  res.status(201).json(await getBookingWithDetails(booking.id));
});

router.get("/bookings/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await completeExpiredBookings();
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const booking = await getBookingWithDetails(params.data.id);
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (req.user!.role === "requesting_department" && booking.userId !== req.user!.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(booking);
});

router.patch("/bookings/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  const isDept = req.user!.role === "requesting_department";
  if (req.user!.role === "admin" || (isDept && existing.userId !== req.user!.id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (isDept && existing.status !== "pending") {
    res.status(409).json({ error: BLOCKED_DEPT_EDIT });
    return;
  }
  if (["rejected", "cancelled", "emergency_cancelled", "completed"].includes(existing.status)) {
    res.status(409).json({ error: BLOCKED_DEPT_EDIT });
    return;
  }
  const d = parsed.data;
  const slot = {
    startDate: d.startDate ?? existing.startDate,
    endDate: d.endDate ?? existing.endDate,
    startTime: (d.startTime ?? existing.startTime).slice(0, 5),
    endTime: (d.endTime ?? existing.endTime).slice(0, 5),
    isRecurring: existing.isRecurring,
    recurringWeeks: existing.recurringWeeks,
  };
  const reqs = readRequirements(req.body);
  const timingChanged =
    slot.startDate !== existing.startDate || slot.endDate !== existing.endDate ||
    slot.startTime !== existing.startTime.slice(0, 5) || slot.endTime !== existing.endTime.slice(0, 5);
  const result = await withLock(`hall:${existing.hallId}`, async () => {
    if (timingChanged) {
      const check = await validateBooking(existing.hallId, slot, {
        strict: isDept,
        excludeBookingId: existing.id,
        extras: { ...existing, ...d, attendees: reqs.attendees !== undefined ? reqs.attendees : existing.attendees },
      });
      if (!check.ok) return check;
    }
    const [updated] = await db
      .update(bookingsTable)
      .set({ ...d, ...slot, ...reqs, updatedAt: new Date() })
      .where(eq(bookingsTable.id, params.data.id))
      .returning();
    return { ok: true as const, updated };
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  await logAudit(req.user!.id, req.user!.username, "update_booking", "booking", existing.id, undefined, clientIp(req));
  res.json(await getBookingWithDetails(result.updated.id));
});

router.delete("/bookings/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CancelBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (req.user!.role === "admin" || (req.user!.role === "requesting_department" && existing.userId !== req.user!.id)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!["pending", "approved", "partially_approved"].includes(existing.status)) {
    res.status(409).json({ error: "لا يمكن إلغاء هذا الحجز في حالته الحالية" });
    return;
  }
  if (!parsed.data.reason?.trim()) {
    res.status(400).json({ error: "يرجى ذكر سبب الإلغاء" });
    return;
  }
  const [updated] = await db.update(bookingsTable).set({
    status: "cancelled",
    cancellationReason: parsed.data.reason,
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, params.data.id)).returning();
  await notifyWaitlist(existing.id);
  await logAudit(req.user!.id, req.user!.username, "cancel_booking", "booking", existing.id, parsed.data.reason, clientIp(req));
  if (req.user!.role === "requesting_department") {
    await notifyManagers({
      title: "Booking Cancelled",
      titleAr: "تم إلغاء الحجز",
      message: `Booking was cancelled by the requesting department. Reason: ${parsed.data.reason}`,
      messageAr: `تم إلغاء الحجز من قبل الجهة الطالبة. السبب: ${parsed.data.reason}`,
      type: "booking_cancelled",
      relatedBookingId: existing.id,
    });
  }
  res.json(await getBookingWithDetails(updated.id));
});

router.patch("/bookings/:id/approve", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ApproveBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ApproveBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: "لا يمكن الموافقة إلا على الطلبات قيد الانتظار" });
    return;
  }
  const { cateringApproved, mealsApproved, approverNote } = parsed.data;
  const fullyApproved = (!existing.needsCatering || cateringApproved) && (!existing.needsMeals || mealsApproved);
  const status = fullyApproved ? "approved" : "partially_approved";
  const [updated] = await db.update(bookingsTable).set({
    status,
    cateringApproved: cateringApproved ?? null,
    mealsApproved: mealsApproved ?? null,
    approvedBy: req.user!.id,
    approverNote,
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, params.data.id)).returning();
  await logAudit(req.user!.id, req.user!.username, "approve_booking", "booking", existing.id, status, clientIp(req));
  await db.insert(notificationsTable).values({
    userId: existing.userId,
    title: status === "approved" ? "Booking Approved" : "Booking Partially Approved",
    titleAr: status === "approved" ? "تمت الموافقة على الحجز" : "تمت الموافقة الجزئية على الحجز",
    message: `Your booking has been ${status === "approved" ? "approved" : "partially approved"}.`,
    messageAr: `تم ${status === "approved" ? "قبول" : "قبول جزئي"} طلب الحجز.`,
    type: "booking_approved",
    relatedBookingId: existing.id,
  });
  res.json(await getBookingWithDetails(updated.id));
});

router.patch("/bookings/:id/reject", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = RejectBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RejectBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (existing.status !== "pending") {
    res.status(409).json({ error: "لا يمكن رفض إلا الطلبات قيد الانتظار" });
    return;
  }
  if (!parsed.data.reason?.trim()) {
    res.status(400).json({ error: "يرجى ذكر سبب الرفض" });
    return;
  }
  await logAudit(req.user!.id, req.user!.username, "reject_booking", "booking", existing.id, parsed.data.reason, clientIp(req));
  const [updated] = await db.update(bookingsTable).set({
    status: "rejected",
    rejectionReason: parsed.data.reason,
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, params.data.id)).returning();
  await notifyWaitlist(existing.id);
  await db.insert(notificationsTable).values({
    userId: existing.userId,
    title: "Booking Rejected",
    titleAr: "تم رفض الحجز",
    message: `Your booking request was rejected. Reason: ${parsed.data.reason}`,
    messageAr: `تم رفض طلب الحجز. السبب: ${parsed.data.reason}`,
    type: "booking_rejected",
    relatedBookingId: existing.id,
  });
  res.json(await getBookingWithDetails(updated.id));
});

router.patch("/bookings/:id/emergency-cancel", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = EmergencyCancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = EmergencyCancelBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (!["pending", "approved", "partially_approved"].includes(existing.status)) {
    res.status(409).json({ error: "لا يمكن إلغاء هذا الحجز في حالته الحالية" });
    return;
  }
  if (!parsed.data.reason?.trim()) {
    res.status(400).json({ error: "يرجى ذكر سبب الإلغاء" });
    return;
  }
  await logAudit(req.user!.id, req.user!.username, "emergency_cancel_booking", "booking", existing.id, parsed.data.reason, clientIp(req));
  const [updated] = await db.update(bookingsTable).set({
    status: "emergency_cancelled",
    cancellationReason: parsed.data.reason,
    updatedAt: new Date(),
  }).where(eq(bookingsTable.id, params.data.id)).returning();
  await notifyWaitlist(existing.id);
  await db.insert(notificationsTable).values({
    userId: existing.userId,
    title: "Booking Cancelled (Emergency)",
    titleAr: "تم إلغاء الحجز (طارئ)",
    message: `Your booking was emergency cancelled. Reason: ${parsed.data.reason}`,
    messageAr: `تم إلغاء حجزك بشكل طارئ. السبب: ${parsed.data.reason}`,
    type: "booking_cancelled",
    relatedBookingId: existing.id,
  });
  res.json(await getBookingWithDetails(updated.id));
});

router.patch("/bookings/:id/change-status", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ChangeBookingStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ChangeBookingStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status: targetStatus, reason } = parsed.data;
  const [existing] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const isCurrentlyApprovedLike = existing.status === "approved" || existing.status === "partially_approved";
  const meetingHasEnded = `${existing.endDate} ${existing.endTime.slice(0, 5)}` < localStamp();

  const validTransition =
    (isCurrentlyApprovedLike && (targetStatus === "completed" || targetStatus === "cancelled" || targetStatus === "emergency_cancelled")) ||
    (existing.status === "completed" && targetStatus === "approved" && !meetingHasEnded);

  if (!validTransition) {
    res.status(400).json({
      error: existing.status === "completed" && targetStatus === "approved"
        ? "Cannot revert a completed booking to approved after the meeting has already ended"
        : `Cannot change status from '${existing.status}' to '${targetStatus}'`,
    });
    return;
  }

  if ((targetStatus === "cancelled" || targetStatus === "emergency_cancelled") && !reason) {
    res.status(400).json({ error: "A reason is required to cancel this booking" });
    return;
  }

  const updateValues: Record<string, unknown> = { status: targetStatus, updatedAt: new Date() };
  if (targetStatus === "cancelled" || targetStatus === "emergency_cancelled") {
    updateValues.cancellationReason = reason;
  }
  if (targetStatus === "approved") {
    updateValues.cancellationReason = null;
  }

  const [updated] = await db.update(bookingsTable).set(updateValues).where(eq(bookingsTable.id, params.data.id)).returning();
  if (targetStatus === "cancelled" || targetStatus === "emergency_cancelled") await notifyWaitlist(existing.id);
  await logAudit(req.user!.id, req.user!.username, "change_booking_status", "booking", existing.id, `${existing.status} -> ${targetStatus}`, clientIp(req));

  const notificationByStatus: Record<string, { title: string; titleAr: string; message: string; messageAr: string; type: "booking_approved" | "booking_cancelled" | "booking_rejected" | "booking_pending" | "system" | "general" }> = {
    completed: {
      title: "Booking Marked as Completed",
      titleAr: "تم تحديد الحجز كمكتمل",
      message: "Your booking has been marked as completed by the relations manager.",
      messageAr: "تم تحديد حجزك كمكتمل من قبل مدير العلاقات.",
      type: "system",
    },
    cancelled: {
      title: "Booking Cancelled",
      titleAr: "تم إلغاء الحجز",
      message: `Your booking was cancelled by the relations manager. Reason: ${reason}`,
      messageAr: `تم إلغاء حجزك من قبل مدير العلاقات. السبب: ${reason}`,
      type: "booking_cancelled",
    },
    emergency_cancelled: {
      title: "Booking Cancelled (Emergency)",
      titleAr: "تم إلغاء الحجز (طارئ)",
      message: `Your booking was emergency cancelled by the relations manager. Reason: ${reason}`,
      messageAr: `تم إلغاء حجزك بشكل طارئ من قبل مدير العلاقات. السبب: ${reason}`,
      type: "booking_cancelled",
    },
    approved: {
      title: "Booking Restored to Approved",
      titleAr: "تمت إعادة الحجز إلى حالة موافقة",
      message: "Your booking status was reverted back to approved by the relations manager.",
      messageAr: "تمت إعادة حالة حجزك إلى موافقة من قبل مدير العلاقات.",
      type: "booking_approved",
    },
  };
  const notification = notificationByStatus[targetStatus];
  await db.insert(notificationsTable).values({
    userId: existing.userId,
    title: notification.title,
    titleAr: notification.titleAr,
    message: notification.message,
    messageAr: notification.messageAr,
    type: notification.type,
    relatedBookingId: existing.id,
  });

  res.json(await getBookingWithDetails(updated.id));
});

router.post("/bookings/:id/waitlist", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = JoinWaitlistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [target] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!target || !["pending", "approved", "partially_approved"].includes(target.status)) {
    res.status(404).json({ error: "الحجز غير متاح لقائمة الانتظار" });
    return;
  }
  const [existingEntry] = await db.select().from(waitlistTable).where(
    and(eq(waitlistTable.bookingId, params.data.id), eq(waitlistTable.userId, req.user!.id)),
  );
  const entry = existingEntry ?? (await db.insert(waitlistTable).values({ bookingId: params.data.id, userId: req.user!.id }).returning())[0];
  res.status(201).json({ ...entry, createdAt: entry.createdAt.toISOString() });
});

router.delete("/bookings/:id/waitlist", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = LeaveWaitlistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(waitlistTable).where(
    and(eq(waitlistTable.bookingId, params.data.id), eq(waitlistTable.userId, req.user!.id))
  );
  res.sendStatus(204);
});

export default router;
