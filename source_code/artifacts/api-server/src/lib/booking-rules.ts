import { and, eq, ne, sql } from "drizzle-orm";
import { db, bookingsTable, hallsTable, holidaysTable, platformSettingsTable, maintenanceNotesTable } from "@workspace/db";
import { addDays, hhmm, isValidDate, isValidTime, localStamp, localDate } from "./time";
import { getOptions } from "./options";

const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Extra request details checked by the advanced booking rules. */
export interface BookingExtras {
  attendees?: number | null;
  needsCatering?: boolean | null;
  needsMeals?: boolean | null;
  coordinatorName?: string | null;
  coordinatorPhone?: string | null;
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start, i = 0; d <= end && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
}

/** An open maintenance note that blocks the hall during part of the requested slot. */
export async function findMaintenanceBlock(hallId: number, slot: Slot) {
  const notes = await db
    .select()
    .from(maintenanceNotesTable)
    .where(
      and(
        eq(maintenanceNotesTable.hallId, hallId),
        eq(maintenanceNotesTable.blocksHall, true),
        sql`${maintenanceNotesTable.status} <> 'resolved'`,
        sql`${maintenanceNotesTable.blockStartDate} IS NOT NULL`,
      ),
    );
  for (const n of notes) {
    const block: Slot = {
      startDate: n.blockStartDate!,
      endDate: n.blockEndDate || n.blockStartDate!,
      startTime: n.blockStartTime || "00:00",
      endTime: n.blockEndTime || "23:59",
    };
    if (slotsOverlap(block, slot)) return n;
  }
  return null;
}

/** Statuses that occupy a hall. */
export const ACTIVE_STATUSES = ["pending", "approved", "partially_approved", "completed"] as const;

export interface Slot {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring?: boolean | null;
  recurringWeeks?: number | null;
}

export const MAX_RECURRING_WEEKS = 52;

/** Expand a (possibly weekly-recurring) booking into its concrete date ranges. */
export function occurrences(s: Slot): { start: string; end: string }[] {
  const weeks = s.isRecurring ? Math.min(Math.max(s.recurringWeeks ?? 1, 1), MAX_RECURRING_WEEKS) : 1;
  const list: { start: string; end: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    list.push({ start: addDays(s.startDate, w * 7), end: addDays(s.endDate, w * 7) });
  }
  return list;
}

/** Two bookings clash when a date range overlaps AND their daily time windows overlap (back-to-back is allowed). */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  const timesOverlap = hhmm(a.startTime) < hhmm(b.endTime) && hhmm(b.startTime) < hhmm(a.endTime);
  if (!timesOverlap) return false;
  const oa = occurrences(a);
  const ob = occurrences(b);
  return oa.some((x) => ob.some((y) => x.start <= y.end && y.start <= x.end));
}

export async function findConflict(hallId: number, slot: Slot, excludeBookingId?: number) {
  const lastDate = occurrences(slot).at(-1)!.end;
  const candidates = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hallId, hallId),
        sql`${bookingsTable.status} IN ('pending','approved','partially_approved','completed')`,
        // coarse pre-filter; recurring bookings are re-checked precisely below
        sql`(${bookingsTable.isRecurring} = true OR (${bookingsTable.startDate} <= ${lastDate} AND ${bookingsTable.endDate} >= ${slot.startDate}))`,
        excludeBookingId ? ne(bookingsTable.id, excludeBookingId) : sql`true`,
      ),
    );
  return candidates.find((b) => slotsOverlap(b, slot)) ?? null;
}

export type RuleResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Validate a booking request. `strict` (requesting departments) additionally enforces
 * working hours; managers may book outside them.
 */
