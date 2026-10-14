import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import {
  useListBookings, useCancelBooking, useCreateReview,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Eye, XCircle, Star, CalendarDays, MapPin, Users, Hash, Clock, FileText, UtensilsCrossed, Repeat, Printer, ClipboardList, Armchair, PackageCheck } from "lucide-react";
import { Link } from "wouter";
import { formatDate, formatDateTime } from "@/lib/format";
import { activityLabel } from "@/lib/labels";
import { PageHeader } from "@/components/layout/page-header";

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  pending: { label: "معلق", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "موافق عليه", cls: "bg-emerald-100 text-emerald-700" },
  partially_approved: { label: "موافقة جزئية", cls: "bg-teal-100 text-teal-700" },
  rejected: { label: "مرفوض", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "ملغي", cls: "bg-muted text-muted-foreground" },
  completed: { label: "مكتمل", cls: "bg-primary/10 text-primary" },
  emergency_cancelled: { label: "ملغي طارئ", cls: "bg-orange-100 text-orange-700" },
};

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

  const RowActions = ({ booking }: { booking: any }) => (
<div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewBooking(booking)}>
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          {!["rejected", "cancelled", "emergency_cancelled"].includes(booking.status) && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="طباعة إشعار الحجز" onClick={() => window.open(`/print/booking/${booking.id}`, "_blank")}>
                              <Printer className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}
                          {booking.status === "pending" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-50" onClick={() => setCancelTarget(booking)}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                          {booking.status === "completed" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className={`h-8 w-8 ${booking.review ? "text-amber-500 hover:bg-amber-50" : "text-amber-400 hover:bg-amber-50"}`}
                              title={booking.review ? "عرض التقييم" : "إضافة تقييم"}
                              onClick={() => {
                                setReviewBooking(booking);
                                if (booking.review) {
                                  setRating(Math.round(booking.review.overallRating ?? booking.review.cleanlinessRating ?? 5));
                                  setComment(booking.review.comment ?? "");
                                } else {
                                  setRating(5);
                                  setComment("");
                                }
                              }}
                            >
                              <Star className={`w-4 h-4 ${booking.review ? "fill-amber-400" : ""}`} />
                            </Button>
                          )}
                        </div>
  );

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader
          icon={ClipboardList}
          title="حجوزاتي"
          description="متابعة حالة طلبات الحجز وطباعة إشعار الحجز المعتمد"
          actions={<Button asChild><Link href="/department/halls"><CalendarDays className="w-4 h-4" />حجز قاعة جديدة</Link></Button>}
        />

        <div className="md:hidden space-y-2.5">
          {isLoading ? <Skeleton className="h-24 rounded-xl" /> : !bookings?.length ? (
            <div className="text-center py-12 text-muted-foreground rounded-xl border bg-card">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />لا توجد حجوزات
            </div>
          ) : bookings.map((booking) => {
            const si = STATUS_AR[booking.status] ?? { label: booking.status, cls: "bg-muted text-foreground" };
            return (
              <div key={booking.id} className="rounded-xl border bg-card p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{booking.hall?.nameAr || booking.hall?.name}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${si.cls}`}>{si.label}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatDate(booking.startDate)}</span>
                  <span className="inline-flex items-center gap-1" dir="ltr"><Clock className="w-3.5 h-3.5" />{booking.startTime} – {booking.endTime}</span>
                  <span>{activityLabel(booking.activityType)}</span>
                </div>
                <RowActions booking={booking} />
              </div>
            );
          })}
        </div>

        <Card className="hidden md:block">
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>القاعة</TableHead>
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>النشاط</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4,5].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : !bookings?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      لا توجد حجوزات. <Link href="/department/halls" className="text-primary underline">احجز قاعة الآن</Link>
                    </TableCell>
                  </TableRow>
                ) : bookings.map(booking => {
                  const si = STATUS_AR[booking.status] ?? { label: booking.status, cls: "bg-muted text-foreground" };
                  return (
                    <TableRow key={booking.id} className="hover:bg-muted/40">
                      <TableCell className="font-medium text-sm">{booking.hall?.nameAr || booking.hall?.name}</TableCell>
                      <TableCell>
                        <p className="text-sm">{formatDate(booking.startDate)}</p>
                        <p className="text-xs text-muted-foreground"><span dir="ltr">{booking.startTime} – {booking.endTime}</span></p>
                      </TableCell>
                      <TableCell className="text-sm">{activityLabel(booking.activityType)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${si.cls}`}>{si.label}</span>
                      </TableCell>
                      <TableCell><RowActions booking={booking} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_AR[viewBooking.status]?.cls ?? "bg-muted text-foreground"}`}>
                  {STATUS_AR[viewBooking.status]?.label ?? viewBooking.status}
                </span>
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
                      <p className="font-medium"><span dir="ltr">{viewBooking.startTime} – {viewBooking.endTime}</span></p>
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
