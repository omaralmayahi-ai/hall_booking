import { useEffect, useMemo, useState } from "react";
import { useListHalls } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CheckCircle2, Loader2, Package, PackageX, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, StatTile } from "@/components/layout/page-header";
import { api, errorMessage, useApiQuery, type HallAsset } from "@/lib/api";
import { ASSET_CATEGORY, ASSET_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AssetForm {
  hallId: string;
  name: string;
  category: string;
  inventoryNo: string;
  serialNo: string;
  quantity: string;
  status: string;
  isRequestable: boolean;
  lastCheckedAt: string;
  notes: string;
}

const EMPTY: AssetForm = { hallId: "", name: "", category: "video", inventoryNo: "", serialNo: "", quantity: "1", status: "working", isRequestable: true, lastCheckedAt: "", notes: "" };

export default function ManagerAssets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: halls } = useListHalls();
  const { data: assets, isLoading } = useApiQuery<HallAsset[]>("/assets");
  const [hallFilter, setHallFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<HallAsset | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [f, setF] = useState<AssetForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HallAsset | null>(null);
  const [faultTarget, setFaultTarget] = useState<HallAsset | null>(null);

  const list = useMemo(() => {
    const q = search.trim();
    return (assets ?? []).filter(
      (a) =>
        (hallFilter === "all" || String(a.hallId) === hallFilter) &&
        (statusFilter === "all" || a.status === statusFilter) &&
        (!q || [a.name, a.inventoryNo, a.serialNo, a.hallName, ASSET_CATEGORY[a.category]].some((v) => v?.toLowerCase().includes(q.toLowerCase()))),
    );
  }, [assets, hallFilter, statusFilter, search]);

  const count = (s: string) => (assets ?? []).filter((a) => a.status === s).reduce((n, a) => n + a.quantity, 0);
  const total = (assets ?? []).reduce((n, a) => n + a.quantity, 0);

  useEffect(() => {
    if (!formOpen) return;
    setF(
      editing
        ? {
            hallId: String(editing.hallId), name: editing.name, category: editing.category, inventoryNo: editing.inventoryNo ?? "", serialNo: editing.serialNo ?? "",
            quantity: String(editing.quantity), status: editing.status, isRequestable: editing.isRequestable, lastCheckedAt: editing.lastCheckedAt ?? "", notes: editing.notes ?? "",
          }
        : { ...EMPTY, hallId: hallFilter !== "all" ? hallFilter : halls?.[0] ? String(halls[0].id) : "" },
    );
  }, [formOpen, editing, hallFilter, halls]);

  const save = async () => {
    if (!f.hallId || !f.name.trim()) {
      toast({ variant: "destructive", title: "يرجى اختيار القاعة وإدخال اسم المادة" });
      return;
    }
    setSaving(true);
    try {
      const body = { ...f, hallId: Number(f.hallId), quantity: Number(f.quantity) || 1 };
      if (editing) await api("PATCH", `/assets/${editing.id}`, body);
      else await api("POST", "/assets", body);
      toast({ title: editing ? "تم حفظ التعديلات" : "تمت إضافة المادة إلى جرد القاعة" });
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["v2"] });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api("DELETE", `/assets/${deleteTarget.id}`);
      toast({ title: "تم حذف المادة" });
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["v2"] });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحذف", description: errorMessage(e) });
      setDeleteTarget(null);
    }
  };

  const Actions = ({ a }: { a: HallAsset }) => (
    <div className="flex items-center gap-0.5">
      <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-50" title="الإبلاغ عن عطل" onClick={() => setFaultTarget(a)}>
        <Wrench className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/5" title="تعديل" onClick={() => { setEditing(a); setFormOpen(true); }}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" title="حذف" onClick={() => setDeleteTarget(a)}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Boxes}
        title="محتويات القاعات"
        description="سجل جرد لكل قاعة: الأجهزة والأثاث ورقمها المخزني وحالتها وتاريخ آخر فحص"
        actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="w-4 h-4" />إضافة مادة</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Package} label="إجمالي المواد" value={total} tone="primary" />
        <StatTile icon={CheckCircle2} label="صالحة" value={count("working")} tone="emerald" />
        <StatTile icon={AlertTriangle} label="تحتاج إصلاح" value={count("needs_repair")} tone="amber" />
        <StatTile icon={PackageX} label="عاطلة" value={count("out_of_service")} tone="rose" />
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم المخزني أو التسلسلي..." className="pr-9" />
        </div>
        <div className="flex gap-2">
          <Select value={hallFilter} onValueChange={setHallFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع القاعات</SelectItem>
              {halls?.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.nameAr || h.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(ASSET_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="md:hidden space-y-2.5">
        {isLoading ? <Skeleton className="h-24 rounded-xl" /> : !list.length ? (
          <div className="text-center py-12 text-muted-foreground rounded-xl border bg-card"><Package className="w-8 h-8 mx-auto mb-2 opacity-40" />لا توجد مواد</div>
        ) : list.map((a) => (
          <div key={a.id} className="rounded-xl border bg-card p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{a.name} {a.quantity > 1 && <span className="text-muted-foreground font-normal">×{a.quantity}</span>}</p>
                <p className="text-xs text-muted-foreground">{a.hallName} • {ASSET_CATEGORY[a.category]}</p>
              </div>
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full border shrink-0", ASSET_STATUS[a.status]?.className)}>{ASSET_STATUS[a.status]?.label}</span>
            </div>
            {(a.inventoryNo || a.serialNo) && <p className="text-xs text-muted-foreground text-right" dir="ltr">{[a.inventoryNo, a.serialNo].filter(Boolean).join(" • ")}</p>}
            <Actions a={a} />
          </div>
        ))}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المادة</TableHead>
                <TableHead>القاعة</TableHead>
                <TableHead>الصنف</TableHead>
                <TableHead className="text-center">العدد</TableHead>
                <TableHead>الرقم المخزني</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>آخر فحص</TableHead>
                <TableHead className="text-center">قابلة للطلب</TableHead>
                <TableHead className="w-32">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9}><Skeleton className="h-6" /></TableCell></TableRow>
              ) : !list.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2 opacity-40" />لا توجد مواد مسجلة — ابدأ بإضافة محتويات القاعات</TableCell></TableRow>
              ) : list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{a.name}</p>
                    {a.serialNo && <p className="text-[11px] text-muted-foreground text-right" dir="ltr">S/N {a.serialNo}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{a.hallName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ASSET_CATEGORY[a.category] ?? a.category}</TableCell>
                  <TableCell className="text-center tabular-nums">{a.quantity}</TableCell>
                  <TableCell className="text-sm tabular-nums text-right" dir="ltr">{a.inventoryNo || "—"}</TableCell>
                  <TableCell><span className={cn("text-xs px-2 py-0.5 rounded-full border whitespace-nowrap", ASSET_STATUS[a.status]?.className)}>{ASSET_STATUS[a.status]?.label}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{a.lastCheckedAt ? formatDate(a.lastCheckedAt) : "—"}</TableCell>
                  <TableCell className="text-center">{a.isRequestable ? <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><Actions a={a} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl max-h-[92svh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right"><DialogTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" />{editing ? "تعديل مادة" : "إضافة مادة إلى جرد القاعة"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2"><Label>اسم المادة *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثال: جهاز عرض (داتا شو) Epson" /></div>
            <div className="space-y-1.5">
              <Label>القاعة *</Label>
              <Select value={f.hallId} onValueChange={(v) => setF({ ...f, hallId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{halls?.map((h) => <SelectItem key={h.id} value={String(h.id)}>{h.nameAr || h.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الصنف</Label>
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ASSET_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>الرقم المخزني</Label><Input value={f.inventoryNo} onChange={(e) => setF({ ...f, inventoryNo: e.target.value })} dir="ltr" className="text-right" /></div>
            <div className="space-y-1.5"><Label>الرقم التسلسلي</Label><Input value={f.serialNo} onChange={(e) => setF({ ...f, serialNo: e.target.value })} dir="ltr" className="text-right" /></div>
            <div className="space-y-1.5"><Label>العدد</Label><Input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} dir="ltr" className="text-right" /></div>
            <div className="space-y-1.5">
              <Label>الحالة</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ASSET_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>تاريخ آخر فحص</Label><Input type="date" value={f.lastCheckedAt} onChange={(e) => setF({ ...f, lastCheckedAt: e.target.value })} dir="ltr" /></div>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                <Checkbox checked={f.isRequestable} onCheckedChange={(v) => setF({ ...f, isRequestable: v === true })} className="mt-0.5" />
                <span>
                  <span className="text-sm font-medium block">يمكن طلبها عند الحجز</span>
                  <span className="text-xs text-muted-foreground">تظهر ضمن «التجهيزات المطلوبة» في نموذج طلب الحجز</span>
                </span>
              </label>
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <FaultDialog asset={faultTarget} onClose={() => setFaultTarget(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{deleteTarget?.name}»</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف المادة من جرد القاعة. للمواد المستبعدة يُفضَّل تغيير حالتها إلى «مستبعدة» للاحتفاظ بسجلها.</AlertDialogDescription>
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

function FaultDialog({ asset, onClose }: { asset: HallAsset | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [priority, setPriority] = useState("high");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPriority("high");
    setDescription("");
  }, [asset]);
  const submit = async () => {
    if (!asset || !description.trim()) return;
    setSaving(true);
    try {
      await api("POST", "/maintenance", {
        hallId: asset.hallId,
        assetId: asset.id,
        title: `عطل في ${asset.name}`,
        category: asset.category === "hvac" ? "hvac" : asset.category === "furniture" ? "furniture" : asset.category === "lighting" ? "electrical" : "technology",
        priority,
        description: description.trim(),
        blocksHall: false,
      });
      toast({ title: "تم تسجيل العطل في متابعة الصيانة", description: "تغيّرت حالة المادة تلقائياً" });
      qc.invalidateQueries({ queryKey: ["v2"] });
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر التسجيل", description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={!!asset} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader className="text-right"><DialogTitle className="flex items-center gap-2"><Wrench className="w-5 h-5 text-amber-600" />الإبلاغ عن عطل: {asset?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>الأولوية</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {[["low", "منخفضة"], ["medium", "متوسطة"], ["high", "عالية"], ["urgent", "عاجلة"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setPriority(v)} className={cn("text-xs rounded-lg border py-2", priority === v ? "border-primary bg-primary/5 font-semibold text-primary" : "hover:bg-muted")}>{l}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5"><Label>وصف العطل *</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving || !description.trim()}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}تسجيل العطل</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
