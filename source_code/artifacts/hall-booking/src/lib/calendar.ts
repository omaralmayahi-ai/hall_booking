import type { CalendarData, CalendarEvent } from "./api";

export const MONTHS_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
export const WEEKDAYS_SHORT = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const pad = (n: number) => String(n).padStart(2, "0");

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parse(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function todayIso(): string {
  return iso(new Date());
}
export function weekday(s: string): number {
  return parse(s).getDay();
}
export function toMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}
export function fromMin(m: number): string {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Weeks start on Sunday (the Iraqi working week). */
export function startOfWeek(s: string): string {
  return addDays(s, -weekday(s));
}

/** 6×7 grid of ISO dates covering the month of `anchor`. */
export function monthGrid(anchor: string): { days: string[]; from: string; to: string; month: number; year: number } {
  const d = parse(anchor);
  const first = iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const from = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return { days, from, to: days[41], month: d.getMonth(), year: d.getFullYear() };
}

export function monthTitle(anchor: string): string {
  const d = parse(anchor);
  return `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export function longDate(s: string): string {
  const d = parse(s);
  return `${WEEKDAYS_AR[d.getDay()]} ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

export type DayState = "past" | "holiday" | "weekend" | "maintenance" | "full" | "partial" | "free";

export interface Interval {
  start: number;
  end: number;
}

/** Merge overlapping minute intervals. */
export function merge(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export interface DayInfo {
  date: string;
  state: DayState;
  events: CalendarEvent[];
  holiday?: string;
  busy: Interval[];
  free: Interval[];
  freeMinutes: number;
}

/** Availability of one hall on one day within working hours. */
export function dayInfo(data: CalendarData, hallId: number, date: string, step = 30): DayInfo {
  const ws = toMin(data.workingHoursStart);
  const we = toMin(data.workingHoursEnd);
  const events = data.events.filter((e) => e.hallId === hallId && e.date === date);
  const holiday = data.holidays.find((h) => h.date === date)?.name;
  const isWeekend = data.weekendDays.includes(weekday(date));
  const busy = merge(
    events.map((e) => ({
      start: e.startTime ? Math.max(ws, toMin(e.startTime)) : ws,
      end: e.endTime ? Math.min(we, toMin(e.endTime)) : we,
    })).filter((i) => i.end > i.start),
  );
  const free: Interval[] = [];
  let cursor = ws;
  if (date === data.today) {
    // Today: time already passed is not bookable.
    const now = new Date();
    cursor = Math.max(ws, Math.ceil((now.getHours() * 60 + now.getMinutes()) / step) * step);
  }
  for (const b of busy) {
    if (b.start - cursor >= step) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (we - cursor >= step) free.push({ start: cursor, end: we });
  const freeMinutes = free.reduce((s, f) => s + f.end - f.start, 0);
  const fullDayMaintenance = events.some((e) => e.type === "maintenance" && !e.startTime);
  let state: DayState;
  if (date < data.today) state = "past";
  else if (holiday) state = "holiday";
  else if (fullDayMaintenance) state = "maintenance";
  else if (isWeekend && data.blockWeekends) state = "weekend";
  else if (freeMinutes === 0) state = date === data.today && !busy.length ? "past" : "full";
  else if (busy.length) state = "partial";
  else state = "free";
  return { date, state, events, holiday, busy, free, freeMinutes };
}

export const DAY_STATE_STYLE: Record<DayState, { label: string; cell: string; dot: string }> = {
  free: { label: "متاح", cell: "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200", dot: "bg-emerald-500" },
  partial: { label: "محجوز جزئياً", cell: "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200", dot: "bg-amber-500" },
  full: { label: "محجوز بالكامل", cell: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-200", dot: "bg-red-500" },
  maintenance: { label: "صيانة", cell: "bg-rose-50 text-rose-800 border-rose-200 [background-image:repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(244_63_94/0.08)_6px,rgb(244_63_94/0.08)_12px)] dark:bg-rose-500/10 dark:text-rose-200", dot: "bg-rose-500" },
  holiday: { label: "عطلة رسمية", cell: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-500/10 dark:text-violet-200", dot: "bg-violet-500" },
  weekend: { label: "عطلة أسبوعية", cell: "bg-muted/60 text-muted-foreground border-transparent", dot: "bg-slate-400" },
  past: { label: "منتهٍ", cell: "bg-transparent text-muted-foreground/50 border-transparent", dot: "bg-slate-300" },
};
