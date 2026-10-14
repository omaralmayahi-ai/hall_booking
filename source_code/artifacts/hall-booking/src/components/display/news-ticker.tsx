import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface TickerConfig {
  tickerEnabled: boolean;
  tickerItems: string[];
  tickerMode: "scroll" | "static";
  tickerSpeed: "slow" | "normal" | "fast";
  tickerStaticSeconds: number;
  tickerShowLogo: boolean;
  tickerLabel: string;
  tickerTextColor: string;
  tickerBgColor: string;
  tickerLabelColor: string;
  tickerSize: "md" | "lg" | "xl";
}

const SPEED_PX: Record<TickerConfig["tickerSpeed"], number> = { slow: 45, normal: 80, fast: 130 };
const SIZE = {
  md: { bar: "h-12", text: "text-base", logo: "h-7 w-7", label: "text-sm px-4" },
  lg: { bar: "h-14", text: "text-xl", logo: "h-8 w-8", label: "text-base px-5" },
  xl: { bar: "h-[4.5rem]", text: "text-[1.7rem]", logo: "h-10 w-10", label: "text-xl px-6" },
} as const;

function Item({ text, logo, size }: { text: string; logo: string | null; size: (typeof SIZE)[keyof typeof SIZE] }) {
  return (
    <span className="inline-flex items-center gap-3 shrink-0 whitespace-nowrap">
      {logo && <img src={logo} alt="" className={cn("rounded-full bg-white object-contain p-0.5 shadow-sm", size.logo)} />}
      <span className={cn("font-semibold leading-none", size.text)}>{text}</span>
    </span>
  );
}

/** News-channel style ticker: label box + logo before every item, scrolling or fixed. */
export function NewsTicker({ config, logoUrl, className, preview }: { config: TickerConfig; logoUrl: string | null; className?: string; preview?: boolean }) {
  const items = config.tickerItems.map((x) => x.trim()).filter(Boolean);
  const size = SIZE[config.tickerSize] ?? SIZE.lg;
  const logo = config.tickerShowLogo ? logoUrl : null;
  if (!config.tickerEnabled || !items.length) return null;
  return (
    <div
      className={cn("relative flex items-stretch overflow-hidden select-none shadow-[0_-8px_30px_rgba(0,0,0,0.25)]", size.bar, className)}
      style={{ backgroundColor: config.tickerBgColor, color: config.tickerTextColor }}
      dir="rtl"
    >
      {config.tickerLabel.trim() && (
        <div
          className={cn("relative z-10 flex items-center gap-2 font-extrabold shrink-0 text-white", size.label)}
          style={{ backgroundColor: config.tickerLabelColor, clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)", paddingLeft: "1.75rem" }}
        >
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-white" />
          </span>
          {config.tickerLabel}
        </div>
      )}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {config.tickerMode === "static" ? (
          <StaticTrack items={items} logo={logo} size={size} seconds={config.tickerStaticSeconds} />
        ) : (
          <ScrollTrack items={items} logo={logo} size={size} speed={SPEED_PX[config.tickerSpeed] ?? 80} preview={preview} />
        )}
        {/* soft fade at both edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10" style={{ background: `linear-gradient(to right, ${config.tickerBgColor}, transparent)` }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6" style={{ background: `linear-gradient(to left, ${config.tickerBgColor}, transparent)` }} />
      </div>
    </div>
  );
}

function ScrollTrack({ items, logo, size, speed, preview }: { items: string[]; logo: string | null; size: (typeof SIZE)[keyof typeof SIZE]; speed: number; preview?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const [repeat, setRepeat] = useState(1);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const boxW = box.current?.clientWidth ?? 0;
      const copyW = copy.current?.scrollWidth ?? 0;
      if (!boxW || !copyW) return;
      const single = copyW / repeat;
      const need = Math.max(1, Math.ceil(boxW / single));
      if (need !== repeat) setRepeat(need);
      else setWidth(copyW);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [items.join("|"), logo, repeat, size.text]);

  const list = Array.from({ length: repeat }, () => items).flat();
  const content = (
    <>
      {list.map((t, i) => (
        <span key={i} className="inline-flex items-center shrink-0">
          <Item text={t} logo={logo} size={size} />
          <span className="mx-8 opacity-50 text-2xl leading-none">◆</span>
        </span>
      ))}
    </>
  );
  const style = { "--ticker-shift": `${width}px`, animationDuration: `${Math.max(8, width / speed)}s` } as CSSProperties;
  return (
    <div ref={box} className="absolute inset-0 flex items-center overflow-hidden">
      <div className={cn("flex items-center w-max pr-6", width ? "ticker-track" : "", preview && "ticker-track--hover-pause")} style={style}>
        <div ref={copy} className="flex items-center shrink-0">{content}</div>
        <div className="flex items-center shrink-0" aria-hidden>{content}</div>
      </div>
    </div>
  );
}

function StaticTrack({ items, logo, size, seconds }: { items: string[]; logo: string | null; size: (typeof SIZE)[keyof typeof SIZE]; seconds: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), Math.max(3, seconds) * 1000);
    return () => clearInterval(t);
  }, [items.join("|"), seconds]);
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div key={i} className="ticker-fade flex items-center justify-center max-w-full overflow-hidden">
        <Item text={items[i % items.length]} logo={logo} size={size} />
      </div>
      {items.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
          {items.map((_, k) => (
            <span key={k} className={cn("h-1 rounded-full transition-all", k === i % items.length ? "w-4 bg-current" : "w-1.5 bg-current opacity-40")} />
          ))}
        </div>
      )}
    </div>
  );
}
