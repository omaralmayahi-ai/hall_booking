import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { bookingLinkFor, useFocusedNotification } from "@/components/notifications/use-focused-notification";
import { ClearReadButton } from "@/components/notifications/clear-read-button";
import { Bell as BellIcon } from "lucide-react";
import {
  useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification,
  useSendNotification, useListUsers,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCheck, Send, Users, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export default function ManagerNotifications() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: notifications, isLoading } = useListNotifications({});
  const { data: users } = useListUsers({});
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();
  const sendNotification = useSendNotification();

  const [titleAr, setTitleAr] = useState("");
  const [messageAr, setMessageAr] = useState("");
  const [targetUserId, setTargetUserId] = useState<string>("all");
  const [sending, setSending] = useState(false);

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

  const handleSend = async () => {
    if (!titleAr || !messageAr) {
      toast({ variant: "destructive", title: "يرجى ملء العنوان والرسالة على الأقل" });
      return;
    }
    setSending(true);
    try {
      await sendNotification.mutateAsync({
        data: {
          title: titleAr,
          titleAr,
          message: messageAr,
          messageAr,
          targetUserId: targetUserId !== "all" ? Number(targetUserId) : undefined,
        }
      });
      toast({ title: "تم إرسال الإشعار بنجاح" });
      setTitleAr(""); setMessageAr(""); setTargetUserId("all");
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: e?.data?.error ?? "" });
    } finally {
      setSending(false);
    }
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;
  const { user } = useAuth();
  const focusedId = useFocusedNotification(!!notifications?.length);
  // Opening a notification from the bell marks it as read.
  useEffect(() => {
    const n = notifications?.find((x) => x.id === focusedId);
    if (n && !n.isRead) void handleMarkOne(n.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, notifications?.length]);
  const departmentUsers = users?.filter(u => u.role === "requesting_department") ?? [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader icon={BellIcon} title="الإشعارات" description="إرسال إشعارات للجهات وعرض إشعاراتك" />

        {/* Send Notification Form */}
        <Card >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">إرسال إشعار جديد</CardTitle>
            </div>
            <CardDescription>أرسل إشعاراً لجهة معينة أو لجميع المستخدمين</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>العنوان *</Label>
              <Input
                value={titleAr}
                onChange={e => setTitleAr(e.target.value)}
                placeholder="مثال: تنبيه بشأن الحجز"
              />
            </div>
            <div className="space-y-1.5">
              <Label>نص الاشعار *</Label>
              <Textarea
                value={messageAr}
                onChange={e => setMessageAr(e.target.value)}
                placeholder="اكتب نص الإشعار هنا..."
                rows={3}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1 max-w-xs">
                <Label className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  المستلم
                </Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المستخدمين</SelectItem>
                    {departmentUsers.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.departmentName || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSend}
                disabled={sending || !titleAr || !messageAr}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                <Send className="w-4 h-4" />
                {sending ? "جاري الإرسال..." : "إرسال الإشعار"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Inbox */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">صندوق الوارد</h2>
            <p className="text-muted-foreground text-sm">{unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "جميع الإشعارات مقروءة"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" onClick={handleMarkAll} className="gap-2 h-8 text-sm">
                <CheckCheck className="w-4 h-4" />
                تحديد الكل كمقروء
              </Button>
            )}
            <ClearReadButton readCount={(notifications?.length ?? 0) - unreadCount} className="h-8 text-sm" />
          </div>
        </div>

        <Card >
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !notifications?.length ? (
              <div className="py-16 text-center">
                <Bell className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">لا توجد إشعارات</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  id={`notif-${n.id}`}
                  className={`group flex gap-4 p-4 border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors scroll-mt-24 ${focusedId === n.id ? "bg-primary/[0.07] ring-2 ring-inset ring-primary/50" : !n.isRead ? "bg-primary/[0.04]" : ""}`}
                  onClick={() => !n.isRead && handleMarkOne(n.id)}
                >
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${n.isRead ? "bg-muted" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{n.titleAr || n.title}</p>
                      {!n.isRead && <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-xs">جديد</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.messageAr || n.message}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                        <p className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                        {bookingLinkFor(user?.role, n.relatedBookingId) && (
                          <Link href={bookingLinkFor(user?.role, n.relatedBookingId)!} className="text-xs font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>عرض الحجز</Link>
                        )}
                      </div>
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
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
