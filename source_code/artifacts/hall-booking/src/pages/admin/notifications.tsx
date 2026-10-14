import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Send as SendIcon } from "lucide-react";
import { useSendNotification, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send, Bell } from "lucide-react";

export default function AdminNotifications() {
  const { toast } = useToast();
  const sendNotification = useSendNotification();
  const { data: users } = useListUsers();

  const [form, setForm] = useState({
    titleAr: "", messageAr: "", type: "general", targetRole: "all", userId: "",
  });
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!form.titleAr || !form.messageAr) {
      toast({ variant: "destructive", title: "يرجى ملء العنوان والنص" });
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        title: form.titleAr, titleAr: form.titleAr,
        message: form.messageAr, messageAr: form.messageAr,
        type: form.type as any,
      };
      if (form.targetRole !== "all" && form.targetRole !== "specific") payload.targetRole = form.targetRole;
      if (form.userId) payload.userId = Number(form.userId);
      await sendNotification.mutateAsync({ data: payload });
      toast({ title: "تم إرسال الإشعار بنجاح" });
      setForm({ titleAr: "", messageAr: "", type: "general", targetRole: "all", userId: "" });
    } catch {
      toast({ variant: "destructive", title: "فشل إرسال الإشعار" });
    } finally {
      setSending(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader icon={SendIcon} title="إرسال الإشعارات" description="إرسال تنبيهات وإشعارات للمستخدمين" />
        <div className="max-w-2xl">
          <Card >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base">إنشاء إشعار جديد</CardTitle>
              </div>
              <CardDescription>سيتم إرسال الإشعار فور الضغط على زر الإرسال</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>عنوان الإشعار <span className="text-red-500">*</span></Label>
                <Input value={form.titleAr} onChange={e => setForm(p => ({ ...p, titleAr: e.target.value }))} placeholder="مثال: تحديث مهم في سياسة الحجز" />
              </div>
              <div className="space-y-1.5">
                <Label>نص الإشعار <span className="text-red-500">*</span></Label>
                <Textarea value={form.messageAr} onChange={e => setForm(p => ({ ...p, messageAr: e.target.value }))} placeholder="اكتب نص الإشعار هنا..." rows={4} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>نوع الإشعار</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">عام</SelectItem>
                      <SelectItem value="booking">حجز</SelectItem>
                      <SelectItem value="maintenance">صيانة</SelectItem>
                      <SelectItem value="system">نظام</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>الجهة المستهدفة</Label>
                  <Select value={form.targetRole} onValueChange={v => setForm(p => ({ ...p, targetRole: v, userId: "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع المستخدمين</SelectItem>
                      <SelectItem value="admin">مديرو النظام</SelectItem>
                      <SelectItem value="relations_manager">مديرو العلاقات</SelectItem>
                      <SelectItem value="requesting_department">الجهات الطالبة</SelectItem>
                      <SelectItem value="specific">مستخدم محدد</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.targetRole === "specific" && (
                <div className="space-y-1.5">
                  <Label>اختر المستخدم</Label>
                  <Select value={form.userId} onValueChange={v => setForm(p => ({ ...p, userId: v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر مستخدماً" /></SelectTrigger>
                    <SelectContent>
                      {users?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.username} ({u.departmentName ?? u.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={handleSend} disabled={sending || !form.titleAr || !form.messageAr} className="w-full gap-2 bg-primary hover:bg-primary/90 h-11">
                <Send className="w-4 h-4" />
                {sending ? "جاري الإرسال..." : "إرسال الإشعار"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
