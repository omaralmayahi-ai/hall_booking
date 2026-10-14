/** Consistent Arabic (Iraq) date formatting with Latin digits, as used across the organisation. */
const LOCALE = "ar-IQ-u-nu-latn";

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(LOCALE, { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.toLocaleDateString(LOCALE, { year: "numeric", month: "2-digit", day: "2-digit" })} ${d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "—";
}
