import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarCheck2, CalendarClock, CheckCircle2, Clock, DoorOpen, Hourglass, Loader2, MapPin, Users, Wrench } from "lucide-react";
import { systemNameOf, usePublicSettings } from "@/components/layout/use-public-settings";
import { NewsTicker, type TickerConfig } from "@/components/display/news-ticker";
import { longDate } from "@/lib/calendar";
import type { PlatformOptions } from "@/lib/options";
import { cn } from "@/lib/utils";

type DisplayOptions = PlatformOptions["display"];
interface Slot { startTime: string; endTime: string; title: string; department: string | null; attendees: number | null }
interface HallDisplay { id: number; name: string; location: string; capacity: number; status: string; state: "free" | "busy" | "maintenance" | "disabled"; current: Slot | null; next: Slot | null; schedule: Slot[] }
interface DisplayResponse { refreshSeconds: number; ticker: string; display?: DisplayOptions; workingHours?: { start: string; end: string } }

const STATE = {
  free: { label: "متاحة الآن", grad: "from-emerald-500 to-emerald-700", ring: "ring-emerald-400/40", text: "text-emerald-400" },
  busy: { label: "مشغولة الآن", grad: "from-rose-500 to-rose-700", ring: "ring-rose-400/40", text: "text-rose-400" },
  maintenance: { label: "تحت الصيانة", grad: "from-amber-400 to-amber-600", ring: "ring-amber-400/40", text: "text-amber-400" },
  disabled: { label: "غير متاحة", grad: "from-slate-500 to-slate-700", ring: "ring-slate-400/30", text: "text-slate-400" },
} as const;

const THEME = {
  midnight: {
    page: "bg-[#050816] text-white",
    glow: "bg-[radial-gradient(60rem_30rem_at_85%_-10%,rgba(56,189,248,0.16),transparent),radial-gradient(50rem_30rem_at_0%_110%,rgba(168,85,247,0.14),transparent)]",
    header: "border-white/10",
    card: "bg-white/[0.05] border-white/10 backdrop-blur-md",
    soft: "bg-white/[0.06]",
    muted: "text-white/60",
    faint: "text-white/40",
    track: "bg-white/10",
    chip: "bg-white/[0.07] border-white/10",
    logo: "bg-white",
  },
  brand: {
    page: "text-white bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_78%,black),color-mix(in_oklab,var(--primary)_40%,#020617))]",
    glow: "bg-[radial-gradient(55rem_28rem_at_90%_-10%,rgba(255,255,255,0.14),transparent)]",
    header: "border-white/15",
    card: "bg-black/20 border-white/15 backdrop-blur-md",
    soft: "bg-white/[0.08]",
    muted: "text-white/70",
    faint: "text-white/45",
    track: "bg-white/15",
    chip: "bg-white/10 border-white/15",
    logo: "bg-white",
  },
  light: {
    page: "bg-slate-100 text-slate-900",
    glow: "bg-[radial-gradient(60rem_30rem_at_85%_-10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]",
    header: "border-slate-200",
    card: "bg-white border-slate-200 shadow-sm",
    soft: "bg-slate-50",
    muted: "text-slate-500",
    faint: "text-slate-400",
    track: "bg-slate-200",
    chip: "bg-white border-slate-200 shadow-sm",
    logo: "bg-white ring-1 ring-slate-200",
  },
} as const;
type Theme = (typeof THEME)[keyof typeof THEME];

const DEFAULT_DISPLAY: DisplayOptions = {
  showDepartment: true, showActivity: true, refreshSeconds: 60, tickerAr: "", theme: "midnight", subtitleAr: "حالة القاعات اليوم",
  showStats: true, showTimeline: true, showNext: true, hallsPerPage: 0, pageSeconds: 15, tickerEnabled: true, tickerItems: [],
  tickerMode: "scroll", tickerSpeed: "normal", tickerStaticSeconds: 6, tickerShowLogo: true, tickerLabel: "إعلانات",
  tickerTextColor: "#ffffff", tickerBgColor: "#0b3a6e", tickerLabelColor: "#c8102e", tickerSize: "lg",
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function minutesText(m: number) {
  if (m < 1) return "أقل من دقيقة";
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} س ${r} د` : `${h} ساعة`;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function usePublic<T>(path: string) {
  return useQuery<T & DisplayResponse>({
    queryKey: ["display", path],
    queryFn: async () => {
      const r = await fetch(`/api${path}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: (q) => ((q.state.data as { refreshSeconds?: number } | undefined)?.refreshSeconds ?? 60) * 1000,
  });
}

