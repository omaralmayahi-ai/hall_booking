import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Advanced platform options stored as JSON in platform_settings.options.
 * Every read is merged over DEFAULTS, so new keys can be added without a migration.
 */
export interface PlatformOptions {
  identity: {
    systemNameAr: string;
    systemNameEn: string;
    shortNameAr: string;
    organizationAr: string;
    parentOrganizationAr: string;
    taglineAr: string;
    loginWelcomeAr: string;
    loginNoticeAr: string;
    loginBackground: string | null;
    supportPhone: string;
    supportEmail: string;
  };
  appearance: {
    theme: string;
    font: string;
    sidebarStyle: string;
    darkByDefault: boolean;
    allowUserCustomization: boolean;
    radius: "sharp" | "normal" | "round";
  };
  booking: {
    weekendDays: number[];
    blockWeekends: boolean;
    minAdvanceHours: number;
    maxAdvanceDays: number;
    maxDurationHours: number;
    slotStepMinutes: number;
    allowRecurring: boolean;
    maxRecurringWeeks: number;
    requireCoordinator: boolean;
    requireAttendees: boolean;
    cateringLeadHours: number;
    seatingLayouts: string[];
    activityTypes: string[];
  };
  notifications: {
    reminderEnabled: boolean;
    reminderHoursBefore: number;
    remindManagersForPreparation: boolean;
    notifyAffectedOnMaintenance: boolean;
  };
  maintenance: {
    urgentBlocksHall: boolean;
    highBlocksHall: boolean;
    affectedWindowDays: number;
  };
  display: {
    showDepartment: boolean;
    showActivity: boolean;
    refreshSeconds: number;
    tickerAr: string;
  };
  print: {
    headerLine1: string;
    headerLine2: string;
    headerLine3: string;
    signatureTitle: string;
    footerNote: string;
    showQr: boolean;
  };
}

export const DEFAULT_OPTIONS: PlatformOptions = {
  identity: {
    systemNameAr: "منصة حجز القاعات",
    systemNameEn: "Hall Booking Platform",
    shortNameAr: "حجز القاعات",
    organizationAr: "",
    parentOrganizationAr: "",
    taglineAr: "إدارة القاعات والحجوزات",
    loginWelcomeAr: "مرحباً بك في منصة حجز القاعات",
    loginNoticeAr: "",
    loginBackground: null,
    supportPhone: "",
    supportEmail: "",
  },
  appearance: {
    theme: "blue",
    font: "cairo",
    sidebarStyle: "light",
    darkByDefault: false,
    allowUserCustomization: true,
    radius: "normal",
  },
  booking: {
    weekendDays: [5, 6],
    blockWeekends: true,
    minAdvanceHours: 0,
    maxAdvanceDays: 180,
    maxDurationHours: 0,
    slotStepMinutes: 30,
    allowRecurring: true,
    maxRecurringWeeks: 52,
    requireCoordinator: false,
    requireAttendees: false,
    cateringLeadHours: 24,
    seatingLayouts: ["مسرحي", "صفّي (فصل دراسي)", "حرف U", "طاولة اجتماعات", "مجموعات (ورشة عمل)", "مأدبة"],
    activityTypes: ["اجتماع", "ورشة عمل", "دورة تدريبية", "ندوة", "مؤتمر", "احتفالية", "مقابلات", "أخرى"],
  },
  notifications: {
    reminderEnabled: true,
    reminderHoursBefore: 24,
    remindManagersForPreparation: true,
    notifyAffectedOnMaintenance: true,
  },
  maintenance: {
    urgentBlocksHall: true,
    highBlocksHall: false,
    affectedWindowDays: 30,
  },
  display: {
    showDepartment: true,
    showActivity: true,
    refreshSeconds: 60,
    tickerAr: "",
  },
  print: {
    headerLine1: "",
    headerLine2: "",
    headerLine3: "",
    signatureTitle: "مدير العلاقات",
    footerNote: "",
    showQr: true,
  },
};

