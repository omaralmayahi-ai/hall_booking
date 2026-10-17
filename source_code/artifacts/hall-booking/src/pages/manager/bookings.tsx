import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import {
  useListBookings, useApproveBooking, useRejectBooking, useChangeBookingStatus,
  useListHalls,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Archive } from "lucide-react";
import { CalendarDays, CheckCircle, XCircle, Eye, Filter, UtensilsCrossed, MapPin, Users, Building2, Hash, Phone, Repeat, Clock, FileText, User as UserIcon, RefreshCcw, Plus, Printer, ArrowLeftRight, Search, Armchair, PackageCheck, ClipboardList } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { activityLabel } from "@/lib/labels";
import { BookingDialog, type BookableHall } from "@/components/booking/booking-dialog";
import { RelocateDialog } from "@/components/booking/relocate-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Fact, FilterChips, SectionTitle, StatusBadge, Ticket, relativeDay, toneOf, TimeRange } from "@/components/booking/ticket";
import { todayIso } from "@/lib/calendar";
import { ArchiveAllButton, isArchivable, useArchive } from "@/components/booking/archive-actions";


function departmentDisplayName(booking: any): string {
  return booking.manualDepartmentName || booking.user?.departmentName || "غير محدد";
}

export default function ManagerBookings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "completed" | "closed">("all");
  const { data: bookings, isLoading } = useListBookings({});
  const { data: halls } = useListHalls({});
  const approve = useApproveBooking();
  const reject = useRejectBooking();
  const changeStatus = useChangeBookingStatus();

  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [action, setAction] = useState<"view" | "approve" | "reject" | "status">("view");
  const [note, setNote] = useState("");
  const [cateringApproved, setCateringApproved] = useState(true);
  const [mealsApproved, setMealsApproved] = useState(true);
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  const [relocateTarget, setRelocateTarget] = useState<any>(null);
  const [search, setSearch] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });
  const openManualDialog = () => setManualDialogOpen(true);
  const q = search.trim();
  const groupOf = (b: any) => (b.status === "approved" || b.status === "partially_approved" ? "approved" : ["rejected", "cancelled", "emergency_cancelled"].includes(b.status) ? "closed" : b.status);
  const countOf = (g: string) => (bookings ?? []).filter((b: any) => groupOf(b) === g).length;
  const rows = (bookings ?? []).filter((b: any) => statusFilter === "all" || groupOf(b) === statusFilter).filter((b: any) =>
    !q || [departmentDisplayName(b), b.hall?.nameAr, b.hall?.name, activityLabel(b.activityType), b.reason, String(b.id)].some((v) => v?.includes(q)),
  );

  // Opened from a notification: /manager/bookings?booking=<id> shows that booking's details.
  const searchParams = useSearch();
  const focusBooking = Number(new URLSearchParams(searchParams).get("booking")) || null;
  useEffect(() => {
    if (!focusBooking || !bookings) return;
    const b = bookings.find((x: any) => x.id === focusBooking);
    if (b) openAction(b, "view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBooking, bookings]);

  const openAction = (booking: any, act: typeof action) => {
    setSelectedBooking(booking);
    setAction(act);
    setNote("");
    setCateringApproved(!!booking?.needsCatering);
    setMealsApproved(!!booking?.needsMeals);
    setTargetStatus("");
  };

  const meetingHasEnded = (booking: any) => !!booking && new Date(`${booking.endDate}T${booking.endTime}`) < new Date();

  const statusChangeOptions = (booking: any): { value: string; label: string }[] => {
    if (!booking) return [];
    if (booking.status === "approved" || booking.status === "partially_approved") {
      return [
        { value: "completed", label: "مكتملة (انتهى الاجتماع)" },
        { value: "cancelled", label: "إلغاء الحجز" },
        { value: "emergency_cancelled", label: "إلغاء طارئ" },
      ];
    }
    if (booking.status === "completed" && !meetingHasEnded(booking)) {
      return [{ value: "approved", label: "إعادة إلى موافق عليه" }];
    }
    return [];
  };

  const handleApprove = async () => {
    if (!selectedBooking) return;
    try {
      await approve.mutateAsync({
        id: selectedBooking.id,
        data: {
          cateringApproved: selectedBooking.needsCatering ? cateringApproved : false,
          mealsApproved: selectedBooking.needsMeals ? mealsApproved : false,
          approverNote: note || undefined,
        },
      });
      toast({ title: "تمت الموافقة على الحجز" });
      setSelectedBooking(null);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشلت العملية", description: e?.data?.error ?? "" });
    }
  };

  const handleReject = async () => {
    if (!selectedBooking || !note) { toast({ variant: "destructive", title: "يرجى ذكر سبب الرفض" }); return; }
    try {
      await reject.mutateAsync({ id: selectedBooking.id, data: { reason: note } });
      toast({ title: "تم رفض الحجز" });
      setSelectedBooking(null);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشلت العملية", description: e?.data?.error ?? "" });
    }
  };

  const requiresReason = targetStatus === "cancelled" || targetStatus === "emergency_cancelled";

  const handleChangeStatus = async () => {
    if (!selectedBooking || !targetStatus) { toast({ variant: "destructive", title: "يرجى اختيار الحالة الجديدة" }); return; }
    if (requiresReason && !note) { toast({ variant: "destructive", title: "يرجى ذكر سبب الإلغاء" }); return; }
    try {
      await changeStatus.mutateAsync({ id: selectedBooking.id, data: { status: targetStatus as any, reason: note || undefined } });
      toast({ title: "تم تحديث حالة الحجز" });
      setSelectedBooking(null);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشلت العملية", description: e?.data?.error ?? "" });
    }
  };

  const isPending = approve.isPending || reject.isPending || changeStatus.isPending;

  const today = todayIso();
  const byDateAsc = (a: any, b: any) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime);
  const pendingRows = rows.filter((b: any) => b.status === "pending").sort(byDateAsc);
  const upcomingRows = rows.filter((b: any) => b.status !== "pending" && (b.endDate || b.startDate) >= today && ["approved", "partially_approved"].includes(b.status)).sort(byDateAsc);
  const otherRows = rows.filter((b: any) => !pendingRows.includes(b) && !upcomingRows.includes(b)).sort((a: any, b: any) => byDateAsc(b, a));

  const archive = useArchive("/manager/archive");
  const archivableOthers = otherRows.filter(isArchivable);

  const renderTicket = (booking: any) => {
    const closed = ["rejected", "cancelled", "emergency_cancelled"].includes(booking.status);
    const pending = booking.status === "pending";
    return (
      <Ticket
        key={booking.id}
        date={booking.startDate}
        tone={toneOf(booking.status)}
        muted={closed}
        highlight={pending && booking.startDate <= today}
        onClick={() => openAction(booking, "view")}
        actions={
          <>
            {pending && (
              <>
                <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openAction(booking, "approve")}>
                  <CheckCircle className="w-4 h-4" />موافقة
                </Button>
                <Button size="sm" variant="outline" className="h-9 gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-500/10 hover:text-rose-700" onClick={() => openAction(booking, "reject")}>
                  <XCircle className="w-4 h-4" />رفض
                </Button>
              </>
            )}
            {statusChangeOptions(booking).length > 0 && (
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openAction(booking, "status")} title="تغيير الحالة" aria-label="تغيير الحالة">
                <RefreshCcw className="w-4 h-4" />
              </Button>
            )}
            {["pending", "approved", "partially_approved"].includes(booking.status) && (
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setRelocateTarget(booking)} title="نقل إلى قاعة أخرى" aria-label="نقل إلى قاعة أخرى">
                <ArrowLeftRight className="w-4 h-4" />
              </Button>
            )}
            {!closed && (
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => window.open(`/print/booking/${booking.id}`, "_blank")} title="طباعة إشعار الحجز" aria-label="طباعة إشعار الحجز">
                <Printer className="w-4 h-4" />
              </Button>
            )}
            {isArchivable(booking) && (
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => archive.archiveIds([booking.id])} disabled={archive.busy} title="نقل إلى الأرشيف" aria-label="نقل إلى الأرشيف">
                <Archive className="w-4 h-4" />
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-bold text-base truncate">{departmentDisplayName(booking)}</h3>
          <StatusBadge status={booking.status} />
          {booking.manualDepartmentName && <Badge variant="secondary" className="text-[11px] font-normal">حجز مباشر</Badge>}
          <span className="text-xs text-muted-foreground tabular-nums">#{booking.id}</span>
        </div>
        <p className="text-sm mt-1 truncate">{booking.reason || activityLabel(booking.activityType)}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <Fact icon={Building2} className="text-foreground font-medium">{booking.hall?.nameAr || booking.hall?.name}</Fact>
          <Fact icon={Clock}><TimeRange start={booking.startTime} end={booking.endTime} /></Fact>
          <Fact icon={CalendarDays}>{booking.endDate && booking.endDate !== booking.startDate ? `حتى ${formatDate(booking.endDate)}` : relativeDay(booking.startDate)}</Fact>
          {booking.attendees ? <Fact icon={Users}>{booking.attendees} شخص</Fact> : null}
          {(booking.needsCatering || booking.needsMeals) && <Fact icon={UtensilsCrossed} className="text-amber-700 dark:text-amber-300">{booking.needsCatering && booking.needsMeals ? "ضيافة ووجبة" : booking.needsCatering ? "ضيافة" : "وجبة"}</Fact>}
          {booking.isRecurring && <Fact icon={Repeat}>أسبوعي</Fact>}
        </div>
      </Ticket>
    );
  };

  return (
    <>
      <div className="space-y-5 max-w-6xl">
        <PageHeader
          icon={ClipboardList}
          title="طلبات الحجز"
          description="راجع الطلبات وقرّر فيها، وانقل الحجز أو اطبع إشعاره"
          actions={
            <Button onClick={openManualDialog}>
              <Plus className="w-4 h-4" />
              حجز مباشر لجهة
            </Button>
          }
        />

        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative lg:w-80 shrink-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالجهة أو القاعة أو رقم الطلب" className="pr-9 h-10" />
          </div>
          <FilterChips<typeof statusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "الكل", count: bookings?.length ?? 0 },
              { value: "pending", label: "بانتظار القرار", count: countOf("pending"), tone: "amber" },
              { value: "approved", label: "موافق عليها", count: countOf("approved"), tone: "emerald" },
              { value: "completed", label: "منتهية", count: countOf("completed"), tone: "sky" },
              { value: "closed", label: "مرفوضة وملغاة", count: countOf("closed"), tone: "slate" },
            ]}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : !bookings?.length ? (
          <EmptyState icon={CalendarDays} title="لا توجد طلبات حجز بعد" hint="تظهر هنا طلبات الجهات فور تقديمها، ويمكنك أيضاً إنشاء حجز مباشر لجهة." action={<Button onClick={openManualDialog}><Plus className="w-4 h-4" />حجز مباشر لجهة</Button>} />
        ) : !rows.length ? (
          <EmptyState icon={Search} title="لا توجد نتائج" hint="جرّب كلمة بحث أخرى أو حالة مختلفة." action={<Button variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); }}>مسح البحث والتصفية</Button>} />
        ) : (
          <div className="space-y-6">
            {pendingRows.length > 0 && (
              <section className="space-y-3">
                <SectionTitle count={pendingRows.length} hint="الأقرب موعداً أولاً">بانتظار قرارك</SectionTitle>
                {pendingRows.map(renderTicket)}
              </section>
            )}
            {upcomingRows.length > 0 && (
              <section className="space-y-3">
                <SectionTitle count={upcomingRows.length}>حجوزات قادمة</SectionTitle>
                {upcomingRows.map(renderTicket)}
              </section>
            )}
            {otherRows.length > 0 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionTitle count={otherRows.length}>السابقة والمغلقة</SectionTitle>
                  <ArchiveAllButton count={archivableOthers.length} busy={archive.busy} onClick={() => archive.archiveIds(archivableOthers.map((b: any) => b.id))} />
                </div>
                {otherRows.map(renderTicket)}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={v => !v && setSelectedBooking(null)}>
        <DialogContent className={`${action === "view" ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[85vh] overflow-y-auto`} dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {action === "view" ? "تفاصيل الحجز" : action === "approve" ? "الموافقة على الحجز" : action === "reject" ? "رفض الحجز" : action === "status" ? "تغيير حالة الحجز" : "إلغاء طارئ"}
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-3">
              {/* Status + reference */}
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedBooking.status} />
                <span className="text-xs text-muted-foreground">طلب رقم #{selectedBooking.id}</span>
              </div>

              {action === "view" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Hall details */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">بيانات القاعة</p>
                    <div className="bg-muted/40 rounded-xl p-3 space-y-1.5 text-sm h-full">
                      <p className="font-semibold text-foreground">{selectedBooking.hall?.nameAr || selectedBooking.hall?.name}</p>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                        {selectedBooking.hall?.locationAr || selectedBooking.hall?.location}
                        {selectedBooking.hall?.floor && ` • الطابق ${selectedBooking.hall.floor}`}
                        {selectedBooking.hall?.building && ` • ${selectedBooking.hall.building}`}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                        السعة: {selectedBooking.hall?.capacity} شخص
                      </div>
                      {selectedBooking.hall?.referenceCode && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Hash className="w-3 h-3 shrink-0" />
                          {selectedBooking.hall.referenceCode}
                        </div>
                      )}
                      {selectedBooking.hall?.equipment?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {selectedBooking.hall.equipment.map((eq: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{eq}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Requester details */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">بيانات الجهة الطالبة</p>
                    <div className="bg-muted/40 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm h-full">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> الجهة</p>
                        <p className="font-medium">{departmentDisplayName(selectedBooking)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><UserIcon className="w-3 h-3" /> اسم المستخدم</p>
                        <p className="font-medium">{selectedBooking.manualDepartmentName ? "حجز يدوي بواسطة مدير العلاقات" : (selectedBooking.user?.username ?? "—")}</p>
                      </div>
                      {selectedBooking.user?.phoneNumber && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Phone className="w-3 h-3" /> رقم الهاتف</p>
                          <p className="font-medium text-right" dir="ltr">{selectedBooking.user.phoneNumber}</p>
                        </div>
                      )}
                      {selectedBooking.coordinatorName && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">منسق الحجز</p>
                          <p className="font-medium">{selectedBooking.coordinatorName}</p>
                        </div>
                      )}
                      {selectedBooking.coordinatorPhone && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">هاتف المنسق</p>
                          <p className="font-medium text-right" dir="ltr">{selectedBooking.coordinatorPhone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule & activity */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">تفاصيل الحجز</p>
                <div className="bg-muted/40 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> التاريخ</p>
                    <p className="font-medium">
                      {formatDate(selectedBooking.startDate)}
                      {selectedBooking.endDate && selectedBooking.endDate !== selectedBooking.startDate && ` — ${formatDate(selectedBooking.endDate)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> الوقت</p>
                    <p className="font-medium"><TimeRange start={selectedBooking.startTime} end={selectedBooking.endTime} className="font-medium" /></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">النشاط</p>
                    <p className="font-medium">{activityLabel(selectedBooking.activityType)}</p>
                  </div>
                  {selectedBooking.isRecurring && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Repeat className="w-3 h-3" /> تكرار</p>
                      <p className="font-medium">{selectedBooking.recurringWeeks ?? "—"} أسابيع</p>
                    </div>
                  )}
                  {selectedBooking.attendees && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Users className="w-3 h-3" /> الحضور</p>
                      <p className="font-medium">{selectedBooking.attendees} شخص</p>
                    </div>
                  )}
                  {selectedBooking.seatingLayout && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Armchair className="w-3 h-3" /> ترتيب الجلوس</p>
                      <p className="font-medium">{selectedBooking.seatingLayout}</p>
                    </div>
                  )}
                  {selectedBooking.requestedItems?.length > 0 && (
                    <div className="col-span-2 sm:col-span-4">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><PackageCheck className="w-3 h-3" /> التجهيزات المطلوبة</p>
                      <div className="flex flex-wrap gap-1">{selectedBooking.requestedItems.map((x: string) => <Badge key={x} variant="secondary" className="font-normal">{x}</Badge>)}</div>
                    </div>
                  )}
                  {selectedBooking.reason && (
                    <div className="col-span-2 sm:col-span-4">
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><FileText className="w-3 h-3" /> سبب الحجز</p>
                      <p className="font-medium">{selectedBooking.reason}</p>
                    </div>
                  )}
                  {selectedBooking.notes && (
                    <div className="col-span-2 sm:col-span-4"><p className="text-xs text-muted-foreground mb-0.5">ملاحظات الجهة</p><p className="font-medium">{selectedBooking.notes}</p></div>
                  )}
                </div>
              </div>

              {action === "view" && (selectedBooking.needsCatering || selectedBooking.needsMeals || selectedBooking.approverNote || selectedBooking.rejectionReason || selectedBooking.cancellationReason) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Hospitality */}
                  {(selectedBooking.needsCatering || selectedBooking.needsMeals) && (
                    <div className={`space-y-1.5 ${!(selectedBooking.approverNote || selectedBooking.rejectionReason || selectedBooking.cancellationReason) ? "sm:col-span-2" : ""}`}>
                      <p className="text-xs font-semibold text-muted-foreground">طلب الضيافة</p>
                      <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 space-y-1.5 text-sm h-full">
                        {selectedBooking.needsCatering && (
                          <div className="flex items-center gap-1.5 text-amber-800">
                            <UtensilsCrossed className="w-3.5 h-3.5" />
                            خدمة الضيافة
                            {selectedBooking.status !== "pending" && (
                              <span className={selectedBooking.cateringApproved ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                                — {selectedBooking.cateringApproved ? "تمت الموافقة" : "مرفوضة"}
                              </span>
                            )}
                          </div>
                        )}
                        {selectedBooking.needsMeals && (
                          <div className="flex items-center gap-1.5 text-amber-800">
                            <UtensilsCrossed className="w-3.5 h-3.5" />
                            وجبة طعام
                            {selectedBooking.status !== "pending" && (
                              <span className={selectedBooking.mealsApproved ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                                — {selectedBooking.mealsApproved ? "تمت الموافقة" : "مرفوضة"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Decision / reasons */}
                  {(selectedBooking.approverNote || selectedBooking.rejectionReason || selectedBooking.cancellationReason) && (
                    <div className={`space-y-1.5 ${!(selectedBooking.needsCatering || selectedBooking.needsMeals) ? "sm:col-span-2" : ""}`}>
                      <p className="text-xs font-semibold text-muted-foreground">قرار مدير العلاقات</p>
                      <div className="rounded-xl p-3 space-y-1.5 text-sm bg-muted/40 h-full">
                        {selectedBooking.approverNote && (
                          <div><p className="text-xs text-muted-foreground mb-0.5">ملاحظات الموافقة</p><p className="font-medium">{selectedBooking.approverNote}</p></div>
                        )}
                        {selectedBooking.rejectionReason && (
                          <div><p className="text-xs text-red-400 mb-0.5">سبب الرفض</p><p className="text-red-600 font-medium">{selectedBooking.rejectionReason}</p></div>
                        )}
                        {selectedBooking.cancellationReason && (
                          <div><p className="text-xs text-orange-500 mb-0.5">سبب الإلغاء</p><p className="text-orange-600 font-medium">{selectedBooking.cancellationReason}</p></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              {action === "view" && (
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span>تاريخ تقديم الطلب: {formatDateTime(selectedBooking.createdAt)}</span>
                  {selectedBooking.updatedAt && selectedBooking.updatedAt !== selectedBooking.createdAt && (
                    <span>آخر تحديث: {formatDateTime(selectedBooking.updatedAt)}</span>
                  )}
                </div>
              )}

              {action === "approve" && (selectedBooking.needsCatering || selectedBooking.needsMeals) && (
                <div className="space-y-2 border rounded-lg p-3 bg-amber-50/50">
                  <Label className="flex items-center gap-1.5 text-amber-800">
                    <UtensilsCrossed className="w-4 h-4" /> قرار الضيافة
                  </Label>
                  {selectedBooking.needsCatering && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={cateringApproved} onCheckedChange={v => setCateringApproved(!!v)} />
                      الموافقة على طلب خدمة الضيافة
                    </label>
                  )}
                  {selectedBooking.needsMeals && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={mealsApproved} onCheckedChange={v => setMealsApproved(!!v)} />
                      الموافقة على طلب وجبة الطعام
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">يمكنك الموافقة على الحجز مع رفض الضيافة و/أو الوجبة فقط دون الحاجة لرفض الطلب بالكامل.</p>
                </div>
              )}

              {action === "status" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>الحالة الجديدة *</Label>
                    <Select value={targetStatus} onValueChange={setTargetStatus}>
                      <SelectTrigger><SelectValue placeholder="اختر الحالة الجديدة" /></SelectTrigger>
                      <SelectContent>
                        {statusChangeOptions(selectedBooking).map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedBooking.status === "completed" && (
                      <p className="text-xs text-muted-foreground">يمكن إعادة الحجز إلى حالة "موافق عليه" فقط قبل انتهاء موعد الاجتماع.</p>
                    )}
                  </div>
                  {requiresReason && (
                    <div className="space-y-1.5">
                      <Label>سبب الإلغاء *</Label>
                      <Textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="اذكر سبب الإلغاء..."
                        rows={3}
                      />
                    </div>
                  )}
                </div>
              )}

              {action !== "view" && action !== "status" && (
                <div className="space-y-1.5">
                  <Label>
                    {action === "approve" ? "ملاحظات (اختياري)" : "سبب الرفض / الإلغاء *"}
                  </Label>
                  <Textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={action === "approve" ? "أي توجيهات أو ملاحظات..." : "اذكر السبب..."}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row-reverse gap-2">
            {action === "approve" && (
              <Button onClick={handleApprove} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {isPending ? "جاري..." : "تأكيد الموافقة"}
              </Button>
            )}
            {action === "reject" && (
              <Button onClick={handleReject} disabled={isPending || !note} className="bg-red-600 hover:bg-red-700">
                {isPending ? "جاري..." : "تأكيد الرفض"}
              </Button>
            )}
            {action === "status" && (
              <Button onClick={handleChangeStatus} disabled={isPending || !targetStatus || (requiresReason && !note)} className="bg-primary hover:bg-primary">
                {isPending ? "جاري..." : "تأكيد تغيير الحالة"}
              </Button>
            )}
            {action === "view" && (
              <Button variant="outline" onClick={() => window.open(`/print/booking/${selectedBooking?.id}`, "_blank")}>
                <Printer className="w-4 h-4" /> طباعة
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedBooking(null)}>
              {action === "view" ? "إغلاق" : "إلغاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BookingDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        mode="manager"
        halls={(halls ?? []) as BookableHall[]}
      />
      <RelocateDialog booking={relocateTarget} onClose={() => setRelocateTarget(null)} onDone={invalidate} />
    </>
  );
}