function displayOf(data?: DisplayResponse): DisplayOptions {
  const d = { ...DEFAULT_DISPLAY, ...(data?.display ?? {}) };
  if (!data?.display && data?.ticker) d.tickerItems = [data.ticker];
  return d;
}

function BigClock({ now, className }: { now: Date; className?: string }) {
  const [h, m] = hm(now).split(":");
  return (
    <div className={cn("text-left", className)}>
      <p className="text-5xl xl:text-6xl font-black tabular-nums tracking-tight leading-none" dir="ltr">
        {h}<span className="colon-blink">:</span>{m}
        <span className="text-xl xl:text-2xl font-bold opacity-50 ml-1 align-top">{String(now.getSeconds()).padStart(2, "0")}</span>
      </p>
      <p className="text-sm xl:text-base opacity-75 mt-1.5">{longDate(isoDay(now))}</p>
    </div>
  );
}

/** Day timeline: working hours on a bar (right = morning), bookings as blocks, a live "now" marker. */
function Timeline({ hall, hours, now, theme }: { hall: HallDisplay; hours: { start: string; end: string }; now: Date; theme: Theme }) {
  const starts = [toMin(hours.start), ...hall.schedule.map((s) => toMin(s.startTime))];
  const ends = [toMin(hours.end), ...hall.schedule.map((s) => toMin(s.endTime))];
  const from = Math.floor(Math.min(...starts) / 60) * 60;
  const to = Math.ceil(Math.max(...ends) / 60) * 60;
  const span = Math.max(60, to - from);
  const pct = (m: number) => ((Math.min(Math.max(m, from), to) - from) / span) * 100;
  const nowM = now.getHours() * 60 + now.getMinutes();
  const step = span > 600 ? 120 : 60;
  const ticks: number[] = [];
  for (let m = from; m <= to; m += step) ticks.push(m);
  return (
    <div className="pt-1">
      <div className={cn("relative h-3 rounded-full", theme.track)}>
        {hall.schedule.map((s, i) => (
          <div
            key={i}
            className={cn("absolute inset-y-0 rounded-full", hall.current?.startTime === s.startTime ? "bg-rose-500" : "bg-sky-500/80")}
            style={{ right: `${pct(toMin(s.startTime))}%`, width: `${pct(toMin(s.endTime)) - pct(toMin(s.startTime))}%` }}
          />
        ))}
        {nowM >= from && nowM <= to && (
          <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,0.9)] rounded" style={{ right: `${pct(nowM)}%` }}>
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-yellow-300" />
          </div>
        )}
      </div>
      <div className={cn("relative h-4 mt-1 text-[10px] tabular-nums", theme.faint)}>
        {ticks.map((m) => (
          <span key={m} className="absolute translate-x-1/2" style={{ right: `${pct(m)}%` }}>{String(Math.floor(m / 60)).padStart(2, "0")}</span>
        ))}
      </div>
    </div>
  );
}

function LiveDot({ size = "w-2.5 h-2.5" }: { size?: string }) {
  return (
    <span className={cn("relative flex", size)}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" />
      <span className={cn("relative inline-flex rounded-full bg-white", size)} />
    </span>
  );
}

