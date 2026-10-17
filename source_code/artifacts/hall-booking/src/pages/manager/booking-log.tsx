import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { useListHalls, useListBookings } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, CalendarDays, Clock, Hash, History as HistoryIcon, MapPin, Phone, Search, User as UserIcon, Users, UtensilsCrossed } from "lucide-react";
import { activityLabel } from "@/lib/labels";
import { addDays, todayIso, WEEKDAYS_SHORT, parse } from "@/lib/calendar";
import { formatDate } from "@/lib/format";
import { EmptyState, Fact, FilterChips, StatusBadge, Ticket, relativeDay, toneOf, TimeRange } from "@/components/booking/ticket";
import { cn } from "@/lib/utils";

const ACTIVE = ["approved", "partially_approved", "pending"];
const STRIP_DAYS = 14;

function departmentDisplayName(b: any): string {
  return b.manualDepartmentName || b.user?.departmentName || b.user?.username || "غير محدد";
}

/** Every calendar day a booking occupies (weekly repeats included). */
function bookingDays(b: any): string[] {
  const weeks = b.isRecurring ? Math.min(Math.max(b.recurringWeeks ?? 1, 1), 52) : 1;
  const out: string[] = [];
  for (let w = 0; w < weeks; w++) {
    let d = addDays(b.startDate, w * 7);
    const end = addDays(b.endDate || b.startDate, w * 7);
    for (let guard = 0; d <= end && guard < 62; guard++, d = addDays(d, 1)) out.push(d);
  }
  return out;
}

