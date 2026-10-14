import { useState } from "react";
import {
  ArrowDown, ArrowUp, Check, ExternalLink, Gauge, LayoutDashboard, MonitorPlay, Newspaper, Palette, Pencil, Plus, Rows3, Trash2, Type, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewsTicker, type TickerConfig } from "@/components/display/news-ticker";
import type { PlatformOptions } from "@/lib/options";
import { cn } from "@/lib/utils";
import { CheckRow, Field, NumberField, Section } from "./settings-ui";

type D = PlatformOptions["display"];
type Setter = <K extends keyof D>(key: K, value: D[K]) => void;

/** Card-style single choice (the platform avoids toggle switches). */
function Choice<T extends string>({ value, onChange, options, cols = 3 }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string; preview?: React.ReactNode }[]; cols?: number }) {
  return (
    <div className={cn("grid gap-2", cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn("relative rounded-xl border p-3 text-right transition-all", on ? "border-primary ring-2 ring-primary/25 bg-primary/[0.04]" : "hover:bg-muted/50")}
          >
            {on && <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span>}
            {o.preview}
            <span className="block text-sm font-semibold">{o.label}</span>
            {o.hint && <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const SWATCHES = ["#ffffff", "#0f172a", "#0b3a6e", "#1d4ed8", "#0e7490", "#047857", "#c8102e", "#b91c1c", "#d97706", "#facc15", "#7c3aed", "#334155"];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <label className="relative w-11 h-10 rounded-lg border overflow-hidden cursor-pointer shrink-0" style={{ backgroundColor: value }} title="اختيار لون مخصص">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <Input value={value} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)} dir="ltr" className="font-mono text-left w-28" maxLength={7} />
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn("w-6 h-6 rounded-md border shadow-sm transition-transform hover:scale-110", value.toLowerCase() === c && "ring-2 ring-primary ring-offset-1")}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
    </Field>
  );
}

const PRESETS: { name: string; bg: string; text: string; label: string }[] = [
  { name: "أزرق رسمي", bg: "#0b3a6e", text: "#ffffff", label: "#c8102e" },
  { name: "أحمر إخباري", bg: "#b91c1c", text: "#ffffff", label: "#0f172a" },
  { name: "ذهبي على داكن", bg: "#0f172a", text: "#facc15", label: "#d97706" },
  { name: "أخضر هادئ", bg: "#047857", text: "#ffffff", label: "#0f172a" },
  { name: "فاتح", bg: "#ffffff", text: "#0f172a", label: "#1d4ed8" },
];

function TickerItems({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v].slice(0, 20));
    setDraft("");
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.length ? (
        <ol className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2">
              <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              {editing === i ? (
                <>
                  <Input
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); const v = editText.trim(); if (v) onChange(items.map((x, k) => (k === i ? v : x))); setEditing(null); }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-8"
                  />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { const v = editText.trim(); if (v) onChange(items.map((x, k) => (k === i ? v : x))); setEditing(null); }} aria-label="حفظ النص"><Check className="w-4 h-4 text-emerald-600" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditing(null)} aria-label="إلغاء"><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 text-sm truncate">{t}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="تقديم"><ArrowUp className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="تأخير"><ArrowDown className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditing(i); setEditText(t); }} aria-label="تعديل"><Pencil className="w-4 h-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="حذف"><Trash2 className="w-4 h-4" /></Button>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4 text-center">لا توجد عبارات بعد — أضف أول عبارة لتظهر في الشريط</p>
      )}
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب عبارة جديدة، مثل: شركة نفط الوسط ترحب بكم" maxLength={300} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" onClick={add} disabled={!draft.trim() || items.length >= 20}><Plus className="w-4 h-4" />إضافة</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">حتى 20 عبارة. تظهر بالترتيب، ويسبق كل عبارة شعار الجهة (من «الهوية البصرية») مع فاصل بينها.</p>
    </div>
  );
}

