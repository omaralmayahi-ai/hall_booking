import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, hallsTable, bookingsTable, platformSettingsTable, usersTable, maintenanceNotesTable } from "@workspace/db";
import { GetPublicHallParams } from "@workspace/api-zod";
import { localDate, localTime, hhmm } from "../lib/time";
import { getOptions, publicOptions } from "../lib/options";
import { iconVersion } from "../lib/branding";
import { occurrences } from "../lib/booking-rules";
import { STATUS_AR, activityLabel } from "../lib/reports";

const router: IRouter = Router();

router.get("/public/halls/:id", async (req, res): Promise<void> => {
  const params = GetPublicHallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, params.data.id));
  if (!hall) {
    res.status(404).json({ error: "Hall not found" });
    return;
  }
  const today = localDate();
  const [currentBooking] = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hallId, hall.id),
        sql`${bookingsTable.status} IN ('approved', 'partially_approved')`,
        sql`${bookingsTable.startDate} <= ${today}`,
        sql`${bookingsTable.endDate} >= ${today}`
      )
    );
  res.json({
    id: hall.id,
    name: hall.name,
    nameAr: hall.nameAr,
    location: hall.location,
    locationAr: hall.locationAr,
    capacity: hall.capacity,
    status: hall.status,
    equipment: hall.equipment,
    images: (hall.images || []).map((url: string, idx: number) => ({ id: idx + 1, url })),
    latitude: hall.latitude,
    longitude: hall.longitude,
    isCurrentlyOccupied: !!currentBooking,
    currentBooking: currentBooking ? { startTime: currentBooking.startTime, endTime: currentBooking.endTime } : null,
  });
});

router.get("/public/settings", async (_req, res): Promise<void> => {
  const [s] = await db.select({
    companyName: platformSettingsTable.companyName,
    companyNameAr: platformSettingsTable.companyNameAr,
    logoUrl: platformSettingsTable.logoUrl,
    footerText: platformSettingsTable.footerText,
    footerTextAr: platformSettingsTable.footerTextAr,
    workingHoursStart: platformSettingsTable.workingHoursStart,
    workingHoursEnd: platformSettingsTable.workingHoursEnd,
    passwordMinLength: platformSettingsTable.passwordMinLength,
  }).from(platformSettingsTable).limit(1);
  const base = s ?? { companyName: "Hall Booking Platform", companyNameAr: "منصة حجز القاعات", logoUrl: null, footerText: null, footerTextAr: null, workingHoursStart: "07:00", workingHoursEnd: "15:00", passwordMinLength: 6 };
  res.json({ ...base, iconVersion: iconVersion(), options: publicOptions(await getOptions()) });
});

/** Booking verification page opened from the QR code printed on the booking slip. */
router.get("/public/bookings/:code", async (req, res): Promise<void> => {
  const code = String(req.params.code ?? "");
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) {
    res.status(404).json({ error: "رمز الحجز غير صالح" });
    return;
  }
  const [row] = await db
    .select({ booking: bookingsTable, hall: hallsTable, user: usersTable })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(eq(bookingsTable.publicCode, code));
  if (!row) {
    res.status(404).json({ error: "لم يتم العثور على الحجز" });
    return;
  }
  const { booking: b, hall, user: u } = row;
  res.json({
    id: b.id,
    status: b.status,
    statusAr: STATUS_AR[b.status] ?? b.status,
    valid: ["approved", "partially_approved", "completed"].includes(b.status),
    hall: hall?.nameAr || hall?.name,
    location: hall?.locationAr || hall?.location,
    department: b.manualDepartmentName || u?.departmentName || "",
    activityType: activityLabel(b.activityType),
    startDate: b.startDate,
    endDate: b.endDate,
    startTime: hhmm(b.startTime),
    endTime: hhmm(b.endTime),
    isRecurring: b.isRecurring,
    recurringWeeks: b.recurringWeeks,
  });
});

