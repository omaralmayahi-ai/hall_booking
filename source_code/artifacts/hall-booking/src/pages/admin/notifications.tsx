import { useMemo, useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell, BellRing, Building2, CalendarOff, CheckCheck, Clock, Info, Loader2, Megaphone, Search, Send, ShieldCheck, User, Users, Wrench, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/page-header";
import { api, errorMessage, useApiQuery } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Audience = "all" | "relations_manager" | "requesting_department" | "admin" | "specific";

interface SentBatch {
  batchId: string;
  title: string;
  message: string;
  type: string;
  sender: string;
  createdAt: string;
  recipients: number;
  read: number;
}

const AUDIENCES: { value: Audience; label: string; hint: string; icon: typeof Users }[] = [
  { value: "all", label: "جميع المستخدمين", hint: "كل الحسابات الفعّالة", icon: Users },
  { value: "requesting_department", label: "الجهات الطالبة", hint: "الأقسام التي تحجز القاعات", icon: Building2 },
  { value: "relations_manager", label: "مديرو العلاقات", hint: "المسؤولون عن الموافقات", icon: ShieldCheck },
  { value: "admin", label: "مديرو النظام", hint: "حسابات الإدارة", icon: ShieldCheck },
  { value: "specific", label: "مستخدم محدد", hint: "اختر حساباً واحداً", icon: User },
];

const TEMPLATES: { label: string; icon: typeof Bell; title: string; message: string; type: "general" | "system" }[] = [
  { label: "عطلة رسمية", icon: CalendarOff, type: "general", title: "تنويه بعطلة رسمية", message: "نود إعلامكم بأن يوم ... عطلة رسمية، ولا يمكن حجز القاعات خلاله. يرجى مراعاة ذلك عند تقديم طلبات الحجز." },
  { label: "صيانة قاعة", icon: Wrench, type: "general", title: "أعمال صيانة في إحدى القاعات", message: "ستكون قاعة ... خارج الخدمة بسبب أعمال صيانة من تاريخ ... إلى تاريخ ...، وسيتم التنسيق مع أصحاب الحجوزات لنقلها إلى قاعات بديلة." },
  { label: "تحديث سياسة الحجز", icon: Megaphone, type: "general", title: "تحديث في تعليمات حجز القاعات", message: "تم تحديث تعليمات حجز القاعات، ومنها: ... يرجى الاطلاع عليها قبل تقديم الطلبات القادمة." },
  { label: "تحديث المنصة", icon: Sparkles, type: "system", title: "تحديث منصة حجز القاعات", message: "تم تحديث المنصة بميزات جديدة، منها تقويم القاعات وعرض الأيام المحجوزة عند الحجز وطباعة إشعار الحجز." },
];

const ROLE_AR: Record<string, string> = { admin: "مدير النظام", relations_manager: "مدير العلاقات", requesting_department: "جهة طالبة" };

export default function AdminNotifications() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useListUsers();
  const { data: sent, isLoading: sentLoading } = useApiQuery<SentBatch[]>("/notifications/sent");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"general" | "system">("general");
  const [audience, setAudience] = useState<Audience>("all");
  const [userId, setUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [sending, setSending] = useState(false);

  const activeUsers = useMemo(() => (users ?? []).filter((u) => u.isActive !== false), [users]);
  const countFor = (a: Audience) =>
    a === "all" ? activeUsers.length : a === "specific" ? (userId ? 1 : 0) : activeUsers.filter((u) => u.role === a).length;
  const recipients = countFor(audience);
  const filteredUsers = activeUsers.filter((u) => {
    const q = userSearch.trim();
    return !q || [u.username, u.departmentName].some((v) => v?.includes(q));
  });
  const canSend = !!title.trim() && !!message.trim() && recipients > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await api("POST", "/notifications", {
        title: title.trim(),
        titleAr: title.trim(),
        message: message.trim(),
        messageAr: message.trim(),
        type,
        ...(audience === "specific" ? { targetUserId: userId } : audience !== "all" ? { targetRole: audience } : {}),
      });
      toast({ title: "تم إرسال الإشعار", description: `وصل إلى ${recipients} مستخدم` });
      setTitle("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["v2"] });
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر إرسال الإشعار", description: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={Send} title="إرسال الإشعارات" description="تنبيهات تصل إلى مستخدمي المنصة داخل جرس الإشعارات" />

      <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2"><BellRing className="w-4 h-4 text-primary" />إشعار جديد</CardTitle>
            <CardDescription>اختر الفئة المستهدفة ثم اكتب الإشعار، أو ابدأ من أحد القوالب الجاهزة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2.5">
              <Label className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] flex items-center justify-center">1</span>إلى من؟</Label>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => { setAudience(a.value); if (a.value !== "specific") setUserId(null); }}
                    className={cn("text-right rounded-xl border p-3 transition-colors", audience === a.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <a.icon className={cn("w-4 h-4", audience === a.value ? "text-primary" : "text-muted-foreground")} />
                      {a.value !== "specific" && <span className="text-[11px] tabular-nums rounded-full bg-muted px-2 py-0.5">{countFor(a.value)}</span>}
                    </div>
                    <p className="text-sm font-semibold mt-1.5">{a.label}</p>
                    <p className="text-[11px] text-muted-foreground">{a.hint}</p>
                  </button>
                ))}
              </div>
              {audience === "specific" && (
                <div className="rounded-xl border p-2.5 space-y-2 bg-muted/20">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="ابحث باسم المستخدم أو الجهة..." className="pr-9 h-9" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setUserId(u.id)}
                        className={cn("w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-right text-sm", userId === u.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                      >
                        <span className="truncate font-medium">{u.departmentName || u.username}</span>
                        <span className={cn("text-[11px] shrink-0", userId === u.id ? "opacity-90" : "text-muted-foreground")}>
                          <span dir="ltr">{u.username}</span> • {ROLE_AR[u.role] ?? u.role}
                        </span>
                      </button>
                    ))}
                    {!filteredUsers.length && <p className="text-xs text-muted-foreground text-center py-4">لا يوجد مستخدم مطابق</p>}
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] flex items-center justify-center">2</span>نص الإشعار</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((t) => (
                    <button key={t.label} type="button" onClick={() => { setTitle(t.title); setMessage(t.message); setType(t.type); }} className="inline-flex items-center gap-1 text-[11px] rounded-full border px-2.5 py-1 hover:bg-muted">
                      <t.icon className="w-3 h-3" />{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">العنوان</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="مثال: تحديث مهم في تعليمات الحجز" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between"><Label className="text-xs text-muted-foreground">النص</Label><span className="text-[11px] text-muted-foreground tabular-nums">{message.length}/2000</span></div>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} placeholder="اكتب نص الإشعار..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">نوع الإشعار</Label>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {([["general", "إشعار عام", Bell], ["system", "تنبيه من النظام", Info]] as const).map(([v, l, Icon]) => (
                    <button key={v} type="button" onClick={() => setType(v)} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", type === v ? "border-primary bg-primary/5 font-semibold text-primary" : "hover:bg-muted/50")}>
                      <Icon className="w-4 h-4" />{l}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <Label className="text-xs text-muted-foreground">المعاينة — كما يظهر في جرس الإشعارات</Label>
              <div className="rounded-xl border bg-background p-3.5 flex gap-3">
                <span className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", type === "system" ? "bg-sky-500/10 text-sky-600" : "bg-primary/10 text-primary")}>
                  {type === "system" ? <Info className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{title || "عنوان الإشعار"}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line mt-0.5">{message || "نص الإشعار يظهر هنا..."}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />الآن</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between rounded-xl bg-muted/40 p-3">
                <p className="text-sm">
                  سيصل الإشعار إلى <span className="font-bold tabular-nums text-primary">{recipients}</span> مستخدم
                  {audience === "specific" && !userId && <span className="text-amber-700"> — اختر المستخدم أولاً</span>}
                </p>
                <Button onClick={send} disabled={!canSend} className="min-w-40">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  إرسال الإشعار
                </Button>
              </div>
            </section>
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><CheckCheck className="w-4 h-4 text-emerald-600" />الإشعارات المرسلة</CardTitle>
            <CardDescription>آخر 50 إشعاراً ونسبة قراءتها</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 max-h-[70svh] overflow-y-auto">
            {sentLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            ) : !sent?.length ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
                لم يُرسل أي إشعار بعد
              </div>
            ) : (
              sent.map((b) => {
                const pct = b.recipients ? Math.round((b.read / b.recipients) * 100) : 0;
                return (
                  <div key={b.batchId} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm leading-snug">{b.title}</p>
                      {b.type === "system" && <span className="text-[10px] rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 shrink-0">نظام</span>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{b.message}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>قرأه {b.read} من {b.recipients}</span>
                        <span className="tabular-nums font-semibold">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDateTime(b.createdAt)}{b.sender ? ` • ${b.sender}` : ""}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
