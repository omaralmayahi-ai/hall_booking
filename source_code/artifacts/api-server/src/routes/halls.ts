import { Router, type IRouter } from "express";
import { eq, ilike, gte, and, or, SQL } from "drizzle-orm";
import { db, hallsTable, bookingsTable, reviewsTable, maintenanceNotesTable, hallAssetsTable, maintenanceSchedulesTable } from "@workspace/db";
import {
  ListHallsQueryParams,
  CreateHallBody,
  GetHallParams,
  UpdateHallParams,
  UpdateHallBody,
  DeleteHallParams,
  GetHallAvailabilityQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";
import { localDate, hhmm } from "../lib/time";
import { occurrences } from "../lib/booking-rules";
import { avg, count, sql } from "drizzle-orm";
import QRCode from "qrcode";

const router: IRouter = Router();

/** Only accept inline raster images (data URLs) or same-origin paths — blocks javascript:/svg payloads. */
function sanitizeImages(images: unknown): string[] | undefined {
  if (!Array.isArray(images)) return undefined;
  return images
    .filter((u): u is string => typeof u === "string")
    .filter((u) => /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || /^\/[\w\-./]+$/.test(u))
    .slice(0, 10);
}

function generateReferenceCode(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HALL-${stamp}-${rand}`;
}

async function generateHallQrCode(latitude: number | null, longitude: number | null): Promise<string | null> {
  if (latitude == null || longitude == null) return null;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return QRCode.toDataURL(mapUrl, { margin: 1, width: 320 });
}

async function buildHallResponse(hall: typeof hallsTable.$inferSelect) {
  const ratingResult = await db
    .select({ avg: avg(reviewsTable.overallRating), reviewCount: count() })
    .from(reviewsTable)
    .where(eq(reviewsTable.hallId, hall.id));
  const countResult = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.hallId, hall.id));
  return {
    ...hall,
    images: (hall.images || []).map((url: string, idx: number) => ({ id: idx + 1, url })),
    averageRating: ratingResult[0]?.avg ? Number(ratingResult[0].avg) : null,
    reviewCount: Number(ratingResult[0]?.reviewCount ?? 0),
    totalBookings: Number(countResult[0]?.count ?? 0),
    createdAt: hall.createdAt.toISOString(),
    updatedAt: hall.updatedAt.toISOString(),
  };
}

router.get("/halls", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListHallsQueryParams.safeParse(req.query);
  const conditions: SQL[] = [];
  if (params.success) {
    if (params.data.status) conditions.push(eq(hallsTable.status, params.data.status as any));
    if (params.data.search) {
      const term = `%${params.data.search.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
      conditions.push(or(ilike(hallsTable.name, term), ilike(hallsTable.nameAr, term), ilike(hallsTable.referenceCode, term))!);
    }
    if (params.data.minCapacity) conditions.push(gte(hallsTable.capacity, params.data.minCapacity));
  }
  const halls = conditions.length
    ? await db.select().from(hallsTable).where(and(...conditions))
    : await db.select().from(hallsTable);
  const result = await Promise.all(halls.map(buildHallResponse));
  res.json(result);
});

router.post("/halls", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateHallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { images: rawImages, referenceCode, latitude, longitude, ...rest } = parsed.data;
  const images = sanitizeImages(rawImages);
  if (rest.capacity !== undefined && (rest.capacity < 1 || rest.capacity > 100000)) {
    res.status(400).json({ error: "السعة غير صالحة" });
    return;
  }
  if (referenceCode) {
    const [dup] = await db.select({ id: hallsTable.id }).from(hallsTable).where(eq(hallsTable.referenceCode, referenceCode));
    if (dup) {
      res.status(409).json({ error: "الرمز المرجعي مستخدم لقاعة أخرى" });
      return;
    }
  }
  const qrCode = await generateHallQrCode(latitude ?? null, longitude ?? null);
  const [hall] = await db
    .insert(hallsTable)
    .values({
      ...rest,
      status: (rest.status as any) ?? "available",
      images: images ?? [],
      referenceCode: referenceCode ?? generateReferenceCode(),
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      qrCode,
    })
    .returning();
  await logAudit(req.user!.id, req.user!.username, "create_hall", "hall", hall.id, undefined, clientIp(req));
  res.status(201).json(await buildHallResponse(hall));
});

