import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, List, Loader2, MapPin, Plus, Printer, Rows3, Users, Wrench, Building2,
} from "lucide-react";
import { useListHalls } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { BookingDialog, type BookableHall } from "@/components/booking/booking-dialog";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useApiQuery, type CalendarData, type CalendarEvent } from "@/lib/api";
import {
  MONTHS_AR, WEEKDAYS_AR, WEEKDAYS_SHORT, addDays, fromMin, longDate, monthGrid, monthTitle, parse, startOfWeek, toMin, todayIso,
} from "@/lib/calendar";
import { BOOKING_STATUS, activityLabel } from "@/lib/labels";

type View = "month" | "week" | "day" | "list";

const VIEWS: { value: View; label: string; icon: typeof CalendarDays }[] = [
  { value: "month", label: "شهر", icon: CalendarDays },
  { value: "week", label: "أسبوع", icon: CalendarRange },
  { value: "day", label: "يوم", icon: Rows3 },
  { value: "list", label: "قائمة", icon: List },
];

function eventClass(e: CalendarEvent) {
  if (e.type === "maintenance") return "bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200";
  if (e.mine) return "bg-primary/10 border-primary/40 text-primary";
  switch (e.status) {
    case "pending":
      return "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200";
    case "completed":
      return "bg-slate-50 border-slate-300 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300";
    case "approved":
    case "partially_approved":
      return "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200";
    default:
      return "bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200";
  }
}

function eventLabel(e: CalendarEvent) {
  if (e.type === "maintenance") return e.title || "صيانة";
  if (e.department) return `${e.department} — ${activityLabel(e.title)}`;
  return e.mine ? activityLabel(e.title) : e.status === "pending" ? "محجوز (بانتظار الموافقة)" : "محجوز";
}

const sortEvents = (a: CalendarEvent, b: CalendarEvent) => (a.startTime ?? "").localeCompare(b.startTime ?? "");

