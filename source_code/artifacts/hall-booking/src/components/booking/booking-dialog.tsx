import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBookingsQueryKey } from "@workspace/api-client-react";
import {
  Armchair, Building2, CalendarClock, CalendarDays, Hash, Info, Loader2, MapPin, PackageCheck, Phone, Repeat, User, Users, UtensilsCrossed,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { api, errorMessage, useApiQuery } from "@/lib/api";
import { fromMin, longDate, toMin } from "@/lib/calendar";
import { DEFAULT_ACTIVITY_TYPES } from "@/lib/labels";
import { usePublicSettings } from "@/components/layout/use-public-settings";
import { AvailabilityCalendar } from "./availability-calendar";

export interface BookableHall {
  id: number;
  name: string;
  nameAr?: string | null;
  location: string;
  locationAr?: string | null;
  capacity: number;
  floor?: string | null;
  building?: string | null;
  referenceCode?: string | null;
  providesHospitality?: boolean;
  status?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hall?: BookableHall | null;
  /** Manager mode: choose the hall, enter the department name, booking is approved immediately. */
  halls?: BookableHall[];
  mode: "department" | "manager";
  initialDate?: string;
  /** Pre-select a hall in the hall picker (when `hall` is not fixed). */
  initialHallId?: number;
  onCreated?: () => void;
}

interface FormState {
  hallId: number | null;
  manualDepartmentName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  activityType: string;
  reason: string;
  attendees: string;
  seatingLayout: string;
  requestedItems: string[];
  needsCatering: boolean;
  needsMeals: boolean;
  coordinatorName: string;
  coordinatorPhone: string;
  isRecurring: boolean;
  recurringWeeks: string;
  notes: string;
}

const EMPTY: FormState = {
  hallId: null,
  manualDepartmentName: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  activityType: "",
  reason: "",
  attendees: "",
  seatingLayout: "",
  requestedItems: [],
  needsCatering: false,
  needsMeals: false,
  coordinatorName: "",
  coordinatorPhone: "",
  isRecurring: false,
  recurringWeeks: "4",
  notes: "",
};

function Section({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-3.5 h-3.5" />
        </span>
        {title}
      </h4>
      {children}
    </section>
  );
}

const Req = () => <span className="text-destructive">*</span>;

export function BookingDialog({ open, onOpenChange, hall, halls, mode, initialDate, initialHallId, onCreated }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = usePublicSettings();
  const rules = settings?.options?.booking;
  const [f, setF] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const activeHall = useMemo(
    () => hall ?? halls?.find((h) => h.id === f.hallId) ?? null,
    [hall, halls, f.hallId],
  );
  const hallId = activeHall?.id ?? null;
  const { data: requestable } = useApiQuery<{ items: { name: string; available: boolean }[]; seatingLayouts: string[]; capacity: number }>(
    open && hallId ? `/halls/${hallId}/requestable` : null,
  );

  useEffect(() => {
    if (!open) return;
    setF({
      ...EMPTY,
      hallId: hall?.id ?? initialHallId ?? null,
      startDate: initialDate ?? "",
      endDate: initialDate ?? "",
      activityType: (rules?.activityTypes?.length ? rules.activityTypes : DEFAULT_ACTIVITY_TYPES)[0],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hall?.id, initialDate, initialHallId]);

  const step = rules?.slotStepMinutes ?? 30;
  const timeOptions = useMemo(() => {
    const ws = mode === "manager" ? 0 : toMin(settings?.workingHoursStart ?? "07:00");
    const we = mode === "manager" ? 24 * 60 - step : toMin(settings?.workingHoursEnd ?? "15:00");
    const out: string[] = [];
    for (let m = ws; m <= we; m += step) out.push(fromMin(m));
    return out;
  }, [mode, settings?.workingHoursStart, settings?.workingHoursEnd, step]);

  const activityTypes = rules?.activityTypes?.length ? rules.activityTypes : DEFAULT_ACTIVITY_TYPES;
  const seating = requestable?.seatingLayouts ?? rules?.seatingLayouts ?? [];
  const capacity = activeHall?.capacity ?? 0;
  const attendeesNum = Number(f.attendees) || 0;

  const validate = (): string | null => {
    if (!hallId) return "يرجى اختيار القاعة";
    if (mode === "manager" && !f.manualDepartmentName.trim()) return "يرجى إدخال اسم الجهة الطالبة";
    if (!f.startDate) return "يرجى اختيار تاريخ الحجز من التقويم";
    if (f.endDate && f.endDate < f.startDate) return "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء";
    if (!f.startTime || !f.endTime) return "يرجى تحديد وقت البداية والنهاية";
    if (f.endTime <= f.startTime) return "وقت الانتهاء يجب أن يكون بعد وقت البدء";
    if (!f.activityType) return "يرجى اختيار نوع النشاط";
    if (!f.reason.trim()) return "يرجى كتابة عنوان أو غرض النشاط";
    if (rules?.requireAttendees && !attendeesNum) return "يرجى تحديد عدد الحضور المتوقع";
    if (attendeesNum && capacity && attendeesNum > capacity) return `عدد الحضور يتجاوز سعة القاعة (${capacity})`;
    if (rules?.requireCoordinator && (!f.coordinatorName.trim() || !f.coordinatorPhone.trim())) return "يرجى إدخال اسم ورقم هاتف المنسق";
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      toast({ variant: "destructive", title: err });
      return;
    }
    setSaving(true);
    try {
      await api("POST", "/bookings", {
        hallId,
        startDate: f.startDate,
        endDate: f.endDate || f.startDate,
        startTime: f.startTime,
        endTime: f.endTime,
        activityType: f.activityType,
        reason: f.reason.trim(),
        notes: f.notes.trim() || undefined,
        attendees: attendeesNum || null,
        seatingLayout: f.seatingLayout || null,
        requestedItems: f.requestedItems,
        needsCatering: !!activeHall?.providesHospitality && f.needsCatering,
        needsMeals: !!activeHall?.providesHospitality && f.needsMeals,
        coordinatorName: f.coordinatorName.trim() || undefined,
        coordinatorPhone: f.coordinatorPhone.trim() || undefined,
        isRecurring: f.isRecurring,
        recurringWeeks: f.isRecurring ? Number(f.recurringWeeks) || 1 : undefined,
        ...(mode === "manager" ? { manualDepartmentName: f.manualDepartmentName.trim() } : {}),
      });
      toast({
        title: mode === "manager" ? "تم تسجيل الحجز واعتماده" : "تم تقديم طلب الحجز بنجاح",
        description: mode === "manager" ? undefined : "سيصلك إشعار عند مراجعة الطلب من قبل مدير العلاقات",
      });
      qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });
      qc.invalidateQueries({ queryKey: ["v2"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر حفظ الحجز", description: errorMessage(e, "يرجى المحاولة مرة أخرى") });
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (name: string) =>
    set("requestedItems", f.requestedItems.includes(name) ? f.requestedItems.filter((x) => x !== name) : [...f.requestedItems, name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[calc(100vw-1rem)] max-h-[94svh] p-0 gap-0 overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader className="px-5 py-4 border-b bg-muted/30 text-right space-y-1">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="w-5 h-5 text-primary" />
            {mode === "manager" ? "حجز مباشر لجهة" : `طلب حجز: ${activeHall?.nameAr || activeHall?.name || ""}`}
          </DialogTitle>
          {activeHall && (
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{activeHall.locationAr || activeHall.location}{activeHall.floor ? ` • الطابق ${activeHall.floor}` : ""}</span>
              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />السعة {activeHall.capacity} شخص</span>
              {activeHall.referenceCode && <span className="inline-flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{activeHall.referenceCode}</span>}
              {activeHall.providesHospitality && <span className="inline-flex items-center gap-1 text-amber-700"><UtensilsCrossed className="w-3.5 h-3.5" />تتوفر ضيافة</span>}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-0">
            {/* Calendar column */}
            <div className="p-4 lg:border-l space-y-3 bg-muted/10">
              {!hall && (
                <div className="space-y-1.5">
                  <Label>القاعة <Req /></Label>
                  <Select value={f.hallId ? String(f.hallId) : ""} onValueChange={(v) => set("hallId", Number(v))}>
                    <SelectTrigger><SelectValue placeholder="اختر القاعة" /></SelectTrigger>
                    <SelectContent>
                      {(halls ?? []).filter((h) => h.status === "available").map((h) => (
                        <SelectItem key={h.id} value={String(h.id)}>{h.nameAr || h.name} — {h.capacity} شخص</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {hallId ? (
                <AvailabilityCalendar
                  hallId={hallId}
                  selectedDate={f.startDate || undefined}
                  managerMode={mode === "manager"}
                  step={step}
                  onSelectDate={(d) => setF((s) => ({ ...s, startDate: d, endDate: !s.endDate || s.endDate < d || s.endDate === s.startDate ? d : s.endDate }))}
                  onPickSlot={(st, en) => setF((s) => ({ ...s, startTime: st, endTime: en }))}
                />
              ) : (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  اختر القاعة لعرض الأيام المحجوزة
                </div>
              )}
              {rules && mode === "department" && (
                <div className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                  <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    ساعات الحجز: {settings?.workingHoursStart} – {settings?.workingHoursEnd}
                    {rules.minAdvanceHours > 0 && ` • يُقدَّم الطلب قبل ${rules.minAdvanceHours} ساعة على الأقل`}
                    {rules.maxAdvanceDays > 0 && ` • الحجز المسبق حتى ${rules.maxAdvanceDays} يوماً`}
                    {rules.maxDurationHours > 0 && ` • أقصى مدة ${rules.maxDurationHours} ساعات يومياً`}
                  </span>
                </div>
              )}
            </div>

            {/* Form column */}
            <div className="p-4 sm:p-5 space-y-6">
              <Section icon={CalendarDays} title="الموعد">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>من تاريخ <Req /></Label>
                    <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} dir="ltr" className="text-right" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>إلى تاريخ</Label>
                    <Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => set("endDate", e.target.value)} dir="ltr" className="text-right" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>من الساعة <Req /></Label>
                    <Select value={f.startTime} onValueChange={(v) => set("startTime", v)}>
                      <SelectTrigger dir="ltr" className="tabular-nums"><SelectValue placeholder="--:--" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {timeOptions.map((t) => <SelectItem key={t} value={t} className="tabular-nums">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>إلى الساعة <Req /></Label>
                    <Select value={f.endTime} onValueChange={(v) => set("endTime", v)}>
                      <SelectTrigger dir="ltr" className="tabular-nums"><SelectValue placeholder="--:--" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {[...timeOptions.slice(1), ...(mode === "manager" ? ["23:59"] : [])].filter((t) => !f.startTime || t > f.startTime).map((t) => (
                          <SelectItem key={t} value={t} className="tabular-nums">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {f.startDate && (
                  <p className="text-xs text-muted-foreground">
                    {longDate(f.startDate)}
                    {f.endDate && f.endDate !== f.startDate ? ` — حتى ${longDate(f.endDate)}` : ""}
                  </p>
                )}
                {(rules?.allowRecurring ?? true) && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={f.isRecurring} onCheckedChange={(v) => set("isRecurring", v === true)} />
                      <Repeat className="w-4 h-4 text-muted-foreground" />
                      تكرار أسبوعي بنفس اليوم والوقت
                    </label>
                    {f.isRecurring && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">لمدة</span>
                        <Input type="number" min={2} max={rules?.maxRecurringWeeks ?? 52} value={f.recurringWeeks} onChange={(e) => set("recurringWeeks", e.target.value)} className="w-20 h-8 text-center" dir="ltr" />
                        <span className="text-muted-foreground">أسبوع</span>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section icon={Info} title="تفاصيل النشاط">
                {mode === "manager" && (
                  <div className="space-y-1.5">
                    <Label>الجهة الطالبة <Req /></Label>
                    <Input value={f.manualDepartmentName} onChange={(e) => set("manualDepartmentName", e.target.value)} placeholder="مثال: قسم الموارد البشرية" />
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>نوع النشاط <Req /></Label>
                    <Select value={f.activityType} onValueChange={(v) => set("activityType", v)}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        {activityTypes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>عدد الحضور المتوقع {rules?.requireAttendees && <Req />}</Label>
                    <div className="relative">
                      <Input type="number" min={1} max={capacity || undefined} value={f.attendees} onChange={(e) => set("attendees", e.target.value)} dir="ltr" className={cn("text-right", attendeesNum > capacity && capacity ? "border-destructive" : "")} />
                      {capacity > 0 && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">من {capacity}</span>}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>عنوان النشاط / الغرض من الحجز <Req /></Label>
                  <Textarea value={f.reason} onChange={(e) => set("reason", e.target.value)} rows={2} placeholder="مثال: الاجتماع الدوري لمدراء الأقسام" />
                </div>
              </Section>

              {(seating.length > 0 || (requestable?.items.length ?? 0) > 0) && (
                <Section icon={Armchair} title="تجهيز القاعة">
                  {seating.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">ترتيب الجلوس</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {seating.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => set("seatingLayout", f.seatingLayout === s ? "" : s)}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                              f.seatingLayout === s ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(requestable?.items.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" />التجهيزات المطلوبة</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {requestable!.items.map((it) => (
                          <label
                            key={it.name}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm cursor-pointer transition-colors",
                              f.requestedItems.includes(it.name) ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50",
                              !it.available && "opacity-60",
                            )}
                          >
                            <Checkbox checked={f.requestedItems.includes(it.name)} onCheckedChange={() => toggleItem(it.name)} />
                            <span className="truncate">{it.name}</span>
                            {!it.available && <span className="text-[10px] text-amber-700 mr-auto">قيد الصيانة</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {activeHall?.providesHospitality && (
                <Section icon={UtensilsCrossed} title="الضيافة">
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    <label className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer", f.needsCatering && "border-amber-300 bg-amber-50/70")}>
                      <Checkbox checked={f.needsCatering} onCheckedChange={(v) => set("needsCatering", v === true)} />
                      ضيافة (مشروبات)
                    </label>
                    <label className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer", f.needsMeals && "border-amber-300 bg-amber-50/70")}>
                      <Checkbox checked={f.needsMeals} onCheckedChange={(v) => set("needsMeals", v === true)} />
                      وجبات طعام
                    </label>
                  </div>
                  {rules && rules.cateringLeadHours > 0 && (
                    <p className="text-[11px] text-muted-foreground">طلبات الضيافة تُقدَّم قبل {rules.cateringLeadHours} ساعة على الأقل.</p>
                  )}
                </Section>
              )}

              <Section icon={User} title="المنسق والملاحظات">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>اسم المنسق {rules?.requireCoordinator && <Req />}</Label>
                    <Input value={f.coordinatorName} onChange={(e) => set("coordinatorName", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">هاتف المنسق {rules?.requireCoordinator && <Req />}<Phone className="w-3 h-3 text-muted-foreground" /></Label>
                    <Input value={f.coordinatorPhone} onChange={(e) => set("coordinatorPhone", e.target.value)} dir="ltr" className="text-right" inputMode="tel" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>ملاحظات إضافية</Label>
                  <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
                </div>
              </Section>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-3 border-t bg-muted/20">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" onClick={submit} disabled={saving} className="min-w-40">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "manager" ? "تسجيل الحجز" : "تقديم طلب الحجز"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
