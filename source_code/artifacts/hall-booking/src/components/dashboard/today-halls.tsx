import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, DoorOpen, MonitorPlay, Wrench, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Slot { startTime: string; endTime: string; title: string; department: string | null }
interface HallNow { id: number; name: string; capacity: number; state: "free" | "busy" | "maintenance" | "disabled"; current: Slot | null; next: Slot | null; schedule: Slot[] }

const STATE = {
  free: { label: "متاحة الآن", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10", icon: CheckCircle2, bar: "bg-emerald-500" },
  busy: { label: "مشغولة", cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10", icon: DoorOpen, bar: "bg-rose-500" },
  maintenance: { label: "صيانة", cls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10", icon: Wrench, bar: "bg-amber-500" },
  disabled: { label: "غير متاحة", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban, bar: "bg-slate-400" },
} as const;

/** Live state of every hall right now with today's schedule (same data as the lobby display). */
export function TodayHalls() {
  const { data, isLoading } = useQuery<{ halls: HallNow[] }>({
    queryKey: ["today-halls"],
    queryFn: async () => {
      const r = await fetch("/api/public/display");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" />حالة القاعات الآن</CardTitle>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => window.open("/display", "_blank")}><MonitorPlay className="w-3.5 h-3.5" />شاشة العرض</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : !data?.halls.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد قاعات</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.halls.map((h) => {
              const st = STATE[h.state];
              return (
                <div key={h.id} className="relative rounded-xl border bg-background p-3.5 overflow-hidden">
                  <span className={cn("absolute inset-y-0 right-0 w-1", st.bar)} />
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{h.name}</p>
                    <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border shrink-0", st.cls)}><st.icon className="w-3 h-3" />{st.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 truncate">
                    {h.current ? (
                      <>الآن: {h.current.department || h.current.title} <span dir="ltr">({h.current.startTime}–{h.current.endTime})</span></>
                    ) : h.next ? (
                      <>التالي: {h.next.department || h.next.title} <span dir="ltr">({h.next.startTime}–{h.next.endTime})</span></>
                    ) : (
                      "لا توجد حجوزات متبقية اليوم"
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">{h.schedule.length} حجز اليوم</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
