/** Local (server time-zone) date helpers. Booking dates/times are stored as local "YYYY-MM-DD" / "HH:MM" strings. */

const pad = (n: number) => String(n).padStart(2, "0");

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTime(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD HH:MM" for lexical comparison against booking strings. */
export function localStamp(d = new Date()): string {
  return `${localDate(d)} ${localTime(d)}`;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && localDate(d) === s;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === "string" && TIME_RE.test(s.slice(0, 5));
}

/** Normalise "HH:MM[:SS]" to "HH:MM". */
export function hhmm(s: string): string {
  return s.slice(0, 5);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
