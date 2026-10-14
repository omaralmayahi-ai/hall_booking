import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import {
  db,
  bookingsTable,
  hallsTable,
  usersTable,
  holidaysTable,
  maintenanceNotesTable,
  platformSettingsTable,
  hallAssetsTable,
  notificationsTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";
import { addDays, hhmm, isValidDate, localDate } from "../lib/time";
import { occurrences, validateBooking } from "../lib/booking-rules";
import { suggestAlternatives } from "../lib/maintenance-impact";
import { withLock } from "../lib/mutex";
import { getOptions } from "../lib/options";
import { activityLabel } from "../lib/reports";

const router: IRouter = Router();

const MAX_RANGE_DAYS = 62;

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
}

export function departmentLabel(b: { manualDepartmentName: string | null }, u?: { departmentName: string | null; username: string } | null) {
  return b.manualDepartmentName || u?.departmentName || u?.username || "";
}

/* ------------------------------------------------------------------ */
/* Calendar: bookings, maintenance blocks, holidays in a date range     */
/* ------------------------------------------------------------------ */

router.get("/calendar", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!isValidDate(from) || !isValidDate(to) || to < from || daysBetween(from, to) > MAX_RANGE_DAYS) {
    res.status(400).json({ error: "نطاق التاريخ غير صالح" });
    return;
  }
  const hallId = req.query.hallId ? Number(req.query.hallId) : undefined;
  const isDept = req.user!.role === "requesting_department";

  const halls = await db.select().from(hallsTable).orderBy(hallsTable.id);
  const rows = await db
    .select({ booking: bookingsTable, user: usersTable })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(
      and(
        sql`${bookingsTable.status} IN ('pending','approved','partially_approved','completed')`,
        hallId ? eq(bookingsTable.hallId, hallId) : sql`true`,
        sql`(${bookingsTable.isRecurring} = true OR (${bookingsTable.startDate} <= ${to} AND ${bookingsTable.endDate} >= ${from}))`,
      ),
    );

  const events: unknown[] = [];
  for (const { booking: b, user: u } of rows) {
    const mine = b.userId === req.user!.id;
    const masked = isDept && !mine;
    for (const occ of occurrences(b)) {
      if (occ.end < from || occ.start > to) continue;
      for (let d = occ.start < from ? from : occ.start; d <= occ.end && d <= to; d = addDays(d, 1)) {
        events.push({
          id: `b${b.id}-${d}`,
          type: "booking",
          bookingId: masked ? null : b.id,
          hallId: b.hallId,
          date: d,
          startTime: hhmm(b.startTime),
          endTime: hhmm(b.endTime),
          status: masked ? (b.status === "pending" ? "pending" : "booked") : b.status,
          title: masked ? "محجوز" : activityLabel(b.activityType),
          department: masked ? null : departmentLabel(b, u),
          attendees: masked ? null : b.attendees,
          mine,
        });
      }
    }
  }

  const notes = await db
    .select()
    .from(maintenanceNotesTable)
    .where(and(eq(maintenanceNotesTable.blocksHall, true), sql`${maintenanceNotesTable.status} <> 'resolved'`, hallId ? eq(maintenanceNotesTable.hallId, hallId) : sql`true`));
  const today = localDate();
  for (const n of notes) {
    // Open-ended blocks (hall in maintenance) cover every day from today until resolved.
    const start = n.blockStartDate ?? today;
    const end = n.blockStartDate ? n.blockEndDate || n.blockStartDate : to;
    for (let d = start < from ? from : start; d <= end && d <= to; d = addDays(d, 1)) {
      events.push({
        id: `m${n.id}-${d}`,
        type: "maintenance",
        noteId: isDept ? null : n.id,
        hallId: n.hallId,
        date: d,
        startTime: n.blockStartTime || null,
        endTime: n.blockEndTime || null,
        status: "maintenance",
        title: isDept ? "صيانة" : n.title || "صيانة",
        mine: false,
      });
    }
  }

  const holidays = (await db.select().from(holidaysTable)).filter((h) => h.date >= from && h.date <= to);
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const opts = await getOptions();
  res.json({
    from,
    to,
    events,
    holidays: holidays.map((h) => ({ date: h.date, name: h.nameAr || h.name })),
    halls: halls.map((h) => ({
      id: h.id,
      name: h.nameAr || h.name,
      status: h.status,
      capacity: h.capacity,
      location: h.locationAr || h.location,
    })),
    workingHoursStart: settings?.workingHoursStart ?? "07:00",
    workingHoursEnd: settings?.workingHoursEnd ?? "15:00",
    weekendDays: opts.booking.weekendDays,
    blockWeekends: opts.booking.blockWeekends,
    today,
  });
});

