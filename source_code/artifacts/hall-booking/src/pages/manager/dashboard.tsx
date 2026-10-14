import { MainLayout } from "@/components/layout/main-layout";
import { useGetDashboardStats, useGetTopHalls, useGetTopDepartments, useGetPendingRequestsStats, useListBookings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, CalendarDays, Star, AlertCircle, TrendingUp, Wrench, Bell, CalendarRange, Armchair, BarChart3, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TodayHalls } from "@/components/dashboard/today-halls";
import { Link } from "wouter";
import { activityLabel } from "@/lib/labels";
import { formatDate } from "@/lib/format";


const QUICK_LINKS = [
  { href: "/manager/calendar", label: "تقويم القاعات", icon: CalendarRange, color: "bg-primary/10 text-primary" },
  { href: "/manager/bookings", label: "طلبات الحجز", icon: CalendarDays, color: "bg-emerald-500/10 text-emerald-600" },
  { href: "/manager/maintenance", label: "متابعة الصيانة", icon: Wrench, color: "bg-amber-500/10 text-amber-600" },
  { href: "/manager/assets", label: "محتويات القاعات", icon: Armchair, color: "bg-sky-500/10 text-sky-600" },
  { href: "/manager/reports", label: "التقارير", icon: BarChart3, color: "bg-violet-500/10 text-violet-600" },
];

export default function ManagerDashboard() {
  const { data: stats, isLoading } = useGetDashboardStats({ period: "month" });
  const { data: pendingStats } = useGetPendingRequestsStats();
  const { data: topHalls } = useGetTopHalls({ limit: 5 });
  const { data: topDepts } = useGetTopDepartments({ limit: 5 });
  const { data: pendingBookings, isLoading: pendingBookingsLoading } = useListBookings({ status: "pending" });

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader icon={LayoutDashboard} title="لوحة تحكم مدير العلاقات" description="حالة القاعات اليوم والطلبات بانتظار القرار وأداء الحجوزات" />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "إجمالي القاعات", value: stats?.totalHalls, icon: Building2, color: "bg-primary/5 text-primary" },
            { label: "إجمالي الحجوزات", value: stats?.totalBookings, icon: CalendarDays, color: "bg-emerald-50 text-emerald-600" },
            { label: "طلبات معلقة", value: pendingStats?.pendingCount, icon: AlertCircle, color: "bg-amber-50 text-amber-600" },
            { label: "متوسط الاستجابة (ساعات)", value: stats?.avgResponseHours != null ? Number(stats.avgResponseHours).toFixed(1) : "—", icon: Star, color: "bg-purple-50 text-purple-600", raw: true },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  {isLoading ? <Skeleton className="h-8 w-20" /> : (
                    <p className="text-3xl font-bold text-foreground">{item.raw ? item.value : (item.value ?? 0)}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Links */}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_LINKS.map((link, i) => {
            const Icon = link.icon;
            return (
              <Link key={i} href={link.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${link.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-foreground">{link.label}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <TodayHalls />

        {/* Pending Approvals */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              طلبات بانتظار الموافقة
            </CardTitle>
            {!!pendingBookings?.length && (
              <Link href="/manager/bookings">
                <Button variant="ghost" size="sm" className="text-xs">عرض الكل ({pendingBookings.length})</Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {pendingBookingsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !pendingBookings?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">لا توجد طلبات معلقة حالياً</div>
            ) : (
              <div className="space-y-2">
                {pendingBookings.slice(0, 5).map(booking => (
                  <Link key={booking.id} href="/manager/bookings">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors cursor-pointer">
                      <div>
                        <p className="text-sm font-medium text-foreground">{booking.hall?.nameAr || booking.hall?.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {booking.user?.departmentName ?? booking.user?.username} · {formatDate(booking.startDate)} · <span dir="ltr">{booking.startTime}–{booking.endTime}</span> · {activityLabel(booking.activityType)}
                        </p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">معلق</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top Halls */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                القاعات الأكثر حجزاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!topHalls?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد بيانات</p>
              ) : (
                <div className="space-y-2">
                  {topHalls.map((hall, i) => (
                    <div key={hall.hallId} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <div>
                          <p className="text-sm font-medium">{hall.hallName}</p>
                          <p className="text-xs text-muted-foreground">{Math.round(hall.utilizationRate)}% استخدام</p>
                        </div>
                      </div>
                      <Badge variant="secondary">{hall.bookingCount} حجز</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Departments */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                الجهات الأكثر حجزاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!topDepts?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد بيانات</p>
              ) : (
                <div className="space-y-2">
                  {topDepts.map((dept, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <p className="text-sm font-medium">{dept.departmentName || "غير محدد"}</p>
                      </div>
                      <Badge variant="secondary">{dept.bookingCount} حجز</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
