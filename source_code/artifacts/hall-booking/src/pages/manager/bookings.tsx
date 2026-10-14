import { useState } from "react";
import {
  useListBookings, useApproveBooking, useRejectBooking, useChangeBookingStatus,
  useListHalls,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { CalendarDays, CheckCircle, XCircle, Eye, Filter, UtensilsCrossed, MapPin, Users, Building2, Hash, Phone, Repeat, Clock, FileText, User as UserIcon, RefreshCcw, Plus, Printer, ArrowLeftRight, Search, Armchair, PackageCheck, ClipboardList } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { activityLabel } from "@/lib/labels";
import { BookingDialog, type BookableHall } from "@/components/booking/booking-dialog";
import { RelocateDialog } from "@/components/booking/relocate-dialog";
import { PageHeader } from "@/components/layout/page-header";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  pending: { label: "معلق", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "موافق عليه", cls: "bg-emerald-100 text-emerald-700" },
  partially_approved: { label: "موافقة جزئية", cls: "bg-teal-100 text-teal-700" },
  rejected: { label: "مرفوض", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "ملغي", cls: "bg-muted text-foreground" },
  completed: { label: "مكتمل", cls: "bg-primary/10 text-primary" },
  emergency_cancelled: { label: "ملغي طارئ", cls: "bg-orange-100 text-orange-700" },
};

function departmentDisplayName(booking: any): string {
  return booking.manualDepartmentName || booking.user?.departmentName || "غير محدد";
}

export default function ManagerBookings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: bookings, isLoading } = useListBookings(statusFilter !== "all" ? { status: statusFilter as any } : {});
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
  const rows = (bookings ?? []).filter((b: any) =>
    !q || [departmentDisplayName(b), b.hall?.nameAr, b.hall?.name, activityLabel(b.activityType), b.reason, String(b.id)].some((v) => v?.includes(q)),
  );

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

  const BookingActions = ({ booking }: { booking: any }) => (
    <div className="flex items-center gap-0.5 flex-wrap">
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openAction(booking, "view")} title="عرض التفاصيل">
        <Eye className="w-4 h-4 text-muted-foreground" />
      </Button>
      {booking.status === "pending" && (
        <>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => openAction(booking, "approve")} title="موافقة">
            <CheckCircle className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => openAction(booking, "reject")} title="رفض">
            <XCircle className="w-4 h-4" />
          </Button>
        </>
      )}
      {statusChangeOptions(booking).length > 0 && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => openAction(booking, "status")} title="تغيير الحالة">
          <RefreshCcw className="w-4 h-4" />
        </Button>
      )}
      {["pending", "approved", "partially_approved"].includes(booking.status) && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-sky-600 hover:bg-sky-50" onClick={() => setRelocateTarget(booking)} title="نقل إلى قاعة أخرى">
          <ArrowLeftRight className="w-4 h-4" />
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => window.open(`/print/booking/${booking.id}`, "_blank")} title="طباعة إشعار الحجز">
        <Printer className="w-4 h-4 text-muted-foreground" />
      </Button>
    </div>
  );

  return (
    <>
      <div className="space-y-5">
        <PageHeader
          icon={ClipboardList}
          title="إدارة طلبات الحجز"
          description="مراجعة طلبات حجز القاعات والبت فيها، وطباعة إشعارات الحجز"
          actions={
            <Button onClick={openManualDialog}>
              <Plus className="w-4 h-4" />
              حجز مباشر لجهة
            </Button>
          }
        />

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالجهة أو القاعة أو النشاط أو رقم الطلب..." className="pr-9" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الطلبات</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="approved">مقبولة</SelectItem>
                <SelectItem value="partially_approved">مقبولة جزئياً</SelectItem>
                <SelectItem value="rejected">مرفوضة</SelectItem>
                <SelectItem value="cancelled">ملغاة</SelectItem>
                <SelectItem value="emergency_cancelled">ملغاة طارئ</SelectItem>
                <SelectItem value="completed">مكتملة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mobile: cards */}
        <div className="md:hidden space-y-2.5">
          {isLoading ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />) :
            !rows.length ? (
              <div className="text-center py-12 text-muted-foreground rounded-xl border bg-card">
                <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />لا توجد طلبات حجز
              </div>
            ) : rows.map((booking: any) => {
              const si = STATUS_INFO[booking.status] ?? { label: booking.status, cls: "bg-muted text-foreground" };
              return (
                <div key={booking.id} className="rounded-xl border bg-card p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{booking.hall?.nameAr || booking.hall?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{departmentDisplayName(booking)}</p>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${si.cls}`}>{si.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatDate(booking.startDate)}</span>
                    <span className="inline-flex items-center gap-1" dir="ltr"><Clock className="w-3.5 h-3.5" />{booking.startTime} – {booking.endTime}</span>
                    <span>{activityLabel(booking.activityType)}</span>
                  </div>
                  <BookingActions booking={booking} />
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
                  <TableHead>الجهة الطالبة</TableHead>
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>النشاط</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array(6).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {[1,2,3,4,5,6].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                )) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      لا توجد طلبات حجز
                    </TableCell>
                  </TableRow>
                ) : rows.map((booking: any) => {
                  const si = STATUS_INFO[booking.status] ?? { label: booking.status, cls: "bg-muted text-foreground" };
                  return (
                    <TableRow key={booking.id} className="hover:bg-muted/40">
                      <TableCell className="font-medium text-sm">{booking.hall?.nameAr || booking.hall?.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {departmentDisplayName(booking)}
                        {booking.manualDepartmentName && (
                          <Badge variant="secondary" className="text-[10px] mr-1.5">حجز يدوي</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{formatDate(booking.startDate)}</p>
                        <p className="text-xs text-muted-foreground"><span dir="ltr">{booking.startTime} – {booking.endTime}</span></p>
                      </TableCell>
                      <TableCell className="text-sm">{activityLabel(booking.activityType)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${si.cls}`}>{si.label}</span>
                      </TableCell>
                      <TableCell><BookingActions booking={booking} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_INFO[selectedBooking.status]?.cls ?? "bg-muted text-foreground"}`}>
                  {STATUS_INFO[selectedBooking.status]?.label ?? selectedBooking.status}
                </span>
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
                    <p className="font-medium"><span dir="ltr">{selectedBooking.startTime} – {selectedBooking.endTime}</span></p>
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