function HallCard({ hall, d, hours, now, theme, index }: { hall: HallDisplay; d: DisplayOptions; hours: { start: string; end: string }; now: Date; theme: Theme; index: number }) {
  const st = STATE[hall.state];
  const nowM = now.getHours() * 60 + now.getMinutes();
  const cur = hall.current;
  const progress = cur ? Math.min(100, Math.max(0, ((nowM - toMin(cur.startTime)) / Math.max(1, toMin(cur.endTime) - toMin(cur.startTime))) * 100)) : 0;
  const upcoming = hall.schedule.filter((s) => s.startTime > hm(now) && s.startTime !== hall.next?.startTime).slice(0, 2);
  const who = (s: Slot) => (d.showDepartment && s.department) || s.title;
  return (
    <article className={cn("display-rise rounded-3xl border overflow-hidden flex flex-col", theme.card)} style={{ animationDelay: `${index * 70}ms` }}>
      <header className={cn("relative shrink-0 overflow-hidden bg-gradient-to-l text-white px-5 py-4 flex items-center justify-between gap-3", st.grad, hall.state === "busy" && "display-sheen")}>
        <div className="min-w-0">
          <h2 className="text-2xl xl:text-[1.7rem] font-extrabold truncate leading-tight">{hall.name}</h2>
          <p className="text-sm text-white/85 flex items-center gap-1.5 mt-0.5 truncate">
            <MapPin className="w-3.5 h-3.5 shrink-0" />{hall.location}
            <span className="opacity-60">•</span>
            <Users className="w-3.5 h-3.5 shrink-0" />{hall.capacity} شخص
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur px-3.5 py-1.5 text-sm font-bold">
          <LiveDot />{st.label}
        </span>
      </header>

      <div className="p-5 flex-1 flex flex-col gap-3.5">
        {cur ? (
          <div className={cn("rounded-2xl p-4 ring-1", theme.soft, st.ring)}>
            <p className={cn("text-xs font-bold flex items-center gap-1.5", st.text)}><DoorOpen className="w-3.5 h-3.5" />يجري الآن</p>
            <p className="text-xl font-bold mt-1 truncate">{who(cur)}</p>
            {d.showDepartment && cur.department && d.showActivity && <p className={cn("text-sm truncate", theme.muted)}>{cur.title}</p>}
            <div className="flex items-center justify-between gap-2 mt-3 text-sm">
              <span className="tabular-nums font-bold" dir="ltr">{cur.startTime} – {cur.endTime}</span>
              <span className={cn("flex items-center gap-1", theme.muted)}><Hourglass className="w-3.5 h-3.5" />متبقٍ {minutesText(toMin(cur.endTime) - nowM)}</span>
            </div>
            <div className={cn("h-2 rounded-full mt-2 overflow-hidden", theme.track)}>
              <div className="h-full rounded-full bg-gradient-to-l from-rose-400 to-rose-600 transition-[width] duration-1000" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : hall.state === "maintenance" ? (
          <div className={cn("rounded-2xl p-4 flex items-center gap-3", theme.soft)}>
            <Wrench className="w-8 h-8 text-amber-400 shrink-0" />
            <p className="font-semibold">القاعة متوقفة مؤقتاً لأعمال الصيانة</p>
          </div>
        ) : (
          <div className={cn("rounded-2xl p-4 flex items-center gap-3", theme.soft)}>
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-lg">القاعة متاحة</p>
              <p className={cn("text-sm", theme.muted)}>
                {hall.next ? `حتى ${hall.next.startTime} — بعد ${minutesText(toMin(hall.next.startTime) - nowM)}` : hall.schedule.length ? "لا حجوزات متبقية اليوم" : "لا توجد حجوزات اليوم"}
              </p>
            </div>
          </div>
        )}

        {d.showNext && hall.next && (
          <div className="flex items-center gap-3">
            <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", theme.soft)}><CalendarClock className="w-5 h-5 text-sky-400" /></span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-xs font-semibold", theme.muted)}>الحجز التالي</p>
              <p className="font-semibold truncate">{who(hall.next)}</p>
            </div>
            <span className="tabular-nums font-bold text-lg shrink-0" dir="ltr">{hall.next.startTime}</span>
          </div>
        )}

        {upcoming.length > 0 && (
          <ul className="space-y-1.5">
            {upcoming.map((s, i) => (
              <li key={i} className={cn("flex items-center gap-2 text-sm rounded-lg px-2.5 py-1.5", theme.soft)}>
                <Clock className={cn("w-3.5 h-3.5", theme.faint)} />
                <span className="tabular-nums font-semibold" dir="ltr">{s.startTime}–{s.endTime}</span>
                <span className={cn("truncate", theme.muted)}>{who(s)}</span>
              </li>
            ))}
          </ul>
        )}

        {d.showTimeline && <div className="mt-auto"><Timeline hall={hall} hours={hours} now={now} theme={theme} /></div>}
      </div>
    </article>
  );
}

