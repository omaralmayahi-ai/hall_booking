import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useFactoryResetFull, useFactoryResetNotifications, useFactoryResetAccounts,
  useFactoryResetBookings, useFactoryResetCompletedBookings, useFactoryResetAuditLog, useFactoryResetReviews,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, CalendarCog, CheckCircle2, ClipboardList, Fingerprint, History, ImageIcon, Loader2, MonitorPlay, Palette, Plus,
  Printer, RotateCcw, Save, Settings2, ShieldCheck, Star, Trash2, Upload, Users, Wrench, X, Database, DatabaseBackup, Building, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/page-header";
import { PUBLIC_SETTINGS_KEY } from "@/components/layout/use-public-settings";
import { FONT_OPTIONS, SIDEBAR_STYLES, THEME_OPTIONS } from "@/hooks/use-appearance";
import { api, errorMessage, useApiQuery } from "@/lib/api";
import type { PlatformOptions } from "@/lib/options";
import { WEEKDAYS_AR } from "@/lib/options";
import { makeIconSet, readFileAsDataUrl, resizeImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { ScreenSettings } from "./screen-settings";
import { BackupSettings, backupBeforeReset } from "./backup-settings";
import { CheckRow, Field, NumberField, Section } from "./settings-ui";

interface BaseSettings {
  companyName: string;
  companyNameAr: string | null;
  logoUrl: string | null;
  footerText: string | null;
  footerTextAr: string | null;
  workingHoursStart: string;
  workingHoursEnd: string;
  passwordMinLength: number;
  passwordRequireSpecial: boolean;
  passwordExpiryDays: number | null;
  overdueRequestHours: number;
}

type OptionsResponse = PlatformOptions & { icon: { custom: boolean; version: string } };

const TABS = [
  { key: "identity", label: "الهوية البصرية", icon: Fingerprint },
  { key: "appearance", label: "المظهر", icon: Palette },
  { key: "booking", label: "قواعد الحجز", icon: CalendarCog },
  { key: "notifications", label: "التذكير والصيانة", icon: Bell },
  { key: "display", label: "العرض والطباعة", icon: Printer },
  { key: "screens", label: "شاشات العرض", icon: MonitorPlay },
  { key: "security", label: "الأمان", icon: ShieldCheck },
  { key: "backup", label: "النسخ الاحتياطي", icon: DatabaseBackup },
  { key: "data", label: "البيانات", icon: Database },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/* ---------------- small building blocks ---------------- */

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <span key={x} className="inline-flex items-center gap-1 rounded-lg border bg-muted/50 pr-2.5 pl-1 py-1 text-sm">
            {x}
            <button type="button" onClick={() => onChange(items.filter((i) => i !== x))} className="w-5 h-5 rounded hover:bg-destructive/10 hover:text-destructive flex items-center justify-center" aria-label={`حذف ${x}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {!items.length && <span className="text-xs text-muted-foreground">لا توجد عناصر</span>}
      </div>
      <div className="flex gap-2 max-w-md">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" onClick={add}><Plus className="w-4 h-4" />إضافة</Button>
      </div>
    </div>
  );
}

function ImagePicker({ label, hint, value, onChange, accept = "image/png,image/jpeg,image/webp", square, onError }: { label: string; hint?: string; value: string | null; onChange: (v: string | null) => void; accept?: string; square?: boolean; onError: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <div className={cn("shrink-0 rounded-xl border-2 border-dashed bg-muted/30 flex items-center justify-center overflow-hidden", square ? "w-24 h-24" : "w-40 h-24")}>
        {value ? <img src={value} alt="" className={cn("w-full h-full", square ? "object-contain p-1.5" : "object-cover")} /> : <ImageIcon className="w-7 h-7 text-muted-foreground/50" />}
      </div>
      <div className="space-y-2 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}><Upload className="w-3.5 h-3.5" />رفع صورة</Button>
          {value && <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(null)}><Trash2 className="w-3.5 h-3.5" />إزالة</Button>}
        </div>
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) return onError("حجم الصورة يتجاوز 5 ميجابايت");
            try {
              onChange(await readFileAsDataUrl(file));
            } catch {
              onError("تعذّر قراءة الصورة");
            }
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function AdminSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: base, isLoading: loadingBase } = useApiQuery<BaseSettings>("/settings");
  const { data: opts, isLoading: loadingOpts } = useApiQuery<OptionsResponse>("/settings/options");
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      return (localStorage.getItem("admin:settings-tab") as TabKey) || "identity";
    } catch {
      return "identity";
    }
  });
  const [b, setB] = useState<BaseSettings | null>(null);
  const [o, setO] = useState<PlatformOptions | null>(null);
  const [saving, setSaving] = useState(false);
  const [useLogoAsIcon, setUseLogoAsIcon] = useState(true);
  const [iconBusy, setIconBusy] = useState(false);
  const iconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("admin:settings-tab", tab);
    } catch {
      /* ignore */
    }
  }, [tab]);
  useEffect(() => { if (base) setB(base); }, [base]);
  useEffect(() => {
    if (opts) {
      const { icon: _icon, ...rest } = opts;
      setO(rest);
    }
  }, [opts]);

  const dirty = useMemo(() => {
    if (!b || !o || !base || !opts) return false;
    const { icon: _i, ...origO } = opts;
    return JSON.stringify(b) !== JSON.stringify(base) || JSON.stringify(o) !== JSON.stringify(origO);
  }, [b, o, base, opts]);

  const setOpt = <S extends keyof PlatformOptions, K extends keyof PlatformOptions[S]>(section: S, key: K, value: PlatformOptions[S][K]) =>
    setO((cur) => (cur ? { ...cur, [section]: { ...cur[section], [key]: value } } : cur));
  const setBase = <K extends keyof BaseSettings>(key: K, value: BaseSettings[K]) => setB((cur) => (cur ? { ...cur, [key]: value } : cur));
  const fail = (m: string) => toast({ variant: "destructive", title: m });

  const uploadIcon = async (src: string, fill: boolean) => {
    setIconBusy(true);
    try {
      const set = await makeIconSet(src, fill);
      await api("PUT", "/settings/icon", set);
      qc.invalidateQueries({ queryKey: PUBLIC_SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: ["v2"] });
      toast({ title: "تم اعتماد الأيقونة الجديدة للمنصة", description: "تظهر في المتصفح والتطبيق المثبّت واختصار سطح المكتب" });
    } catch (e) {
      fail(errorMessage(e, "تعذّر حفظ الأيقونة"));
    } finally {
      setIconBusy(false);
    }
  };

  const resetIcon = async () => {
    setIconBusy(true);
    try {
      await api("DELETE", "/settings/icon");
      qc.invalidateQueries({ queryKey: PUBLIC_SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: ["v2"] });
      toast({ title: "أُعيدت الأيقونة الافتراضية" });
    } catch (e) {
      fail(errorMessage(e));
    } finally {
      setIconBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!b || !o || !base) return;
    if (b.workingHoursEnd <= b.workingHoursStart) {
      fail("نهاية الدوام يجب أن تكون بعد بدايته");
      return;
    }
    setSaving(true);
    try {
      const logoChanged = (b.logoUrl || "") !== (base.logoUrl || "");
      let logo = b.logoUrl || "";
      if (logoChanged && logo.startsWith("data:")) logo = await resizeImage(logo, 512);
      await api("PATCH", "/settings", {
        companyName: b.companyName || "Hall Booking Platform",
        companyNameAr: b.companyNameAr || "",
        logoUrl: logo,
        footerText: b.footerText || "",
        footerTextAr: b.footerTextAr || "",
        workingHoursStart: b.workingHoursStart,
        workingHoursEnd: b.workingHoursEnd,
        passwordMinLength: Math.max(6, Number(b.passwordMinLength) || 6),
        passwordRequireSpecial: b.passwordRequireSpecial,
        ...(b.passwordExpiryDays ? { passwordExpiryDays: Number(b.passwordExpiryDays) } : {}),
        overdueRequestHours: Number(b.overdueRequestHours) || 24,
      });
      let background = o.identity.loginBackground;
      if (background && background !== opts?.identity.loginBackground) background = await resizeImage(background, 1920, "image/jpeg", 0.82);
      await api("PUT", "/settings/options", {
        ...o,
        identity: { ...o.identity, systemNameAr: b.companyNameAr || o.identity.systemNameAr, systemNameEn: b.companyName || o.identity.systemNameEn, loginBackground: background },
      });
      if (logoChanged && logo && useLogoAsIcon) await uploadIcon(logo, false);
      qc.invalidateQueries({ queryKey: ["v2"] });
      qc.invalidateQueries({ queryKey: PUBLIC_SETTINGS_KEY });
      toast({ title: "تم حفظ الإعدادات" });
    } catch (e) {
      fail(errorMessage(e, "تعذّر حفظ الإعدادات"));
    } finally {
      setSaving(false);
    }
  };

  const loading = loadingBase || loadingOpts || !b || !o;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        icon={Settings2}
        title="إعدادات النظام"
        description="الهوية البصرية والمظهر وقواعد الحجز والتذكير والطباعة والأمان"
      />

      <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-5 items-start">
        {/* Tabs: vertical list on desktop, horizontal scroller on mobile */}
        <nav className="lg:sticky lg:top-16 flex lg:flex-col gap-1 overflow-x-auto rounded-xl border bg-card p-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap transition-colors text-right",
                tab === t.key ? "bg-primary text-primary-foreground font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className="w-4 h-4 shrink-0" />
              {t.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="space-y-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
        ) : (
          <div className="space-y-5 min-w-0">
            {tab === "identity" && (
              <>
                <Section icon={Building} title="اسم المنصة والجهة" description="تظهر في القائمة الجانبية وصفحة الدخول والمطبوعات والتطبيق المثبّت">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="اسم المنصة (عربي)"><Input value={b!.companyNameAr ?? ""} onChange={(e) => setBase("companyNameAr", e.target.value)} /></Field>
                    <Field label="اسم المنصة (إنكليزي)"><Input value={b!.companyName} onChange={(e) => setBase("companyName", e.target.value)} dir="ltr" className="text-right" /></Field>
                    <Field label="الاسم المختصر" hint="يظهر تحت أيقونة التطبيق عند تثبيته على الحاسوب أو الهاتف"><Input value={o!.identity.shortNameAr} onChange={(e) => setOpt("identity", "shortNameAr", e.target.value)} /></Field>
                    <Field label="العبارة التعريفية"><Input value={o!.identity.taglineAr} onChange={(e) => setOpt("identity", "taglineAr", e.target.value)} /></Field>
                    <Field label="اسم الجهة / الشركة"><Input value={o!.identity.organizationAr} onChange={(e) => setOpt("identity", "organizationAr", e.target.value)} placeholder="مثال: شركة نفط الوسط" /></Field>
                    <Field label="الجهة العليا"><Input value={o!.identity.parentOrganizationAr} onChange={(e) => setOpt("identity", "parentOrganizationAr", e.target.value)} placeholder="مثال: وزارة النفط" /></Field>
                  </div>
                </Section>

                <Section icon={ImageIcon} title="الشعار وأيقونة المنصة" description="الأيقونة الافتراضية مُعتمدة عند التنصيب، وتُستبدل بالأيقونة التي ترفعها هنا">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <ImagePicker label="شعار الجهة" hint="PNG بخلفية شفافة يعطي أفضل نتيجة. يظهر في القائمة الجانبية وصفحة الدخول والمطبوعات." value={b!.logoUrl || null} onChange={(v) => setBase("logoUrl", v ?? "")} square onError={fail} />
                      {b!.logoUrl !== (base?.logoUrl ?? "") && !!b!.logoUrl && (
                        <CheckRow checked={useLogoAsIcon} onChange={setUseLogoAsIcon} title="اعتماد الشعار أيقونةً للمنصة عند الحفظ" description="يُستخدم في تبويب المتصفح والتطبيق المثبّت واختصار سطح المكتب" />
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <img src={`/icons/icon-192.png?v=${opts?.icon.version}`} alt="أيقونة المنصة" className="w-24 h-24 rounded-2xl border shadow-sm" />
                        <div className="space-y-2">
                          <p className="text-sm font-medium">أيقونة المنصة</p>
                          <p className="text-[11px] text-muted-foreground">{opts?.icon.custom ? "أيقونة مخصصة مرفوعة" : "الأيقونة الافتراضية للمنصة"}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={iconBusy} onClick={() => iconInput.current?.click()}>
                              {iconBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}رفع أيقونة
                            </Button>
                            {opts?.icon.custom && <Button type="button" size="sm" variant="ghost" disabled={iconBusy} onClick={resetIcon}><RotateCcw className="w-3.5 h-3.5" />الافتراضية</Button>}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">صورة مربعة بدقة 512×512 على الأقل. تُحدَّث أيقونة اختصار سطح المكتب تلقائياً (قد يحتاج ويندوز لإعادة تسجيل الدخول لتحديث ذاكرة الأيقونات).</p>
                      <input
                        ref={iconInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) uploadIcon(await readFileAsDataUrl(f), true);
                        }}
                      />
                    </div>
                  </div>
                </Section>

                <Section icon={Fingerprint} title="صفحة تسجيل الدخول">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="عبارة الترحيب"><Input value={o!.identity.loginWelcomeAr} onChange={(e) => setOpt("identity", "loginWelcomeAr", e.target.value)} /></Field>
                    <Field label="تنويه يظهر أسفل نموذج الدخول" hint="مثال: للاستفسار يرجى الاتصال بشعبة العلاقات"><Input value={o!.identity.loginNoticeAr} onChange={(e) => setOpt("identity", "loginNoticeAr", e.target.value)} /></Field>
                    <Field label="هاتف الدعم"><Input value={o!.identity.supportPhone} onChange={(e) => setOpt("identity", "supportPhone", e.target.value)} dir="ltr" className="text-right" /></Field>
                    <Field label="بريد الدعم"><Input value={o!.identity.supportEmail} onChange={(e) => setOpt("identity", "supportEmail", e.target.value)} dir="ltr" className="text-right" /></Field>
                  </div>
                  <ImagePicker label="صورة خلفية صفحة الدخول" hint="صورة أفقية لمبنى الجهة أو إحدى القاعات (تُضغط تلقائياً)." value={o!.identity.loginBackground} onChange={(v) => setOpt("identity", "loginBackground", v)} accept="image/jpeg,image/png,image/webp" onError={fail} />
                </Section>

                <Section icon={ClipboardList} title="نص الحقوق (تذييل الصفحات)">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="عربي"><Input value={b!.footerTextAr ?? ""} onChange={(e) => setBase("footerTextAr", e.target.value)} /></Field>
                    <Field label="إنكليزي"><Input value={b!.footerText ?? ""} onChange={(e) => setBase("footerText", e.target.value)} dir="ltr" className="text-right" /></Field>
                  </div>
                </Section>
              </>
            )}

            {tab === "appearance" && (
              <>
                <Section icon={Palette} title="لون المنصة" description="اللون الافتراضي لجميع المستخدمين">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                    {THEME_OPTIONS.map((t) => (
                      <button key={t.value} type="button" onClick={() => setOpt("appearance", "theme", t.value)} className={cn("rounded-xl border p-2.5 text-right transition-colors", o!.appearance.theme === t.value ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}>
                        <span className="flex gap-1 mb-2">
                          <span className="h-8 flex-1 rounded-md" style={{ background: t.color }} />
                          <span className="h-8 w-4 rounded-md opacity-40" style={{ background: t.color }} />
                        </span>
                        <span className="text-xs font-medium flex items-center gap-1">{o!.appearance.theme === t.value && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}{t.label}</span>
                      </button>
                    ))}
                  </div>
                </Section>
                <Section icon={Settings2} title="الخط والقائمة والحواف">
                  <Field label="نوع الخط">
                    <div className="grid sm:grid-cols-3 gap-2">
                      {FONT_OPTIONS.map((f) => (
                        <button key={f.value} type="button" onClick={() => setOpt("appearance", "font", f.value)} className={cn("rounded-xl border p-3 text-right", o!.appearance.font === f.value ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}>
                          <span className="block text-lg" style={{ fontFamily: f.value === "cairo" ? "Cairo" : f.value === "tajawal" ? "Tajawal" : "IBM Plex Sans Arabic" }}>حجز القاعات ١٢٣</span>
                          <span className="text-xs text-muted-foreground">{f.label}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="نمط القائمة الجانبية">
                      <div className="grid grid-cols-3 gap-2">
                        {SIDEBAR_STYLES.map((s) => (
                          <button key={s.value} type="button" onClick={() => setOpt("appearance", "sidebarStyle", s.value)} className={cn("rounded-xl border p-2 text-center", o!.appearance.sidebarStyle === s.value ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}>
                            <span className={cn("block h-10 rounded-md mb-1.5 border", s.value === "light" ? "bg-muted" : s.value === "dark" ? "bg-slate-900" : "bg-primary")} />
                            <span className="text-xs">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="شكل الحواف">
                      <div className="grid grid-cols-3 gap-2">
                        {([["sharp", "حادة", "rounded-sm"], ["normal", "متوسطة", "rounded-lg"], ["round", "دائرية", "rounded-2xl"]] as const).map(([v, l, r]) => (
                          <button key={v} type="button" onClick={() => setOpt("appearance", "radius", v)} className={cn("rounded-xl border p-2 text-center", o!.appearance.radius === v ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}>
                            <span className={cn("block h-10 border-2 border-primary/60 bg-primary/10 mb-1.5", r)} />
                            <span className="text-xs">{l}</span>
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <CheckRow checked={o!.appearance.darkByDefault} onChange={(v) => setOpt("appearance", "darkByDefault", v)} title="الوضع الداكن افتراضياً" description="للمستخدمين الذين لم يختاروا وضعاً بأنفسهم" />
                    <CheckRow checked={o!.appearance.allowUserCustomization} onChange={(v) => setOpt("appearance", "allowUserCustomization", v)} title="السماح للمستخدم بتخصيص المظهر" description="عند إلغائها يُفرض لون وخط المنصة على الجميع" />
                  </div>
                </Section>
              </>
            )}

            {tab === "booking" && (
              <>
                <Section icon={CalendarCog} title="أوقات الحجز" description="تُطبَّق على طلبات الجهات؛ مدير العلاقات يستطيع الحجز خارجها">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field label="بداية الدوام"><Input type="time" value={b!.workingHoursStart} onChange={(e) => setBase("workingHoursStart", e.target.value)} dir="ltr" /></Field>
                    <Field label="نهاية الدوام"><Input type="time" value={b!.workingHoursEnd} onChange={(e) => setBase("workingHoursEnd", e.target.value)} dir="ltr" /></Field>
                    <Field label="فواصل اختيار الوقت">
                      <Select value={String(o!.booking.slotStepMinutes)} onValueChange={(v) => setOpt("booking", "slotStepMinutes", Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[10, 15, 30, 60].map((m) => <SelectItem key={m} value={String(m)}>كل {m} دقيقة</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <NumberField label="أقصى مدة يومية" value={o!.booking.maxDurationHours} onChange={(v) => setOpt("booking", "maxDurationHours", v)} min={0} max={24} suffix="ساعة" hint="0 = بلا حد" />
                  </div>
                  <Field label="أيام العطلة الأسبوعية">
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS_AR.map((d, i) => {
                        const on = o!.booking.weekendDays.includes(i);
                        return (
                          <label key={d} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer", on && "border-primary/50 bg-primary/5")}>
                            <Checkbox checked={on} onCheckedChange={(v) => setOpt("booking", "weekendDays", v === true ? [...o!.booking.weekendDays, i].sort() : o!.booking.weekendDays.filter((x) => x !== i))} />
                            {d}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                  <CheckRow checked={o!.booking.blockWeekends} onChange={(v) => setOpt("booking", "blockWeekends", v)} title="منع الجهات من الحجز في أيام العطلة الأسبوعية" />
                </Section>

                <Section icon={ClipboardList} title="شروط الطلب">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NumberField label="الحد الأدنى لتقديم الطلب مسبقاً" value={o!.booking.minAdvanceHours} onChange={(v) => setOpt("booking", "minAdvanceHours", v)} min={0} max={720} suffix="ساعة" hint="0 = يمكن الحجز لنفس اليوم" />
                    <NumberField label="أقصى مدة للحجز المسبق" value={o!.booking.maxAdvanceDays} onChange={(v) => setOpt("booking", "maxAdvanceDays", v)} min={1} max={730} suffix="يوم" />
                    <NumberField label="مهلة طلبات الضيافة" value={o!.booking.cateringLeadHours} onChange={(v) => setOpt("booking", "cateringLeadHours", v)} min={0} max={240} suffix="ساعة" />
                    <NumberField label="تنبيه الطلبات المتأخرة بعد" value={b!.overdueRequestHours} onChange={(v) => setBase("overdueRequestHours", v)} min={1} max={720} suffix="ساعة" />
                    <NumberField label="أقصى عدد أسابيع للتكرار" value={o!.booking.maxRecurringWeeks} onChange={(v) => setOpt("booking", "maxRecurringWeeks", v)} min={1} max={52} suffix="أسبوع" />
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <CheckRow checked={o!.booking.allowRecurring} onChange={(v) => setOpt("booking", "allowRecurring", v)} title="السماح بالحجز المتكرر أسبوعياً" />
                    <CheckRow checked={o!.booking.requireAttendees} onChange={(v) => setOpt("booking", "requireAttendees", v)} title="عدد الحضور إلزامي" />
                    <CheckRow checked={o!.booking.requireCoordinator} onChange={(v) => setOpt("booking", "requireCoordinator", v)} title="بيانات المنسق إلزامية" />
                  </div>
                </Section>

                <Section icon={Settings2} title="القوائم المستخدمة في نموذج الحجز">
                  <Field label="أنواع النشاط"><ListEditor items={o!.booking.activityTypes} onChange={(v) => setOpt("booking", "activityTypes", v)} placeholder="نوع نشاط جديد" /></Field>
                  <Field label="ترتيبات الجلوس"><ListEditor items={o!.booking.seatingLayouts} onChange={(v) => setOpt("booking", "seatingLayouts", v)} placeholder="ترتيب جلوس جديد" /></Field>
                </Section>
              </>
            )}

            {tab === "notifications" && (
              <>
                <Section icon={Bell} title="التذكير بمواعيد الحجز">
                  <div className="grid md:grid-cols-2 gap-3">
                    <CheckRow checked={o!.notifications.reminderEnabled} onChange={(v) => setOpt("notifications", "reminderEnabled", v)} title="إرسال تذكير قبل موعد الحجز" description="يصل إشعار للجهة صاحبة الحجز" />
                    <CheckRow checked={o!.notifications.remindManagersForPreparation} onChange={(v) => setOpt("notifications", "remindManagersForPreparation", v)} title="تذكير مدير العلاقات بالتجهيز" description="عند وجود ضيافة أو تجهيزات أو ترتيب جلوس مطلوب" />
                  </div>
                  <div className="max-w-xs"><NumberField label="وقت التذكير قبل الموعد" value={o!.notifications.reminderHoursBefore} onChange={(v) => setOpt("notifications", "reminderHoursBefore", v)} min={1} max={168} suffix="ساعة" /></div>
                </Section>
                <Section icon={Wrench} title="الصيانة وأثرها على الحجوزات">
                  <div className="grid md:grid-cols-2 gap-3">
                    <CheckRow checked={o!.maintenance.urgentBlocksHall} onChange={(v) => setOpt("maintenance", "urgentBlocksHall", v)} title="الصيانة العاجلة توقف القاعة تلقائياً" description="تتحول القاعة إلى «تحت الصيانة» حتى إنجاز العمل" />
                    <CheckRow checked={o!.maintenance.highBlocksHall} onChange={(v) => setOpt("maintenance", "highBlocksHall", v)} title="الصيانة عالية الأولوية توقف القاعة أيضاً" />
                    <CheckRow checked={o!.notifications.notifyAffectedOnMaintenance} onChange={(v) => setOpt("notifications", "notifyAffectedOnMaintenance", v)} title="إشعار أصحاب الحجوزات المتأثرة" description="مع اقتراح قاعات بديلة متاحة في نفس الموعد" />
                  </div>
                  <div className="max-w-xs"><NumberField label="فترة فحص الحجوزات المتأثرة" value={o!.maintenance.affectedWindowDays} onChange={(v) => setOpt("maintenance", "affectedWindowDays", v)} min={1} max={365} suffix="يوم" hint="للصيانة المفتوحة دون تاريخ انتهاء" /></div>
                </Section>
              </>
            )}

            {tab === "display" && (
              <>
                <Section icon={MonitorPlay} title="شاشات العرض" description="انتقلت إعدادات شاشات العرض وشريط الأخبار إلى تبويب مستقل">
                  <Button type="button" variant="outline" size="sm" onClick={() => setTab("screens")}><MonitorPlay className="w-3.5 h-3.5" />فتح إعدادات شاشات العرض</Button>
                </Section>
                <Section icon={Printer} title="ترويسة المطبوعات" description="تظهر أعلى إشعار الحجز والتقارير المطبوعة (يمين الصفحة)">
                  <div className="grid md:grid-cols-3 gap-4">
                    <Field label="السطر الأول"><Input value={o!.print.headerLine1} onChange={(e) => setOpt("print", "headerLine1", e.target.value)} placeholder="جمهورية العراق" /></Field>
                    <Field label="السطر الثاني"><Input value={o!.print.headerLine2} onChange={(e) => setOpt("print", "headerLine2", e.target.value)} placeholder="وزارة النفط" /></Field>
                    <Field label="السطر الثالث"><Input value={o!.print.headerLine3} onChange={(e) => setOpt("print", "headerLine3", e.target.value)} placeholder="شركة ..." /></Field>
                    <Field label="صفة الموقِّع على إشعار الحجز"><Input value={o!.print.signatureTitle} onChange={(e) => setOpt("print", "signatureTitle", e.target.value)} /></Field>
                    <Field label="ملاحظة أسفل المطبوعات" className="md:col-span-2"><Input value={o!.print.footerNote} onChange={(e) => setOpt("print", "footerNote", e.target.value)} /></Field>
                  </div>
                  <CheckRow checked={o!.print.showQr} onChange={(v) => setOpt("print", "showQr", v)} title="طباعة رمز QR للتحقق على إشعار الحجز" description="يفتح صفحة تؤكد صحة الحجز وحالته الحالية" />
                </Section>
              </>
            )}

            {tab === "screens" && <ScreenSettings d={o!.display} set={(k, v) => setOpt("display", k, v)} logo={b!.logoUrl || `/icons/icon-192.png?v=${opts?.icon.version ?? ""}`} />}

            {tab === "security" && (
              <Section icon={ShieldCheck} title="سياسة كلمات المرور" description="الحد الأدنى 6 رموز، ويختار المستخدم تركيبتها (أرقام أو حروف أو رموز)">
                <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                  <NumberField label="الحد الأدنى لطول كلمة المرور" value={b!.passwordMinLength} onChange={(v) => setBase("passwordMinLength", v)} min={6} max={64} suffix="رموز" />
                  <NumberField label="انتهاء صلاحية كلمة المرور" value={b!.passwordExpiryDays ?? 0} onChange={(v) => setBase("passwordExpiryDays", v || null)} min={0} max={365} suffix="يوم" hint="0 = لا تنتهي" />
                </div>
                <CheckRow checked={b!.passwordRequireSpecial} onChange={(v) => setBase("passwordRequireSpecial", v)} title="اشتراط رمز خاص (مثل @ # !)" description="اختياري — غير مفعّل افتراضياً" />
              </Section>
            )}

            {tab === "backup" && <BackupSettings b={o!.backup} saved={opts!.backup} set={(k, v) => setOpt("backup", k, v)} />}

            {tab === "data" && <FactoryReset offerBackup={opts?.backup.offerBeforeReset ?? true} onOpenBackups={() => setTab("backup")} />}
          </div>
        )}
      </div>

      {dirty && (
        <div className="fixed bottom-4 inset-x-4 lg:right-[calc(17rem+1.5rem)] lg:left-6 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-2.5">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />لديك تغييرات غير محفوظة</span>
            <Button size="sm" variant="ghost" onClick={() => { if (base) setB(base); if (opts) { const { icon: _i, ...r } = opts; setO(r); } }}><RotateCcw className="w-4 h-4" />تراجع عن التغييرات</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}حفظ التغييرات</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- factory reset (unchanged behaviour, new layout) ---------------- */

function FactoryReset({ offerBackup, onOpenBackups }: { offerBackup: boolean; onOpenBackups: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const full = useFactoryResetFull();
  const notifications = useFactoryResetNotifications();
  const accounts = useFactoryResetAccounts();
  const bookings = useFactoryResetBookings();
  const completed = useFactoryResetCompletedBookings();
  const audit = useFactoryResetAuditLog();
  const reviews = useFactoryResetReviews();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [armed, setArmed] = useState(false); // full reset: second button press confirms
  const [withBackup, setWithBackup] = useState(offerBackup);
  const [phase, setPhase] = useState<"idle" | "backup" | "run">("idle");
  const openAction = (key: string) => {
    setActiveKey(key);
    setArmed(false);
    setWithBackup(offerBackup);
  };

  const actions = [
    { key: "notifications", icon: Bell, title: "حذف الإشعارات", description: "حذف جميع الإشعارات لكل المستخدمين", mutation: notifications },
    { key: "reviews", icon: Star, title: "حذف التقييمات", description: "حذف جميع تقييمات القاعات", mutation: reviews },
    { key: "audit-log", icon: History, title: "حذف سجل الأحداث", description: "حذف سجل العمليات بالكامل", mutation: audit },
    { key: "completed-bookings", icon: CheckCircle2, title: "حذف الحجوزات المكتملة", description: "الحجوزات المنتهية فقط وتقييماتها", mutation: completed },
    { key: "bookings", icon: ClipboardList, title: "حذف جميع الطلبات", description: "كل طلبات الحجز بجميع حالاتها", mutation: bookings, danger: true },
    { key: "accounts", icon: Users, title: "حذف الحسابات", description: "جميع الحسابات عدا مدير النظام الأساسي، مع بياناتها", mutation: accounts, danger: true },
    { key: "full", icon: AlertTriangle, title: "إعادة ضبط المصنع الشاملة", description: "محو جميع البيانات والإعدادات عدا مدير النظام الأساسي", mutation: full, danger: true, typed: true },
  ];
  const active = actions.find((a) => a.key === activeKey) ?? null;

  const run = async () => {
    if (!active) return;
    try {
      if (withBackup) {
        setPhase("backup");
        try {
          const b = await backupBeforeReset();
          toast({ title: "أُخذت نسخة احتياطية قبل التنفيذ", description: b.name });
        } catch (e) {
          toast({ variant: "destructive", title: "تعذّر أخذ النسخة الاحتياطية — لم يُنفَّذ الحذف", description: errorMessage(e, "يمكنك إلغاء تحديد خيار النسخ والمتابعة") });
          setPhase("idle");
          return;
        }
      }
      setPhase("run");
      const r = (await active.mutation.mutateAsync({} as never)) as { message?: string };
      toast({ title: r?.message || "تم التنفيذ" });
      qc.invalidateQueries();
      setActiveKey(null);
      setArmed(false);
    } catch {
      toast({ variant: "destructive", title: "فشل التنفيذ" });
    } finally {
      setPhase("idle");
    }
  };

  return (
    <>
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 dark:bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1">رسالة التأكيد تقترح أخذ نسخة احتياطية قبل التنفيذ (اختياري). لاستعادة البيانات لاحقاً استخدم تبويب «النسخ الاحتياطي».</p>
        <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={onOpenBackups}><DatabaseBackup className="w-3.5 h-3.5" />النسخ الاحتياطي</Button>
      </div>
      <Card className="border-red-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />حذف البيانات وإعادة الضبط</CardTitle>
          <CardDescription>إجراءات نهائية — استخدمها بحذر</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {actions.map((a) => (
            <div key={a.key} className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border", a.key === "full" ? "bg-red-50 border-red-300 dark:bg-red-500/10" : "bg-muted/30")}>
              <div className="flex items-start gap-3">
                <a.icon className={cn("w-4 h-4 mt-0.5", a.danger ? "text-red-600" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50 shrink-0 self-start sm:self-auto" onClick={() => openAction(a.key)}>
                <RotateCcw className="w-3.5 h-3.5" />تنفيذ
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <AlertDialog open={!!active} onOpenChange={(v) => { if (!v && phase === "idle") { setActiveKey(null); setArmed(false); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{active?.title}</AlertDialogTitle>
            <AlertDialogDescription>{active?.description}. لا يمكن التراجع عن هذا الإجراء إلا باسترجاع نسخة احتياطية.</AlertDialogDescription>
          </AlertDialogHeader>
          <CheckRow
            checked={withBackup}
            onChange={setWithBackup}
            title="أخذ نسخة احتياطية قبل التنفيذ"
            description={withBackup ? "موصى به — تستطيع استعادة البيانات منها لاحقاً من تبويب «النسخ الاحتياطي»" : "لن تُؤخذ نسخة — لن تتمكن من استعادة ما سيُحذف"}
          />
          {active?.typed && armed && (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>تأكيد أخير: ستُمحى كل البيانات والإعدادات. اضغط «تأكيد المحو النهائي» للمتابعة، أو «إلغاء» للتراجع.</span>
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={phase !== "idle"}>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled={phase !== "idle"} onClick={(e) => { e.preventDefault(); if (active?.typed && !armed) { setArmed(true); return; } run(); }}>
              {phase !== "idle" && <Loader2 className="w-4 h-4 animate-spin" />}
              {phase === "backup" ? "جارٍ أخذ النسخة..." : phase === "run" ? "جاري التنفيذ..." : active?.typed && !armed ? "متابعة" : active?.typed ? "تأكيد المحو النهائي" : withBackup ? "نسخ احتياطي ثم تنفيذ" : "تنفيذ بدون نسخة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