/* ------------------------------------------------------------------ */
/* Requestable items of a hall (for the booking form)                  */
/* ------------------------------------------------------------------ */

router.get("/halls/:id/requestable", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, id));
  if (!hall) {
    res.status(404).json({ error: "القاعة غير موجودة" });
    return;
  }
  const assets = await db
    .select()
    .from(hallAssetsTable)
    .where(and(eq(hallAssetsTable.hallId, id), eq(hallAssetsTable.isRequestable, true)));
  const items = new Map<string, { name: string; available: boolean }>();
  for (const e of hall.equipment ?? []) items.set(e, { name: e, available: true });
  for (const a of assets) {
    if (a.status === "retired") continue;
    const prev = items.get(a.name);
    items.set(a.name, { name: a.name, available: (prev?.available ?? false) || a.status === "working" });
  }
  const opts = await getOptions();
  res.json({ items: Array.from(items.values()), seatingLayouts: opts.booking.seatingLayouts, capacity: hall.capacity });
});

/* ------------------------------------------------------------------ */
/* Hall assets (inventory)                                             */
/* ------------------------------------------------------------------ */

export const ASSET_CATEGORIES = ["audio", "video", "computing", "furniture", "hvac", "lighting", "network", "other"];
export const ASSET_STATUSES = ["working", "needs_repair", "out_of_service", "retired"];

function readAsset(body: any, partial: boolean): Partial<typeof hallAssetsTable.$inferInsert> | string {
  if (!body || typeof body !== "object") return "بيانات غير صالحة";
  const out: Partial<typeof hallAssetsTable.$inferInsert> = {};
  if (!partial || "name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) return "يرجى إدخال اسم المادة";
    out.name = body.name.trim().slice(0, 120);
  }
  if (!partial || "hallId" in body) {
    const id = Number(body.hallId);
    if (!Number.isInteger(id) || id < 1) return "يرجى اختيار القاعة";
    out.hallId = id;
  }
  if ("category" in body) out.category = ASSET_CATEGORIES.includes(body.category) ? body.category : "other";
  if ("status" in body) {
    if (!ASSET_STATUSES.includes(body.status)) return "حالة المادة غير صحيحة";
    out.status = body.status;
  }
  if ("quantity" in body) {
    const q = Number(body.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 100000) return "الكمية غير صحيحة";
    out.quantity = q;
  }
  for (const k of ["inventoryNo", "serialNo"] as const) {
    if (k in body) out[k] = typeof body[k] === "string" && body[k].trim() ? body[k].trim().slice(0, 80) : null;
  }
  if ("notes" in body) out.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null;
  if ("isRequestable" in body) out.isRequestable = body.isRequestable === true;
  if ("lastCheckedAt" in body) {
    if (body.lastCheckedAt && !isValidDate(body.lastCheckedAt)) return "تاريخ آخر فحص غير صحيح";
    out.lastCheckedAt = body.lastCheckedAt || null;
  }
  return out;
}

