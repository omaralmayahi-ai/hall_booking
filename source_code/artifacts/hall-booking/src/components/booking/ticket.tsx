import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MONTHS_AR, WEEKDAYS_AR, parse, todayIso } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * "Booking ticket" kit shared by the bookings, history and holidays pages:
 * a calendar leaf stub (status colour) + perforation + body + actions.
 */

export type StatusTone = "amber" | "emerald" | "teal" | "rose" | "slate" | "orange" | "sky" | "violet";

export const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "بانتظار القرار", tone: "amber" },
  approved: { label: "موافق عليه", tone: "emerald" },
  partially_approved: { label: "موافقة جزئية", tone: "teal" },
  rejected: { label: "مرفوض", tone: "rose" },
  cancelled: { label: "ملغى", tone: "slate" },
  emergency_cancelled: { label: "ملغى طارئ", tone: "orange" },
  completed: { label: "منتهٍ", tone: "sky" },
};

const TONE: Record<StatusTone, { stub: string; text: string; soft: string; dot: string; ring: string }> = {
  amber: { stub: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", soft: "bg-amber-500/10", dot: "bg-amber-500", ring: "ring-amber-500/30" },
  emerald: { stub: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300", soft: "bg-emerald-500/10", dot: "bg-emerald-500", ring: "ring-emerald-500/30" },
  teal: { stub: "bg-teal-600", text: "text-teal-700 dark:text-teal-300", soft: "bg-teal-500/10", dot: "bg-teal-500", ring: "ring-teal-500/30" },
  rose: { stub: "bg-rose-600", text: "text-rose-700 dark:text-rose-300", soft: "bg-rose-500/10", dot: "bg-rose-500", ring: "ring-rose-500/30" },
  slate: { stub: "bg-slate-500", text: "text-slate-600 dark:text-slate-300", soft: "bg-slate-500/10", dot: "bg-slate-400", ring: "ring-slate-400/30" },
  orange: { stub: "bg-orange-600", text: "text-orange-700 dark:text-orange-300", soft: "bg-orange-500/10", dot: "bg-orange-500", ring: "ring-orange-500/30" },
  sky: { stub: "bg-sky-600", text: "text-sky-700 dark:text-sky-300", soft: "bg-sky-500/10", dot: "bg-sky-500", ring: "ring-sky-500/30" },
  violet: { stub: "bg-violet-600", text: "text-violet-700 dark:text-violet-300", soft: "bg-violet-500/10", dot: "bg-violet-500", ring: "ring-violet-500/30" },
};

export function toneOf(status: string): StatusTone {
  return STATUS_META[status]?.tone ?? "slate";
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "slate" as StatusTone };
  const t = TONE[meta.tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", t.soft, t.text, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />
      {meta.label}
    </span>
  );
}

/** Days from today to an ISO date (negative = past). */
export function daysFromToday(date: string): number {
  return Math.round((parse(date).getTime() - parse(todayIso()).getTime()) / 86_400_000);
}

export function relativeDay(date: string): string {
  const d = daysFromToday(date);
  if (d === 0) return "اليوم";
  if (d === 1) return "غداً";
  if (d === -1) return "أمس";
  if (d > 1 && d <= 10) return `بعد ${d} أيام`;
  if (d > 10) return `بعد ${d} يوماً`;
  if (d < -1 && d >= -10) return `قبل ${-d} أيام`;
  return `قبل ${-d} يوماً`;
}

/** Tear-off calendar leaf: weekday, big day number, month (and year when not this year). */
export function DateLeaf({ date, tone = "emerald", muted, className }: { date: string; tone?: StatusTone; muted?: boolean; className?: string }) {
  const d = parse(date.slice(0, 10));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return (
    <div className={cn("relative flex flex-col items-center justify-center text-white w-[4.75rem] shrink-0 py-3 select-none", muted ? "bg-slate-400 dark:bg-slate-600" : TONE[tone].stub, className)}>
      <span className="text-[11px] font-medium opacity-90 leading-none">{WEEKDAYS_AR[d.getDay()]}</span>
      <span className="text-[1.9rem] font-black leading-none my-1 tabular-nums">{d.getDate()}</span>
      <span className="text-[11px] font-semibold leading-none opacity-95">{MONTHS_AR[d.getMonth()]}</span>
      {!sameYear && <span className="text-[10px] opacity-80 mt-0.5 tabular-nums">{d.getFullYear()}</span>}
    </div>
  );
}

/** Ticket row: leaf stub, perforated edge, body and actions. Collapses gracefully on phones. */
export function Ticket({
  date, tone, muted, children, actions, onClick, highlight, className,
}: {
  date: string;
  tone: StatusTone;
  muted?: boolean;
  children: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group relative flex rounded-2xl border bg-card overflow-hidden transition-shadow",
        onClick && "cursor-pointer hover:shadow-md focus-within:shadow-md",
        highlight && cn("ring-2", TONE[tone].ring),
        className,
      )}
      onClick={onClick}
    >
      <DateLeaf date={date} tone={tone} muted={muted} />
      {/* perforation */}
      <div className="relative w-0 shrink-0" aria-hidden>
        <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-background border" />
        <span className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-background border" />
        <span className="absolute inset-y-3 right-0 border-r-2 border-dashed border-border" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-3 p-3.5 sm:p-4 pr-5">
        <div className="flex-1 min-w-0">{children}</div>
        {actions && <div className="flex items-center gap-1 shrink-0 -mb-1 md:mb-0" onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
    </article>
  );
}

/** Pill filter row with counts (replaces drop-down status filters). */
export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number; tone?: StatusTone }[] }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1 scrollbar-none" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 h-9 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-foreground text-background border-foreground font-semibold" : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {o.tone && <span className={cn("w-2 h-2 rounded-full", TONE[o.tone].dot)} />}
            {o.label}
            {o.count !== undefined && (
              <span className={cn("min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums inline-flex items-center justify-center", on ? "bg-background/20" : "bg-muted text-foreground")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({ children, count, hint }: { children: ReactNode; count?: number; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 pt-2">
      <h2 className="text-base font-bold">{children}</h2>
      {count !== undefined && <span className="text-sm text-muted-foreground tabular-nums">{count}</span>}
      {hint && <span className="text-xs text-muted-foreground mr-auto">{hint}</span>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4"><Icon className="w-7 h-7" /></div>
      <p className="font-bold text-lg">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Small "label: value" fact used inside tickets. */
export function Fact({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground min-w-0", className)}>
      <Icon className="w-4 h-4 shrink-0 opacity-70" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** "09:00 – 11:00" that always reads left-to-right inside Arabic text (isolated with LRI…PDI). */
export function TimeRange({ start, end, className }: { start: string; end: string; className?: string }) {
  return <bdi dir="ltr" className={cn("tabular-nums font-semibold text-foreground whitespace-nowrap", className)}>{`\u2066${start} – ${end}\u2069`}</bdi>;
}
