import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { History as HistoryIcon } from "lucide-react";
import { useListHalls, useListBookings } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, MapPin, Users, CalendarDays, Clock, Building, User as UserIcon,
  CheckCircle2, Phone, UtensilsCrossed, Hash,
} from "lucide-react";
import { activityLabel } from "@/lib/labels";
import { formatDate } from "@/lib/format";


const ACTIVE_STATUSES = ["approved", "partially_approved"];

function departmentDisplayName(booking: any): string {
  return booking.manualDepartmentName || booking.user?.departmentName || booking.user?.username || "غير محدد";
}

export default function ManagerBookingLog() {
  const { data: halls, isLoading: hallsLoading } = useListHalls({});
  const { data: bookings, isLoading: bookingsLoading } = useListBookings({});
  const [selectedHall, setSelectedHall] = useState<any>(null);

  const isLoading = hallsLoading || bookingsLoading;

  const activeBookingsByHall = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const booking of bookings ?? []) {
      if (!ACTIVE_STATUSES.includes(booking.status)) continue;
      const list = map.get(booking.hallId) ?? [];
      list.push(booking);
      map.set(booking.hallId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }
    return map;
  }, [bookings]);

  const sortedHalls = useMemo(() => {
    if (!halls) return [];
    return [...halls].sort((a, b) => {
      const aCount = activeBookingsByHall.get(a.id)?.length ?? 0;
      const bCount = activeBookingsByHall.get(b.id)?.length ?? 0;
      if (aCount !== bCount) return bCount - aCount;
      return (a.nameAr || a.name).localeCompare(b.nameAr || b.name, "ar");
    });
  }, [halls, activeBookingsByHall]);

  const selectedHallBookings = selectedHall ? activeBookingsByHall.get(selectedHall.id) ?? [] : [];

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader icon={HistoryIcon} title="سجل الحجوزات" description="استعرض جميع القاعات المسجّلة ومعرفة الحجوزات النشطة عليها" />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array(6).fill(0).map((_, i) => (
              <Card key={i} >
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !sortedHalls.length ? (
          <div className="text-center py-16 bg-card rounded-xl">
            <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد قاعات مسجّلة حالياً</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedHalls.map(hall => {
              const activeCount = activeBookingsByHall.get(hall.id)?.length ?? 0;
              const isBooked = activeCount > 0;
              return (
                <Card
                  key={hall.id}
                  className="hover:shadow-md transition-all cursor-pointer"
                  onClick={() => setSelectedHall(hall)}
                >
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-foreground text-base leading-tight">{hall.nameAr || hall.name}</h3>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          isBooked ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isBooked ? <CheckCircle2 className="w-3 h-3" /> : null}
                        {isBooked ? `محجوزة (${activeCount})` : "غير محجوزة"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <MapPin className="w-3 h-3" />
                      {hall.locationAr || hall.location}
                      {hall.floor && ` • الطابق ${hall.floor}`}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      {hall.capacity} شخص
                    </div>
                    {hall.referenceCode && (
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <Hash className="w-3 h-3" />
                        {hall.referenceCode}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Hall active bookings dialog */}
      <Dialog open={!!selectedHall} onOpenChange={v => !v && setSelectedHall(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>الحجوزات النشطة — {selectedHall?.nameAr || selectedHall?.name}</DialogTitle>
          </DialogHeader>

          {!selectedHallBookings.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              لا توجد حجوزات نشطة (موافق عليها) على هذه القاعة حالياً
            </div>
          ) : (
            <div className="space-y-3">
              {selectedHallBookings.map(booking => (
                <div key={booking.id} className="bg-muted/40 rounded-xl p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      booking.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-700"
                    }`}>
                      {booking.status === "approved" ? "موافق عليه" : "موافقة جزئية"}
                    </span>
                    <span className="text-xs text-muted-foreground">طلب رقم #{booking.id}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Building className="w-3 h-3" /> الجهة</p>
                      <p className="font-medium">{departmentDisplayName(booking)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> التاريخ</p>
                      <p className="font-medium">
                        {formatDate(booking.startDate)}
                        {booking.endDate && booking.endDate !== booking.startDate && ` — ${formatDate(booking.endDate)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> الوقت</p>
                      <p className="font-medium"><span dir="ltr">{booking.startTime} – {booking.endTime}</span></p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">النشاط</p>
                      <p className="font-medium">{activityLabel(booking.activityType)}</p>
                    </div>
                  </div>
                  {(booking.coordinatorName || booking.coordinatorPhone) && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
                      {booking.coordinatorName && (
                        <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" /> {booking.coordinatorName}</span>
                      )}
                      {booking.coordinatorPhone && (
                        <span className="flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" /> {booking.coordinatorPhone}</span>
                      )}
                    </div>
                  )}
                  {(booking.needsCatering || booking.needsMeals) && (
                    <div className="flex items-center gap-1.5 text-amber-700 text-xs pt-1">
                      <UtensilsCrossed className="w-3.5 h-3.5" />
                      {booking.needsCatering && booking.needsMeals ? "ضيافة ووجبة" : booking.needsCatering ? "ضيافة" : "وجبة"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedHall(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
