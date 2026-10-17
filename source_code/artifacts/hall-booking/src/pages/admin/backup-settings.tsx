import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArchiveRestore, CalendarClock, CheckCircle2, Clock, Database, Download, FolderCheck, FolderOpen, HardDrive,
  History, Loader2, Plus, RotateCcw, ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, downloadFile, errorMessage, useApiQuery } from "@/lib/api";
import { WEEKDAYS_AR, type PlatformOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckRow, Field, NumberField, Section } from "./settings-ui";
import { Choice } from "./screen-settings";
import { FilterChips } from "@/components/booking/ticket";

type B = PlatformOptions["backup"];
type Kind = "manual" | "scheduled" | "before-reset" | "before-restore" | "uploaded" | "legacy";
interface Item { name: string; kind: Kind; size: number; createdAt: string; restorable: boolean; location: "main" | "legacy" }
interface Overview {
  supported: boolean;
  directory: string;
  defaultDirectory: string;
  folder: { ok: boolean; freeBytes: number | null; error?: string };
  items: Item[];
  totalBytes: number;
  lastScheduled: { ok: boolean; at: string; name?: string; error?: string } | null;
  nextRun: string | null;
  lastRestore: { ok: boolean; at: string; name: string; error?: string; safety?: string } | null;
}