function Stat({ icon: Icon, label, value, color, theme }: { icon: typeof Clock; label: string; value: number; color: string; theme: Theme }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-2.5", theme.chip)}>
      <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-white", color)}><Icon className="w-5 h-5" /></span>
      <div className="leading-tight">
        <p className="text-2xl font-black tabular-nums">{value}</p>
        <p className={cn("text-xs", theme.muted)}>{label}</p>
      </div>
    </div>
  );
}

/** Lobby board: every hall with its live state, today's timeline and a news ticker. */
export function LobbyDisplay() {
  const { data: s } = usePublicSettings();
  const { data, isLoading } = usePublic<{ halls: HallDisplay[] }>("/public/display");
  const now = useNow();
  const d = displayOf(data);
  const theme = THEME[d.theme] ?? THEME.midnight;
  const hours = data?.workingHours ?? { start: "08:00", end: "15:00" };
  const halls = useMemo(() => data?.halls ?? [], [data]);
  const logo = s?.logoUrl || `/icons/icon-192.png?v=${s?.iconVersion ?? ""}`;

  // Auto-fit (hallsPerPage = 0): as many cards as fit the screen; the rest rotate as pages.
  const gridRef = useRef<HTMLElement>(null);
  const [autoPer, setAutoPer] = useState(0);
  const total = halls.length;
  const cols =
    total <= 1 ? "grid-cols-1 max-w-3xl mx-auto w-full"
    : total === 2 ? "md:grid-cols-2"
    : total === 3 ? "md:grid-cols-2 xl:grid-cols-3"
    : total === 4 ? "md:grid-cols-2 2xl:grid-cols-4"
    : "md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  useLayoutEffect(() => {
    if (d.hallsPerPage > 0) return;
    const measure = () => {
      const g = gridRef.current;
      if (!g || !g.children.length) return;
      const style = getComputedStyle(g);
      const colCount = style.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const gap = parseFloat(style.rowGap) || 0;
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const cardH = Math.max(...Array.from(g.children).map((c) => (c as HTMLElement).offsetHeight));
      const rows = Math.max(1, Math.floor((g.clientHeight - padding + gap) / (cardH + gap)));
      const fit = rows * colCount;
      setAutoPer((cur) => (cur === fit ? cur : fit));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [d.hallsPerPage, total, d.showTimeline, d.showNext, d.showStats]);

  const per = d.hallsPerPage > 0 ? d.hallsPerPage : autoPer || total || 1;
  const pages = Math.max(1, Math.ceil(total / per));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages < 2) {
      setPage(0);
      return;
    }
    const t = setInterval(() => setPage((p) => (p + 1) % pages), Math.max(5, d.pageSeconds) * 1000);
    return () => clearInterval(t);
  }, [pages, d.pageSeconds]);
  const current = page % pages;
  const shown = halls.slice(current * per, current * per + per);

  const stats = useMemo(() => ({
    free: halls.filter((h) => h.state === "free").length,
    busy: halls.filter((h) => h.state === "busy").length,
    maintenance: halls.filter((h) => h.state === "maintenance").length,
    bookings: halls.reduce((n, h) => n + h.schedule.length, 0),
  }), [halls]);

  return (
    <div className={cn("relative h-svh flex flex-col overflow-hidden", theme.page)} dir="rtl">
      <div className={cn("pointer-events-none absolute inset-0", theme.glow)} />
      <header className={cn("relative z-10 shrink-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 xl:px-10 py-5 border-b", theme.header)}>
        <div className="flex items-center gap-4 min-w-0">
          <img src={logo} alt="" className={cn("w-16 h-16 rounded-2xl object-contain p-1.5 shadow-lg", theme.logo)} />
          <div className="min-w-0">
            <p className="font-black text-2xl xl:text-3xl truncate">{systemNameOf(s)}</p>
            {d.subtitleAr && <p className={cn("text-base mt-0.5", theme.muted)}>{d.subtitleAr}</p>}
          </div>
        </div>
        {d.showStats && halls.length > 0 && (
          <div className="flex flex-wrap gap-2.5 order-3 xl:order-none w-full xl:w-auto justify-center">
            <Stat icon={CheckCircle2} label="متاحة" value={stats.free} color="bg-emerald-500" theme={theme} />
            <Stat icon={DoorOpen} label="مشغولة" value={stats.busy} color="bg-rose-500" theme={theme} />
            <Stat icon={Wrench} label="صيانة" value={stats.maintenance} color="bg-amber-500" theme={theme} />
            <Stat icon={CalendarCheck2} label="حجوزات اليوم" value={stats.bookings} color="bg-sky-500" theme={theme} />
          </div>
        )}
        <BigClock now={now} />
      </header>

      {isLoading || !data ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin" /></div>
      ) : !halls.length ? (
        <div className={cn("flex-1 flex items-center justify-center text-2xl", theme.muted)}>لا توجد قاعات</div>
      ) : (
        <main ref={gridRef} className={cn("relative z-10 flex-1 min-h-0 overflow-hidden grid auto-rows-max gap-4 px-6 xl:px-8 pt-5 pb-7 content-start", cols)}>
          {shown.map((h, i) => <HallCard key={h.id} hall={h} d={d} hours={hours} now={now} theme={theme} index={i} />)}
        </main>
      )}

      {pages > 1 && (
        <div className="absolute z-20 inset-x-0 flex justify-center gap-1.5 pointer-events-none" style={{ bottom: d.tickerEnabled && d.tickerItems.length ? (d.tickerSize === "xl" ? "5.25rem" : d.tickerSize === "lg" ? "4.25rem" : "3.75rem") : "0.75rem" }}>
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all", i === current ? "w-8 bg-current" : "w-2 bg-current opacity-30")} />
          ))}
        </div>
      )}

      <NewsTicker config={d as TickerConfig} logoUrl={logo} className="relative z-10 shrink-0" />
    </div>
  );
}