async function hallDisplay(hall: typeof hallsTable.$inferSelect) {
  const opts = await getOptions();
  const today = localDate();
  const now = localTime();
  const rows = await db
    .select({ booking: bookingsTable, user: usersTable })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(
      and(
        eq(bookingsTable.hallId, hall.id),
        sql`${bookingsTable.status} IN ('approved','partially_approved','completed')`,
        sql`(${bookingsTable.isRecurring} = true OR (${bookingsTable.startDate} <= ${today} AND ${bookingsTable.endDate} >= ${today}))`,
      ),
    );
  const schedule = rows
    .filter(({ booking: b }) => occurrences(b).some((o) => o.start <= today && o.end >= today))
    .map(({ booking: b, user: u }) => ({
      startTime: hhmm(b.startTime),
      endTime: hhmm(b.endTime),
      title: opts.display.showActivity ? activityLabel(b.activityType) : "حجز",
      department: opts.display.showDepartment ? b.manualDepartmentName || u?.departmentName || "" : null,
      attendees: b.attendees,
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const current = schedule.find((s) => s.startTime <= now && s.endTime > now) ?? null;
  const next = schedule.find((s) => s.startTime > now) ?? null;
  const [maint] = await db
    .select()
    .from(maintenanceNotesTable)
    .where(and(eq(maintenanceNotesTable.hallId, hall.id), eq(maintenanceNotesTable.blocksHall, true), sql`${maintenanceNotesTable.status} <> 'resolved'`, sql`(${maintenanceNotesTable.blockStartDate} IS NULL OR (${maintenanceNotesTable.blockStartDate} <= ${today} AND COALESCE(${maintenanceNotesTable.blockEndDate}, ${maintenanceNotesTable.blockStartDate}) >= ${today}))`));
  const maintenanceNow =
    hall.status === "maintenance" ||
    (!!maint && (!maint.blockStartTime || (maint.blockStartTime <= now && (maint.blockEndTime ?? "23:59") > now)));
  return {
    id: hall.id,
    name: hall.nameAr || hall.name,
    location: hall.locationAr || hall.location,
    capacity: hall.capacity,
    status: hall.status,
    state: hall.status === "disabled" ? "disabled" : maintenanceNow ? "maintenance" : current ? "busy" : "free",
    current,
    next,
    schedule,
  };
}

async function workingHours() {
  const [row] = await db.select({ start: platformSettingsTable.workingHoursStart, end: platformSettingsTable.workingHoursEnd }).from(platformSettingsTable).limit(1);
  return { start: hhmm(row?.start ?? "08:00"), end: hhmm(row?.end ?? "15:00") };
}

/** Door / lobby screens: one hall, or every hall when id is omitted. */
router.get("/public/display", async (_req, res): Promise<void> => {
  const halls = await db.select().from(hallsTable).orderBy(hallsTable.id);
  const opts = await getOptions();
  res.json({
    now: new Date().toISOString(),
    date: localDate(),
    time: localTime(),
    refreshSeconds: opts.display.refreshSeconds,
    ticker: opts.display.tickerItems.join("   •   "),
    display: opts.display,
    workingHours: await workingHours(),
    halls: await Promise.all(halls.filter((h) => h.status !== "disabled").map(hallDisplay)),
  });
});

router.get("/public/display/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [hall] = Number.isInteger(id) ? await db.select().from(hallsTable).where(eq(hallsTable.id, id)) : [];
  if (!hall) {
    res.status(404).json({ error: "القاعة غير موجودة" });
    return;
  }
  const opts = await getOptions();
  res.json({
    now: new Date().toISOString(),
    date: localDate(),
    time: localTime(),
    refreshSeconds: opts.display.refreshSeconds,
    ticker: opts.display.tickerItems.join("   •   "),
    display: opts.display,
    workingHours: await workingHours(),
    hall: await hallDisplay(hall),
  });
});

export default router;