export default function ManagerBookingLog() {
  const { data: halls, isLoading: hallsLoading } = useListHalls({});
  const { data: bookings, isLoading: bookingsLoading } = useListBookings({});
  const [selectedHall, setSelectedHall] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "busy" | "free">("all");
  const isLoading = hallsLoading || bookingsLoading;
  const today = todayIso();
  const strip = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i)), [today]);

  /** hallId -> upcoming active bookings, and day -> count for the 14-day strip. */
  const byHall = useMemo(() => {
    const map = new Map<number, { upcoming: any[]; days: Map<string, number> }>();
    for (const b of bookings ?? []) {
      if (!ACTIVE.includes(b.status)) continue;
      const days = bookingDays(b);
      if (days[days.length - 1] < today) continue;
      const entry = map.get(b.hallId) ?? { upcoming: [] as any[], days: new Map<string, number>() };
      entry.upcoming.push(b);
      for (const d of days) if (d >= today) entry.days.set(d, (entry.days.get(d) ?? 0) + 1);
      map.set(b.hallId, entry);
    }
    for (const e of map.values()) e.upcoming.sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
    return map;
  }, [bookings, today]);

  const q = search.trim();
  const list = useMemo(() => {
    return [...(halls ?? [])]
      .filter((h) => !q || [h.nameAr, h.name, h.locationAr, h.location, h.referenceCode].some((v) => v?.includes(q)))
      .filter((h) => filter === "all" || (filter === "busy" ? byHall.has(h.id) : !byHall.has(h.id)))
      .sort((a, b) => (byHall.get(b.id)?.upcoming.length ?? 0) - (byHall.get(a.id)?.upcoming.length ?? 0) || (a.nameAr || a.name).localeCompare(b.nameAr || b.name, "ar"));
  }, [halls, q, filter, byHall]);

  const busyCount = (halls ?? []).filter((h) => byHall.has(h.id)).length;
  const selected = selectedHall ? byHall.get(selectedHall.id)?.upcoming ?? [] : [];

  return (
    <MainLayout>
      <div className="space-y-5 max-w-6xl">
        <PageHeader icon={HistoryIcon} title="سجل الحجوزات" description="إشغال كل قاعة خلال الأسبوعين القادمين، وحجوزاتها القائمة" />

        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative lg:w-80 shrink-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم القاعة أو موقعها" className="pr-9 h-10" />
          </div>
          <FilterChips<typeof filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "كل القاعات", count: halls?.length ?? 0 },
              { value: "busy", label: "عليها حجوزات", count: busyCount, tone: "emerald" },
              { value: "free", label: "بلا حجوزات", count: (halls?.length ?? 0) - busyCount, tone: "slate" },
            ]}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
        ) : !halls?.length ? (
          <EmptyState icon={Building2} title="لا توجد قاعات مسجّلة" hint="أضف القاعات من صفحة «إدارة القاعات» لتظهر هنا." />
        ) : !list.length ? (
          <EmptyState icon={Search} title="لا توجد قاعات مطابقة" />
        ) : (
          <div className="rounded-2xl border bg-card divide-y overflow-hidden">
            <div className="hidden md:flex items-center gap-4 px-5 py-2.5 bg-muted/40 text-xs text-muted-foreground">
              <span className="flex-1">القاعة</span>
              <span className="w-[21rem] shrink-0 flex justify-between" aria-hidden>
                {strip.map((d, i) => (
                  <span key={d} className={cn("w-5 text-center whitespace-nowrap", i === 0 && "font-bold text-foreground")}>{i === 0 ? "اليوم" : i % 2 === 0 ? WEEKDAYS_SHORT[parse(d).getDay()].slice(0, 2) : ""}</span>
                ))}
              </span>
              <span className="w-44 shrink-0">الحجز التالي</span>
            </div>
            {list.map((hall) => {
              const info = byHall.get(hall.id);
              const next = info?.upcoming[0];
              return (
                <button
                  key={hall.id}
                  type="button"
                  onClick={() => setSelectedHall(hall)}
                  className="w-full text-right flex flex-col md:flex-row md:items-center gap-3 md:gap-4 px-5 py-4 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none transition-colors"
                >
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", info ? "bg-emerald-500" : "bg-slate-300")} />
                      <h3 className="font-bold truncate">{hall.nameAr || hall.name}</h3>
                      {info && <span className="text-xs text-muted-foreground tabular-nums">{info.upcoming.length} حجز</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      <Fact icon={MapPin}>{hall.locationAr || hall.location}{hall.floor ? ` — الطابق ${hall.floor}` : ""}</Fact>
                      <Fact icon={Users}>{hall.capacity} شخص</Fact>
                      {hall.referenceCode && <Fact icon={Hash} className="text-xs">{hall.referenceCode}</Fact>}
                    </div>
                  </div>
                  <div className="w-full md:w-[21rem] shrink-0 flex justify-between gap-1" aria-label="إشغال الأيام القادمة">
                    {strip.map((d, i) => {
                      const n = info?.days.get(d) ?? 0;
                      return (
                        <span
                          key={d}
                          title={`${formatDate(d)}${n ? ` — ${n} حجز` : ""}`}
                          className={cn(
                            "h-7 flex-1 md:flex-none md:w-5 rounded-md text-[10px] font-bold flex items-center justify-center tabular-nums",
                            n === 0 ? "bg-muted" : n === 1 ? "bg-emerald-500/30 text-emerald-900 dark:text-emerald-100" : "bg-emerald-600 text-white",
                            i === 0 && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-card",
                          )}
                        >
                          {n > 1 ? n : ""}
                        </span>
                      );
                    })}
                  </div>
                  <div className="md:w-44 shrink-0 text-sm w-full">
                    {next ? (
                      <>
                        <p className="font-semibold truncate">{relativeDay(next.startDate)} <span dir="ltr" className="tabular-nums text-muted-foreground font-normal">{next.startTime}</span></p>
                        <p className="text-xs text-muted-foreground truncate">{departmentDisplayName(next)}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">لا حجوزات قادمة</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selectedHall} onOpenChange={(v) => !v && setSelectedHall(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{selectedHall?.nameAr || selectedHall?.name}</DialogTitle>
            <DialogDescription>الحجوزات القادمة، الموافق عليها وبانتظار القرار</DialogDescription>
          </DialogHeader>
          {!selected.length ? (
            <EmptyState icon={CalendarDays} title="لا توجد حجوزات قادمة على هذه القاعة" />
          ) : (
            <div className="space-y-3">
              {selected.map((b) => (
                <Ticket key={b.id} date={b.startDate} tone={toneOf(b.status)}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-bold truncate">{departmentDisplayName(b)}</h3>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-sm mt-1 truncate">{b.reason || activityLabel(b.activityType)}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <Fact icon={Clock}><TimeRange start={b.startTime} end={b.endTime} /></Fact>
                    <Fact icon={CalendarDays}>{b.endDate && b.endDate !== b.startDate ? `حتى ${formatDate(b.endDate)}` : relativeDay(b.startDate)}</Fact>
                    {b.coordinatorName && <Fact icon={UserIcon}>{b.coordinatorName}</Fact>}
                    {b.coordinatorPhone && <Fact icon={Phone}><span dir="ltr">{b.coordinatorPhone}</span></Fact>}
                    {(b.needsCatering || b.needsMeals) && <Fact icon={UtensilsCrossed} className="text-amber-700 dark:text-amber-300">{b.needsCatering && b.needsMeals ? "ضيافة ووجبة" : b.needsCatering ? "ضيافة" : "وجبة"}</Fact>}
                  </div>
                </Ticket>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