function readView(): View {
  try {
    const v = localStorage.getItem("calendar:view") as View | null;
    if (v && VIEWS.some((x) => x.value === v)) return v;
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "month";
}

export default function CalendarPage() {
  const { user } = useAuth();
  const canBook = user?.role === "requesting_department" || user?.role === "relations_manager";
  const isManager = user?.role === "relations_manager";
  const [view, setView] = useState<View>(readView);
  const [anchor, setAnchor] = useState(todayIso());
  const [hallFilter, setHallFilter] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [bookOn, setBookOn] = useState<{ date: string; hall: BookableHall | null } | null>(null);
  const { data: hallsFull } = useListHalls({});

  useEffect(() => {
    try {
      localStorage.setItem("calendar:view", view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const range = useMemo(() => {
    if (view === "month") {
      const g = monthGrid(anchor);
      return { from: g.from, to: g.to };
    }
    if (view === "week") {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
    if (view === "day") return { from: anchor, to: anchor };
    return { from: anchor, to: addDays(anchor, 30) };
  }, [view, anchor]);

  const hallQ = hallFilter !== "all" ? `&hallId=${hallFilter}` : "";
  const { data, isLoading, isFetching } = useApiQuery<CalendarData>(`/calendar?from=${range.from}&to=${range.to}${hallQ}`, {
    refetchInterval: 60_000,
  });

  const halls = useMemo(() => {
    const list = data?.halls ?? [];
    return hallFilter === "all" ? list.filter((h) => h.status !== "disabled") : list.filter((h) => String(h.id) === hallFilter);
  }, [data?.halls, hallFilter]);
  const hallName = (id: number) => data?.halls.find((h) => h.id === id)?.name ?? "";

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of data?.events ?? []) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    for (const l of m.values()) l.sort(sortEvents);
    return m;
  }, [data?.events]);
  const holidayOf = (d: string) => data?.holidays.find((h) => h.date === d)?.name;
  const isWeekend = (d: string) => data?.weekendDays.includes(parse(d).getDay()) ?? false;

  const shift = (n: number) => {
    if (view === "month") {
      const d = parse(anchor);
      const next = new Date(d.getFullYear(), d.getMonth() + n, 1);
      setAnchor(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
    } else setAnchor(addDays(anchor, n * (view === "week" ? 7 : view === "day" ? 1 : 30)));
  };

  const title = useMemo(() => {
    if (view === "month") return monthTitle(anchor);
    if (view === "day") return longDate(anchor);
    const a = parse(range.from);
    const b = parse(range.to);
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${MONTHS_AR[b.getMonth()]} ${b.getFullYear()}`
      : `${a.getDate()} ${MONTHS_AR[a.getMonth()]} – ${b.getDate()} ${MONTHS_AR[b.getMonth()]} ${b.getFullYear()}`;
  }, [view, anchor, range]);

  const startBooking = (date: string, hallId?: number) => {
    if (!canBook || date < todayIso()) return;
    const h = hallId ?? (hallFilter !== "all" ? Number(hallFilter) : undefined);
    const hall = (hallsFull ?? []).find((x) => x.id === h) as BookableHall | undefined;
    setBookOn({ date, hall: hall && hall.status === "available" ? hall : null });
  };

  const Chip = ({ e, compact }: { e: CalendarEvent; compact?: boolean }) => (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        setSelectedEvent(e);
      }}
      className={cn("w-full text-right rounded-md border-r-[3px] border px-1.5 py-0.5 text-[11px] leading-snug truncate hover:brightness-95", eventClass(e))}
      title={`${e.startTime ?? ""}${e.endTime ? `–${e.endTime}` : ""} ${hallName(e.hallId)} — ${eventLabel(e)}`}
    >
      {e.type === "maintenance" && <Wrench className="inline w-3 h-3 ml-0.5" />}
      {e.startTime && <span className="tabular-nums font-semibold ml-1">{e.startTime}</span>}
      {!compact && hallFilter === "all" && <span className="font-semibold">{hallName(e.hallId)} · </span>}
      {eventLabel(e)}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarDays}
        title="تقويم القاعات"
        description={canBook ? "انقر على أي يوم متاح لبدء حجز جديد، أو على الحجز لعرض تفاصيله" : "إشغال جميع القاعات والصيانة المجدولة"}
        actions={
          canBook ? (
            <Button onClick={() => startBooking(anchor >= todayIso() ? anchor : todayIso())}>
              <Plus className="w-4 h-4" /> {isManager ? "حجز مباشر" : "طلب حجز"}
            </Button>
          ) : undefined
        }
      />

      <Card className="p-2.5 flex flex-col lg:flex-row lg:items-center gap-2 lg:justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => shift(-1)} aria-label="السابق"><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setAnchor(todayIso())}>اليوم</Button>
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => shift(1)} aria-label="التالي"><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="text-base font-bold px-2 min-w-0">{title}</h2>
          {(isLoading || isFetching) && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={hallFilter} onValueChange={setHallFilter}>
            <SelectTrigger className="h-9 w-48"><Building2 className="w-4 h-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع القاعات</SelectItem>
              {(data?.halls ?? []).map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors",
                  view === v.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <v.icon className="w-3.5 h-3.5" />
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-emerald-300 bg-emerald-50" />مقبول</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-amber-300 bg-amber-50" />قيد الانتظار</span>
        {user?.role === "requesting_department" && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-primary/40 bg-primary/10" />حجوزاتي</span>}
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-sky-300 bg-sky-50" />محجوز</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-rose-300 bg-rose-50" />صيانة</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-violet-300 bg-violet-50" />عطلة رسمية</span>
      </div>

      {view === "month" && (
        <Card className="p-2 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS_AR.map((w, i) => (
                <div key={w} className={cn("text-center text-xs font-semibold py-1.5 rounded-md", data?.weekendDays.includes(i) ? "text-muted-foreground/70 bg-muted/40" : "text-muted-foreground bg-muted/70")}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid(anchor).days.map((d) => {
                const ev = byDate.get(d) ?? [];
                const inMonth = parse(d).getMonth() === parse(anchor).getMonth();
                const holiday = holidayOf(d);
                const past = d < todayIso();
                return (
                  <div
                    key={d}
                    onClick={() => startBooking(d)}
                    className={cn(
                      "min-h-[104px] rounded-lg border p-1.5 flex flex-col gap-1 transition-colors",
                      !inMonth && "opacity-45",
                      holiday ? "bg-violet-50/70 border-violet-200 dark:bg-violet-500/10" : isWeekend(d) ? "bg-muted/40" : "bg-card",
                      canBook && !past && "cursor-pointer hover:border-primary/50",
                      d === todayIso() && "ring-2 ring-primary/60",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-bold tabular-nums w-6 h-6 rounded-full flex items-center justify-center", d === todayIso() && "bg-primary text-primary-foreground")}>{parse(d).getDate()}</span>
                      {holiday && <span className="text-[10px] text-violet-700 truncate max-w-[70%]">{holiday}</span>}
                    </div>
                    {ev.slice(0, 3).map((e) => <Chip key={e.id} e={e} />)}
                    {ev.length > 3 && (
                      <button type="button" onClick={(x) => { x.stopPropagation(); setAnchor(d); setView("day"); }} className="text-[11px] text-primary font-medium text-right hover:underline">
                        +{ev.length - 3} أخرى
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {view === "week" && (
        <Card className="p-2 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-1 table-fixed">
            <thead>
              <tr>
                <th className="w-36 text-xs text-muted-foreground font-semibold text-start p-1.5">القاعة</th>
                {Array.from({ length: 7 }, (_, i) => addDays(range.from, i)).map((d) => (
                  <th key={d} className={cn("text-xs font-semibold p-1.5 rounded-md", d === todayIso() ? "bg-primary text-primary-foreground" : isWeekend(d) ? "bg-muted/40 text-muted-foreground" : "bg-muted/70")}>
                    <div>{WEEKDAYS_AR[parse(d).getDay()]}</div>
                    <div className="tabular-nums font-normal opacity-80">{parse(d).getDate()}/{parse(d).getMonth() + 1}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {halls.map((h) => (
                <tr key={h.id}>
                  <td className="align-top p-1.5 rounded-md bg-muted/30">
                    <p className="text-xs font-bold truncate">{h.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{h.capacity}</p>
                    {h.status === "maintenance" && <p className="text-[10px] text-rose-600 flex items-center gap-1"><Wrench className="w-3 h-3" />تحت الصيانة</p>}
                  </td>
                  {Array.from({ length: 7 }, (_, i) => addDays(range.from, i)).map((d) => {
                    const ev = (byDate.get(d) ?? []).filter((e) => e.hallId === h.id);
                    const holiday = holidayOf(d);
                    return (
                      <td
                        key={d}
                        onClick={() => startBooking(d, h.id)}
                        className={cn(
                          "align-top p-1 rounded-md border h-20 space-y-1",
                          holiday ? "bg-violet-50/70 border-violet-200" : isWeekend(d) ? "bg-muted/30" : "bg-card",
                          canBook && d >= todayIso() && h.status === "available" && "cursor-pointer hover:border-primary/50",
                        )}
                      >
                        {holiday && <p className="text-[10px] text-violet-700 truncate">{holiday}</p>}
                        {ev.map((e) => <Chip key={e.id} e={e} compact />)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {view === "day" && data && (
        <Card className="p-3 overflow-x-auto">
          {(() => {
            const ws = Math.floor(toMin(data.workingHoursStart) / 60) * 60 - 60;
            const we = Math.ceil(toMin(data.workingHoursEnd) / 60) * 60 + 60;
            const startH = Math.max(0, ws);
            const endH = Math.min(24 * 60, we);
            const span = endH - startH;
            const hours = Array.from({ length: span / 60 + 1 }, (_, i) => startH + i * 60);
            const ev = byDate.get(anchor) ?? [];
            const holiday = holidayOf(anchor);
            return (
              <div className="min-w-[760px] space-y-2">
                {holiday && <div className="rounded-lg bg-violet-50 text-violet-800 border border-violet-200 px-3 py-2 text-sm">عطلة رسمية: {holiday}</div>}
                <div className="grid grid-cols-[9rem_1fr] gap-2 items-end">
                  <div />
                  <div className="relative h-5" dir="ltr">
                    {hours.map((m) => (
                      <span key={m} className="absolute -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ left: `${((m - startH) / span) * 100}%` }}>{fromMin(m)}</span>
                    ))}
                  </div>
                </div>
                {halls.map((h) => {
                  const list = ev.filter((e) => e.hallId === h.id);
                  return (
                    <div key={h.id} className="grid grid-cols-[9rem_1fr] gap-2 items-stretch">
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-xs font-bold truncate">{h.name}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{h.capacity}</p>
                      </div>
                      <div
                        className={cn("relative h-14 rounded-md border bg-card", canBook && anchor >= todayIso() && h.status === "available" && "cursor-pointer hover:border-primary/50")}
                        dir="ltr"
                        onClick={() => startBooking(anchor, h.id)}
                      >
                        <div
                          className="absolute inset-y-0 bg-emerald-50/70 dark:bg-emerald-500/5"
                          style={{ left: `${((toMin(data.workingHoursStart) - startH) / span) * 100}%`, width: `${((toMin(data.workingHoursEnd) - toMin(data.workingHoursStart)) / span) * 100}%` }}
                        />
                        {hours.map((m) => <div key={m} className="absolute inset-y-0 border-l border-dashed border-border/70" style={{ left: `${((m - startH) / span) * 100}%` }} />)}
                        {list.map((e) => {
                          const s = e.startTime ? toMin(e.startTime) : startH;
                          const en = e.endTime ? toMin(e.endTime) : endH;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={(x) => { x.stopPropagation(); setSelectedEvent(e); }}
                              className={cn("absolute top-1.5 bottom-1.5 rounded-md border px-1.5 text-[11px] text-right overflow-hidden", eventClass(e))}
                              style={{ left: `${(Math.max(0, s - startH) / span) * 100}%`, width: `${(Math.max(15, Math.min(en, endH) - Math.max(s, startH)) / span) * 100}%` }}
                              dir="rtl"
                              title={eventLabel(e)}
                            >
                              <span className="font-semibold tabular-nums block" dir="ltr">{e.startTime ?? ""}{e.endTime ? `–${e.endTime}` : ""}</span>
                              <span className="block truncate">{eventLabel(e)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Card>
      )}

      {view === "list" && (
        <div className="space-y-3">
          {Array.from({ length: 31 }, (_, i) => addDays(range.from, i))
            .filter((d) => (byDate.get(d)?.length ?? 0) > 0 || holidayOf(d))
            .map((d) => (
              <Card key={d} className="overflow-hidden">
                <div className={cn("flex items-center justify-between px-3.5 py-2 border-b", d === todayIso() ? "bg-primary/10" : "bg-muted/40")}>
                  <p className="font-bold text-sm">{longDate(d)}</p>
                  {holidayOf(d) && <span className="text-xs text-violet-700">عطلة: {holidayOf(d)}</span>}
                </div>
                <div className="divide-y">
                  {(byDate.get(d) ?? []).map((e) => (
                    <button key={e.id} type="button" onClick={() => setSelectedEvent(e)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-right hover:bg-muted/40">
                      <span className={cn("w-1.5 self-stretch rounded-full", e.type === "maintenance" ? "bg-rose-500" : e.status === "pending" ? "bg-amber-500" : e.mine ? "bg-primary" : "bg-emerald-500")} />
                      <span className="tabular-nums text-sm font-semibold w-24 shrink-0" dir="ltr">{e.startTime ? `${e.startTime}–${e.endTime}` : "طوال اليوم"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{hallName(e.hallId)}</span>
                        <span className="block text-xs text-muted-foreground truncate">{eventLabel(e)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          {!isLoading && ![...byDate.values()].some((l) => l.length) && (
            <div className="text-center py-14 text-muted-foreground rounded-xl border bg-card">
              <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
              لا توجد حجوزات خلال الثلاثين يوماً القادمة
            </div>
          )}
        </div>
      )}

      {/* Event details */}
      <Dialog open={!!selectedEvent} onOpenChange={(v) => !v && setSelectedEvent(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              {selectedEvent?.type === "maintenance" ? <Wrench className="w-5 h-5 text-rose-500" /> : <CalendarDays className="w-5 h-5 text-primary" />}
              {selectedEvent ? eventLabel(selectedEvent) : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3">
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />القاعة</p>
                  <p className="font-semibold">{hallName(selectedEvent.hallId)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />الموعد</p>
                  <p className="font-semibold">{WEEKDAYS_SHORT[parse(selectedEvent.date).getDay()]} {selectedEvent.date}</p>
                  <p className="tabular-nums text-right" dir="ltr">{selectedEvent.startTime ? `${selectedEvent.startTime} – ${selectedEvent.endTime}` : "طوال اليوم"}</p>
                </div>
                {selectedEvent.type === "booking" && (
                  <div>
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs border", BOOKING_STATUS[selectedEvent.status]?.className)}>
                      {BOOKING_STATUS[selectedEvent.status]?.label ?? selectedEvent.status}
                    </span>
                  </div>
                )}
                {selectedEvent.attendees ? (
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />الحضور</p>
                    <p className="font-semibold">{selectedEvent.attendees}</p>
                  </div>
                ) : null}
              </div>
              {selectedEvent.bookingId && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => window.open(`/print/booking/${selectedEvent.bookingId}`, "_blank")}>
                    <Printer className="w-4 h-4" /> طباعة إشعار الحجز
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {canBook && (
        <BookingDialog
          open={!!bookOn}
          onOpenChange={(v) => !v && setBookOn(null)}
          mode={isManager ? "manager" : "department"}
          halls={(hallsFull ?? []) as BookableHall[]}
          initialHallId={bookOn?.hall?.id}
          initialDate={bookOn?.date}
        />
      )}
    </div>
  );
}
