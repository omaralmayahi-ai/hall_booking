import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { LayoutDashboard as LayoutDashboardIcon } from "lucide-react";
import { useListBookings } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, CheckCircle, XCircle, ClipboardList, Star, CalendarCheck2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { activityLabel } from "@/lib/labels";
import { formatDate } from "@/lib/format";

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  pending: { label: "معلق", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "موافق عليه", cls: "bg-emerald-100 text-emerald-700" },
  partially_approved: { label: "موافقة جزئية", cls: "bg-teal-100 text-teal-700" },
  rejected: { label: "مرفوض", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "ملغي", cls: "bg-muted text-muted-foreground" },
  completed: { label: "مكتمل", cls: "bg-primary/10 text-primary" },
  emergency_cancelled: { label: "ملغي طارئ", cls: "bg-orange-100 text-orange-700" },
};


export default function DepartmentDashboard() {
  const { user } = useAuth();
  const { data: bookings, isLoading } = useListBookings({});

  const pending = bookings?.filter(b => b.status === "pending").length ?? 0;
  const approved = bookings?.filter(b => b.status === "approved").length ?? 0;
  const completed = bookings?.filter(b => b.status === "completed").length ?? 0;
  const rejected = bookings?.filter(b => b.status === "rejected").length ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (bookings ?? [])
    .filter(b => (b.status === "approved" || b.status === "partially_approved") && b.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  const needsReview = (bookings ?? []).filter(b => b.status === "completed" && !b.review);

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader icon={LayoutDashboardIcon} title={`مرحباً، ${user?.username ?? ""}`} description={<>{user?.departmentName ?? "الجهة الطالبة"} — نظرة عامة على حجوزاتك</>} />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "معلقة", value: pending, icon: Clock, color: "bg-amber-50 text-amber-600" },
            { label: "موافق عليها", value: approved, icon: CheckCircle, color: "bg-emerald-50 text-emerald-600" },
            { label: "مكتملة", value: completed, icon: CalendarDays, color: "bg-primary/5 text-primary" },
            { label: "مرفوضة", value: rejected, icon: XCircle, color: "bg-red-50 text-red-500" },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <Card key={i} >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  {isLoading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-3xl font-bold text-foreground">{item.value}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-white">
            <CardContent className="p-6">
              <CalendarDays className="w-8 h-8 mb-3 text-white/70" />
              <h3 className="font-bold text-lg mb-1">حجز قاعة جديدة</h3>
              <p className="text-white/60 text-sm mb-4">استعرض القاعات المتاحة وقدم طلب حجز</p>
              <Link href="/department/halls">
                <Button className="bg-card text-primary hover:bg-card/ font-semibold">استعراض القاعات</Button>
              </Link>
            </CardContent>
          </Card>
          <Card >
            <CardContent className="p-6">
              <ClipboardList className="w-8 h-8 mb-3 text-primary" />
              <h3 className="font-bold text-lg mb-1 text-foreground">طلباتي الأخيرة</h3>
              <p className="text-muted-foreground text-sm mb-4">تتبع حالة طلبات الحجز المقدمة</p>
              <Link href="/department/bookings">
                <Button variant="outline" className="font-semibold">عرض الطلبات</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Needs review reminder */}
        {!isLoading && needsReview.length > 0 && (
          <Card className="bg-amber-50/60">
            <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">لديك {needsReview.length} حجز/حجوزات مكتملة بانتظار التقييم</p>
                  <p className="text-xs text-muted-foreground mt-0.5">شاركنا رأيك لمساعدتنا في تحسين الخدمة</p>
                </div>
              </div>
              <Link href="/department/bookings">
                <Button size="sm" className="font-semibold">تقييم الآن</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Upcoming bookings */}
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarCheck2 className="w-4 h-4 text-emerald-500" />
                الحجوزات القادمة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !upcoming.length ? (
                <div className="py-10 text-center text-muted-foreground text-sm">لا توجد حجوزات قادمة</div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map(booking => {
                    const si = STATUS_AR[booking.status] ?? { label: booking.status, cls: "bg-muted text-foreground" };
                    return (
                      <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                        <div>
                          <p className="text-sm font-medium text-foreground">{booking.hall?.nameAr || booking.hall?.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(booking.startDate)} | <span dir="ltr">{booking.startTime}–{booking.endTime}</span> | {activityLabel(booking.activityType)}
                          </p>
                        </div>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${si.cls}`}>{si.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent bookings */}
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">آخر طلبات الحجز</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !bookings?.length ? (
                <div className="py-10 text-center text-muted-foreground text-sm">لا توجد حجوزات بعد</div>
              ) : (
                <div className="space-y-2">
                  {bookings.slice(0, 5).map(booking => {
                    const si = STATUS_AR[booking.status] ?? { label: booking.status, cls: "bg-muted text-foreground" };
                    return (
                      <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                        <div>
                          <p className="text-sm font-medium text-foreground">{booking.hall?.nameAr || booking.hall?.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(booking.startDate)} | <span dir="ltr">{booking.startTime}–{booking.endTime}</span> | {activityLabel(booking.activityType)}
                          </p>
                        </div>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${si.cls}`}>{si.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