/** Door screen of one hall (tablet / TV beside the entrance). */
export function HallDoorDisplay() {
  const { id } = useParams<{ id: string }>();
  const { data: s } = usePublicSettings();
  const { data, isLoading, isError } = usePublic<{ hall: HallDisplay }>(`/public/display/${id}`);
  const now = useNow();
  if (isLoading) return <div className="min-h-svh flex items-center justify-center bg-slate-950 text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (isError || !data) return <div className="min-h-svh flex items-center justify-center bg-slate-950 text-white text-xl" dir="rtl">القاعة غير موجودة</div>;
  const d = displayOf(data);
  const h = data.hall;
  const st = STATE[h.state];
  const logo = s?.logoUrl || `/icons/icon-192.png?v=${s?.iconVersion ?? ""}`;
  const nowM = now.getHours() * 60 + now.getMinutes();
  const cur = h.current;
  const progress = cur ? Math.min(100, Math.max(0, ((nowM - toMin(cur.startTime)) / Math.max(1, toMin(cur.endTime) - toMin(cur.startTime))) * 100)) : 0;
  const who = (x: Slot) => (d.showDepartment && x.department) || x.title;
  return (
    <div className={cn("relative min-h-svh bg-gradient-to-br text-white flex flex-col overflow-hidden", st.grad)} dir="rtl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_90%_-10%,rgba(255,255,255,0.18),transparent),radial-gradient(40rem_30rem_at_0%_120%,rgba(0,0,0,0.3),transparent)]" />
      <header className="relative z-10 flex items-center justify-between gap-4 px-6 xl:px-10 py-5">
        <div className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="" className="w-14 h-14 rounded-2xl bg-white object-contain p-1.5 shadow-lg" />
          <p className="font-bold text-xl truncate">{systemNameOf(s)}</p>
        </div>
        <BigClock now={now} />
      </header>
      <main className="relative z-10 flex-1 grid xl:grid-cols-[1.25fr_1fr] gap-6 px-6 xl:px-10 pb-8">
        <section className="flex flex-col justify-center gap-6 display-rise">
          <div>
            <p className="text-2xl text-white/85 flex items-center gap-2"><MapPin className="w-6 h-6" />{h.location}</p>
            <h1 className="text-6xl xl:text-8xl font-black leading-tight mt-2 drop-shadow-sm">{h.name}</h1>
            <p className="text-xl text-white/85 mt-2 flex items-center gap-2"><Users className="w-5 h-5" />السعة {h.capacity} شخص</p>
          </div>
          <div className="inline-flex items-center gap-4 self-start rounded-3xl bg-white/15 backdrop-blur px-7 py-4 text-4xl xl:text-5xl font-black ring-1 ring-white/25">
            <LiveDot size="w-4 h-4" />{st.label}
          </div>
          {cur && (
            <div className="rounded-3xl bg-black/20 backdrop-blur p-6 space-y-2 ring-1 ring-white/15">
              <p className="text-lg text-white/75">الاجتماع الحالي</p>
              <p className="text-4xl font-black">{who(cur)}</p>
              {d.showDepartment && cur.department && d.showActivity && <p className="text-xl text-white/85">{cur.title}</p>}
              <div className="flex items-center justify-between text-2xl pt-1">
                <span className="tabular-nums font-bold" dir="ltr">{cur.startTime} – {cur.endTime}</span>
                <span className="text-lg text-white/80 flex items-center gap-1.5"><Hourglass className="w-5 h-5" />متبقٍ {minutesText(toMin(cur.endTime) - nowM)}</span>
              </div>
              <div className="h-3 rounded-full bg-white/20 overflow-hidden"><div className="h-full rounded-full bg-white transition-[width] duration-1000" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {!cur && h.next && (
            <div className="rounded-3xl bg-black/20 backdrop-blur p-6 space-y-1 ring-1 ring-white/15">
              <p className="text-lg text-white/75">الحجز القادم — بعد {minutesText(toMin(h.next.startTime) - nowM)}</p>
              <p className="text-3xl font-bold">{who(h.next)}</p>
              <p className="text-2xl tabular-nums font-semibold" dir="ltr">{h.next.startTime} – {h.next.endTime}</p>
            </div>
          )}
        </section>
        <section className="rounded-3xl bg-white text-slate-900 p-6 flex flex-col shadow-2xl display-rise" style={{ animationDelay: "120ms" }}>
          <h2 className="text-2xl font-black flex items-center gap-2 mb-4"><CalendarClock className="w-7 h-7 text-primary" />جدول اليوم</h2>
          {!h.schedule.length ? (
            <p className="text-slate-500 text-xl py-10 text-center">لا توجد حجوزات اليوم</p>
          ) : (
            <ol className="relative space-y-3 overflow-y-auto pr-5 border-r-2 border-slate-200">
              {h.schedule.map((x, i) => {
                const active = cur?.startTime === x.startTime;
                const past = x.endTime <= hm(now);
                return (
                  <li key={i} className={cn("relative rounded-2xl border p-4 flex items-center gap-4", active ? "border-rose-300 bg-rose-50 shadow-sm" : past ? "border-slate-100 opacity-50" : "border-slate-200")}>
                    <span className={cn("absolute -right-[1.65rem] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full ring-4 ring-white", active ? "bg-rose-500" : past ? "bg-slate-300" : "bg-primary")} />
                    <span className="tabular-nums font-black text-xl w-36 shrink-0" dir="ltr">{x.startTime}–{x.endTime}</span>
                    <span className="min-w-0">
                      <span className="block font-bold text-lg truncate">{who(x)}</span>
                      {d.showDepartment && x.department && d.showActivity && <span className="block text-sm text-slate-500 truncate">{x.title}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </main>
      <NewsTicker config={d as TickerConfig} logoUrl={logo} className="relative z-10" />
    </div>
  );
}
