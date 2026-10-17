import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBookingsQueryKey } from "@workspace/api-client-react";
import { Archive, ArchiveRestore, Building2, CalendarDays, Clock, FileText, Loader2, Printer, Search, Settings2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage, useApiQuery } from "@/lib/api";
import { activityLabel } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { EmptyState, Fact, FilterChips, StatusBadge, Ticket, TimeRange, toneOf } from "./ticket";
import { cn } from "@/lib/utils";

interface ArchiveResponse {
  total: number;
  limit: number;
  offset: number;
  items: any[];
  halls: { id: number; name: string }[];
  departments: string[];
}
interface Summary { eligible: number; archived: number; autoArchiveDays: number }

const PAGE = 50;
const ALL = "__all__";

function deptName(b: any): string {
  return b.manualDepartmentName || b.user?.departmentName || b.user?.username || "غير محدد";
}

/** Searchable archive of finished / cancelled bookings. `manager` adds department filter and the auto-archive setting. */
export function ArchivePage({ manager }: { manager: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled" | "rejected">("all");
  const [hallId, setHallId] = useState(ALL);
  const [dept, setDept] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [autoDays, setAutoDays] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setLimit(PAGE);
    setSelected(new Set());
  }, [debounced, status, hallId, dept, from, to]);

  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  if (status !== "all") params.set("status", status);
  if (hallId !== ALL) params.set("hallId", hallId);
  if (dept !== ALL) params.set("department", dept);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("limit", String(limit));
  const { data, isLoading, isFetching } = useApiQuery<ArchiveResponse>(`/bookings/archive?${params.toString()}`, { placeholderData: (prev) => prev });
  const { data: summary } = useApiQuery<Summary>("/bookings/archive/summary");
  useEffect(() => {
    if (summary && autoDays === null) setAutoDays(summary.autoArchiveDays);
  }, [summary, autoDays]);

  const filtersOn = !!(debounced || status !== "all" || hallId !== ALL || dept !== ALL || from || to);
  const clear = () => {
    setQ("");
    setStatus("all");
    setHallId(ALL);
    setDept(ALL);
    setFrom("");
    setTo("");
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2"] });
    qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });
  };

  const restore = async (ids: number[]) => {
    setBusy("restore");
    try {
      const r = await api<{ restored: number }>("POST", "/bookings/unarchive", { ids });
      toast({ title: r.restored === 1 ? "أُعيد الحجز إلى القائمة" : `أُعيد ${r.restored} حجز إلى القائمة` });
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast({ variant: "destructive", title: errorMessage(e, "تعذّرت الإعادة") });
    } finally {
      setBusy(null);
    }
  };

  const archiveEligible = async () => {
    setBusy("archive");
    try {
      const r = await api<{ archived: number }>("POST", "/bookings/archive", { all: true });
      toast({ title: r.archived ? `أُرشف ${r.archived} حجز` : "لا توجد حجوزات جاهزة للأرشفة" });
      refresh();
    } catch (e) {
      toast({ variant: "destructive", title: errorMessage(e, "تعذّرت الأرشفة") });
    } finally {
      setBusy(null);
    }
  };

  const saveAuto = async () => {
    setBusy("auto");
    try {
      const r = await api<{ autoArchiveDays: number }>("PUT", "/bookings/archive/settings", { autoArchiveDays: autoDays ?? 0 });
      toast({ title: r.autoArchiveDays ? `الأرشفة التلقائية بعد ${r.autoArchiveDays} يوماً من انتهاء الحجز` : "أُوقفت الأرشفة التلقائية" });
      refresh();
    } catch (e) {
      toast({ variant: "destructive", title: errorMessage(e, "تعذّر الحفظ") });
    } finally {
      setBusy(null);
    }
  };

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((b) => selected.has(b.id));

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        icon={Archive}
        title="أرشيف الحجوزات"
        description="الحجوزات المنتهية والملغاة والمرفوضة بعد نقلها من القوائم اليومية — ابحث فيها أو أعدها عند الحاجة"
        actions={
          summary && summary.eligible > 0 ? (
            <Button variant="outline" onClick={archiveEligible} disabled={busy === "archive"}>
              {busy === "archive" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              أرشفة الجاهزة الآن ({summary.eligible})
            </Button>
          ) : undefined
        }
      />

      {manager && (
        <div className="flex flex-col md:flex-row md:items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <Settings2 className="w-5 h-5 text-muted-foreground shrink-0 hidden md:block" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">الأرشفة التلقائية</p>
            <p className="text-muted-foreground text-xs mt-0.5">تُنقل الحجوزات المنتهية والملغاة والمرفوضة إلى الأرشيف تلقائياً بعد المدة المحددة. 0 = يدوياً فقط.</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground whitespace-nowrap">بعد</span>
            <Input type="number" min={0} max={3650} value={autoDays ?? 0} onChange={(e) => setAutoDays(Math.max(0, Number(e.target.value) || 0))} className="w-20 h-9" dir="ltr" />
            <span className="text-muted-foreground whitespace-nowrap">يوماً</span>
            <Button size="sm" className="h-9" onClick={saveAuto} disabled={busy === "auto" || autoDays === (summary?.autoArchiveDays ?? 0)}>
              {busy === "auto" && <Loader2 className="w-4 h-4 animate-spin" />}حفظ
            </Button>
          </div>
        </div>
      )}

      {/* filters */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={manager ? "ابحث بالجهة أو القاعة أو عنوان النشاط أو المنسق أو رقم الطلب" : "ابحث بالقاعة أو عنوان النشاط أو رقم الطلب"} className="pr-9 h-10" />
          </div>
          <FilterChips<typeof status>
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "كل الحالات" },
              { value: "completed", label: "منتهية", tone: "sky" },
              { value: "cancelled", label: "ملغاة", tone: "slate" },
              { value: "rejected", label: "مرفوضة", tone: "rose" },
            ]}
          />
        </div>
        <div className={cn("grid gap-3 sm:grid-cols-2", manager ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">القاعة</Label>
            <Select value={hallId} onValueChange={setHallId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل القاعات</SelectItem>
                {data?.halls.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {manager && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">الجهة</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الجهات</SelectItem>
                  {data?.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">من تاريخ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" dir="ltr" />
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {isLoading ? "جارٍ البحث…" : `${data?.total ?? 0} حجز${filtersOn ? " مطابق" : " في الأرشيف"}`}
          </span>
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {filtersOn && <Button variant="ghost" size="sm" className="h-8 mr-auto" onClick={clear}><X className="w-4 h-4" />مسح الفلاتر</Button>}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-3 rounded-xl bg-foreground text-background px-4 py-2.5 text-sm shadow-lg">
          <span className="font-semibold">{selected.size} محدد</span>
          <Button size="sm" variant="secondary" className="h-8" onClick={() => restore([...selected])} disabled={busy === "restore"}>
            {busy === "restore" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}إعادة إلى القائمة
          </Button>
          <button type="button" className="mr-auto opacity-80 hover:opacity-100" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : !items.length ? (
        filtersOn ? (
          <EmptyState icon={Search} title="لا توجد نتائج مطابقة" hint="غيّر كلمة البحث أو الفلاتر." action={<Button variant="outline" onClick={clear}>مسح الفلاتر</Button>} />
        ) : (
          <EmptyState
            icon={Archive}
            title="الأرشيف فارغ"
            hint="أرشف الحجوزات المنتهية والملغاة من صفحة الحجوزات، أو فعّل الأرشفة التلقائية."
          />
        )
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer w-fit">
            <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v === true ? new Set(items.map((b) => b.id)) : new Set())} />
            تحديد الكل في هذه الصفحة
          </label>
          {items.map((b) => (
            <Ticket
              key={b.id}
              date={b.startDate}
              tone={toneOf(b.status)}
              muted={b.status !== "completed"}
              actions={
                <>
                  <Checkbox checked={selected.has(b.id)} onCheckedChange={() => setSelected((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} aria-label={`تحديد الحجز ${b.id}`} className="ml-1" />
                  {b.status === "completed" && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" title="طباعة إشعار الحجز" aria-label="طباعة إشعار الحجز" onClick={() => window.open(`/print/booking/${b.id}`, "_blank")}><Printer className="w-4 h-4" /></Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => restore([b.id])} disabled={busy === "restore"}><ArchiveRestore className="w-4 h-4" />إعادة</Button>
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="font-bold text-base truncate">{manager ? deptName(b) : b.hall?.nameAr || b.hall?.name}</h3>
                <StatusBadge status={b.status} />
                <span className="text-xs text-muted-foreground tabular-nums">#{b.id}</span>
              </div>
              <p className="text-sm mt-1 truncate">{b.reason || activityLabel(b.activityType)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {manager && <Fact icon={Building2} className="text-foreground font-medium">{b.hall?.nameAr || b.hall?.name}</Fact>}
                <Fact icon={Clock}><TimeRange start={b.startTime} end={b.endTime} /></Fact>
                {b.endDate && b.endDate !== b.startDate && <Fact icon={CalendarDays}>حتى {formatDate(b.endDate)}</Fact>}
                {b.reason && <Fact icon={FileText}>{activityLabel(b.activityType)}</Fact>}
                {b.attendees ? <Fact icon={Users}>{b.attendees} شخص</Fact> : null}
                <Fact icon={Archive} className="text-xs">أُرشف {formatDateTime(b.archivedAt)}</Fact>
              </div>
              {(b.rejectionReason || b.cancellationReason) && (
                <p className="text-xs text-muted-foreground mt-1.5 truncate">السبب: {b.rejectionReason || b.cancellationReason}</p>
              )}
            </Ticket>
          ))}
          {data && data.total > items.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)} disabled={isFetching}>
                {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}عرض المزيد ({data.total - items.length} متبقٍ)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
