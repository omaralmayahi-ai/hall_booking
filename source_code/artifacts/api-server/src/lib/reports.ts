import { eq, sql } from "drizzle-orm";
import { db, bookingsTable, hallsTable, usersTable, holidaysTable, platformSettingsTable, maintenanceNotesTable } from "@workspace/db";
import { occurrences } from "./booking-rules";
import { addDays, hhmm } from "./time";
import { getOptions } from "./options";

const minutes = (t: string) => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return h * 60 + m;
};

export const STATUS_AR: Record<string, string> = {
  pending: "قيد الانتظار",
  approved: "مقبول",
  partially_approved: "مقبول جزئياً",
  rejected: "مرفوض",
  cancelled: "ملغى",
  emergency_cancelled: "ملغى طارئ",
  completed: "مكتمل",
};

const LEGACY_ACTIVITY: Record<string, string> = {
  meeting: "اجتماع",
  training: "دورة تدريبية",
  conference: "مؤتمر",
  seminar: "ندوة",
  workshop: "ورشة عمل",
  ceremony: "احتفالية",
  other: "أخرى",
};
export const activityLabel = (v: string) => LEGACY_ACTIVITY[v] ?? v;

const USED = new Set(["approved", "partially_approved", "completed"]);

export async function buildOccupancyReport(from: string, to: string) {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const ws = settings?.workingHoursStart ?? "07:00";
  const we = settings?.workingHoursEnd ?? "15:00";
  const dayMinutes = Math.max(0, minutes(we) - minutes(ws));
  const opts = await getOptions();
  const holidays = new Set((await db.select().from(holidaysTable)).map((h) => h.date));

  const dates: string[] = [];
  for (let d = from; d <= to && dates.length < 400; d = addDays(d, 1)) dates.push(d);
  const workingDates = dates.filter((d) => !opts.booking.weekendDays.includes(new Date(`${d}T00:00:00`).getDay()) && !holidays.has(d));

  const halls = await db.select().from(hallsTable).orderBy(hallsTable.id);
  const rows = await db
    .select({ booking: bookingsTable, user: usersTable })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(sql`(${bookingsTable.isRecurring} = true OR (${bookingsTable.startDate} <= ${to} AND ${bookingsTable.endDate} >= ${from}))`);

  const hallStats = new Map(
    halls.map((h) => [
      h.id,
      {
        hallId: h.id,
        name: h.nameAr || h.name,
        capacity: h.capacity,
        status: h.status,
        availableHours: Math.round((workingDates.length * dayMinutes) / 6) / 10,
        bookedMinutes: 0,
        bookings: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        cancelled: 0,
        attendees: 0,
        maintenance: 0,
      },
    ]),
  );
  const departments = new Map<string, { name: string; bookings: number; minutes: number; cancelled: number }>();
  const activities = new Map<string, number>();
  const daily = new Map(dates.map((d) => [d, 0]));
  const startHour = Math.floor(minutes(ws) / 60);
  const endHour = Math.ceil(minutes(we) / 60);
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: Math.max(1, endHour - startHour) }, () => 0));
  const details: Record<string, unknown>[] = [];
  let responseSum = 0;
  let responseCount = 0;

  for (const { booking: b, user: u } of rows) {
    const inRange = occurrences(b).filter((o) => o.end >= from && o.start <= to);
    if (!inRange.length) continue;
    const hs = hallStats.get(b.hallId);
    const dept = b.manualDepartmentName || u?.departmentName || u?.username || "غير محدد";
    const d = departments.get(dept) ?? { name: dept, bookings: 0, minutes: 0, cancelled: 0 };
    d.bookings++;
    if (hs) {
      hs.bookings++;
      if (USED.has(b.status)) hs.approved++;
      else if (b.status === "pending") hs.pending++;
      else if (b.status === "rejected") hs.rejected++;
      else hs.cancelled++;
    }
    if (b.status === "cancelled" || b.status === "emergency_cancelled") d.cancelled++;
    activities.set(activityLabel(b.activityType), (activities.get(activityLabel(b.activityType)) ?? 0) + 1);
    if (b.status !== "pending") {
      responseSum += (b.updatedAt.getTime() - b.createdAt.getTime()) / 3_600_000;
      responseCount++;
    }
    let bookedMin = 0;
    if (USED.has(b.status)) {
      const s = Math.max(minutes(b.startTime), minutes(ws));
      const e = Math.min(minutes(b.endTime), minutes(we));
      const perDay = Math.max(0, e - s);
      for (const o of inRange) {
        for (let day = o.start < from ? from : o.start; day <= o.end && day <= to; day = addDays(day, 1)) {
          bookedMin += perDay;
          daily.set(day, (daily.get(day) ?? 0) + perDay);
          const wd = new Date(`${day}T00:00:00`).getDay();
          for (let h = startHour; h < endHour; h++) {
            if (minutes(b.startTime) < (h + 1) * 60 && minutes(b.endTime) > h * 60) heatmap[wd][h - startHour]++;
          }
        }
      }
      if (hs) {
        hs.bookedMinutes += bookedMin;
        hs.attendees += b.attendees ?? 0;
      }
      d.minutes += bookedMin;
    }
    departments.set(dept, d);
    details.push({
      id: b.id,
      hall: hs?.name ?? "",
      department: dept,
      activityType: activityLabel(b.activityType),
      startDate: b.startDate,
      endDate: b.endDate,
      startTime: hhmm(b.startTime),
      endTime: hhmm(b.endTime),
      recurring: b.isRecurring ? `${b.recurringWeeks} أسبوع` : "—",
      attendees: b.attendees ?? null,
      status: STATUS_AR[b.status] ?? b.status,
      hours: Math.round(bookedMin / 6) / 10,
    });
  }

  const notes = await db
    .select()
    .from(maintenanceNotesTable)
    .where(sql`${maintenanceNotesTable.createdAt} >= ${from}::date AND ${maintenanceNotesTable.createdAt} < (${to}::date + 1)`);
  let resolvedHours = 0;
  let resolvedCount = 0;
  for (const n of notes) {
    const hs = hallStats.get(n.hallId);
    if (hs) hs.maintenance++;
    if (n.resolvedAt) {
      resolvedHours += (n.resolvedAt.getTime() - n.createdAt.getTime()) / 3_600_000;
      resolvedCount++;
    }
  }

  const hallList = Array.from(hallStats.values()).map(({ bookedMinutes, ...h }) => {
    const bookedHours = Math.round(bookedMinutes / 6) / 10;
    return {
      ...h,
      bookedHours,
      utilization: h.availableHours > 0 ? Math.min(100, Math.round((bookedHours / h.availableHours) * 1000) / 10) : 0,
      avgAttendance: h.approved && h.attendees ? Math.round(h.attendees / h.approved) : null,
    };
  });
  const totalAvailable = hallList.reduce((s, h) => s + (h.status === "disabled" ? 0 : h.availableHours), 0);
  const totalBooked = hallList.reduce((s, h) => s + h.bookedHours, 0);
  const statusCounts = { approved: 0, pending: 0, rejected: 0, cancelled: 0 };
  for (const h of hallList) {
    statusCounts.approved += h.approved;
    statusCounts.pending += h.pending;
    statusCounts.rejected += h.rejected;
    statusCounts.cancelled += h.cancelled;
  }

  return {
    from,
    to,
    workingHoursStart: ws,
    workingHoursEnd: we,
    workingDays: workingDates.length,
    totals: {
      bookings: details.length,
      ...statusCounts,
      bookedHours: Math.round(totalBooked * 10) / 10,
      availableHours: Math.round(totalAvailable * 10) / 10,
      utilization: totalAvailable ? Math.round((totalBooked / totalAvailable) * 1000) / 10 : 0,
      avgResponseHours: responseCount ? Math.round((responseSum / responseCount) * 10) / 10 : null,
      maintenanceOpened: notes.length,
      maintenanceResolved: resolvedCount,
      avgResolutionHours: resolvedCount ? Math.round((resolvedHours / resolvedCount) * 10) / 10 : null,
    },
    halls: hallList,
    departments: Array.from(departments.values())
      .map((d) => ({ ...d, hours: Math.round(d.minutes / 6) / 10 }))
      .sort((a, b) => b.bookings - a.bookings),
    activities: Array.from(activities.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    daily: Array.from(daily.entries()).map(([date, m]) => ({ date, hours: Math.round(m / 6) / 10 })),
    heatmap: { startHour, endHour, rows: heatmap },
    underused: hallList.filter((h) => h.status === "available" && h.utilization < 20).map((h) => h.name),
    details: details.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))),
  };
}

export type OccupancyReport = Awaited<ReturnType<typeof buildOccupancyReport>>;
