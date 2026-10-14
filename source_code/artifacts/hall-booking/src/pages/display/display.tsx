import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock, DoorOpen, Loader2, MapPin, Users, Wrench, Ban } from "lucide-react";
import { systemNameOf, usePublicSettings } from "@/components/layout/use-public-settings";
import { longDate } from "@/lib/calendar";
import { cn } from "@/lib/utils";

interface Slot { startTime: string; endTime: string; title: string; department: string | null; attendees: number | null }
interface HallDisplay { id: number; name: string; location: string; capacity: number; status: string; state: "free" | "busy" | "maintenance" | "disabled"; current: Slot | null; next: Slot | null; schedule: Slot[] }

const STATE = {
  free: { label: "متاحة الآن", bg: "from-emerald-600 to-emerald-700", chip: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  busy: { label: "مشغولة الآن", bg: "from-rose-600 to-rose-700", chip: "bg-rose-100 text-rose-800", icon: DoorOpen },
  maintenance: { label: "تحت الصيانة", bg: "from-amber-500 to-amber-600", chip: "bg-amber-100 text-amber-800", icon: Wrench },
  disabled: { label: "غير متاحة", bg: "from-slate-600 to-slate-700", chip: "bg-slate-200 text-slate-700", icon: Ban },
} as const;

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Clock2() {
  const now = useClock();
  return (
    <div className="text-left">
      <p className="text-4xl lg:text-5xl font-bold tabular-nums tracking-tight" dir="ltr">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
      <p className="text-sm opacity-80">{longDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`)}</p>
    </div>
  );
}

function usePublic<T>(path: string) {
  return useQuery<T & { refreshSeconds: number; ticker: string }>({
    queryKey: ["display", path],
    queryFn: async () => {
      const r = await fetch(`/api${path}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: (q) => ((q.state.data as { refreshSeconds?: number } | undefined)?.refreshSeconds ?? 60) * 1000,
  });
}

/** Door screen of one hall (tablet / TV beside the entrance). */
export function HallDoorDisplay() {
  const { id } = useParams<{ id: string }>();
  const { data: s } = usePublicSettings();
  const { data, isLoading, isError } = usePublic<{ hall: HallDisplay }>(`/public/display/${id}`);
  if (isLoading) return <div className="min-h-svh flex items-center justify-center bg-slate-900 text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (isError || !data) return <div className="min-h-svh flex items-center justify-center bg-slate-900 text-white text-xl" dir="rtl">القاعة غير موجودة</div>;
  const h = data.hall;
  const st = STATE[h.state];
  return (
    <div className={cn("min-h-svh bg-gradient-to-br text-white flex flex-col", st.bg)} dir="rtl">
      <header className="flex items-center justify-between gap-4 px-6 lg:px-10 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <img src={s?.logoUrl || `/icons/icon-192.png?v=${s?.iconVersion ?? ""}`} alt="" className="w-12 h-12 rounded-xl bg-white/15 object-contain p-1" />
          <p className="font-semibold text-lg truncate">{systemNameOf(s)}</p>
        </div>
        <Clock2 />
      </header>
      <main className="flex-1 grid lg:grid-cols-[1.2fr_1fr] gap-6 px-6 lg:px-10 pb-8">
        <section className="flex flex-col justify-center gap-5">
          <div>
            <p className="text-2xl opacity-85 flex items-center gap-2"><MapPin className="w-6 h-6" />{h.location}</p>
            <h1 className="text-5xl lg:text-7xl font-extrabold leading-tight mt-2">{h.name}</h1>
            <p className="text-xl opacity-85 mt-2 flex items-center gap-2"><Users className="w-5 h-5" />السعة {h.capacity} شخص</p>
          </div>
          <div className="inline-flex items-center gap-3 self-start rounded-2xl bg-white/15 backdrop-blur px-6 py-4 text-3xl lg:text-4xl font-bold">
            <st.icon className="w-10 h-10" />{st.label}
          </div>
          {h.current && (
            <div className="rounded-2xl bg-white/10 p-5 space-y-1">
              <p className="text-lg opacity-80">الاجتماع الحالي</p>
              <p className="text-3xl font-bold">{h.current.title}</p>
              {h.current.department && <p className="text-xl">{h.current.department}</p>}
              <p className="text-2xl tabular-nums font-semibold" dir="ltr">{h.current.startTime} – {h.current.endTime}</p>
            </div>
          )}
          {!h.current && h.next && (
            <div className="rounded-2xl bg-white/10 p-5 space-y-1">
              <p className="text-lg opacity-80">الحجز القادم</p>
              <p className="text-2xl font-bold">{h.next.title}{h.next.department ? ` — ${h.next.department}` : ""}</p>
              <p className="text-2xl tabular-nums" dir="ltr">{h.next.startTime} – {h.next.endTime}</p>
            </div>
          )}
        </section>
        <section className="rounded-3xl bg-white text-slate-900 p-5 lg:p-6 flex flex-col">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-3"><CalendarClock className="w-6 h-6 text-primary" />جدول اليوم</h2>
          {!h.schedule.length ? (
            <p className="text-slate-500 text-lg py-8 text-center">لا توجد حجوزات اليوم</p>
          ) : (
            <ul className="space-y-2 overflow-y-auto">
              {h.schedule.map((x, i) => {
                const active = h.current?.startTime === x.startTime;
                return (
                  <li key={i} className={cn("rounded-xl border p-3 flex items-center gap-3", active ? "border-rose-400 bg-rose-50" : "border-slate-200")}>
                    <span className="tabular-nums font-bold text-lg w-32 shrink-0" dir="ltr">{x.startTime}–{x.endTime}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{x.title}</span>
                      {x.department && <span className="block text-sm text-slate-500 truncate">{x.department}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      {data.ticker && <div className="bg-black/25 px-6 py-3 text-lg text-center">{data.ticker}</div>}
    </div>
  );
}

/** Lobby board: every hall with its live state and today's bookings. */
export function LobbyDisplay() {
  const { data: s } = usePublicSettings();
  const { data, isLoading } = usePublic<{ halls: HallDisplay[] }>("/public/display");
  return (
    <div className="min-h-svh bg-slate-950 text-white flex flex-col" dir="rtl">
      <header className="flex items-center justify-between gap-4 px-6 lg:px-10 py-5 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <img src={s?.logoUrl || `/icons/icon-192.png?v=${s?.iconVersion ?? ""}`} alt="" className="w-12 h-12 rounded-xl bg-white/10 object-contain p-1" />
          <div className="min-w-0">
            <p className="font-bold text-xl truncate">{systemNameOf(s)}</p>
            <p className="text-sm text-white/60">حالة القاعات اليوم</p>
          </div>
        </div>
        <Clock2 />
      </header>
      {isLoading || !data ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : (
        <main className="flex-1 grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-6 lg:p-8 content-start">
          {data.halls.map((h) => {
            const st = STATE[h.state];
            return (
              <div key={h.id} className="rounded-2xl bg-white/[0.06] border border-white/10 overflow-hidden flex flex-col">
                <div className={cn("bg-gradient-to-l px-4 py-3 flex items-center justify-between gap-2", st.bg)}>
                  <p className="font-bold text-lg truncate">{h.name}</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><st.icon className="w-4 h-4" />{st.label}</span>
                </div>
                <div className="p-4 space-y-2 flex-1">
                  <p className="text-sm text-white/60 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{h.location} • {h.capacity} شخص</p>
                  {h.schedule.length ? h.schedule.map((x, i) => (
                    <div key={i} className={cn("flex items-center gap-2 text-sm rounded-lg px-2 py-1.5", h.current?.startTime === x.startTime ? "bg-rose-500/20" : "bg-white/[0.04]")}>
                      <Clock className="w-3.5 h-3.5 text-white/50" />
                      <span className="tabular-nums font-semibold" dir="ltr">{x.startTime}–{x.endTime}</span>
                      <span className="truncate text-white/80">{x.department || x.title}</span>
                    </div>
                  )) : <p className="text-sm text-white/40 py-2">لا توجد حجوزات اليوم</p>}
                </div>
              </div>
            );
          })}
        </main>
      )}
      {data?.ticker && <div className="bg-primary px-6 py-3 text-lg text-center">{data.ticker}</div>}
    </div>
  );
}
