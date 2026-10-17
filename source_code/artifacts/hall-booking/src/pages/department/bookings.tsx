import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import {
  useListBookings, useCancelBooking, useCreateReview,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Eye, XCircle, Star, CalendarDays, MapPin, Users, Hash, Clock, FileText, UtensilsCrossed, Repeat, Printer, ClipboardList, Armchair, PackageCheck, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { formatDate, formatDateTime } from "@/lib/format";
import { activityLabel } from "@/lib/labels";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Fact, FilterChips, SectionTitle, StatusBadge, Ticket, relativeDay, toneOf, TimeRange } from "@/components/booking/ticket";
import { todayIso } from "@/lib/calendar";
import { ArchiveAllButton, isArchivable, useArchive } from "@/components/booking/archive-actions";
import { Archive } from "lucide-react";


function StarPicker({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" disabled={readOnly} onClick={() => !readOnly && onChange(i)} className={readOnly ? "cursor-default" : ""}>
          <Star className={`w-6 h-6 transition-colors ${i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50 hover:text-amber-300"}`} />
        </button>
      ))}
    </div>
  );
}

export default function DepartmentBookings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: bookings, isLoading } = useListBookings({});
  const cancelBooking = useCancelBooking();
  const submitReview = useCreateReview();

  const [viewBooking, setViewBooking] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reviewBooking, setReviewBooking] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason) { toast({ variant: "destructive", title: "يرجى ذكر سبب الإلغاء" }); return; }
    try {
      await cancelBooking.mutateAsync({ id: cancelTarget.id, data: { reason: cancelReason } });
      toast({ title: "تم إلغاء الحجز بنجاح" });
      setCancelTarget(null);
      setCancelReason("");
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل الإلغاء", description: e?.data?.error ?? "" });
    }
  };

  const handleReview = async () => {
    if (!reviewBooking || !rating || reviewBooking.review) return;
    try {
      await submitReview.mutateAsync({
        id: reviewBooking.id,
        data: { cleanlinessRating: rating, equipmentRating: rating, cateringRating: rating, comment: comment || undefined }
      });
      toast({ title: "شكراً! تم إرسال تقييمك" });
      setReviewBooking(null);
      setRating(5);
      setComment("");
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل التقييم", description: e?.data?.error ?? "" });
    }
  };

  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "completed" | "closed" | "review">("all");
  const today = todayIso();
  const groupOf = (b: any) => (b.status === "approved" || b.status === "partially_approved" ? "approved" : ["rejected", "cancelled", "emergency_cancelled"].includes(b.status) ? "closed" : b.status);
  const canReview = (b: any) => b.status === "completed" && !b.review && !b.manualDepartmentName;
  const toReview = (bookings ?? []).filter(canReview);
  const list = (bookings ?? []).filter((b: any) => filter === "all" || (filter === "review" ? canReview(b) : groupOf(b) === filter));
  const isUpcoming = (b: any) => (b.endDate || b.startDate) >= today && !["rejected", "cancelled", "emergency_cancelled", "completed"].includes(b.status);
  const upcoming = list.filter(isUpcoming).sort((a: any, b: any) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
  const past = list.filter((b: any) => !isUpcoming(b)).sort((a: any, b: any) => (b.startDate + b.startTime).localeCompare(a.startDate + a.startTime));
  const count = (g: string) => (bookings ?? []).filter((b: any) => groupOf(b) === g).length;

  const openReview = (booking: any) => {
    setReviewBooking(booking);
    if (booking.review) {
      setRating(Math.round(booking.review.overallRating ?? booking.review.cleanlinessRating ?? 5));
      setComment(booking.review.comment ?? "");
    } else {
      setRating(5);
      setComment("");
    }
  };

  const archive = useArchive("/department/archive");
  const archivablePast = past.filter(isArchivable);

  const renderTicket = (booking: any) => {
    const tone = toneOf(booking.status);
    const closed = ["rejected", "cancelled", "emergency_cancelled"].includes(booking.status);
    return (
      <Ticket
        key={booking.id}
        date={booking.startDate}
        tone={tone}
        muted={closed}
        highlight={isUpcoming(booking) && booking.startDate === today}
        onClick={() => setViewBooking(booking)}
        actions={
          <>
            {booking.status === "completed" && !booking.manualDepartmentName && (
              <Button size="sm" variant={booking.review ? "ghost" : "outline"} className="h-9 gap-1.5" onClick={() => openReview(booking)}>
                <Star className={`w-4 h-4 text-amber-500 ${booking.review ? "fill-amber-400" : ""}`} />
                {booking.review ? "تقييمك" : "قيّم القاعة"}
              </Button>
            )}
            {booking.status === "pending" && (
              <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10" onClick={() => setCancelTarget(booking)}>
                <XCircle className="w-4 h-4" />إلغاء الطلب
              </Button>
            )}
            {!closed && (
              <Button size="icon" variant="ghost" className="h-9 w-9" title="طباعة إشعار الحجز" aria-label="طباعة إشعار الحجز" onClick={() => window.open(`/print/booking/${booking.id}`, "_blank")}>
                <Printer className="w-4 h-4" />
              </Button>
            )}
            {isArchivable(booking) && (
              <Button size="icon" variant="ghost" className="h-9 w-9" title="نقل إلى الأرشيف" aria-label="نقل إلى الأرشيف" onClick={() => archive.archiveIds([booking.id])} disabled={archive.busy}>
                <Archive className="w-4 h-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-9 w-9" title="التفاصيل" aria-label="التفاصيل" onClick={() => setViewBooking(booking)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-bold text-base truncate">{booking.hall?.nameAr || booking.hall?.name}</h3>
          <StatusBadge status={booking.status} />
        </div>
        <p className="text-sm mt-1 truncate">{booking.reason || activityLabel(booking.activityType)}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <Fact icon={Clock}><TimeRange start={booking.startTime} end={booking.endTime} /></Fact>
          <Fact icon={CalendarDays}>{booking.endDate && booking.endDate !== booking.startDate ? `حتى ${formatDate(booking.endDate)}` : relativeDay(booking.startDate)}</Fact>
          {booking.reason && <Fact icon={FileText}>{activityLabel(booking.activityType)}</Fact>}
          {booking.attendees ? <Fact icon={Users}>{booking.attendees} شخص</Fact> : null}
          {booking.isRecurring && <Fact icon={Repeat}>أسبوعي</Fact>}
        </div>
      </Ticket>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-5 max-w-5xl">
        <PageHeader
          icon={ClipboardList}
          title="حجوزاتي"
          description="طلباتك وحالتها، وطباعة إشعار الحجز بعد الموافقة"
          actions={<Button asChild><Link href="/department/halls"><CalendarDays className="w-4 h-4" />حجز قاعة</Link></Button>}
        />

        {!!bookings?.length && (
          <FilterChips<typeof filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "الكل", count: bookings.length },
              { value: "pending", label: "بانتظار القرار", count: count("pending"), tone: "amber" },
              { value: "approved", label: "موافق عليها", count: count("approved"), tone: "emerald" },
              { value: "completed", label: "منتهية", count: count("completed"), tone: "sky" },
              { value: "closed", label: "مرفوضة وملغاة", count: count("closed"), tone: "slate" },
              ...(toReview.length ? [{ value: "review" as const, label: "بانتظار تقييمك", count: toReview.length, tone: "violet" as const }] : []),
            ]}
          />
        )}

        {toReview.length > 0 && filter !== "review" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 dark:bg-amber-500/10 px-4 py-3">
            <Star className="w-5 h-5 text-amber-500 fill-amber-400 shrink-0" />
            <p className="text-sm flex-1">انتهى {toReview.length === 1 ? "حجز واحد" : `${toReview.length} حجوزات`} ولم تقيّم القاعة بعد. رأيكم يساعد في تحسين القاعات.</p>
            <Button size="sm" variant="outline" className="bg-background shrink-0" onClick={() => setFilter("review")}>قيّم الآن</Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        ) : !bookings?.length ? (
          <EmptyState
            icon={CalendarDays}
            title="لم تحجز أي قاعة بعد"
            hint="اختر قاعة وموعداً مناسباً، وسيصلك إشعار عند الموافقة على طلبك."
            action={<Button asChild><Link href="/department/halls"><CalendarDays className="w-4 h-4" />احجز قاعة</Link></Button>}
          />
        ) : !list.length ? (
          <EmptyState icon={ClipboardList} title="لا توجد طلبات بهذه الحالة" action={<Button variant="outline" onClick={() => setFilter("all")}>عرض كل الطلبات</Button>} />
        ) : (
          <div className="space-y-6">
            {upcoming.length > 0 && (
              <section className="space-y-3">
                <SectionTitle count={upcoming.length}>القادمة</SectionTitle>
                {upcoming.map(renderTicket)}
              </section>
            )}
            {past.length > 0 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionTitle count={past.length}>السابقة</SectionTitle>
                  <ArchiveAllButton count={archivablePast.length} busy={archive.busy} onClick={() => archive.archiveIds(archivablePast.map((b: any) => b.id))} />
                </div>
                {past.map(renderTicket)}
              </section>
            )}
          </div>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewBooking} onOpenChange={v => !v && setViewBooking(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل الحجز</DialogTitle>
          </DialogHeader>
          {viewBooking && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <StatusBadge status={viewBooking.status} />
                <span className="text-xs text-muted-foreground">طلب رقم #{viewBooking.id}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Hall details */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">بيانات القاعة</p>
                  <div className="bg-muted/40 rounded-xl p-3 space-y-1.5 text-sm h-full">
                    <p className="font-semibold text-foreground">{viewBooking.hall?.nameAr || viewBooking.hall?.name}</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      {viewBooking.hall?.locationAr || viewBooking.hall?.location}
                      {viewBooking.hall?.floor && ` • الطابق ${viewBooking.hall.floor}`}
                      {viewBooking.hall?.building && ` • ${viewBooking.hall.building}`}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                      السعة: {viewBooking.hall?.capacity} شخص
                    </div>
                    {viewBooking.hall?.referenceCode && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Hash className="w-3 h-3 shrink-0" />
                        {viewBooking.hall.referenceCode}
                      </div>
                    )}
                    {viewBooking.hall?.equipment?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {viewBooking.hall.equipment.map((eq: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{eq}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Schedule & activity */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">تفاصيل الحجز</p>
                  <div className="bg-muted/40 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm h-full">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> التاريخ</p>
                      <p className="font-medium">
                        {formatDate(viewBooking.startDate)}
                        {viewBooking.endDate && viewBooking.endDate !== viewBooking.startDate && ` — ${formatDate(viewBooking.endDate)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> الوقت</p>
                      <p className="font-medium"><TimeRange start={viewBooking.startTime} end={viewBooking.endTime} className="font-medium" /></p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">النشاط</p>
                      <p className="font-medium">{activityLabel(viewBooking.activityType)}</p>
                    </div>
                    {viewBooking.isRecurring && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Repeat className="w-3 h-3" /> تكرار</p>
                        <p className="font-medium">{viewBooking.recurringWeeks ?? "—"} أسابيع</p>
                      </div>
                    )}
                    {viewBooking.attendees && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Users className="w-3 h-3" /> الحضور</p>
                        <p className="font-medium">{viewBooking.attendees} شخص</p>
                      </div>
                    )}
                    {viewBooking.seatingLayout && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Armchair className="w-3 h-3" /> ترتيب الجلوس</p>
                        <p className="font-medium">{viewBooking.seatingLayout}</p>
                      </div>
                    )}
                    {viewBooking.requestedItems?.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><PackageCheck className="w-3 h-3" /> التجهيزات المطلوبة</p>
                        <div className="flex flex-wrap gap-1">{viewBooking.requestedItems.map((x: string) => <Badge key={x} variant="secondary" className="font-normal">{x}</Badge>)}</div>
                      </div>
                    )}
                    {viewBooking.reason && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><FileText className="w-3 h-3" /> عنوان النشاط</p>
                        <p className="font-medium">{viewBooking.reason}</p>
                      </div>
                    )}
                    {viewBooking.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground mb-0.5">ملاحظات إضافية</p><p className="font-medium">{viewBooking.notes}</p></div>}
                  </div>
                </div>
              </div>

              {(viewBooking.needsCatering || viewBooking.needsMeals || viewBooking.approverNote || viewBooking.rejectionReason || viewBooking.cancellationReason) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Hospitality */}
                  {(viewBooking.needsCatering || viewBooking.needsMeals) && (
                    <div className={`space-y-1.5 ${!(viewBooking.approverNote || viewBooking.rejectionReason || viewBooking.cancellationReason) ? "sm:col-span-2" : ""}`}>
                      <p className="text-xs font-semibold text-muted-foreground">طلب الضيافة</p>
                      <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 space-y-1.5 text-sm h-full">
                        {viewBooking.needsCatering && (
                          <div className="flex items-center gap-1.5 text-amber-800">
                            <UtensilsCrossed className="w-3.5 h-3.5" />
                            خدمة الضيافة
                            {viewBooking.status !== "pending" && (
                              <span className={viewBooking.cateringApproved ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                                — {viewBooking.cateringApproved ? "تمت الموافقة" : "مرفوضة"}
                              </span>
                            )}
                          </div>
                        )}
                        {viewBooking.needsMeals && (
                          <div className="flex items-center gap-1.5 text-amber-800">
                            <UtensilsCrossed className="w-3.5 h-3.5" />
                            وجبة طعام
                            {viewBooking.status !== "pending" && (
                              <span className={viewBooking.mealsApproved ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                                — {viewBooking.mealsApproved ? "تمت الموافقة" : "مرفوضة"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Decision / reasons */}
                  {(viewBooking.approverNote || viewBooking.rejectionReason || viewBooking.cancellationReason) && (
                    <div className={`space-y-1.5 ${!(viewBooking.needsCatering || viewBooking.needsMeals) ? "sm:col-span-2" : ""}`}>
                      <p className="text-xs font-semibold text-muted-foreground">ملاحظات مدير العلاقات</p>
                      <div className="rounded-xl p-3 space-y-1.5 text-sm bg-muted/40 h-full">
                        {viewBooking.approverNote && (
                          <div><p className="text-xs text-muted-foreground mb-0.5">ملاحظات الموافقة</p><p className="font-medium">{viewBooking.approverNote}</p></div>
                        )}
                        {viewBooking.rejectionReason && (
                          <div><p className="text-xs text-red-400 mb-0.5">سبب الرفض</p><p className="text-red-600 font-medium">{viewBooking.rejectionReason}</p></div>
                        )}
                        {viewBooking.cancellationReason && (
                          <div><p className="text-xs text-orange-500 mb-0.5">سبب الإلغاء</p><p className="text-orange-600 font-medium">{viewBooking.cancellationReason}</p></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                <span>تاريخ تقديم الطلب: {formatDateTime(viewBooking.createdAt)}</span>
                {viewBooking.updatedAt && viewBooking.updatedAt !== viewBooking.createdAt && (
                  <span>آخر تحديث: {formatDateTime(viewBooking.updatedAt)}</span>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBooking(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={v => { if (!v) { setCancelTarget(null); setCancelReason(""); } }}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد إلغاء الحجز</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">هل أنت متأكد من إلغاء هذا الحجز؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="space-y-1.5">
              <Label>سبب الإلغاء <span className="text-red-500">*</span></Label>
              <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="اذكر سبب إلغاء الحجز..." rows={3} />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button className="bg-red-600 hover:bg-red-700" disabled={!cancelReason || cancelBooking.isPending} onClick={handleCancel}>
              {cancelBooking.isPending ? "جاري..." : "إلغاء الحجز"}
            </Button>
            <Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>تراجع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewBooking} onOpenChange={v => !v && setReviewBooking(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{reviewBooking?.review ? "تقييمك المُرسل" : "تقييم القاعة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reviewBooking?.review ? "هذا هو التقييم الذي أرسلته لتجربتك في " : "قيّم تجربتك في "}
              <strong>{reviewBooking?.hall?.nameAr || reviewBooking?.hall?.name}</strong>
            </p>
            <div className="space-y-1.5">
              <Label>التقييم</Label>
              <StarPicker value={rating} onChange={setRating} readOnly={!!reviewBooking?.review} />
            </div>
            <div className="space-y-1.5">
              <Label>تعليق {!reviewBooking?.review && "(اختياري)"}</Label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="شاركنا رأيك..."
                rows={3}
                readOnly={!!reviewBooking?.review}
                className={reviewBooking?.review ? "bg-muted/40 resize-none" : ""}
              />
            </div>
            {reviewBooking?.review && (
              <p className="text-xs text-muted-foreground">
                تم الإرسال بتاريخ {formatDate(reviewBooking.review.createdAt)}. لا يمكن تعديل التقييم بعد إرساله.
              </p>
            )}
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            {!reviewBooking?.review && (
              <Button onClick={handleReview} disabled={submitReview.isPending} className="bg-primary hover:bg-primary/90">
                {submitReview.isPending ? "جاري الإرسال..." : "إرسال التقييم"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setReviewBooking(null)}>{reviewBooking?.review ? "إغلاق" : "إلغاء"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
