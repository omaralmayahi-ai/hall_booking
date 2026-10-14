import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Consistent page title block: icon tile + title + description on the right, actions on the left (wraps on mobile). */
export function PageHeader({ icon: Icon, title, description, actions }: { icon?: LucideIcon; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-primary/75 text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{title}</h1>
          {description && <p className="text-muted-foreground text-sm mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

/** Small KPI tile used on dashboards and reports. */
export function StatTile({ icon: Icon, label, value, hint, tone = "primary" }: { icon: LucideIcon; label: string; value: ReactNode; hint?: ReactNode; tone?: "primary" | "emerald" | "amber" | "rose" | "sky" | "violet" | "slate" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    sky: "bg-sky-500/10 text-sky-600",
    violet: "bg-violet-500/10 text-violet-600",
    slate: "bg-slate-500/10 text-slate-600",
  };
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3 shadow-xs">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{hint}</p>}
      </div>
    </div>
  );
}