const serializeAsset = (a: typeof hallAssetsTable.$inferSelect, hallName?: string) => ({
  ...a,
  hallName,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

router.get("/assets", requireAuth, requireRole("relations_manager", "admin"), async (req, res): Promise<void> => {
  const hallId = req.query.hallId ? Number(req.query.hallId) : undefined;
  const rows = await db
    .select({ asset: hallAssetsTable, hall: hallsTable })
    .from(hallAssetsTable)
    .leftJoin(hallsTable, eq(hallAssetsTable.hallId, hallsTable.id))
    .where(hallId ? eq(hallAssetsTable.hallId, hallId) : sql`true`)
    .orderBy(hallAssetsTable.hallId, hallAssetsTable.name);
  res.json(rows.map(({ asset, hall }) => serializeAsset(asset, hall?.nameAr || hall?.name)));
});

router.post("/assets", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const data = readAsset(req.body, false);
  if (typeof data === "string") {
    res.status(400).json({ error: data });
    return;
  }
  const [hall] = await db.select({ id: hallsTable.id }).from(hallsTable).where(eq(hallsTable.id, data.hallId!));
  if (!hall) {
    res.status(404).json({ error: "القاعة غير موجودة" });
    return;
  }
  if (data.inventoryNo) {
    const [dup] = await db.select({ id: hallAssetsTable.id }).from(hallAssetsTable).where(eq(hallAssetsTable.inventoryNo, data.inventoryNo));
    if (dup) {
      res.status(409).json({ error: "الرقم المخزني مستخدم لمادة أخرى" });
      return;
    }
  }
  const [row] = await db.insert(hallAssetsTable).values(data as typeof hallAssetsTable.$inferInsert).returning();
  await logAudit(req.user!.id, req.user!.username, "create_asset", "asset", row.id, row.name, clientIp(req));
  res.status(201).json(serializeAsset(row));
});

router.patch("/assets/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const data = readAsset(req.body, true);
  if (typeof data === "string") {
    res.status(400).json({ error: data });
    return;
  }
  if (data.inventoryNo) {
    const [dup] = await db.select({ id: hallAssetsTable.id }).from(hallAssetsTable).where(eq(hallAssetsTable.inventoryNo, data.inventoryNo));
    if (dup && dup.id !== id) {
      res.status(409).json({ error: "الرقم المخزني مستخدم لمادة أخرى" });
      return;
    }
  }
  const [row] = await db.update(hallAssetsTable).set({ ...data, updatedAt: new Date() }).where(eq(hallAssetsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "غير موجود" });
    return;
  }
  await logAudit(req.user!.id, req.user!.username, "update_asset", "asset", row.id, undefined, clientIp(req));
  res.json(serializeAsset(row));
});

router.delete("/assets/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const [open] = await db
    .select({ id: maintenanceNotesTable.id })
    .from(maintenanceNotesTable)
    .where(and(eq(maintenanceNotesTable.assetId, id), sql`${maintenanceNotesTable.status} <> 'resolved'`));
  if (open) {
    res.status(409).json({ error: "توجد أعمال صيانة مفتوحة على هذه المادة، أغلقها أولاً أو غيّر حالة المادة إلى «مستبعدة»" });
    return;
  }
  await db.update(maintenanceNotesTable).set({ assetId: null }).where(eq(maintenanceNotesTable.assetId, id));
  await db.delete(hallAssetsTable).where(eq(hallAssetsTable.id, id));
  await logAudit(req.user!.id, req.user!.username, "delete_asset", "asset", id, undefined, clientIp(req));
  res.sendStatus(204);
});

/* ------------------------------------------------------------------ */
/* Booking extras: alternatives, relocation, printable slip            */
/* ------------------------------------------------------------------ */

router.get("/bookings/:id/alternatives", requireAuth, requireRole("relations_manager"), async (req, res): Promise<void> => {
  const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, Number(req.params.id)));
  if (!b) {
    res.status(404).json({ error: "الحجز غير موجود" });
    return;
  }
  res.json(await suggestAlternatives(b, 10));
});

