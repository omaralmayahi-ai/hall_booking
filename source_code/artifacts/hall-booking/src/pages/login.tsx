import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { useLogin, useCreatePasswordResetRequest } from "@workspace/api-client-react";
import { CalendarRange, Wrench, BarChart3, Phone, Mail, Info, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LogIn, User, ArrowRight } from "lucide-react";
import { useAuth, homePathFor, type SessionUser } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { systemNameOf, usePublicSettings } from "@/components/layout/use-public-settings";

type LoginValues = { username: string; password: string };
type ForgotValues = { username: string; reason?: string };

/** Login screen — same look as ناظم: neutral background, centred card, logo + system name. */
export default function Login() {
  const loginMutation = useLogin();
  const resetMutation = useCreatePasswordResetRequest();
  const { login, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: settings, isLoading: settingsLoading } = usePublicSettings();
  const [showPwd, setShowPwd] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation(homePathFor(user?.role), { replace: true });
  }, [isAuthenticated, user, setLocation]);

  const loginForm = useForm<LoginValues>();
  const forgotForm = useForm<ForgotValues>();

  const systemName = systemNameOf(settings);
  const identity = settings?.options?.identity;
  const bg = identity?.loginBackground;

  const onLogin = async (values: LoginValues) => {
    setError(null);
    try {
      const res = await loginMutation.mutateAsync({ data: { username: values.username.trim(), password: values.password } });
      login(res.user as SessionUser, res.token);
      setLocation(homePathFor(res.user.role));
    } catch (e: any) {
      setError(e?.data?.error ?? "تعذر الاتصال بالخادم، حاول مرة أخرى");
    }
  };

  const onForgot = async (values: ForgotValues) => {
    try {
      await resetMutation.mutateAsync({ data: { username: values.username.trim(), reason: values.reason || undefined } });
      setMode("sent");
    } catch (e: any) {
      forgotForm.setError("username", { message: e?.data?.error ?? "تعذر إرسال الطلب" });
    }
  };

  return (
    <div className="min-h-svh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-background" dir="rtl">
      <div className="flex items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-background via-primary/5 to-muted">
      <div className="w-full max-w-sm">
        <Card className="p-7 sm:p-8 border-card-border shadow-sm">
          <div className="text-center mb-7">
            {settingsLoading ? (
              <div className="w-20 h-20 mx-auto mb-4" />
            ) : settings?.logoUrl ? (
              <div className="w-20 h-20 mx-auto mb-4">
                <img src={settings.logoUrl} alt="شعار" className="w-full h-full object-contain" />
              </div>
            ) : (
              <img src={`/icons/icon-192.png?v=${settings?.iconVersion ?? ""}`} alt="" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-sm" />
            )}
            <h1 className="text-2xl font-bold tracking-tight">{systemName}</h1>
            <p className="text-sm text-muted-foreground mt-1">{identity?.loginWelcomeAr || "إدارة القاعات والحجوزات والصيانة إلكترونياً"}</p>
          </div>

          {mode === "login" && (
            <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="username">اسم المستخدم</Label>
                <div className="relative">
                  <User className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input id="username" className="pr-10 h-10" placeholder="أدخل اسم المستخدم" autoComplete="username" autoFocus {...loginForm.register("username", { validate: (v) => v.trim().length > 0 || "اسم المستخدم مطلوب" })} />
                </div>
                {loginForm.formState.errors.username && <p className="text-xs text-destructive">{loginForm.formState.errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <div className="relative">
                  <KeyRound className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    className="pr-10 pl-10 h-10"
                    placeholder="أدخل كلمة المرور"
                    autoComplete="current-password"
                    {...loginForm.register("password", { required: "كلمة المرور مطلوبة" })}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPwd((s) => !s)} className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground" aria-label="إظهار كلمة المرور">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>}
              </div>

              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 leading-relaxed">{error}</p>}

              <Button type="submit" className="w-full h-10" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                تسجيل الدخول
              </Button>
              <div className="text-center">
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => { forgotForm.reset(); setMode("forgot"); }}>
                  نسيت كلمة المرور؟
                </button>
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={forgotForm.handleSubmit(onForgot)} className="space-y-4" noValidate>
              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground leading-relaxed">
                سيصل طلبك إلى مدير النظام ليقوم بتعيين كلمة مرور مؤقتة لك، وسيُطلب منك تغييرها عند أول دخول.
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-username">اسم المستخدم</Label>
                <div className="relative">
                  <User className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input id="f-username" className="pr-10" placeholder="أدخل اسم المستخدم" {...forgotForm.register("username", { validate: (v) => v.trim().length > 0 || "يرجى إدخال اسم المستخدم" })} />
                </div>
                {forgotForm.formState.errors.username && <p className="text-xs text-destructive">{forgotForm.formState.errors.username.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-reason">ملاحظة (اختياري)</Label>
                <Input id="f-reason" placeholder="مثال: رقم الهاتف للتواصل" {...forgotForm.register("reason", { maxLength: { value: 500, message: "النص طويل" } })} />
              </div>
              <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
                {resetMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                إرسال الطلب
              </Button>
              <Button type="button" variant="ghost" className="w-full text-sm" onClick={() => setMode("login")}>
                <ArrowRight className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Button>
            </form>
          )}

          {mode === "sent" && (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h3 className="font-semibold text-lg">تم إرسال الطلب</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">إذا كان اسم المستخدم صحيحاً فسيقوم مدير النظام بمعالجة طلبك والتواصل معك.</p>
              <Button variant="outline" onClick={() => setMode("login")} className="mt-2">
                <ArrowRight className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Button>
            </div>
          )}
          {identity?.loginNoticeAr && (
            <div className="mt-5 flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
              <Info className="w-4 h-4 shrink-0 text-primary" />
              {identity.loginNoticeAr}
            </div>
          )}
          {(identity?.supportPhone || identity?.supportEmail) && (
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {identity.supportPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /><span dir="ltr">{identity.supportPhone}</span></span>}
              {identity.supportEmail && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /><span dir="ltr">{identity.supportEmail}</span></span>}
            </div>
          )}
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-5">
          {settings?.footerTextAr || settings?.footerText || `جميع الحقوق محفوظة © ${new Date().getFullYear()}`}
        </p>
      </div>
      </div>

      {/* Brand panel (desktop) */}
      <aside className="hidden lg:flex relative overflow-hidden bg-primary text-primary-foreground">
        {bg ? (
          <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" aria-hidden="true">
            <defs>
              <pattern id="login-grid" width="56" height="56" patternUnits="userSpaceOnUse">
                <rect x="6" y="6" width="44" height="44" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M6 20h44M18 2v10M38 2v10" stroke="currentColor" strokeWidth="2" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#login-grid)" />
          </svg>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-primary/40 to-primary/20" />
        <div className="relative z-10 flex flex-col justify-end p-12 xl:p-16 gap-6 w-full">
          {(identity?.parentOrganizationAr || identity?.organizationAr) && (
            <p className="text-sm font-medium opacity-90">{[identity?.parentOrganizationAr, identity?.organizationAr].filter(Boolean).join(" — ")}</p>
          )}
          <h2 className="text-4xl xl:text-5xl font-extrabold leading-tight">{systemName}</h2>
          <p className="text-lg opacity-90 max-w-lg">{identity?.taglineAr || "إدارة القاعات والحجوزات"}</p>
          <div className="grid grid-cols-3 gap-3 max-w-xl pt-2">
            {[
              { icon: CalendarRange, t: "تقويم الحجوزات", d: "الأيام المتاحة بنظرة واحدة" },
              { icon: Wrench, t: "متابعة الصيانة", d: "وحجب القاعة تلقائياً" },
              { icon: BarChart3, t: "تقارير الإشغال", d: "Excel و PDF" },
            ].map((f) => (
              <div key={f.t} className="rounded-xl bg-white/12 backdrop-blur-sm border border-white/15 p-3.5">
                <f.icon className="w-5 h-5 mb-2" />
                <p className="text-sm font-semibold">{f.t}</p>
                <p className="text-xs opacity-80">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