type Section = keyof PlatformOptions;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const strList = (v: unknown, maxItems = 30) =>
  Array.isArray(v)
    ? Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))).slice(0, maxItems)
    : undefined;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

const THEMES = ["blue", "royal-blue", "crimson", "emerald", "deep-purple", "charcoal", "warm-orange", "azure", "teal"] as const;
const FONTS = ["cairo", "ibm-plex", "tajawal"] as const;
const SIDEBARS = ["light", "primary", "dark"] as const;
const IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

/** Validate a partial options object; unknown / invalid values are dropped (never stored). */
export function sanitizeOptions(input: unknown): Partial<Record<Section, Record<string, unknown>>> {
  if (!isObj(input)) return {};
  const out: Partial<Record<Section, Record<string, unknown>>> = {};
  const put = (section: Section, key: string, value: unknown) => {
    if (value === undefined) return;
    (out[section] ??= {})[key] = value;
  };
  const i = isObj(input.identity) ? input.identity : {};
  for (const k of ["systemNameAr", "systemNameEn", "shortNameAr", "organizationAr", "parentOrganizationAr", "taglineAr", "supportPhone", "supportEmail"]) put("identity", k, str(i[k], 120));
  put("identity", "loginWelcomeAr", str(i.loginWelcomeAr, 200));
  put("identity", "loginNoticeAr", str(i.loginNoticeAr, 500));
  if (i.loginBackground === null || i.loginBackground === "") put("identity", "loginBackground", null);
  else if (typeof i.loginBackground === "string" && IMAGE_RE.test(i.loginBackground) && i.loginBackground.length < 3_000_000) put("identity", "loginBackground", i.loginBackground);

  const a = isObj(input.appearance) ? input.appearance : {};
  put("appearance", "theme", oneOf(a.theme, THEMES));
  put("appearance", "font", oneOf(a.font, FONTS));
  put("appearance", "sidebarStyle", oneOf(a.sidebarStyle, SIDEBARS));
  put("appearance", "darkByDefault", bool(a.darkByDefault));
  put("appearance", "allowUserCustomization", bool(a.allowUserCustomization));
  put("appearance", "radius", oneOf(a.radius, ["sharp", "normal", "round"] as const));

  const b = isObj(input.booking) ? input.booking : {};
  if (Array.isArray(b.weekendDays)) {
    put("booking", "weekendDays", Array.from(new Set(b.weekendDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort());
  }
  put("booking", "blockWeekends", bool(b.blockWeekends));
  put("booking", "minAdvanceHours", num(b.minAdvanceHours, 0, 720));
  put("booking", "maxAdvanceDays", num(b.maxAdvanceDays, 1, 730));
  put("booking", "maxDurationHours", num(b.maxDurationHours, 0, 24));
  const step = num(b.slotStepMinutes, 5, 60);
  put("booking", "slotStepMinutes", step !== undefined && [5, 10, 15, 30, 60].includes(step) ? step : undefined);
  put("booking", "allowRecurring", bool(b.allowRecurring));
  put("booking", "maxRecurringWeeks", num(b.maxRecurringWeeks, 1, 52));
  put("booking", "requireCoordinator", bool(b.requireCoordinator));
  put("booking", "requireAttendees", bool(b.requireAttendees));
  put("booking", "cateringLeadHours", num(b.cateringLeadHours, 0, 240));
  put("booking", "seatingLayouts", strList(b.seatingLayouts));
  put("booking", "activityTypes", strList(b.activityTypes));

  const n = isObj(input.notifications) ? input.notifications : {};
  put("notifications", "reminderEnabled", bool(n.reminderEnabled));
  put("notifications", "reminderHoursBefore", num(n.reminderHoursBefore, 1, 168));
  put("notifications", "remindManagersForPreparation", bool(n.remindManagersForPreparation));
  put("notifications", "notifyAffectedOnMaintenance", bool(n.notifyAffectedOnMaintenance));

  const m = isObj(input.maintenance) ? input.maintenance : {};
  put("maintenance", "urgentBlocksHall", bool(m.urgentBlocksHall));
  put("maintenance", "highBlocksHall", bool(m.highBlocksHall));
  put("maintenance", "affectedWindowDays", num(m.affectedWindowDays, 1, 365));

  const d = isObj(input.display) ? input.display : {};
  put("display", "showDepartment", bool(d.showDepartment));
  put("display", "showActivity", bool(d.showActivity));
  put("display", "refreshSeconds", num(d.refreshSeconds, 15, 600));
  put("display", "tickerAr", str(d.tickerAr, 300));

  const p = isObj(input.print) ? input.print : {};
  for (const k of ["headerLine1", "headerLine2", "headerLine3", "signatureTitle"]) put("print", k, str(p[k], 120));
  put("print", "footerNote", str(p.footerNote, 300));
  put("print", "showQr", bool(p.showQr));
  return out;
}

export function mergeOptions(stored: unknown): PlatformOptions {
  const src = isObj(stored) ? stored : {};
  const result = structuredClone(DEFAULT_OPTIONS) as unknown as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(result)) {
    const s = src[section];
    if (isObj(s)) for (const [k, v] of Object.entries(s)) if (k in result[section] && v !== undefined) result[section][k] = v;
  }
  return result as unknown as PlatformOptions;
}

let cache: { at: number; value: PlatformOptions } | null = null;

export async function getOptions(): Promise<PlatformOptions> {
  if (cache && Date.now() - cache.at < 5_000) return cache.value;
  const [row] = await db
    .select({ options: platformSettingsTable.options, companyNameAr: platformSettingsTable.companyNameAr, companyName: platformSettingsTable.companyName })
    .from(platformSettingsTable)
    .limit(1);
  const value = mergeOptions(row?.options);
  // The platform name historically lives in platform_settings.company_name(_ar).
  const stored = (row?.options as { identity?: Record<string, unknown> } | undefined)?.identity ?? {};
  if (!stored.systemNameAr && row?.companyNameAr) value.identity.systemNameAr = row.companyNameAr;
  if (!stored.systemNameEn && row?.companyName) value.identity.systemNameEn = row.companyName;
  cache = { at: Date.now(), value };
  return value;
}

export async function saveOptions(patch: unknown): Promise<PlatformOptions> {
  const clean = sanitizeOptions(patch);
  let [row] = await db.select().from(platformSettingsTable).limit(1);
  if (!row) [row] = await db.insert(platformSettingsTable).values({}).returning();
  const current = isObj(row.options) ? (row.options as Record<string, Record<string, unknown>>) : {};
  const next: Record<string, Record<string, unknown>> = { ...current };
  for (const [section, values] of Object.entries(clean)) next[section] = { ...(current[section] ?? {}), ...values };
  await db.update(platformSettingsTable).set({ options: next, updatedAt: new Date() }).where(eq(platformSettingsTable.id, row.id));
  cache = null;
  return mergeOptions(next);
}

export function invalidateOptionsCache() {
  cache = null;
}

/** Subset safe to expose without authentication (login page, display screens, print header). */
export function publicOptions(o: PlatformOptions) {
  return {
    identity: o.identity,
    appearance: o.appearance,
    display: o.display,
    print: o.print,
    booking: {
      weekendDays: o.booking.weekendDays,
      blockWeekends: o.booking.blockWeekends,
      slotStepMinutes: o.booking.slotStepMinutes,
      allowRecurring: o.booking.allowRecurring,
      maxRecurringWeeks: o.booking.maxRecurringWeeks,
      requireCoordinator: o.booking.requireCoordinator,
      requireAttendees: o.booking.requireAttendees,
      seatingLayouts: o.booking.seatingLayouts,
      activityTypes: o.booking.activityTypes,
      minAdvanceHours: o.booking.minAdvanceHours,
      maxAdvanceDays: o.booking.maxAdvanceDays,
      maxDurationHours: o.booking.maxDurationHours,
      cateringLeadHours: o.booking.cateringLeadHours,
    },
  };
}