export function ScreenSettings({ d, set, logo }: { d: D; set: Setter; logo: string }) {
  return (
    <>
      <Section icon={MonitorPlay} title="شاشات العرض" description="شاشة الاستقبال تعرض حالة جميع القاعات، وشاشة الباب تعرض قاعة واحدة">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => window.open("/display", "_blank")}><ExternalLink className="w-3.5 h-3.5" />فتح شاشة الاستقبال</Button>
          <p className="text-xs text-muted-foreground">شاشة كل قاعة تُفتح من زر 🖥 في «إدارة القاعات». احفظ التغييرات لتظهر على الشاشات خلال دقيقة.</p>
        </div>
        <Field label="نمط الشاشة">
          <Choice
            value={d.theme}
            onChange={(v) => set("theme", v)}
            options={[
              { value: "midnight", label: "ليلي", hint: "خلفية داكنة أنيقة — الأفضل للشاشات الكبيرة", preview: <span className="block h-10 rounded-lg mb-2 bg-[#050816] ring-1 ring-black/10 bg-[radial-gradient(circle_at_80%_0,rgba(56,189,248,.35),transparent_60%)]" /> },
              { value: "brand", label: "بلون المنصة", hint: "يتبع لون المنصة المختار في «المظهر»", preview: <span className="block h-10 rounded-lg mb-2 bg-primary" /> },
              { value: "light", label: "فاتح", hint: "خلفية فاتحة للأماكن المضاءة", preview: <span className="block h-10 rounded-lg mb-2 bg-slate-100 ring-1 ring-slate-200" /> },
            ]}
          />
        </Field>
        <Field label="العبارة أسفل اسم المنصة"><Input value={d.subtitleAr} onChange={(e) => set("subtitleAr", e.target.value)} placeholder="حالة القاعات اليوم" maxLength={120} /></Field>
        <div className="grid md:grid-cols-2 gap-3">
          <CheckRow checked={d.showStats} onChange={(v) => set("showStats", v)} title="لوحة الأرقام أعلى الشاشة" description="عدد القاعات المتاحة والمشغولة وتحت الصيانة وحجوزات اليوم" />
          <CheckRow checked={d.showTimeline} onChange={(v) => set("showTimeline", v)} title="الخط الزمني لليوم" description="شريط ساعات الدوام مع الحجوزات ومؤشر الوقت الحالي" />
          <CheckRow checked={d.showNext} onChange={(v) => set("showNext", v)} title="إظهار الحجز التالي لكل قاعة" />
          <CheckRow checked={d.showDepartment} onChange={(v) => set("showDepartment", v)} title="إظهار اسم الجهة" />
          <CheckRow checked={d.showActivity} onChange={(v) => set("showActivity", v)} title="إظهار نوع النشاط" />
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <NumberField label="تحديث البيانات كل" value={d.refreshSeconds} onChange={(v) => set("refreshSeconds", v)} min={15} max={600} suffix="ثانية" />
          <NumberField label="عدد القاعات في الصفحة" value={d.hallsPerPage} onChange={(v) => set("hallsPerPage", v)} min={0} max={24} suffix="قاعة" hint="0 = تلقائي حسب حجم الشاشة، وتتقلب الصفحات عند وجود قاعات أكثر" />
          <NumberField label="مدة عرض الصفحة" value={d.pageSeconds} onChange={(v) => set("pageSeconds", v)} min={5} max={120} suffix="ثانية" />
        </div>
      </Section>

      <Section icon={Newspaper} title="شريط الأخبار أسفل الشاشة" description="شريط بنمط النشرات الإخبارية: عنوان مميز، وشعار قبل كل عبارة">
        <CheckRow checked={d.tickerEnabled} onChange={(v) => set("tickerEnabled", v)} title="إظهار شريط الأخبار" description="يظهر على شاشة الاستقبال وشاشات أبواب القاعات" />

        {/* live preview */}
        <div className="rounded-2xl overflow-hidden border bg-[#050816]">
          <div className="h-16 flex items-center justify-center text-xs text-white/40">معاينة مباشرة — مرّر المؤشر فوق الشريط لإيقافه</div>
          {d.tickerEnabled && d.tickerItems.length ? (
            <NewsTicker config={d as TickerConfig} logoUrl={logo} preview />
          ) : (
            <div className="h-12 flex items-center justify-center text-sm text-white/50 border-t border-white/10">{d.tickerEnabled ? "أضف عبارة واحدة على الأقل" : "الشريط مخفي"}</div>
          )}
        </div>

        <Field label="العبارات"><TickerItems items={d.tickerItems} onChange={(v) => set("tickerItems", v)} /></Field>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="عنوان الشريط (المربع الملون)" hint="مثل: إعلانات، أخبار، تنويه — اتركه فارغاً لإخفائه">
            <Input value={d.tickerLabel} onChange={(e) => set("tickerLabel", e.target.value)} maxLength={40} />
          </Field>
          <div className="pt-6"><CheckRow checked={d.tickerShowLogo} onChange={(v) => set("tickerShowLogo", v)} title="الشعار قبل كل عبارة" description="شعار الجهة من «الهوية البصرية»" /></div>
        </div>

        <Field label="حركة الشريط">
          <Choice
            cols={2}
            value={d.tickerMode}
            onChange={(v) => set("tickerMode", v)}
            options={[
              { value: "scroll", label: "متحرك", hint: "تمر العبارات باستمرار كالنشرات الإخبارية العربية" },
              { value: "static", label: "ثابت", hint: "عبارة واحدة في المنتصف تتبدل تلقائياً" },
            ]}
          />
        </Field>

        {d.tickerMode === "scroll" ? (
          <Field label="سرعة الحركة">
            <Choice
              value={d.tickerSpeed}
              onChange={(v) => set("tickerSpeed", v)}
              options={[
                { value: "slow", label: "بطيئة", preview: <Gauge className="w-4 h-4 mb-1 text-muted-foreground" /> },
                { value: "normal", label: "متوسطة", preview: <Gauge className="w-4 h-4 mb-1 text-primary" /> },
                { value: "fast", label: "سريعة", preview: <Gauge className="w-4 h-4 mb-1 text-rose-500" /> },
              ]}
            />
          </Field>
        ) : (
          <div className="max-w-xs"><NumberField label="تبديل العبارة كل" value={d.tickerStaticSeconds} onChange={(v) => set("tickerStaticSeconds", v)} min={3} max={60} suffix="ثانية" /></div>
        )}

        <Field label="حجم النص">
          <Choice
            value={d.tickerSize}
            onChange={(v) => set("tickerSize", v)}
            options={[
              { value: "md", label: "متوسط", preview: <Type className="w-3.5 h-3.5 mb-1" /> },
              { value: "lg", label: "كبير", preview: <Type className="w-4.5 h-4.5 mb-1" /> },
              { value: "xl", label: "كبير جداً", preview: <Type className="w-5.5 h-5.5 mb-1" /> },
            ]}
          />
        </Field>

        <div className="space-y-3">
          <p className="text-sm font-medium flex items-center gap-1.5"><Palette className="w-4 h-4 text-primary" />الألوان</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => { set("tickerBgColor", p.bg); set("tickerTextColor", p.text); set("tickerLabelColor", p.label); }}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted/50"
              >
                <span className="flex h-4 w-8 rounded overflow-hidden ring-1 ring-black/10">
                  <span className="w-2" style={{ backgroundColor: p.label }} />
                  <span className="flex-1 flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: p.bg, color: p.text }}>أ</span>
                </span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <ColorField label="لون الشريط" value={d.tickerBgColor} onChange={(v) => set("tickerBgColor", v)} />
            <ColorField label="لون النص" value={d.tickerTextColor} onChange={(v) => set("tickerTextColor", v)} />
            <ColorField label="لون مربع العنوان" value={d.tickerLabelColor} onChange={(v) => set("tickerLabelColor", v)} />
          </div>
        </div>
      </Section>

      <Section icon={LayoutDashboard} title="نصائح للعرض" description="">
        <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
          <li className="flex gap-2"><Rows3 className="w-4 h-4 shrink-0 mt-0.5 text-primary" />افتح الشاشة في المتصفح ثم اضغط F11 لملء الشاشة.</li>
          <li className="flex gap-2"><Rows3 className="w-4 h-4 shrink-0 mt-0.5 text-primary" />إذا زاد عدد القاعات على مساحة الشاشة تتقلب الصفحات تلقائياً، ويمكن تحديد العدد يدوياً.</li>
        </ul>
      </Section>
    </>
  );
}