const KIND: Record<Kind, { label: string; cls: string }> = {
  manual: { label: "يدوية", cls: "bg-primary/10 text-primary" },
  scheduled: { label: "مجدولة", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  "before-reset": { label: "قبل حذف بيانات", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  "before-restore": { label: "قبل استعادة", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  uploaded: { label: "مرفوعة", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  legacy: { label: "قديمة / التحديث", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
};

export function fileSize(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} ك.ب`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} م.ب`;
  return `${(n / 1024 ** 3).toFixed(2)} ج.ب`;
}

function ago(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.round(h / 24);
  return d === 1 ? "أمس" : `قبل ${d} يوماً`;
}

/** "كل يوم الساعة 02:00 و 14:00" — the schedule in one readable sentence. */
function describe(b: B): string {
  const times = [...b.times].sort().join(" و ");
  if (!b.scheduleEnabled) return "النسخ المجدول متوقف";
  if (!b.times.length) return "حدّد وقتاً واحداً على الأقل";
  if (b.frequency === "weekly") {
    if (!b.weekdays.length) return "اختر يوماً واحداً على الأقل";
    return `كل ${[...b.weekdays].sort().map((d) => WEEKDAYS_AR[d]).join(" و ")} الساعة ${times}`;
  }
  if (b.frequency === "monthly") return `في اليوم ${b.monthDay} من كل شهر الساعة ${times}`;
  return `كل يوم الساعة ${times}`;
}

/** Reload the page once the server is back after a restore. */
function waitForServer(onBack: () => void) {
  let sawDown = false;
  const started = Date.now();
  const tick = async () => {
    try {
      const r = await fetch("/api/healthz", { cache: "no-store" });
      if (r.ok && (sawDown || Date.now() - started > 20000)) return onBack();
      if (!r.ok) sawDown = true;
    } catch {
      sawDown = true;
    }
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 2500);
}

export function BackupSettings({ b, saved, set }: { b: B; saved: B; set: <K extends keyof B>(k: K, v: B[K]) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<Overview>("/settings/backups", { refetchInterval: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [confirm, setConfirm] = useState<{ type: "delete" | "restore" | "older"; names: string[] } | null>(null);
  const [olderDays, setOlderDays] = useState(30);
  const [folderCheck, setFolderCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setFolderCheck(null), [b.directory]);
  const items = data?.items ?? [];
  const shown = useMemo(() => items.filter((i) => kindFilter === "all" || i.kind === kindFilter), [items, kindFilter]);
  const latest = items[0];
  const dirDirty = (b.directory || "") !== (saved.directory || "");
  const refresh = () => {
    void refetch();
    qc.invalidateQueries({ queryKey: ["v2", "/settings/backups"] });
  };
  const fail = (e: unknown, f: string) => toast({ variant: "destructive", title: errorMessage(e, f) });

  const backupNow = async () => {
    setBusy("create");
    try {
      const it = await api<Item>("POST", "/settings/backups", { kind: "manual" });
      toast({ title: "تم أخذ نسخة احتياطية", description: `${it.name} — ${fileSize(it.size)}` });
      refresh();
    } catch (e) {
      fail(e, "تعذّر أخذ النسخة الاحتياطية");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    if (!/\.tar\.gz$/i.test(file.name)) {
      toast({ variant: "destructive", title: "اختر ملف نسخة احتياطية بصيغة ‎.tar.gz‎" });
      return;
    }
    setBusy("upload");
    try {
      const token = localStorage.getItem("token");
      const r = await fetch(`/api/settings/backups/upload?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw { data: j };
      toast({ title: "تم رفع النسخة", description: "تظهر الآن في القائمة ويمكن استعادتها" });
      refresh();
    } catch (e) {
      fail(e, "تعذّر رفع الملف");
    } finally {
      setBusy(null);
    }
  };

  const checkFolder = async () => {
    setBusy("folder");
    try {
      const r = await api<{ path: string; freeBytes: number | null }>("POST", "/settings/backups/check-folder", { directory: b.directory });
      setFolderCheck({ ok: true, text: `المجلد صالح للكتابة${r.freeBytes != null ? ` — المساحة الفارغة ${fileSize(r.freeBytes)}` : ""}` });
    } catch (e) {
      setFolderCheck({ ok: false, text: errorMessage(e, "المجلد غير صالح") });
    } finally {
      setBusy(null);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(confirm.type);
    try {
      if (confirm.type === "restore") {
        await api("POST", `/settings/backups/${encodeURIComponent(confirm.names[0])}/restore`);
        setConfirm(null);
        setRestoring(true);
        waitForServer(() => window.location.reload());
        return;
      }
      const body = confirm.type === "older" ? { olderThanDays: olderDays } : { names: confirm.names };
      const r = await api<{ deleted: number }>("POST", "/settings/backups/delete", body);
      toast({ title: r.deleted ? `حُذفت ${r.deleted} نسخة` : "لا توجد نسخ مطابقة للحذف" });
      setSelected(new Set());
      refresh();
      setConfirm(null);
    } catch (e) {
      fail(e, "تعذّر تنفيذ العملية");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (name: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(name)) n.delete(name);
    else n.add(name);
    return n;
  });
  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(i.name));

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;

  if (data && !data.supported) {
    return (
      <Section icon={Database} title="النسخ الاحتياطي" description="">
        <p className="text-sm text-muted-foreground leading-relaxed">المنصة متصلة بخادم PostgreSQL خارجي، فالنسخ الاحتياطي يتم من أدوات ذلك الخادم (pg_dump) وليس من هنا.</p>
      </Section>
    );
  }

  const confirmItem = confirm?.type === "restore" ? items.find((i) => i.name === confirm.names[0]) : null;

  return (
    <>
      {/* status + primary actions */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="p-5 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-start gap-4 min-w-0">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", latest ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")}>
              {latest ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg">{latest ? `آخر نسخة ${ago(latest.createdAt)}` : "لا توجد أي نسخة احتياطية بعد"}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {latest ? `${formatDateTime(latest.createdAt)} — ${fileSize(latest.size)} — ${KIND[latest.kind].label}` : "خذ أول نسخة الآن، أو فعّل النسخ المجدول أدناه."}
              </p>
              <p className="text-sm mt-2 flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                {saved.scheduleEnabled && data?.nextRun ? <>النسخة المجدولة التالية: <b>{formatDateTime(data.nextRun)}</b></> : <span className="text-muted-foreground">النسخ المجدول غير مفعّل</span>}
              </p>
              {data?.lastScheduled && !data.lastScheduled.ok && (
                <p className="text-sm mt-1.5 text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />فشلت آخر نسخة مجدولة ({formatDateTime(data.lastScheduled.at)}): {data.lastScheduled.error}</p>
              )}
              {data?.lastRestore && Date.now() - Date.parse(data.lastRestore.at) < 3 * 86_400_000 && (
                <p className={cn("text-sm mt-1.5 flex items-center gap-1.5", data.lastRestore.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600")}>
                  <ArchiveRestore className="w-4 h-4" />
                  {data.lastRestore.ok ? `استُعيدت النسخة ${data.lastRestore.name} (${formatDateTime(data.lastRestore.at)})` : `فشلت استعادة ${data.lastRestore.name}: ${data.lastRestore.error}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
            <Button size="lg" onClick={backupNow} disabled={!!busy}>
              {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}نسخ احتياطي الآن
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={!!busy}>
              {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}رفع نسخة من ملف
            </Button>
            <input ref={fileInput} type="file" accept=".gz,application/gzip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </div>
        </div>
        <div className="border-t bg-muted/30 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
          <span className="flex items-center gap-1.5 min-w-0"><FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" /><span dir="ltr" className="font-mono text-xs truncate">{data?.directory}</span></span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><HardDrive className="w-4 h-4" />{items.length} نسخة — {fileSize(data?.totalBytes ?? 0)}</span>
          {data?.folder.freeBytes != null && <span className="text-muted-foreground">المساحة الفارغة: {fileSize(data.folder.freeBytes)}</span>}
          {data && !data.folder.ok && <span className="text-rose-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{data.folder.error}</span>}
        </div>
      </section>

      {/* schedule */}
      <Section icon={CalendarClock} title="النسخ المجدول" description="تأخذ المنصة نسخة تلقائياً في الأوقات المحددة، ما دامت تعمل (الخدمة أو التشغيل المؤقت)">
        <CheckRow checked={b.scheduleEnabled} onChange={(v) => set("scheduleEnabled", v)} title="تفعيل النسخ الاحتياطي المجدول" description={describe(b)} />
        {b.scheduleEnabled && (
          <>
            <Field label="التكرار">
              <Choice
                value={b.frequency}
                onChange={(v) => set("frequency", v)}
                options={[
                  { value: "daily", label: "يومي", hint: "كل يوم في الأوقات المحددة" },
                  { value: "weekly", label: "أسبوعي", hint: "في أيام تختارها من الأسبوع" },
                  { value: "monthly", label: "شهري", hint: "في يوم محدد من كل شهر" },
                ]}
              />
            </Field>
            {b.frequency === "weekly" && (
              <Field label="أيام النسخ">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS_AR.map((d, i) => {
                    const on = b.weekdays.includes(i);
                    return (
                      <label key={d} className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors", on ? "border-primary bg-primary/[0.06] font-semibold" : "hover:bg-muted/50")}>
                        <Checkbox checked={on} onCheckedChange={(v) => set("weekdays", v === true ? [...b.weekdays, i] : b.weekdays.filter((x) => x !== i))} />
                        {d}
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}
            {b.frequency === "monthly" && (
              <div className="max-w-xs"><NumberField label="يوم الشهر" value={b.monthDay} onChange={(v) => set("monthDay", v)} min={1} max={31} hint="إذا كان الشهر أقصر يُؤخذ آخر يوم فيه" /></div>
            )}
            <Field label="أوقات النسخ" hint="حتى 8 أوقات في اليوم. إذا كان الحاسوب مطفأً في الموعد تُؤخذ النسخة عند التشغيل التالي.">
              <div className="flex flex-wrap items-center gap-2">
                {b.times.map((t, i) => (
                  <div key={i} className="flex items-center rounded-lg border bg-background">
                    <Clock className="w-4 h-4 text-muted-foreground mr-2.5" />
                    <Input
                      type="time"
                      value={t}
                      onChange={(e) => e.target.value && set("times", b.times.map((x, k) => (k === i ? e.target.value : x)))}
                      className="border-0 shadow-none w-28 focus-visible:ring-0"
                      dir="ltr"
                    />
                    {b.times.length > 1 && (
                      <button type="button" className="w-8 h-9 flex items-center justify-center text-muted-foreground hover:text-destructive" onClick={() => set("times", b.times.filter((_, k) => k !== i))} aria-label="حذف الوقت"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                {b.times.length < 8 && (
                  <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => set("times", [...b.times, "12:00"])}><Plus className="w-4 h-4" />إضافة وقت</Button>
                )}
              </div>
            </Field>
          </>
        )}
      </Section>

      {/* location */}
      <Section icon={FolderOpen} title="مكان حفظ النسخ" description="يُفضّل مجلد على قرص آخر أو قرص خارجي أو مجلد شبكة، حتى لا تضيع النسخ مع تلف القرص">
        <Field label="المجلد" hint={`اتركه فارغاً لاستخدام المجلد الافتراضي: ${data?.defaultDirectory ?? ""}`}>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={b.directory} onChange={(e) => set("directory", e.target.value)} placeholder={data?.defaultDirectory} dir="ltr" className="font-mono text-sm text-left" />
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={checkFolder} disabled={busy === "folder"}>{busy === "folder" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderCheck className="w-4 h-4" />}فحص المجلد</Button>
              {b.directory && <Button type="button" variant="ghost" onClick={() => set("directory", "")}>الافتراضي</Button>}
            </div>
          </div>
        </Field>
        {folderCheck && (
          <p className={cn("text-sm flex items-center gap-1.5", folderCheck.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600")}>
            {folderCheck.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{folderCheck.text}
          </p>
        )}
        {dirDirty && <p className="text-xs text-amber-700 dark:text-amber-300">احفظ التغييرات من الشريط أسفل الشاشة ليُعتمد المجلد الجديد. النسخ الموجودة تبقى في مكانها القديم.</p>}
      </Section>

      {/* retention */}
      <Section icon={History} title="الاحتفاظ بالنسخ" description="حذف تلقائي للنسخ القديمة بعد كل نسخة مجدولة، حتى لا يمتلئ القرص">
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberField label="الاحتفاظ بآخر" value={b.keepScheduled} onChange={(v) => set("keepScheduled", v)} min={0} max={365} suffix="نسخة مجدولة" hint="0 = الاحتفاظ بكل النسخ المجدولة" />
          <NumberField label="حذف النسخ التلقائية الأقدم من" value={b.maxAgeDays} onChange={(v) => set("maxAgeDays", v)} min={0} max={3650} suffix="يوم" hint="يشمل المجدولة ونسخ ما قبل الحذف والاستعادة. 0 = بلا حد. النسخ اليدوية لا تُحذف تلقائياً." />
        </div>
        <CheckRow checked={b.offerBeforeReset} onChange={(v) => set("offerBeforeReset", v)} title="اقتراح نسخة احتياطية قبل حذف البيانات وضبط المصنع" description="يظهر خيار «أخذ نسخة احتياطية أولاً» محدداً في رسالة التأكيد، ويمكن إلغاء تحديده" />
      </Section>

      {/* list */}
      <Section icon={ArchiveRestore} title="النسخ المحفوظة" description="تنزيل نسخة إلى جهازك، أو استعادتها، أو حذفها">
        {!items.length ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-6 text-center">لا توجد نسخ في المجلد بعد</p>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <FilterChips<"all" | Kind>
                value={kindFilter}
                onChange={(v) => { setKindFilter(v); setSelected(new Set()); }}
                options={[
                  { value: "all", label: "الكل", count: items.length },
                  ...(Object.keys(KIND) as Kind[]).filter((k) => items.some((i) => i.kind === k)).map((k) => ({ value: k, label: KIND[k].label, count: items.filter((i) => i.kind === k).length })),
                ]}
              />
              <div className="flex items-center gap-2 text-sm shrink-0">
                <span className="text-muted-foreground">حذف الأقدم من</span>
                <Input type="number" min={1} value={olderDays} onChange={(e) => setOlderDays(Math.max(1, Number(e.target.value) || 1))} className="w-20 h-9" dir="ltr" />
                <span className="text-muted-foreground">يوماً</span>
                <Button size="sm" variant="outline" className="h-9 text-rose-600 hover:text-rose-700" onClick={() => setConfirm({ type: "older", names: [] })}><Trash2 className="w-4 h-4" />حذف</Button>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-3 rounded-xl bg-foreground text-background px-4 py-2.5 text-sm">
                <span className="font-semibold">{selected.size} محددة</span>
                <Button size="sm" variant="secondary" className="h-8" onClick={() => setConfirm({ type: "delete", names: [...selected] })}><Trash2 className="w-4 h-4" />حذف المحدد</Button>
                <button type="button" className="mr-auto opacity-80 hover:opacity-100" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
              </div>
            )}

            <div className="rounded-xl border divide-y overflow-hidden">
              <label className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={allShownSelected} onCheckedChange={(v) => setSelected(v === true ? new Set(shown.map((i) => i.name)) : new Set())} />
                تحديد الكل ({shown.length})
              </label>
              {shown.map((it) => (
                <div key={it.name} className={cn("flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3", selected.has(it.name) && "bg-primary/[0.04]")}>
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Checkbox className="mt-1" checked={selected.has(it.name)} onCheckedChange={() => toggle(it.name)} aria-label={`تحديد ${it.name}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{formatDateTime(it.createdAt)}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND[it.kind].cls)}>{KIND[it.kind].label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{fileSize(it.size)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5" dir="ltr">{it.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 pr-7 sm:pr-0">
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => downloadFile(`/settings/backups/${encodeURIComponent(it.name)}/download`, it.name).catch((e) => fail(e, "تعذّر التنزيل"))}><Download className="w-4 h-4" />تنزيل</Button>
                    {it.restorable ? (
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirm({ type: "restore", names: [it.name] })}><RotateCcw className="w-4 h-4" />استعادة</Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground px-2" title="تُستعاد من control app.bat الخيار [18]">استعادة من control app</span>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:text-rose-700" onClick={() => setConfirm({ type: "delete", names: [it.name] })} aria-label="حذف"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && !busy && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className={cn("flex items-center gap-2", confirm?.type === "restore" ? "" : "text-rose-700")}>
              {confirm?.type === "restore" ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
              {confirm?.type === "restore" ? "استعادة نسخة احتياطية" : confirm?.type === "older" ? `حذف النسخ الأقدم من ${olderDays} يوماً` : confirm?.names.length === 1 ? "حذف النسخة" : `حذف ${confirm?.names.length} نسخ`}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {confirm?.type === "restore" ? (
                <>
                  ستُستبدل جميع البيانات الحالية ببيانات نسخة <b>{confirmItem ? formatDateTime(confirmItem.createdAt) : ""}</b>.
                  تُؤخذ نسخة من البيانات الحالية أولاً (تظهر باسم «قبل استعادة»)، ثم تُعاد تشغيل المنصة تلقائياً خلال أقل من دقيقة، وقد تحتاج لتسجيل الدخول من جديد.
                </>
              ) : (
                "لا يمكن التراجع عن حذف الملفات."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={!!busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction className={confirm?.type === "restore" ? "" : "bg-rose-600 hover:bg-rose-700"} disabled={!!busy} onClick={(e) => { e.preventDefault(); void runConfirm(); }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {confirm?.type === "restore" ? "استعادة النسخة" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {restoring && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur flex items-center justify-center p-6" role="alert" aria-live="assertive">
          <div className="text-center max-w-sm">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-xl font-bold mt-5">جارٍ استعادة النسخة الاحتياطية</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">تُعاد تشغيل المنصة الآن. ستُحدَّث هذه الصفحة تلقائياً عند عودتها — لا تغلقها.</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Run before a factory-reset action when the admin keeps "back up first" ticked. */
export async function backupBeforeReset(): Promise<Item> {
  return api<Item>("POST", "/settings/backups", { kind: "before-reset" });
}
