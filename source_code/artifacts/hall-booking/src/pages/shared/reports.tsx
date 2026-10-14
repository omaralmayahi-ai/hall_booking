import { useMemo, useState } from "react";
import {
  BarChart3, CalendarCheck2, CalendarX2, Clock, Download, FileText, Gauge, Hourglass, Loader2, Printer, Timer, Users, Wrench, ClipboardCheck,
  UtensilsCrossed, Armchair, PackageCheck, Phone,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, StatTile } from "@/components/layout/page-header";
import { downloadFile, errorMessage, useApiQuery } from "@/lib/api";
import { MONTHS_AR, WEEKDAYS_AR, addDays, iso, longDate, todayIso } from "@/lib/calendar";
import { cn } from "@/lib/utils";

export interface OccupancyReport {
  from: string;
  to: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number;
  totals: {
    bookings: number;
    approved: number;
    pending: number;
    rejected: number;
    cancelled: number;
    bookedHours: number;
    availableHours: number;
    utilization: number;
    avgResponseHours: number | null;
    maintenanceOpened: number;
    maintenanceResolved: number;
    avgResolutionHours: number | null;
  };
  halls: { hallId: number; name: string; capacity: number; status: string; availableHours: number; bookedHours: number; utilization: number; bookings: number; approved: number; pending: number; rejected: number; cancelled: number; avgAttendance: number | null; maintenance: number }[];
  departments: { name: string; bookings: number; hours: number; cancelled: number }[];
  activities: { type: string; count: number }[];
  daily: { date: string; hours: number }[];
  heatmap: { startHour: number; endHour: number; rows: number[][] };
  underused: string[];
}

export interface DailyPrep {
  date: string;
  weekday: string;
  items: {
    id: number; hall: string; location: string; startTime: string; endTime: string; department: string; activityType: string; attendees: number | null;
    seatingLayout: string | null; requestedItems: string[]; catering: string | null; meals: string | null; coordinatorName: string | null; coordinatorPhone: string | null; notes: string | null; status: string;
  }[];
}

function monthRange(offset: number) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: iso(first), to: iso(last), label: `${MONTHS_AR[first.getMonth()]} ${first.getFullYear()}` };
}

