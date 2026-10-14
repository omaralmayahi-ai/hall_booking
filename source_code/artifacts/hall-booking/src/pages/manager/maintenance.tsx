import { useEffect, useMemo, useState } from "react";
import { useListHalls } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeftRight, Ban, CalendarClock, CalendarRange, CheckCircle2, ClipboardList, Lock, Loader2, Package, Pencil, Plus,
  Repeat, Search, Trash2, Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, StatTile } from "@/components/layout/page-header";
import { RelocateDialog } from "@/components/booking/relocate-dialog";
import { api, errorMessage, useApiQuery, type AffectedBooking, type HallAsset, type MaintenanceSchedule } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { MAINTENANCE_CATEGORY, activityLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

const PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: "منخفضة", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  medium: { label: "متوسطة", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  high: { label: "عالية", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  urgent: { label: "عاجلة", cls: "bg-red-100 text-red-700 border-red-200" },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "بانتظار التنفيذ", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  in_progress: { label: "قيد التنفيذ", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  resolved: { label: "منجزة", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

interface Note {
  id: number;
  hallId: number;
  title: string | null;
  category: string;
  priority: string;
  status: string;
  description: string;
  scheduledDate: string | null;
  resolvedAt: string | null;
  assetId: number | null;
  scheduleId: number | null;
  blocksHall: boolean;
  blockStartDate: string | null;
  blockEndDate: string | null;
  blockStartTime: string | null;
  blockEndTime: string | null;
  createdAt: string;
  impact?: { hallBlocked: boolean; hallReleased?: boolean; affected: AffectedBooking[] };
}

type BlockMode = "none" | "until_resolved" | "window";

interface NoteForm {
  hallId: string;
  assetId: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  scheduledDate: string;
  blockMode: BlockMode;
  blockStartDate: string;
  blockEndDate: string;
  blockStartTime: string;
  blockEndTime: string;
}

const EMPTY_NOTE: NoteForm = {
  hallId: "",
  assetId: "",
  title: "",
  category: "other",
  priority: "medium",
  status: "pending",
  description: "",
  scheduledDate: "",
  blockMode: "none",
  blockStartDate: "",
  blockEndDate: "",
  blockStartTime: "",
  blockEndTime: "",
};

function blockText(n: Note) {
  if (!n.blocksHall) return null;
  if (!n.blockStartDate) return "القاعة محجوبة حتى الإنجاز";
  const range = n.blockEndDate && n.blockEndDate !== n.blockStartDate ? `${formatDate(n.blockStartDate)} – ${formatDate(n.blockEndDate)}` : formatDate(n.blockStartDate);
  return `محجوبة ${range}${n.blockStartTime ? ` (\u2066${n.blockStartTime}–${n.blockEndTime}\u2069)` : ""}`;
}

export default function ManagerMaintenance() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: notes, isLoading } = useApiQuery<Note[]>("/maintenance");
  const { data: halls } = useListHalls();
  const { data: assets } = useApiQuery<HallAsset[]>("/assets");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [impact, setImpact] = useState<{ note: Note; affected: AffectedBooking[] } | null>(null);
  const [search, setSearch] = useState("");
  const [hallFilter, setHallFilter] = useState("all");

  const hallName = (id: number) => {
    const h = halls?.find((x) => x.id === id);
    return h?.nameAr || h?.name || `#${id}`;
  };
  const assetName = (id: number | null) => (id ? assets?.find((a) => a.id === id)?.name : undefined);

  const filtered = useMemo(() => {
    const q = search.trim();
    return (notes ?? []).filter(
      (n) =>
        (hallFilter === "all" || String(n.hallId) === hallFilter) &&
        (!q || [n.title, n.description, hallName(n.hallId), assetName(n.assetId)].some((v) => v?.includes(q))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, search, hallFilter, halls, assets]);
  const current = filtered.filter((n) => n.status !== "resolved");
  const done = filtered.filter((n) => n.status === "resolved");
  const blocking = (notes ?? []).filter((n) => n.status !== "resolved" && n.blocksHall).length;
  const urgent = (notes ?? []).filter((n) => n.status !== "resolved" && n.priority === "urgent").length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2"] });
    qc.invalidateQueries();
  };

  const handleResult = (n: Note, verb: string) => {
    toast({
      title: verb,
      description: n.impact?.hallBlocked ? "تم تحويل حالة القاعة إلى «تحت الصيانة»" : n.impact?.hallReleased ? "أُعيدت القاعة إلى حالة «متاحة»" : undefined,
    });
    if (n.impact?.affected?.length) setImpact({ note: n, affected: n.impact.affected });
  };

  const quickStatus = async (n: Note, status: string) => {
    try {
      const r = await api<Note>("PATCH", `/maintenance/${n.id}`, { status });
      handleResult(r, status === "resolved" ? "تم إنجاز الصيانة" : "تم تحديث الحالة");
      refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "فشل تحديث الحالة", description: errorMessage(e) });
    }
  };

  const showAffected = async (n: Note) => {
    try {
      const affected = await api<AffectedBooking[]>("GET", `/maintenance/${n.id}/affected`);
      if (!affected.length) toast({ title: "لا توجد حجوزات متأثرة بهذه الصيانة" });
      else setImpact({ note: n, affected });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر جلب الحجوزات", description: errorMessage(e) });
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api("DELETE", `/maintenance/${deleteTarget.id}`);
      toast({ title: "تم حذف السجل" });
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "فشل الحذف", description: errorMessage(e) });
    }
  };

  const NoteActions = ({ n }: { n: Note }) => (
    <div className="flex items-center gap-0.5">
      {n.status !== "resolved" && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" title="تم الإنجاز" onClick={() => quickStatus(n, "resolved")}>
          <CheckCircle2 className="w-4 h-4" />
        </Button>
      )}
      {n.status === "pending" && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-sky-600 hover:bg-sky-50" title="بدء التنفيذ" onClick={() => quickStatus(n, "in_progress")}>
          <Loader2 className="w-4 h-4" />
        </Button>
      )}
      {n.status === "resolved" && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-50" title="إعادة فتح" onClick={() => quickStatus(n, "pending")}>
          <Repeat className="w-4 h-4" />
        </Button>
      )}
      {n.blocksHall && n.status !== "resolved" && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600 hover:bg-rose-50" title="الحجوزات المتأثرة" onClick={() => showAffected(n)}>
          <ArrowLeftRight className="w-4 h-4" />
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/5" title="تعديل" onClick={() => { setEditing(n); setDialogOpen(true); }}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" title="حذف" onClick={() => setDeleteTarget(n)}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );

  const NotesList = ({ list, empty }: { list: Note[]; empty: string }) => (
    <>
      <div className="md:hidden space-y-2.5">
        {isLoading ? <Skeleton className="h-28 rounded-xl" /> : !list.length ? <EmptyBox text={empty} /> : list.map((n) => (
          <div key={n.id} className="rounded-xl border bg-card p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{n.title || MAINTENANCE_CATEGORY[n.category]}</p>
                <p className="text-xs text-muted-foreground truncate">{hallName(n.hallId)}{assetName(n.assetId) ? ` • ${assetName(n.assetId)}` : ""}</p>
              </div>
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full border shrink-0", PRIORITY[n.priority]?.cls)}>{PRIORITY[n.priority]?.label}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className={cn("px-2 py-0.5 rounded-full border", STATUS[n.status]?.cls)}>{STATUS[n.status]?.label}</span>
              {blockText(n) && <span className="px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-1"><Lock className="w-3 h-3" />{blockText(n)}</span>}
            </div>
            <NoteActions n={n} />
          </div>
        ))}
      </div>
      <Card className="hidden md:block">
        <CardContent className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>القاعة / المادة</TableHead>
                <TableHead>العمل المطلوب</TableHead>
                <TableHead>الأولوية</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الموعد</TableHead>
                <TableHead>أثرها على القاعة</TableHead>
                <TableHead className="w-44">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7}><Skeleton className="h-6" /></TableCell></TableRow>
              ) : !list.length ? (
                <TableRow><TableCell colSpan={7}><EmptyBox text={empty} /></TableCell></TableRow>
              ) : list.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{hallName(n.hallId)}</p>
                    {assetName(n.assetId) && <p className="text-xs text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" />{assetName(n.assetId)}</p>}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <p className="text-sm font-medium truncate">
                      {n.scheduleId && <Repeat className="inline w-3.5 h-3.5 text-violet-500 ml-1" />}
                      {n.title || MAINTENANCE_CATEGORY[n.category] || n.category}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{MAINTENANCE_CATEGORY[n.category]} — {n.description}</p>
                  </TableCell>
                  <TableCell><span className={cn("text-xs px-2 py-0.5 rounded-full border", PRIORITY[n.priority]?.cls)}>{PRIORITY[n.priority]?.label}</span></TableCell>
                  <TableCell><span className={cn("text-xs px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS[n.status]?.cls)}>{STATUS[n.status]?.label}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {n.status === "resolved" && n.resolvedAt ? `أُنجزت ${formatDate(n.resolvedAt)}` : n.scheduledDate ? formatDate(n.scheduledDate) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {blockText(n) ? <span className="inline-flex items-center gap-1 text-rose-700"><Lock className="w-3.5 h-3.5" />{blockText(n)}</span> : <span className="text-muted-foreground">لا تؤثر</span>}
                  </TableCell>
                  <TableCell><NoteActions n={n} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Wrench}
        title="متابعة الصيانة"
        description="الأعمال الطارئة والمجدولة والصيانة الدورية، مع حجب القاعة وإشعار الحجوزات المتأثرة تلقائياً"
        actions={<Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="w-4 h-4" />تسجيل عمل صيانة</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={ClipboardList} label="أعمال مفتوحة" value={(notes ?? []).filter((n) => n.status !== "resolved").length} tone="primary" />
        <StatTile icon={AlertTriangle} label="عاجلة" value={urgent} tone="rose" />
        <StatTile icon={Lock} label="تحجب قاعات" value={blocking} tone="amber" />
        <StatTile icon={CheckCircle2} label="منجزة" value={(notes ?? []).filter((n) => n.status === "resolved").length} tone="emerald" />
      </div>

      <Tabs defaultValue="current" dir="rtl" className="space-y-3">
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
          <TabsList className="self-start">
            <TabsTrigger value="current" className="gap-1.5"><CalendarClock className="w-3.5 h-3.5" />الحالية ({current.length})</TabsTrigger>
            <TabsTrigger value="done" className="gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />المنجزة ({done.length})</TabsTrigger>
            <TabsTrigger value="schedules" className="gap-1.5"><Repeat className="w-3.5 h-3.5" />الصيانة الدورية</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="pr-9 h-9" />
            </div>
            <Select value={hallFilter} onValueChange={setHallFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع القاعات</SelectItem>
                {halls?.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.nameAr || h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <TabsContent value="current"><NotesList list={current} empty="لا توجد أعمال صيانة مفتوحة" /></TabsContent>
        <TabsContent value="done"><NotesList list={done} empty="لا توجد أعمال منجزة" /></TabsContent>
        <TabsContent value="schedules"><SchedulesPanel halls={halls ?? []} assets={assets ?? []} hallFilter={hallFilter} /></TabsContent>
      </Tabs>

      <NoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        note={editing}
        halls={halls ?? []}
        assets={assets ?? []}
        onSaved={(n, created) => { handleResult(n, created ? "تم تسجيل عمل الصيانة" : "تم حفظ التعديلات"); refresh(); }}
      />

      <ImpactDialog impact={impact} onClose={() => setImpact(null)} hallName={hallName} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف سجل الصيانة</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف السجل نهائياً، وإن كان يحجب القاعة فستعود متاحة للحجز.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={remove}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-muted-foreground text-sm">
      <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const BLOCK_OPTIONS: { value: BlockMode; title: string; hint: string; icon: typeof Ban }[] = [
  { value: "none", title: "لا تؤثر على الحجز", hint: "تُنفَّذ دون إيقاف القاعة", icon: CheckCircle2 },
  { value: "until_resolved", title: "إيقاف القاعة حتى الإنجاز", hint: "تتحول القاعة إلى «تحت الصيانة»", icon: Ban },
  { value: "window", title: "حجب القاعة في فترة محددة", hint: "تمنع الحجز في الأيام/الساعات المحددة", icon: CalendarRange },
];

function NoteDialog({
  open, onOpenChange, note, halls, assets, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  note: Note | null;
  halls: any[];
  assets: HallAsset[];
  onSaved: (n: Note, created: boolean) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<NoteForm>(EMPTY_NOTE);
  const [saving, setSaving] = useState(false);
  const [touchedBlock, setTouchedBlock] = useState(false);
  const set = <K extends keyof NoteForm>(k: K, v: NoteForm[K]) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setTouchedBlock(!!note);
    if (note) {
      setF({
        hallId: String(note.hallId),
        assetId: note.assetId ? String(note.assetId) : "",
        title: note.title ?? "",
        category: note.category,
        priority: note.priority,
        status: note.status,
        description: note.description,
        scheduledDate: note.scheduledDate?.slice(0, 10) ?? "",
        blockMode: !note.blocksHall ? "none" : note.blockStartDate ? "window" : "until_resolved",
        blockStartDate: note.blockStartDate ?? "",
        blockEndDate: note.blockEndDate ?? "",
        blockStartTime: note.blockStartTime ?? "",
        blockEndTime: note.blockEndTime ?? "",
      });
    } else setF({ ...EMPTY_NOTE, hallId: halls[0] ? String(halls[0].id) : "" });
  }, [open, note, halls]);

  // Suggest blocking for urgent faults until the manager chooses explicitly.
  useEffect(() => {
    if (!touchedBlock && f.priority === "urgent") setF((s) => ({ ...s, blockMode: "until_resolved" }));
    if (!touchedBlock && f.priority !== "urgent") setF((s) => ({ ...s, blockMode: s.blockMode === "until_resolved" ? "none" : s.blockMode }));
  }, [f.priority, touchedBlock]);

  const hallAssets = assets.filter((a) => String(a.hallId) === f.hallId);

  const save = async () => {
    if (!f.hallId || !f.description.trim()) {
      toast({ variant: "destructive", title: "يرجى اختيار القاعة وكتابة وصف العمل" });
      return;
    }
    if (f.blockMode === "window" && !f.blockStartDate) {
      toast({ variant: "destructive", title: "يرجى تحديد تاريخ بداية حجب القاعة" });
      return;
    }
    setSaving(true);
    const body = {
      hallId: Number(f.hallId),
      assetId: f.assetId ? Number(f.assetId) : null,
      title: f.title,
      category: f.category,
      priority: f.priority,
      status: f.status,
      description: f.description.trim(),
      scheduledDate: f.scheduledDate || (f.blockMode === "window" ? f.blockStartDate : undefined) || undefined,
      blocksHall: f.blockMode !== "none",
      blockStartDate: f.blockMode === "window" ? f.blockStartDate : null,
      blockEndDate: f.blockMode === "window" ? f.blockEndDate || f.blockStartDate : null,
      blockStartTime: f.blockMode === "window" && f.blockStartTime && f.blockEndTime ? f.blockStartTime : null,
      blockEndTime: f.blockMode === "window" && f.blockStartTime && f.blockEndTime ? f.blockEndTime : null,
    };
    try {
      const r = note ? await api<Note>("PATCH", `/maintenance/${note.id}`, body) : await api<Note>("POST", "/maintenance", body);
      onOpenChange(false);
      onSaved(r, !note);
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92svh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2"><Wrench className="w-5 h-5 text-primary" />{note ? "تعديل عمل الصيانة" : "تسجيل عمل صيانة"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>القاعة <span className="text-destructive">*</span></Label>
              <Select value={f.hallId} onValueChange={(v) => setF((s) => ({ ...s, hallId: v, assetId: "" }))}>
                <SelectTrigger><SelectValue placeholder="اختر القاعة" /></SelectTrigger>
                <SelectContent>{halls.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.nameAr || h.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>المادة / الجهاز (اختياري)</Label>
              <Select value={f.assetId || "none"} onValueChange={(v) => set("assetId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">القاعة بشكل عام</SelectItem>
                  {hallAssets.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}{a.inventoryNo ? ` (${a.inventoryNo})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>عنوان العمل</Label>
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="مثال: عطل في جهاز التكييف المركزي" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>نوع الصيانة</Label>
              <Select value={f.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MAINTENANCE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الأولوية</Label>
              <Select value={f.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label>الحالة</Label>
              <Select value={f.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>وصف العمل <span className="text-destructive">*</span></Label>
            <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>

          <div className="space-y-2">
            <Label>أثر الصيانة على حجز القاعة</Label>
            <div className="grid sm:grid-cols-3 gap-2">
              {BLOCK_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { setTouchedBlock(true); set("blockMode", o.value); }}
                  className={cn(
                    "text-right rounded-xl border p-3 transition-colors",
                    f.blockMode === o.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                  )}
                >
                  <o.icon className={cn("w-4 h-4 mb-1.5", f.blockMode === o.value ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-semibold">{o.title}</p>
                  <p className="text-[11px] text-muted-foreground">{o.hint}</p>
                </button>
              ))}
            </div>
            {f.blockMode === "window" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border p-3 bg-muted/30">
                <div className="space-y-1"><Label className="text-xs">من تاريخ *</Label><Input type="date" value={f.blockStartDate} onChange={(e) => set("blockStartDate", e.target.value)} dir="ltr" /></div>
                <div className="space-y-1"><Label className="text-xs">إلى تاريخ</Label><Input type="date" value={f.blockEndDate} min={f.blockStartDate} onChange={(e) => set("blockEndDate", e.target.value)} dir="ltr" /></div>
                <div className="space-y-1"><Label className="text-xs">من الساعة</Label><Input type="time" value={f.blockStartTime} onChange={(e) => set("blockStartTime", e.target.value)} dir="ltr" /></div>
                <div className="space-y-1"><Label className="text-xs">إلى الساعة</Label><Input type="time" value={f.blockEndTime} onChange={(e) => set("blockEndTime", e.target.value)} dir="ltr" /></div>
                <p className="col-span-full text-[11px] text-muted-foreground">اترك الساعات فارغة لحجب اليوم كاملاً.</p>
              </div>
            )}
            {f.blockMode === "none" && (
              <div className="space-y-1.5 max-w-xs">
                <Label className="text-xs">الموعد المخطط للتنفيذ (للتذكير)</Label>
                <Input type="date" value={f.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} dir="ltr" />
              </div>
            )}
            {f.blockMode !== "none" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                سيتم إشعار أصحاب الحجوزات المتأثرة مع اقتراح قاعات بديلة، ويمكنك نقلها مباشرة بعد الحفظ.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}{note ? "حفظ التعديلات" : "تسجيل"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function ImpactDialog({ impact, onClose, hallName }: { impact: { note: Note; affected: AffectedBooking[] } | null; onClose: () => void; hallName: (id: number) => string }) {
  const [relocate, setRelocate] = useState<AffectedBooking | null>(null);
  const [moved, setMoved] = useState<number[]>([]);
  useEffect(() => setMoved([]), [impact]);
  return (
    <>
      <Dialog open={!!impact && !relocate} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[90svh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" />حجوزات تتعارض مع الصيانة</DialogTitle>
            <DialogDescription>
              {impact ? `${impact.affected.length} حجز في ${hallName(impact.note.hallId)} — تم إشعار أصحابها. انقل كل حجز إلى قاعة بديلة متاحة.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {impact?.affected.map((b) => (
              <div key={b.id} className={cn("rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3", moved.includes(b.id) && "opacity-50")}>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-semibold text-sm">{b.department} — {activityLabel(b.activityType)}</p>
                  <p className="text-xs text-muted-foreground">
                    #{b.id} • {formatDate(b.startDate)}{b.endDate !== b.startDate ? ` – ${formatDate(b.endDate)}` : ""} • <span dir="ltr">{b.startTime}–{b.endTime}</span>
                    {b.isRecurring ? ` • متكرر ${b.recurringWeeks} أسبوع` : ""}{b.attendees ? ` • ${b.attendees} شخص` : ""}
                  </p>
                  <p className="text-xs">
                    {b.alternatives.length ? <span className="text-emerald-700">بدائل متاحة: {b.alternatives.map((a) => a.name).join("، ")}</span> : <span className="text-red-600">لا توجد قاعة بديلة متاحة في نفس الموعد</span>}
                  </p>
                </div>
                {moved.includes(b.id) ? (
                  <span className="text-xs text-emerald-700 font-semibold">تم النقل</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={!b.alternatives.length} onClick={() => setRelocate(b)}>
                    <ArrowLeftRight className="w-4 h-4" /> نقل
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1"><Button variant="outline" onClick={onClose}>إغلاق</Button></div>
        </DialogContent>
      </Dialog>
      <RelocateDialog
        booking={relocate ? { ...relocate, hall: { name: impact ? hallName(impact.note.hallId) : "" } } : null}
        onClose={() => setRelocate(null)}
        onDone={() => relocate && setMoved((m) => [...m, relocate.id])}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

interface ScheduleForm {
  hallId: string;
  assetId: string;
  title: string;
  category: string;
  intervalDays: string;
  nextDueDate: string;
  leadDays: string;
  blocksHall: boolean;
  blockStartTime: string;
  blockEndTime: string;
  isActive: boolean;
  notes: string;
}

const INTERVALS = [
  { v: "7", l: "أسبوعياً" },
  { v: "30", l: "شهرياً" },
  { v: "90", l: "كل 3 أشهر" },
  { v: "180", l: "كل 6 أشهر" },
  { v: "365", l: "سنوياً" },
];

function SchedulesPanel({ halls, assets, hallFilter }: { halls: any[]; assets: HallAsset[]; hallFilter: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: schedules, isLoading } = useApiQuery<MaintenanceSchedule[]>("/maintenance/schedules");
  const [editing, setEditing] = useState<MaintenanceSchedule | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ScheduleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const hallName = (id: number) => halls.find((h) => h.id === id)?.nameAr || halls.find((h) => h.id === id)?.name || `#${id}`;
  const list = (schedules ?? []).filter((s) => hallFilter === "all" || String(s.hallId) === hallFilter);

  const openForm = (s: MaintenanceSchedule | null) => {
    setEditing(s);
    setF(
      s
        ? { hallId: String(s.hallId), assetId: s.assetId ? String(s.assetId) : "", title: s.title, category: s.category, intervalDays: String(s.intervalDays), nextDueDate: s.nextDueDate, leadDays: String(s.leadDays), blocksHall: s.blocksHall, blockStartTime: s.blockStartTime ?? "", blockEndTime: s.blockEndTime ?? "", isActive: s.isActive, notes: s.notes ?? "" }
        : { hallId: halls[0] ? String(halls[0].id) : "", assetId: "", title: "", category: "hvac", intervalDays: "90", nextDueDate: "", leadDays: "7", blocksHall: false, blockStartTime: "", blockEndTime: "", isActive: true, notes: "" },
    );
    setOpen(true);
  };

  const save = async () => {
    if (!f) return;
    setSaving(true);
    try {
      const body = { ...f, hallId: Number(f.hallId), assetId: f.assetId ? Number(f.assetId) : null, intervalDays: Number(f.intervalDays), leadDays: Number(f.leadDays), blockStartTime: f.blockStartTime || null, blockEndTime: f.blockEndTime || null };
      if (editing) await api("PATCH", `/maintenance/schedules/${editing.id}`, body);
      else await api("POST", "/maintenance/schedules", body);
      toast({ title: "تم حفظ الصيانة الدورية", description: "تُنشأ مهمة الصيانة تلقائياً قبل موعدها" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["v2"] });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: MaintenanceSchedule) => {
    try {
      await api("DELETE", `/maintenance/schedules/${s.id}`);
      qc.invalidateQueries({ queryKey: ["v2"] });
      toast({ title: "تم حذف الجدولة" });
    } catch (e) {
      toast({ variant: "destructive", title: "فشل الحذف", description: errorMessage(e) });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-violet-50/60 dark:bg-violet-500/10 border-violet-200 p-3">
        <p className="text-sm text-violet-900 dark:text-violet-200">
          الصيانة الدورية تنشئ مهمة صيانة تلقائياً قبل موعدها بالمدة المحددة، وتظهر في التقويم، ويمكن أن تحجب القاعة وقت التنفيذ.
        </p>
        <Button size="sm" onClick={() => openForm(null)} className="shrink-0"><Plus className="w-4 h-4" />جدولة</Button>
      </div>
      {isLoading ? <Skeleton className="h-24" /> : !list.length ? (
        <div className="rounded-xl border bg-card"><EmptyBox text="لا توجد صيانة دورية مجدولة" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((s) => (
            <Card key={s.id} className={cn("p-4 space-y-2", !s.isActive && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{hallName(s.hallId)}{s.assetId ? ` • ${assets.find((a) => a.id === s.assetId)?.name ?? ""}` : ""}</p>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 shrink-0">{INTERVALS.find((i) => i.v === String(s.intervalDays))?.l ?? `كل ${s.intervalDays} يوم`}</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>الموعد القادم: <span className="font-semibold text-foreground">{formatDate(s.nextDueDate)}</span></p>
                <p>{MAINTENANCE_CATEGORY[s.category]} • تُنشأ قبل {s.leadDays} أيام{s.blocksHall ? ` • تحجب القاعة${s.blockStartTime ? ` ${s.blockStartTime}–${s.blockEndTime}` : " يوماً كاملاً"}` : ""}</p>
                {!s.isActive && <p className="text-amber-700">موقوفة</p>}
              </div>
              <div className="flex justify-end gap-1 pt-1 border-t">
                <Button size="sm" variant="ghost" onClick={() => openForm(s)}><Pencil className="w-3.5 h-3.5" />تعديل</Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(s)}><Trash2 className="w-3.5 h-3.5" />حذف</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[92svh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right"><DialogTitle className="flex items-center gap-2"><Repeat className="w-5 h-5 text-violet-600" />{editing ? "تعديل صيانة دورية" : "جدولة صيانة دورية"}</DialogTitle></DialogHeader>
          {f && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>العنوان *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثال: فحص وتنظيف فلاتر التكييف" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>القاعة *</Label>
                  <Select value={f.hallId} onValueChange={(v) => setF({ ...f, hallId: v, assetId: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{halls.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.nameAr || h.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>المادة</Label>
                  <Select value={f.assetId || "none"} onValueChange={(v) => setF({ ...f, assetId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">القاعة بشكل عام</SelectItem>
                      {assets.filter((a) => String(a.hallId) === f.hallId).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>نوع الصيانة</Label>
                  <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(MAINTENANCE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>التكرار *</Label>
                  <Select value={INTERVALS.some((i) => i.v === f.intervalDays) ? f.intervalDays : "custom"} onValueChange={(v) => setF({ ...f, intervalDays: v === "custom" ? "14" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}
                      <SelectItem value="custom">مدة مخصصة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!INTERVALS.some((i) => i.v === f.intervalDays) && (
                  <div className="space-y-1.5"><Label>كل (يوم)</Label><Input type="number" min={1} value={f.intervalDays} onChange={(e) => setF({ ...f, intervalDays: e.target.value })} dir="ltr" /></div>
                )}
                <div className="space-y-1.5"><Label>الموعد القادم *</Label><Input type="date" value={f.nextDueDate} onChange={(e) => setF({ ...f, nextDueDate: e.target.value })} dir="ltr" /></div>
                <div className="space-y-1.5"><Label>إنشاء المهمة قبل (يوم)</Label><Input type="number" min={0} max={60} value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: e.target.value })} dir="ltr" /></div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={f.blocksHall} onCheckedChange={(v) => setF({ ...f, blocksHall: v === true })} />
                  حجب القاعة يوم تنفيذ الصيانة
                </label>
                {f.blocksHall && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">من الساعة</Label><Input type="time" value={f.blockStartTime} onChange={(e) => setF({ ...f, blockStartTime: e.target.value })} dir="ltr" /></div>
                    <div className="space-y-1"><Label className="text-xs">إلى الساعة</Label><Input type="time" value={f.blockEndTime} onChange={(e) => setF({ ...f, blockEndTime: e.target.value })} dir="ltr" /></div>
                    <p className="col-span-2 text-[11px] text-muted-foreground">اتركهما فارغين لحجب اليوم كاملاً.</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5"><Label>ملاحظات / تعليمات التنفيذ</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v === true })} />
                الجدولة فعّالة
              </label>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