router.post("/bookings/:id/relocate", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const targetId = Number(req.body?.hallId);
  const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id));
  if (!b) {
    res.status(404).json({ error: "الحجز غير موجود" });
    return;
  }
  if (!["pending", "approved", "partially_approved"].includes(b.status)) {
    res.status(409).json({ error: "لا يمكن نقل هذا الحجز في حالته الحالية" });
    return;
  }
  if (!Number.isInteger(targetId) || targetId === b.hallId) {
    res.status(400).json({ error: "يرجى اختيار قاعة أخرى" });
    return;
  }
  const [oldHall] = await db.select().from(hallsTable).where(eq(hallsTable.id, b.hallId));
  const result = await withLock(`hall:${targetId}`, async () => {
    const check = await validateBooking(targetId, b, { strict: false, excludeBookingId: b.id, allowPast: true });
    if (!check.ok) return check;
    const [updated] = await db.update(bookingsTable).set({ hallId: targetId, updatedAt: new Date() }).where(eq(bookingsTable.id, id)).returning();
    return { ok: true as const, updated };
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const [newHall] = await db.select().from(hallsTable).where(eq(hallsTable.id, targetId));
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  if (b.userId !== req.user!.id) {
    await db.insert(notificationsTable).values({
      userId: b.userId,
      title: "Booking moved to another hall",
      titleAr: "تم نقل حجزك إلى قاعة أخرى",
      message: `Your booking was moved to ${newHall?.name}`,
      messageAr: `تم نقل حجزكم من ${oldHall?.nameAr || oldHall?.name} إلى ${newHall?.nameAr || newHall?.name} بنفس الموعد.${note ? ` ملاحظة: ${note}` : ""}`,
      type: "system",
      relatedBookingId: b.id,
    });
  }
  await logAudit(req.user!.id, req.user!.username, "relocate_booking", "booking", b.id, `${b.hallId} -> ${targetId}`, clientIp(req));
  res.json({ ok: true, bookingId: b.id, hallId: targetId });
});

router.get("/bookings/:id/slip", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({ booking: bookingsTable, hall: hallsTable, user: usersTable })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(eq(bookingsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "الحجز غير موجود" });
    return;
  }
  const { booking: b, hall, user: u } = row;
  if (req.user!.role === "requesting_department" && b.userId !== req.user!.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [approver] = b.approvedBy ? await db.select({ username: usersTable.username, departmentName: usersTable.departmentName }).from(usersTable).where(eq(usersTable.id, b.approvedBy)) : [];
  const origin = typeof req.query.origin === "string" && /^https?:\/\/[\w.\-:[\]]+$/.test(req.query.origin) ? req.query.origin : `${req.protocol}://${req.get("host")}`;
  const verifyUrl = `${origin}/public/booking/${b.publicCode}`;
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 300, errorCorrectionLevel: "M" });
  res.json({
    id: b.id,
    status: b.status,
    publicCode: b.publicCode,
    verifyUrl,
    qr,
    hall: hall ? { id: hall.id, name: hall.nameAr || hall.name, location: hall.locationAr || hall.location, floor: hall.floor, building: hall.building, capacity: hall.capacity, referenceCode: hall.referenceCode } : null,
    department: departmentLabel(b, u),
    activityType: activityLabel(b.activityType),
    reason: b.reason,
    notes: b.notes,
    startDate: b.startDate,
    endDate: b.endDate,
    startTime: hhmm(b.startTime),
    endTime: hhmm(b.endTime),
    isRecurring: b.isRecurring,
    recurringWeeks: b.recurringWeeks,
    attendees: b.attendees,
    seatingLayout: b.seatingLayout,
    requestedItems: b.requestedItems,
    needsCatering: b.needsCatering,
    needsMeals: b.needsMeals,
    cateringApproved: b.cateringApproved,
    mealsApproved: b.mealsApproved,
    coordinatorName: b.coordinatorName,
    coordinatorPhone: b.coordinatorPhone,
    approverNote: b.approverNote,
    approvedBy: approver ? approver.departmentName || approver.username : null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  });
});

export default router;
