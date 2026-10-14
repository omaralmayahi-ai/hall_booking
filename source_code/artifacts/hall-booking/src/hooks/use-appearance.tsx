import { useCallback, useEffect, useState } from "react";

/** Visual preferences (same options as ناظم): colour theme, dark mode, font, sidebar style. Stored per browser. */
export const THEME_OPTIONS = [
  { value: "blue", label: "أزرق (افتراضي)", color: "#1366c4" },
  { value: "royal-blue", label: "أزرق ملكي", color: "#1E3A8A" },
  { value: "crimson", label: "خمري ملكي", color: "#881337" },
  { value: "emerald", label: "أخضر زمردي", color: "#065F46" },
  { value: "deep-purple", label: "بنفسجي غامق", color: "#581C87" },
  { value: "charcoal", label: "رمادي احترافي", color: "#334155" },
  { value: "warm-orange", label: "برتقالي دافئ", color: "#C2410C" },
  { value: "azure", label: "أزرق أردوازي", color: "#0369A1" },
  { value: "teal", label: "أخضر مائي", color: "#0D9488" },
] as const;

export const FONT_OPTIONS = [
  { value: "cairo", label: "Cairo — القاهرة" },
  { value: "ibm-plex", label: "IBM Plex Arabic" },
  { value: "tajawal", label: "Tajawal — تجوال" },
] as const;

export const SIDEBAR_STYLES = [
  { value: "light", label: "فاتح" },
  { value: "primary", label: "بلون النظام" },
  { value: "dark", label: "داكن" },
] as const;

interface Appearance {
  theme: string;
  dark: boolean;
  font: string;
  sidebarStyle: string;
}

interface SystemAppearance {
  theme: string;
  font: string;
  sidebarStyle: string;
  darkByDefault: boolean;
  allowUserCustomization: boolean;
  radius: string;
}

const KEY = "appearance";
const SYSTEM_KEY = "appearance:system";
const CHANGE_EVENT = "appearance:changed";
const DEFAULTS: Appearance = { theme: "blue", dark: false, font: "cairo", sidebarStyle: "light" };

function readJson<T>(key: string): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as Partial<T>;
  } catch {
    return {};
  }
}

function readSystem(): Partial<SystemAppearance> {
  return readJson<SystemAppearance>(SYSTEM_KEY);
}

/** Effective appearance = built-in defaults < organisation defaults (admin) < the user's own choices (if allowed). */
function read(): Appearance {
  const sys = readSystem();
  const base: Appearance = {
    theme: sys.theme || DEFAULTS.theme,
    font: sys.font || DEFAULTS.font,
    sidebarStyle: sys.sidebarStyle || DEFAULTS.sidebarStyle,
    dark: sys.darkByDefault ?? DEFAULTS.dark,
  };
  const user = readJson<Appearance>(KEY);
  if (sys.allowUserCustomization === false) return { ...base, dark: user.dark ?? base.dark };
  return { ...base, ...user };
}

export function isAppearanceLocked(): boolean {
  return readSystem().allowUserCustomization === false;
}

export function applyAppearance(a: Appearance = read()) {
  const el = document.documentElement;
  if (a.theme && a.theme !== "blue") el.setAttribute("data-theme", a.theme);
  else el.removeAttribute("data-theme");
  el.classList.toggle("dark", !!a.dark);
  el.setAttribute("data-font", a.font || "cairo");
  el.setAttribute("data-sidebar-style", a.sidebarStyle || "light");
  el.setAttribute("data-radius", readSystem().radius || "normal");
}

/** Called when the public settings arrive: store the organisation defaults and re-apply. */
export function setSystemAppearance(sys: SystemAppearance | undefined) {
  if (!sys) return;
  const prev = localStorage.getItem(SYSTEM_KEY);
  const next = JSON.stringify(sys);
  if (prev === next) return;
  try {
    localStorage.setItem(SYSTEM_KEY, next);
  } catch {
    /* ignore */
  }
  applyAppearance();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAppearance() {
  const [state, setState] = useState<Appearance>(read);
  const [locked, setLocked] = useState(isAppearanceLocked);
  useEffect(() => {
    const sync = () => {
      setState(read());
      setLocked(isAppearanceLocked());
    };
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  const update = useCallback((patch: Partial<Appearance>) => {
    const user = { ...readJson<Appearance>(KEY), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    const next = read();
    applyAppearance(next);
    setState(next);
  }, []);
  const resetToDefault = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    const next = read();
    applyAppearance(next);
    setState(next);
  }, []);
  return { ...state, locked, update, resetToDefault };
}
