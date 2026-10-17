import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { ClearReadButton } from "@/components/notifications/clear-read-button";
import { Bell as BellIcon } from "lucide-react";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export default function DepartmentNotifications() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: notifications, isLoading } = useListNotifications({});
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const handleMarkAll = async () => {
    try {
      await markAll.mutateAsync(undefined);
      toast({ title: "تم تحديد جميع الإشعارات كمقروءة" });
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch { toast({ variant: "destructive", title: "فشلت العملية" }); }
  };

  const handleMarkOne = async (id: number) => {
    await markRead.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await deleteNotif.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch { toast({ variant: "destructive", title: "فشل حذف الإشعار" }); }
  };

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <PageHeader icon={BellIcon} title="الإشعارات" description={<>{unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "جميع الإشعارات مقروءة"}</>} />
          <div className="flex flex-wrap gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" onClick={handleMarkAll} className="gap-2">
                <CheckCheck className="w-4 h-4" />
                تحديد الكل كمقروء
              </Button>
            )}
            <ClearReadButton readCount={(notifications?.length ?? 0) - unreadCount} />
          </div>
        </div>

        <Card >
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !notifications?.length ? (
              <div className="py-16 text-center">
                <Bell className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">لا توجد إشعارات</p>
              </div>
            ) : (
              <div>
                {notifications.map(n => (
                  <div key={n.id}
                    className={`group flex gap-4 p-4 border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${!n.isRead ? "bg-primary/5/40" : ""}`}
                    onClick={() => !n.isRead && handleMarkOne(n.id)}
                  >
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.isRead ? "bg-muted" : "bg-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{n.titleAr || n.title}</p>
                        {!n.isRead && <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-xs">جديد</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{n.messageAr || n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50"
                      onClick={(e) => handleDelete(e, n.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
