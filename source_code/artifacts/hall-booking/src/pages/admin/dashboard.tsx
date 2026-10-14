import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { TodayHalls } from "@/components/dashboard/today-halls";
import { LayoutDashboard as LayoutDashboardIcon } from "lucide-react";
import { useGetDashboardStats, useListActiveSessions, useGetPendingRequestsStats, useListAuditLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Building2, AlertCircle, Clock, TrendingUp, CheckCircle, Activity, FileText, Send, KeyRound, Settings, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { actionLabel, entityLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/format";

const ROLE_AR: Record<string, string> = {
  admin: "مدير النظام",
  relations_manager: "مدير علاقات",
  requesting_department: "جهة طالبة",
};

const ACTION_AR: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  approve: "موافقة",
  reject: "رفض",
  cancel: "إلغاء",
};

const QUICK_LINKS = [
  { href: "/admin/users", label: "إدارة المستخدمين", icon: Users, color: "bg-primary/5 text-primary" },
  { href: "/admin/audit", label: "سجل الأحداث", icon: FileText, color: "bg-purple-50 text-purple-600" },
  { href: "/admin/password-reset", label: "طلبات إعادة كلمة المرور", icon: KeyRound, color: "bg-amber-50 text-amber-600" },
  { href: "/admin/notifications", label: "إرسال إشعار", icon: Send, color: "bg-emerald-50 text-emerald-600" },
  { href: "/admin/settings", label: "إعدادات النظام", icon: Settings, color: "bg-muted text-muted-foreground" },
];

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useGetDashboardStats({ period: "month" });
  const { data: pendingStats, isLoading: pendingLoading, isError: pendingError } = useGetPendingRequestsStats();
  const { data: activeSessions, isLoading: sessionsLoading, isError: sessionsError } = useListActiveSessions();
  const { data: auditResponse, isLoading: auditLoading, isError: auditError } = useListAuditLogs({ page: 1, limit: 5 });

  const healthItems = [
    { name: "الخادم (API)", ok: !statsError },
    { name: "قاعدة البيانات", ok: !statsError && !pendingError },
    { name: "نظام الإشعارات", ok: !auditError },
    { name: "نظام الجلسات", ok: !sessionsError },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader icon={LayoutDashboardIcon} title="لوحة تحكم مدير النظام" description="نظرة عامة على حالة المنصة" />

        <TodayHalls />

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "إجمالي المستخدمين", value: stats?.totalUsers, icon: Users, color: "bg-primary/5 text-primary", loading: statsLoading },
            { label: "إجمالي القاعات", value: stats?.totalHalls, icon: Building2, color: "bg-emerald-50 text-emerald-600", loading: statsLoading },
            { label: "طلبات معلقة", value: pendingStats?.pendingCount, icon: AlertCircle, color: "bg-amber-50 text-amber-600", loading: pendingLoading },
            { label: "جلسات نشطة", value: activeSessions?.length, icon: Activity, color: "bg-purple-50 text-purple-600", loading: sessionsLoading },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <Card key={i} >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.color}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                  </div>
                  {item.loading ? <Skeleton className="h-8 w-20" /> : (
                    <p className="text-3xl font-bold text-foreground">{item.value ?? 0}</p>
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

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Active Sessions */}
          <Card >
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" />
                الجلسات النشطة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !activeSessions?.length ? (
                <div className="py-8 text-center text-muted-foreground text-sm">لا توجد جلسات نشطة</div>
              ) : (
                <div className="space-y-2">
                  {activeSessions.slice(0, 6).map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {s.username?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.username}</p>
                          <p className="text-xs text-muted-foreground">{ROLE_AR[s.role] ?? s.role}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground">{formatDateTime(s.lastLogin)}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                          <span className="text-xs text-emerald-600">نشط</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card >
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                آخر الأحداث
              </CardTitle>
              <Link href="/admin/audit">
                <Button variant="ghost" size="sm" className="text-xs">عرض الكل</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !auditResponse?.data?.length ? (
                <div className="py-8 text-center text-muted-foreground text-sm">لا توجد أحداث مسجلة</div>
              ) : (
                <div className="space-y-2">
                  {auditResponse.data.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {log.username ?? "مستخدم"} — {actionLabel(log.action)}{log.entityId ? ` · ${entityLabel(log.entityType)} #${log.entityId}` : ` · ${entityLabel(log.entityType)}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* System Health */}
        <Card >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              حالة النظام
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {healthItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  {item.ok ? (
                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">يعمل</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-full">
                      <XCircle className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">خطأ</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