router.get("/halls/availability", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetHallAvailabilityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { hallId, from, to } = params.data;
  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hallId, hallId),
        sql`${bookingsTable.status} NOT IN ('rejected', 'cancelled', 'emergency_cancelled')`
      )
    );
  if (to < from) {
    res.status(400).json({ error: "نطاق التاريخ غير صالح" });
    return;
  }
  // One entry per booking occurrence on each day; days with no bookings get a single "free" entry.
  const slots: { date: string; startTime: string | null; endTime: string | null; isAvailable: boolean; bookingId: number | null }[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  let guard = 0;
  for (let d = new Date(start); d <= end && guard < 370; d.setDate(d.getDate() + 1), guard++) {
    const dateStr = localDate(d);
    const dayBookings = bookings.filter((b) => occurrences(b).some((o) => o.start <= dateStr && o.end >= dateStr));
    if (!dayBookings.length) {
      slots.push({ date: dateStr, startTime: null, endTime: null, isAvailable: true, bookingId: null });
      continue;
    }
    for (const b of dayBookings) {
      slots.push({ date: dateStr, startTime: hhmm(b.startTime), endTime: hhmm(b.endTime), isAvailable: false, bookingId: b.id });
    }
  }
  res.json(slots);
});

router.get("/halls/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetHallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, params.data.id));
  if (!hall) {
    res.status(404).json({ error: "Hall not found" });
    return;
  }
  res.json(await buildHallResponse(hall));
});

router.patch("/halls/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateHallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateHallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(hallsTable).where(eq(hallsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Hall not found" });
    return;
  }
  const { images: rawImages, latitude, longitude, ...rest } = parsed.data;
  const images = sanitizeImages(rawImages);
  const finalLatitude = latitude !== undefined ? latitude : existing.latitude;
  const finalLongitude = longitude !== undefined ? longitude : existing.longitude;
  const locationChanged = latitude !== undefined || longitude !== undefined;
  const qrCode = locationChanged ? await generateHallQrCode(finalLatitude, finalLongitude) : existing.qrCode;
  const [updated] = await db
    .update(hallsTable)
    .set({
      ...rest,
      status: (rest.status as any) ?? existing.status,
      images: images ?? existing.images,
      latitude: finalLatitude,
      longitude: finalLongitude,
      qrCode,
      updatedAt: new Date(),
    })
    .where(eq(hallsTable.id, params.data.id))
    .returning();
  await logAudit(req.user!.id, req.user!.username, "update_hall", "hall", updated.id, undefined, clientIp(req));
  res.json(await buildHallResponse(updated));
});

router.delete("/halls/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteHallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [used] = await db.select({ c: count() }).from(bookingsTable).where(eq(bookingsTable.hallId, params.data.id));
  if (Number(used?.c ?? 0) > 0) {
    res.status(409).json({ error: "لا يمكن حذف قاعة لها حجوزات مسجلة، يمكنك تغيير حالتها إلى «معطلة» بدلاً من ذلك" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(maintenanceNotesTable).where(eq(maintenanceNotesTable.hallId, params.data.id));
    await tx.delete(maintenanceSchedulesTable).where(eq(maintenanceSchedulesTable.hallId, params.data.id));
    await tx.delete(hallAssetsTable).where(eq(hallAssetsTable.hallId, params.data.id));
    await tx.delete(reviewsTable).where(eq(reviewsTable.hallId, params.data.id));
    await tx.delete(hallsTable).where(eq(hallsTable.id, params.data.id));
  });
  await logAudit(req.user!.id, req.user!.username, "delete_hall", "hall", params.data.id, undefined, clientIp(req));
  res.sendStatus(204);
});

export default router;
