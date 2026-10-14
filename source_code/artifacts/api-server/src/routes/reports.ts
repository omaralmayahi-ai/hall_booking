import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, bookingsTable, hallsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { addDays, hhmm, isValidDate, localDate } from "../lib/time";
import { occurrences } from "../lib/booking-rules";
import { buildOccupancyReport, STATUS_AR, activityLabel, type OccupancyReport } from "../lib/reports";
import { getOptions } from "../lib/options";
import { logAudit, clientIp } from "../lib/auth";

const router: IRouter = Router();

function readRange(q: Record<string, unknown>): { from: string; to: string } | null {
  const from = String(q.from ?? "");
  const to = String(q.to ?? "");
  if (!isValidDate(from) || !isValidDate(to) || to < from) return null;
  if (to > addDays(from, 366)) return null;
  return { from, to };
}

router.get("/reports/occupancy", requireAuth, requireRole("relations_manager", "admin"), async (req, res): Promise<void> => {
  const range = readRange(req.query);
  if (!range) {
    res.status(400).json({ error: "الفترة غير صالحة (الحد الأقصى سنة واحدة)" });
    return;
  }
  res.json(await buildOccupancyReport(range.from, range.to));
});

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function styleHeader(row: ExcelJS.Row, color: string) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.height = 24;
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
}

function addTable(ws: ExcelJS.Worksheet, columns: { header: string; key: string; width: number }[], rows: Record<string, unknown>[], color: string) {
  ws.columns = columns;
  styleHeader(ws.getRow(1), color);
  for (const r of rows) ws.addRow(r);
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    row.font = { name: "Arial", size: 10 };
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
      if (i % 2 === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } };
    });
  });
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

async function buildWorkbook(r: OccupancyReport) {
  const opts = await getOptions();
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.identity.systemNameAr;
  wb.created = new Date();
  const brand = "FF1366C4";

  const sum = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
  sum.columns = [{ width: 34 }, { width: 26 }];
  const title = sum.addRow([`تقرير إشغال القاعات — ${opts.identity.systemNameAr}`]);
  sum.mergeCells(title.number, 1, title.number, 2);
  title.font = { bold: true, size: 14, name: "Arial", color: { argb: brand } };
  title.alignment = { horizontal: "center" };
  const meta = [
    ["الفترة", `${r.from} — ${r.to}`],
    ["أيام العمل", r.workingDays],
    ["ساعات الدوام", `من ${r.workingHoursStart} إلى ${r.workingHoursEnd}`],
    ["إجمالي الطلبات", r.totals.bookings],
    ["المقبولة / المنفذة", r.totals.approved],
    ["قيد الانتظار", r.totals.pending],
    ["المرفوضة", r.totals.rejected],
    ["الملغاة", r.totals.cancelled],
    ["الساعات المحجوزة", r.totals.bookedHours],
    ["الساعات المتاحة", r.totals.availableHours],
    ["نسبة الإشغال الكلية %", r.totals.utilization],
    ["متوسط زمن الاستجابة (ساعة)", r.totals.avgResponseHours ?? "—"],
    ["أعمال الصيانة المسجلة", r.totals.maintenanceOpened],
    ["أعمال الصيانة المنجزة", r.totals.maintenanceResolved],
    ["القاعات قليلة الاستخدام (أقل من 20%)", r.underused.join("، ") || "لا يوجد"],
  ];
  sum.addRow([]);
  for (const m of meta) {
    const row = sum.addRow(m);
    row.font = { name: "Arial", size: 11 };
    row.getCell(1).font = { name: "Arial", size: 11, bold: true };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FB" } };
    row.eachCell((c) => {
      c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      c.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    });
  }

  addTable(
    wb.addWorksheet("القاعات"),
    [
      { header: "القاعة", key: "name", width: 26 },
      { header: "السعة", key: "capacity", width: 10 },
      { header: "الطلبات", key: "bookings", width: 10 },
      { header: "المقبولة", key: "approved", width: 10 },
      { header: "الملغاة", key: "cancelled", width: 10 },
      { header: "الساعات المحجوزة", key: "bookedHours", width: 16 },
      { header: "الساعات المتاحة", key: "availableHours", width: 16 },
      { header: "نسبة الإشغال %", key: "utilization", width: 15 },
      { header: "متوسط الحضور", key: "avgAttendance", width: 14 },
      { header: "أعمال الصيانة", key: "maintenance", width: 14 },
    ],
    r.halls,
    brand,
  );
  addTable(
    wb.addWorksheet("الجهات"),
    [
      { header: "الجهة", key: "name", width: 34 },
      { header: "عدد الطلبات", key: "bookings", width: 14 },
      { header: "الساعات", key: "hours", width: 12 },
      { header: "الملغاة", key: "cancelled", width: 12 },
    ],
    r.departments,
    brand,
  );
  addTable(
    wb.addWorksheet("الأنشطة"),
    [
      { header: "نوع النشاط", key: "type", width: 30 },
      { header: "العدد", key: "count", width: 12 },
    ],
    r.activities,
    brand,
  );
  const heat = wb.addWorksheet("أوقات الذروة");
  const hours = Array.from({ length: r.heatmap.endHour - r.heatmap.startHour }, (_, i) => `${String(r.heatmap.startHour + i).padStart(2, "0")}:00`);
  addTable(
    heat,
    [{ header: "اليوم", key: "day", width: 14 }, ...hours.map((h, i) => ({ header: h, key: `h${i}`, width: 9 }))],
    r.heatmap.rows.map((row, wd) => ({ day: WEEKDAYS[wd], ...Object.fromEntries(row.map((v, i) => [`h${i}`, v])) })),
    brand,
  );
  addTable(
    wb.addWorksheet("تفاصيل الحجوزات"),
    [
      { header: "رقم الحجز", key: "id", width: 10 },
      { header: "القاعة", key: "hall", width: 22 },
      { header: "الجهة", key: "department", width: 28 },
      { header: "النشاط", key: "activityType", width: 18 },
      { header: "من تاريخ", key: "startDate", width: 13 },
      { header: "إلى تاريخ", key: "endDate", width: 13 },
      { header: "من", key: "startTime", width: 8 },
      { header: "إلى", key: "endTime", width: 8 },
      { header: "التكرار", key: "recurring", width: 10 },
      { header: "الحضور", key: "attendees", width: 9 },
      { header: "الحالة", key: "status", width: 13 },
      { header: "الساعات", key: "hours", width: 9 },
    ],
    r.details,
    brand,
  );
  return wb;
}

