import { useState } from "react";
import { ArrowLeftRight, Building2, Loader2, MapPin, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api, errorMessage, useApiQuery } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

interface Alt {
  id: number;
  name: string;
  capacity: number;
  location: string;
}

/** Move a booking to another free hall (same date & time). Used from booking requests and the maintenance impact list. */
export function RelocateDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: { id: number; startDate: string; endDate?: string; startTime: string; endTime: string; hall?: { nameAr?: string | null; name?: string } | null; attendees?: number | null } | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: alts, isLoading } = useApiQuery<Alt[]>(booking ? `/bookings/${booking.id}/alternatives` : null);
  const [target, setTarget] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!booking || !target) return;
    setSaving(true);
    try {
      await api("POST", `/bookings/${booking.id}/relocate`, { hallId: target, note });
      toast({ title: "تم نقل الحجز وإشعار الجهة" });
      qc.invalidateQueries();
      onDone?.();
      setTarget(null);
      setNote("");
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر نقل الحجز", description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            نقل الحجز إلى قاعة أخرى
          </DialogTitle>
          {booking && (
            <DialogDescription>
              حجز رقم #{booking.id} — {booking.hall?.nameAr || booking.hall?.name} — {formatDate(booking.startDate)}{" "}
              <span dir="ltr">{booking.startTime?.slice(0, 5)}–{booking.endTime?.slice(0, 5)}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <Label>القاعات المتاحة في نفس الموعد{booking?.attendees ? ` (تتسع لـ ${booking.attendees} شخصاً فأكثر)` : ""}</Label>
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : !alts?.length ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Building2 className="w-7 h-7 mx-auto mb-2 opacity-40" />
              لا توجد قاعة بديلة متاحة في هذا الموعد
            </div>
          ) : (
            <div className="grid gap-2 max-h-72 overflow-y-auto">
              {alts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setTarget(a.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border p-3 text-right transition-colors",
                    target === a.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{a.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{a.location}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0"><Users className="w-3.5 h-3.5" />{a.capacity}</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>ملاحظة للجهة (اختياري)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="مثال: بسبب أعمال صيانة في القاعة الأصلية" />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={!target || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            تأكيد النقل
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