const PRESETS = [
  { key: "this", label: "الشهر الحالي", get: () => monthRange(0) },
  { key: "last", label: "الشهر الماضي", get: () => monthRange(-1) },
  { key: "q", label: "آخر 3 أشهر", get: () => ({ from: monthRange(-2).from, to: monthRange(0).to, label: "آخر 3 أشهر" }) },
  { key: "year", label: "السنة الحالية", get: () => ({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31`, label: `سنة ${new Date().getFullYear()}` }) },
];

function utilColor(u: number) {
  if (u >= 75) return "bg-emerald-500";
  if (u >= 40) return "bg-primary";
  if (u >= 20) return "bg-amber-500";
  return "bg-rose-400";
}

export function Heatmap({ heatmap }: { heatmap: OccupancyReport["heatmap"] }) {
  const max = Math.max(1, ...heatmap.rows.flat());
  const hours = Array.from({ length: heatmap.endHour - heatmap.startHour }, (_, i) => heatmap.startHour + i);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-20" />
            {hours.map((h) => <th key={h} className="font-normal text-muted-foreground tabular-nums">{String(h).padStart(2, "0")}:00</th>)}
          </tr>
        </thead>
        <tbody>
          {heatmap.rows.map((row, wd) => (
            <tr key={wd}>
              <td className="text-muted-foreground font-medium">{WEEKDAYS_AR[wd]}</td>
              {row.map((v, i) => (
                <td key={i} className="h-8 rounded-md text-center tabular-nums font-semibold" style={{ background: v ? `hsl(var(--primary) / ${0.12 + (v / max) * 0.78})` : "hsl(var(--muted))", color: v / max > 0.5 ? "white" : undefined }} title={`${WEEKDAYS_AR[wd]} ${hours[i]}:00 — ${v} حجز`}>
                  {v || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [range, setRange] = useState(() => PRESETS[0].get());
  const [preset, setPreset] = useState("this");
  const [exporting, setExporting] = useState(false);
  const [prepDate, setPrepDate] = useState(todayIso());
  const { data: r, isLoading } = useApiQuery<OccupancyReport>(`/reports/occupancy?from=${range.from}&to=${range.to}`);
  const { data: prep, isLoading: prepLoading } = useApiQuery<DailyPrep>(`/reports/daily-prep?date=${prepDate}`);

  const hallsChart = useMemo(() => (r?.halls ?? []).filter((h) => h.status !== "disabled").map((h) => ({ name: h.name, value: h.utilization })), [r]);
  const dailyChart = useMemo(() => (r?.daily ?? []).map((d) => ({ name: d.date.slice(5).replace("-", "/"), value: d.hours })), [r]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadFile(`/reports/occupancy.xlsx?from=${range.from}&to=${range.to}`, `تقرير-إشغال-القاعات-${range.from}-${range.to}.xlsx`);
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر تصدير الملف", description: errorMessage(e) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        title="التقارير والإحصاءات"
        description="نسب إشغال القاعات وأوقات الذروة والجهات الأكثر حجزاً، وقائمة التجهيز اليومية"
      />

      <Tabs defaultValue="occupancy" dir="rtl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="occupancy" className="gap-1.5"><Gauge className="w-3.5 h-3.5" />تقرير الإشغال</TabsTrigger>
          <TabsTrigger value="prep" className="gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" />قائمة التجهيز اليومية</TabsTrigger>
        </TabsList>

        <TabsContent value="occupancy" className="space-y-4">
          <Card className="p-3 flex flex-col xl:flex-row xl:items-end gap-3 xl:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setPreset(p.key); setRange(p.get()); }}
                  className={cn("text-xs px-3 h-8 rounded-lg border transition-colors", preset === p.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><Label className="text-xs">من</Label><Input type="date" value={range.from} onChange={(e) => { setPreset("custom"); setRange({ ...range, from: e.target.value, label: "فترة مخصصة" }); }} className="h-8 w-40" dir="ltr" /></div>
              <div className="space-y-1"><Label className="text-xs">إلى</Label><Input type="date" value={range.to} min={range.from} onChange={(e) => { setPreset("custom"); setRange({ ...range, to: e.target.value, label: "فترة مخصصة" }); }} className="h-8 w-40" dir="ltr" /></div>
              <Button size="sm" variant="outline" onClick={exportExcel} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Excel
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`/print/report?from=${range.from}&to=${range.to}`, "_blank")}>
                <Printer className="w-4 h-4" /> طباعة / PDF
              </Button>
            </div>
          </Card>

          {isLoading || !r ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile icon={Gauge} label="نسبة الإشغال الكلية" value={`${r.totals.utilization}%`} hint={`${r.workingDays} يوم عمل`} tone="primary" />
                <StatTile icon={Clock} label="الساعات المحجوزة" value={r.totals.bookedHours} hint={`من ${r.totals.availableHours} ساعة متاحة`} tone="sky" />
                <StatTile icon={CalendarCheck2} label="الحجوزات المنفذة" value={r.totals.approved} hint={`من ${r.totals.bookings} طلب`} tone="emerald" />
                <StatTile icon={CalendarX2} label="الملغاة / المرفوضة" value={r.totals.cancelled + r.totals.rejected} hint={`${r.totals.pending} قيد الانتظار`} tone="rose" />
                <StatTile icon={Timer} label="متوسط زمن الاستجابة" value={r.totals.avgResponseHours != null ? `${r.totals.avgResponseHours} س` : "—"} tone="violet" />
                <StatTile icon={Wrench} label="أعمال الصيانة" value={r.totals.maintenanceOpened} hint={`${r.totals.maintenanceResolved} منجزة`} tone="amber" />
                <StatTile icon={Hourglass} label="متوسط زمن الإصلاح" value={r.totals.avgResolutionHours != null ? `${r.totals.avgResolutionHours} س` : "—"} tone="slate" />
                <StatTile icon={Users} label="الجهات المستفيدة" value={r.departments.length} tone="primary" />
              </div>

              {r.underused.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                  <span className="font-semibold">قاعات قليلة الاستخدام (أقل من 20%):</span> {r.underused.join("، ")}
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">نسبة إشغال كل قاعة</CardTitle></CardHeader>
                  <CardContent className="space-y-2.5">
                    {r.halls.filter((h) => h.status !== "disabled").sort((a, b) => b.utilization - a.utilization).map((h) => (
                      <div key={h.hallId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate">{h.name}</span>
                          <span className="tabular-nums text-muted-foreground text-xs">{h.bookedHours} س — <span className="font-bold text-foreground">{h.utilization}%</span></span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full", utilColor(h.utilization))} style={{ width: `${Math.max(2, h.utilization)}%` }} />
                        </div>
                      </div>
                    ))}
                    {!hallsChart.length && <p className="text-sm text-muted-foreground">لا توجد قاعات</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">الساعات المحجوزة يومياً</CardTitle></CardHeader>
                  <CardContent className="h-64" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyChart} margin={{ top: 8, right: -18, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="hsl(var(--muted-foreground))" reversed />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} stroke="hsl(var(--muted-foreground))" orientation="right" />
                        <Tooltip formatter={(v: number) => [`${v} ساعة`, "محجوز"]} contentStyle={{ direction: "rtl", borderRadius: 8, fontFamily: "inherit" }} />
                        <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#hoursFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">أوقات الذروة (عدد الحجوزات حسب اليوم والساعة)</CardTitle></CardHeader>
                <CardContent><Heatmap heatmap={r.heatmap} /></CardContent>
              </Card>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">الجهات الأكثر حجزاً</CardTitle></CardHeader>
                  <CardContent className="p-2">
                    <Table>
                      <TableHeader><TableRow><TableHead>الجهة</TableHead><TableHead className="text-center">الطلبات</TableHead><TableHead className="text-center">الساعات</TableHead><TableHead className="text-center">الملغاة</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {r.departments.slice(0, 10).map((d) => (
                          <TableRow key={d.name}><TableCell className="font-medium">{d.name}</TableCell><TableCell className="text-center tabular-nums">{d.bookings}</TableCell><TableCell className="text-center tabular-nums">{d.hours}</TableCell><TableCell className="text-center tabular-nums">{d.cancelled}</TableCell></TableRow>
                        ))}
                        {!r.departments.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد بيانات</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">الحجوزات حسب نوع النشاط</CardTitle></CardHeader>
                  <CardContent className="h-64" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={r.activities.map((a) => ({ name: a.type, value: a.count }))} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" reversed />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} orientation="right" stroke="hsl(var(--muted-foreground))" />
                        <Tooltip formatter={(v: number) => [v, "حجز"]} contentStyle={{ direction: "rtl", borderRadius: 8, fontFamily: "inherit" }} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 0, 0, 4]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل القاعات</CardTitle></CardHeader>
                <CardContent className="p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>القاعة</TableHead><TableHead className="text-center">السعة</TableHead><TableHead className="text-center">الطلبات</TableHead><TableHead className="text-center">المنفذة</TableHead>
                        <TableHead className="text-center">الملغاة</TableHead><TableHead className="text-center">الساعات</TableHead><TableHead className="text-center">الإشغال</TableHead><TableHead className="text-center">متوسط الحضور</TableHead><TableHead className="text-center">الصيانة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.halls.map((h) => (
                        <TableRow key={h.hallId}>
                          <TableCell className="font-medium">{h.name}</TableCell>
                          <TableCell className="text-center tabular-nums">{h.capacity}</TableCell>
                          <TableCell className="text-center tabular-nums">{h.bookings}</TableCell>
                          <TableCell className="text-center tabular-nums">{h.approved}</TableCell>
                          <TableCell className="text-center tabular-nums">{h.cancelled}</TableCell>
                          <TableCell className="text-center tabular-nums">{h.bookedHours}</TableCell>
                          <TableCell className="text-center tabular-nums font-semibold">{h.utilization}%</TableCell>
                          <TableCell className="text-center tabular-nums">{h.avgAttendance ?? "—"}</TableCell>
                          <TableCell className="text-center tabular-nums">{h.maintenance}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="prep" className="space-y-4">
          <Card className="p-3 flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-between">
            <div className="flex items-end gap-2">
              <div className="space-y-1"><Label className="text-xs">التاريخ</Label><Input type="date" value={prepDate} onChange={(e) => setPrepDate(e.target.value)} className="h-9 w-44" dir="ltr" /></div>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setPrepDate(todayIso())}>اليوم</Button>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setPrepDate(addDays(todayIso(), 1))}>غداً</Button>
            </div>
            <Button size="sm" onClick={() => window.open(`/print/daily?date=${prepDate}`, "_blank")}><Printer className="w-4 h-4" />طباعة القائمة</Button>
          </Card>
          <p className="text-sm font-semibold">{longDate(prepDate)} — {prep?.items.length ?? 0} حجز</p>
          {prepLoading ? <Skeleton className="h-32 rounded-xl" /> : !prep?.items.length ? (
            <div className="text-center py-14 text-muted-foreground rounded-xl border bg-card"><FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />لا توجد حجوزات معتمدة في هذا اليوم</div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {prep.items.map((it) => (
                <Card key={it.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{it.hall}</p>
                      <p className="text-xs text-muted-foreground">{it.department} — {it.activityType}</p>
                    </div>
                    <span className="tabular-nums text-sm font-bold text-primary bg-primary/10 rounded-lg px-2 py-1 shrink-0" dir="ltr">{it.startTime}–{it.endTime}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" />{it.attendees ? `${it.attendees} شخص` : "الحضور غير محدد"}</span>
                    <span className="flex items-center gap-1.5"><Armchair className="w-3.5 h-3.5 text-muted-foreground" />{it.seatingLayout || "الترتيب الافتراضي"}</span>
                    {(it.catering || it.meals) && (
                      <span className="flex items-center gap-1.5 col-span-2 text-amber-800"><UtensilsCrossed className="w-3.5 h-3.5" />{[it.catering && `ضيافة: ${it.catering}`, it.meals && `وجبات: ${it.meals}`].filter(Boolean).join(" • ")}</span>
                    )}
                    {it.coordinatorName && <span className="flex items-center gap-1.5 col-span-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" />{it.coordinatorName} <span dir="ltr">{it.coordinatorPhone}</span></span>}
                  </div>
                  {it.requestedItems.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t">
                      <PackageCheck className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      {it.requestedItems.map((x) => <span key={x} className="text-[11px] rounded-md bg-muted px-1.5 py-0.5">{x}</span>)}
                    </div>
                  )}
                  {it.notes && <p className="text-xs text-muted-foreground border-t pt-2">{it.notes}</p>}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
