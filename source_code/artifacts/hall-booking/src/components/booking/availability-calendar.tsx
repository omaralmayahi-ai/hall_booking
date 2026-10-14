import { useMemo, useState } from "react";
import { ChevronRight, ChevronLeft, CalendarDays, Clock, Wrench, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApiQuery, type CalendarData } from "@/lib/api";
import {
  DAY_STATE_STYLE, WEEKDAYS_SHORT, dayInfo, fromMin, longDate, monthGrid, monthTitle, parse, todayIso, toMin,
  type DayState,
} from "@/lib/calendar";
import { activityLabel } from "@/lib/labels";

interface Props {
  hallId: number;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
  onPickSlot?: (start: string, end: string) => void;
  /** Managers may book on weekends / outside rules. */
  managerMode?: boolean;
  step?: number;
}

const BLOCKING: DayState[] = ["past", "holiday", "maintenance", "full"];

/**
 * Month view of one hall's occupancy so the requester sees booked days at a glance
 * instead of trying dates one by one. Picking a day shows its free time windows.
 */
export function AvailabilityCalendar({ hallId, selectedDate, onSelectDate, onPickSlot, managerMode, step = 30 }: Props) {
  const [anchor, setAnchor] = useState(() => selectedDate || todayIso());
  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const { data, isLoading } = useApiQuery<CalendarData>(`/calendar?from=${grid.from}&to=${grid.to}&hallId=${hallId}`, {
    staleTime: 20_000,
  });

  const infos = useMemo(() => {
    if (!data) return new Map<string, ReturnType<typeof dayInfo>>();
    return new Map(grid.days.map((d) => [d, dayInfo(data, hallId, d, step)]));
  }, [data, grid.days, hallId, step]);

  const selected = selectedDate ? infos.get(selectedDate) : undefined;
  const shiftMonth = (n: number) => {
    const d = parse(anchor);
    const next = new Date(d.getFullYear(), d.getMonth() + n, 1);
    setAnchor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
  };

  const ws = data ? toMin(data.workingHoursStart) : 7 * 60;
  const we = data ? toMin(data.workingHoursEnd) : 15 * 60;
  const span = Math.max(1, we - ws);

  return (
    <div className="rounded-xl border bg-card overflow-hidden" dir="rtl">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-muted/40">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <CalendarDays className="w-4 h-4 text-primary" />
          {monthTitle(anchor)}
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(-1)} aria-label="الشهر السابق">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAnchor(todayIso())}>
            اليوم
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(1)} aria-label="الشهر التالي">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-2.5">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS_SHORT.map((w, i) => (
            <div key={w} className={cn("text-center text-[11px] font-medium py-1", data?.weekendDays.includes(i) ? "text-muted-foreground/60" : "text-muted-foreground")}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.days.map((d) => {
            const info = infos.get(d);
            const inMonth = parse(d).getMonth() === grid.month;
            const state = info?.state ?? "free";
            const disabled = !info || BLOCKING.includes(state) || (state === "weekend" && !managerMode);
            const isSel = d === selectedDate;
            const bookings = info?.events.filter((e) => e.type === "booking").length ?? 0;
            return (
              <button
                key={d}
                type="button"
                disabled={disabled && !isSel}
                onClick={() => onSelectDate(d)}
                title={info ? `${longDate(d)} — ${DAY_STATE_STYLE[state].label}${info.holiday ? `: ${info.holiday}` : ""}` : d}
                className={cn(
                  "relative aspect-square sm:aspect-[1.15] rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors",
                  info ? DAY_STATE_STYLE[state].cell : "bg-muted/30 border-transparent",
                  !inMonth && "opacity-40",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                  isSel && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  d === data?.today && "outline outline-1 outline-primary/60",
                )}
              >
                <span className="tabular-nums">{parse(d).getDate()}</span>
                {state === "maintenance" ? (
                  <Wrench className="w-2.5 h-2.5" />
                ) : bookings > 0 && state !== "past" ? (
                  <span className="flex gap-0.5">
                    {Array.from({ length: Math.min(bookings, 3) }).map((_, i) => (
                      <span key={i} className={cn("w-1 h-1 rounded-full", DAY_STATE_STYLE[state].dot)} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[11px] text-muted-foreground">
          {(["free", "partial", "full", "maintenance", "holiday", "weekend"] as DayState[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={cn("w-2 h-2 rounded-full", DAY_STATE_STYLE[s].dot)} />
              {DAY_STATE_STYLE[s].label}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <div className="border-t p-3 space-y-2.5 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{longDate(selected.date)}</p>
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border", DAY_STATE_STYLE[selected.state].cell)}>
              {selected.holiday ?? DAY_STATE_STYLE[selected.state].label}
            </span>
          </div>

          {/* Timeline of the working day */}
          <div>
            <div className="relative h-7 rounded-md bg-emerald-100/70 dark:bg-emerald-500/15 overflow-hidden border border-emerald-200/70 dark:border-emerald-500/20" dir="ltr">
              {selected.events.map((e) => {
                const s = e.startTime ? Math.max(ws, toMin(e.startTime)) : ws;
                const en = e.endTime ? Math.min(we, toMin(e.endTime)) : we;
                if (en <= s) return null;
                return (
                  <div
                    key={e.id}
                    className={cn(
                      "absolute inset-y-0 border-x border-white/60",
                      e.type === "maintenance" ? "bg-rose-400/80" : e.status === "pending" ? "bg-amber-400/80" : "bg-red-400/85",
                    )}
                    style={{ left: `${((s - ws) / span) * 100}%`, width: `${((en - s) / span) * 100}%` }}
                    title={`${e.startTime ?? ""}-${e.endTime ?? ""} ${e.title}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 tabular-nums" dir="ltr">
              <span>{data?.workingHoursStart}</span>
              <span>{fromMin(ws + Math.round(span / 2 / 30) * 30)}</span>
              <span>{data?.workingHoursEnd}</span>
            </div>
          </div>

          {selected.free.length > 0 && onPickSlot && !BLOCKING.includes(selected.state) && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">الأوقات المتاحة (انقر لاختيارها):</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.free.map((f) => (
                  <button
                    key={f.start}
                    type="button"
                    onClick={() => onPickSlot(fromMin(f.start), fromMin(Math.min(f.end, f.start + 120)))}
                    className="text-xs px-2.5 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 tabular-nums dark:bg-emerald-500/10 dark:text-emerald-200"
                  >
                    <span dir="ltr">{fromMin(f.start)} – {fromMin(f.end)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected.events.length > 0 && (
            <ul className="space-y-1">
              {selected.events
                .slice()
                .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
                .map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-xs">
                    {e.type === "maintenance" ? <Wrench className="w-3.5 h-3.5 text-rose-500 shrink-0" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className="tabular-nums font-medium" dir="ltr">
                      {e.startTime ? `${e.startTime} – ${e.endTime}` : "طوال اليوم"}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {e.type === "maintenance" ? e.title : e.mine ? `حجزكم: ${activityLabel(e.title)}` : e.department ? `${e.department} — ${activityLabel(e.title)}` : e.status === "pending" ? "محجوز (بانتظار الموافقة)" : "محجوز"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