router.get("/reports/occupancy.xlsx", requireAuth, requireRole("relations_manager", "admin"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const range = readRange(req.query);
  if (!range) {
    res.status(400).json({ error: "الفترة غير صالحة" });
    return;
  }
  const report = await buildOccupancyReport(range.from, range.to);
  const wb = await buildWorkbook(report);
  await logAudit(req.user!.id, req.user!.username, "export_report", "report", undefined, `${range.from}..${range.to}`, clientIp(req));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="occupancy-${range.from}-${range.to}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

/** Everything the services team must prepare for the bookings of one day. */
router.get("/reports/daily-prep", requireAuth, requireRole("relations_manager", "admin"), async (req, res): Promise<void> => {
  const date = isValidDate(req.query.date) ? (req.query.date as string) : localDate();
  const rows = await db
    .select({ booking: bookingsTable, hall: hallsTable, user: usersTable })
    .from(bookingsTable)
    .leftJoin(hallsTable, eq(bookingsTable.hallId, hallsTable.id))
    .leftJoin(usersTable, eq(bookingsTable.userId, usersTable.id))
    .where(
      sql`${bookingsTable.status} IN ('approved','partially_approved','completed') AND (${bookingsTable.isRecurring} = true OR (${bookingsTable.startDate} <= ${date} AND ${bookingsTable.endDate} >= ${date}))`,
    );
  const items = rows
    .filter(({ booking: b }) => occurrences(b).some((o) => o.start <= date && o.end >= date))
    .map(({ booking: b, hall, user: u }) => ({
      id: b.id,
      hallId: b.hallId,
      hall: hall?.nameAr || hall?.name || "",
      location: hall?.locationAr || hall?.location || "",
      startTime: hhmm(b.startTime),
      endTime: hhmm(b.endTime),
      department: b.manualDepartmentName || u?.departmentName || u?.username || "",
      activityType: activityLabel(b.activityType),
      attendees: b.attendees,
      seatingLayout: b.seatingLayout,
      requestedItems: b.requestedItems ?? [],
      catering: b.needsCatering ? (b.cateringApproved === false ? "مرفوضة" : "مطلوبة") : null,
      meals: b.needsMeals ? (b.mealsApproved === false ? "مرفوضة" : "مطلوبة") : null,
      coordinatorName: b.coordinatorName,
      coordinatorPhone: b.coordinatorPhone,
      notes: b.notes,
      status: STATUS_AR[b.status] ?? b.status,
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.hall.localeCompare(b.hall));
  res.json({ date, weekday: WEEKDAYS[new Date(`${date}T00:00:00`).getDay()], items });
});

export default router;
