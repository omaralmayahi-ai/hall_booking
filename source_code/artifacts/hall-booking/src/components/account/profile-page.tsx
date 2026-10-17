import { useState } from "react";
import { useChangePassword, useCreatePasswordResetRequest } from "@workspace/api-client-react";
import { Check, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, MailQuestion, ShieldCheck, UserCog } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { usePublicSettings } from "@/components/layout/use-public-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLE_AR: Record<string, string> = {
  admin: "مدير النظام",
  relations_manager: "مدير العلاقات",
  requesting_department: "جهة طالبة",
};

function PasswordField({ id, label, value, onChange, autoComplete, invalid }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          dir="ltr"
          className={cn("h-11 pl-11 text-left tracking-wide", invalid && "border-rose-400 focus-visible:ring-rose-400/40")}
          aria-invalid={invalid}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function strength(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[0-9]/.test(pw) && /[^0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9؀-ۿ]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = [
  { label: "", bar: "" },
  { label: "مقبولة", bar: "bg-amber-500" },
  { label: "متوسطة", bar: "bg-yellow-500" },
  { label: "جيدة", bar: "bg-emerald-500" },
  { label: "قوية", bar: "bg-emerald-600" },
];

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2 text-sm transition-colors", ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
      <span className={cn("w-4 h-4 rounded-full flex items-center justify-center shrink-0", ok ? "bg-emerald-600 text-white" : "border border-muted-foreground/40")}>
        {ok && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      {children}
    </li>
  );
}

/** Account page shared by every role: who you are, and changing your password. */
export function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: s } = usePublicSettings();
  const changePassword = useChangePassword();
  const requestReset = useCreatePasswordResetRequest();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const min = Math.max(6, s?.passwordMinLength ?? 6);
  const rules = {
    length: next.length >= min,
    different: !!next && next !== current,
    match: !!confirm && next === confirm,
  };
  const valid = !!current && rules.length && rules.different && rules.match;
  const level = strength(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      await changePassword.mutateAsync({ data: { currentPassword: current, newPassword: next } });
      toast({ title: "تم تغيير كلمة المرور", description: "استخدم كلمة المرور الجديدة في الدخول القادم." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast({ variant: "destructive", title: "لم تتغير كلمة المرور", description: errorMessage(err, "تحقق من كلمة المرور الحالية") });
    }
  };

  const sendReset = async () => {
    try {
      await requestReset.mutateAsync({ data: { username: user?.username ?? "" } });
      setResetSent(true);
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر إرسال الطلب", description: errorMessage(err, "") });
    }
  };

  const displayName = user?.departmentName || user?.username || "";
  const initial = (displayName.trim()[0] ?? "؟").toUpperCase();

  return (
    <MainLayout>
      <div className="space-y-5 max-w-5xl">
        <PageHeader icon={UserCog} title="ملف الحساب" description="بيانات حسابك وتغيير كلمة المرور" />

        <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] items-start">
          {/* identity */}
          <aside className="rounded-2xl border bg-card overflow-hidden lg:sticky lg:top-20">
            <div className="h-20 bg-gradient-to-l from-primary to-primary/70" />
            <div className="px-5 pb-5 -mt-10">
              <div className="w-20 h-20 rounded-2xl bg-card p-1 shadow-md">
                <div className="w-full h-full rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-3xl font-black">{initial}</div>
              </div>
              <h2 className="text-xl font-bold mt-3 leading-snug">{displayName}</h2>
              <p className="text-sm text-muted-foreground">{ROLE_AR[user?.role ?? ""] ?? user?.role}</p>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">اسم المستخدم</dt>
                  <dd className="font-semibold" dir="ltr">{user?.username}</dd>
                </div>
                {user?.departmentName && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">الجهة</dt>
                    <dd className="font-semibold text-left truncate">{user.departmentName}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">حالة الحساب</dt>
                  <dd className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400"><ShieldCheck className="w-4 h-4" />نشط</dd>
                </div>
              </dl>
            </div>
          </aside>

          {/* security */}
          <section className="rounded-2xl border bg-card">
            <header className="px-5 sm:px-6 pt-5 sm:pt-6">
              <h2 className="text-lg font-bold flex items-center gap-2"><LockKeyhole className="w-5 h-5 text-primary" />تغيير كلمة المرور</h2>
              <p className="text-sm text-muted-foreground mt-1">أي تركيبة تختارها: أرقام أو حروف أو رموز، بطول {min} على الأقل.</p>
            </header>
            <form onSubmit={submit} className="px-5 sm:px-6 py-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
              <div className="space-y-4">
                <PasswordField id="pw-current" label="كلمة المرور الحالية" value={current} onChange={setCurrent} autoComplete="current-password" />
                <PasswordField id="pw-new" label="كلمة المرور الجديدة" value={next} onChange={setNext} autoComplete="new-password" />
                {next && (
                  <div className="flex items-center gap-3" aria-live="polite">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= level ? STRENGTH[level].bar : "bg-muted")} />)}
                    </div>
                    <span className="text-xs text-muted-foreground w-14 text-left">{STRENGTH[level].label}</span>
                  </div>
                )}
                <PasswordField id="pw-confirm" label="تأكيد كلمة المرور الجديدة" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={!!confirm && !rules.match} />
                <Button type="submit" disabled={!valid || changePassword.isPending} className="h-11 w-full sm:w-auto sm:px-8">
                  {changePassword.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  حفظ كلمة المرور الجديدة
                </Button>
              </div>
              <ul className="space-y-2.5 rounded-xl bg-muted/40 p-4 self-start">
                <li className="text-xs font-semibold text-muted-foreground mb-1">قبل الحفظ</li>
                <Rule ok={rules.length}>{min} رموز على الأقل</Rule>
                <Rule ok={rules.different}>مختلفة عن الحالية</Rule>
                <Rule ok={rules.match}>التأكيد مطابق</Rule>
              </ul>
            </form>
            <footer className="border-t px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <MailQuestion className="w-5 h-5 text-amber-500 shrink-0 hidden sm:block" />
              {resetSent ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">أُرسل طلبك إلى مدير النظام، وسيعطيك كلمة مرور مؤقتة.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground flex-1">نسيت كلمة المرور الحالية؟ اطلب من مدير النظام إعادة تعيينها.</p>
                  <Button variant="outline" size="sm" onClick={sendReset} disabled={requestReset.isPending} className="h-9">
                    {requestReset.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    طلب إعادة التعيين
                  </Button>
                </>
              )}
            </footer>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