export async function validateBooking(
  hallId: number,
  slot: Slot,
  opts: { strict: boolean; excludeBookingId?: number; allowPast?: boolean; extras?: BookingExtras },
): Promise<RuleResult> {
  if (!isValidDate(slot.startDate) || !isValidDate(slot.endDate)) {
    return { ok: false, status: 400, error: "صيغة التاريخ غير صحيحة" };
  }
  if (!isValidTime(slot.startTime) || !isValidTime(slot.endTime)) {
    return { ok: false, status: 400, error: "صيغة الوقت غير صحيحة" };
  }
  if (slot.endDate < slot.startDate) {
    return { ok: false, status: 400, error: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء أو مساوياً له" };
  }
  if (hhmm(slot.endTime) <= hhmm(slot.startTime)) {
    return { ok: false, status: 400, error: "وقت الانتهاء يجب أن يكون بعد وقت البدء" };
  }
  if (slot.isRecurring && (!slot.recurringWeeks || slot.recurringWeeks < 1 || slot.recurringWeeks > MAX_RECURRING_WEEKS)) {
    return { ok: false, status: 400, error: `عدد أسابيع التكرار يجب أن يكون بين 1 و ${MAX_RECURRING_WEEKS}` };
  }
  if (!opts.allowPast && `${slot.startDate} ${hhmm(slot.startTime)}` < localStamp()) {
    return { ok: false, status: 400, error: "لا يمكن الحجز في وقت سابق للوقت الحالي" };
  }

  const [hall] = await db.select().from(hallsTable).where(eq(hallsTable.id, hallId));
  if (!hall) return { ok: false, status: 404, error: "القاعة غير موجودة" };
  if (hall.status !== "available") {
    return { ok: false, status: 409, error: hall.status === "maintenance" ? "القاعة تحت الصيانة حالياً" : "القاعة غير متاحة للحجز" };
  }

  if (opts.strict) {
    const [settings] = await db.select().from(platformSettingsTable).limit(1);
    const ws = settings?.workingHoursStart ?? "00:00";
    const we = settings?.workingHoursEnd ?? "23:59";
    if (hhmm(slot.startTime) < ws || hhmm(slot.endTime) > we) {
      return { ok: false, status: 400, error: `وقت الحجز يجب أن يكون ضمن ساعات الدوام الرسمي من ${ws} إلى ${we}` };
    }
    const rule = await checkAdvancedRules(slot, hall.capacity, opts.extras ?? {});
    if (!rule.ok) return rule;
  }

  const holidays = await db.select().from(holidaysTable);
  for (const occ of occurrences(slot)) {
    const h = holidays.find((x) => x.date >= occ.start && x.date <= occ.end);
    if (h) return { ok: false, status: 409, error: `يتضمن الحجز عطلة رسمية: ${h.nameAr || h.name} (${h.date})` };
  }

  const block = await findMaintenanceBlock(hallId, slot);
  if (block) {
    const range = block.blockEndDate && block.blockEndDate !== block.blockStartDate ? `${block.blockStartDate} إلى ${block.blockEndDate}` : block.blockStartDate;
    return { ok: false, status: 409, error: `القاعة محجوزة لأعمال صيانة مجدولة (${range}${block.blockStartTime ? ` من ${block.blockStartTime} إلى ${block.blockEndTime}` : ""})` };
  }

  const conflict = await findConflict(hallId, slot, opts.excludeBookingId);
  if (conflict) {
    return {
      ok: false,
      status: 409,
      error: `القاعة محجوزة في الفترة المطلوبة (${conflict.startDate} من ${hhmm(conflict.startTime)} إلى ${hhmm(conflict.endTime)})`,
    };
  }
  return { ok: true };
}

/** Organisation-configurable rules (admin settings) — applied to requesting departments only. */
async function checkAdvancedRules(slot: Slot, capacity: number, extras: BookingExtras): Promise<RuleResult> {
  const o = (await getOptions()).booking;
  const now = new Date();
  const startAt = new Date(`${slot.startDate}T${hhmm(slot.startTime)}:00`);
  const hoursAhead = (startAt.getTime() - now.getTime()) / 3_600_000;

  if (slot.isRecurring && !o.allowRecurring) return { ok: false, status: 400, error: "الحجز المتكرر غير مسموح حالياً" };
  if (slot.isRecurring && (slot.recurringWeeks ?? 1) > o.maxRecurringWeeks) {
    return { ok: false, status: 400, error: `الحد الأقصى لعدد أسابيع التكرار ${o.maxRecurringWeeks} أسبوعاً` };
  }
  if (o.minAdvanceHours > 0 && hoursAhead < o.minAdvanceHours) {
    return { ok: false, status: 400, error: `يجب تقديم طلب الحجز قبل ${o.minAdvanceHours} ساعة على الأقل من موعده` };
  }
  if (o.maxAdvanceDays > 0 && slot.startDate > addDays(localDate(), o.maxAdvanceDays)) {
    return { ok: false, status: 400, error: `لا يمكن الحجز لأكثر من ${o.maxAdvanceDays} يوماً مقدماً` };
  }
  if (o.maxDurationHours > 0) {
    const [sh, sm] = hhmm(slot.startTime).split(":").map(Number);
    const [eh, em] = hhmm(slot.endTime).split(":").map(Number);
    if ((eh * 60 + em - (sh * 60 + sm)) / 60 > o.maxDurationHours) {
      return { ok: false, status: 400, error: `مدة الحجز اليومية لا يمكن أن تتجاوز ${o.maxDurationHours} ساعات` };
    }
  }
  if (o.blockWeekends && o.weekendDays.length) {
    for (const occ of occurrences(slot)) {
      const hit = datesBetween(occ.start, occ.end).find((d) => o.weekendDays.includes(new Date(`${d}T00:00:00`).getDay()));
      if (hit) return { ok: false, status: 400, error: `لا يمكن الحجز في أيام العطلة الأسبوعية (${WEEKDAY_AR[new Date(`${hit}T00:00:00`).getDay()]} ${hit})` };
    }
  }
  if (o.requireAttendees && !(extras.attendees && extras.attendees > 0)) {
    return { ok: false, status: 400, error: "يرجى تحديد عدد الحضور المتوقع" };
  }
  if (extras.attendees && extras.attendees > capacity) {
    return { ok: false, status: 400, error: `عدد الحضور (${extras.attendees}) يتجاوز سعة القاعة (${capacity})` };
  }
  if (o.requireCoordinator && (!extras.coordinatorName?.trim() || !extras.coordinatorPhone?.trim())) {
    return { ok: false, status: 400, error: "يرجى إدخال اسم ورقم هاتف منسق الحجز" };
  }
  if ((extras.needsCatering || extras.needsMeals) && o.cateringLeadHours > 0 && hoursAhead < o.cateringLeadHours) {
    return { ok: false, status: 400, error: `طلبات الضيافة يجب أن تُقدَّم قبل ${o.cateringLeadHours} ساعة على الأقل من موعد الحجز` };
  }
  return { ok: true };
}
