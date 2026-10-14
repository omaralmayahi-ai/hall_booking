/** Arabic labels shared across pages. */

const LEGACY_ACTIVITY: Record<string, string> = {
  meeting: "اجتماع",
  training: "دورة تدريبية",
  conference: "مؤتمر",
  seminar: "ندوة",
  workshop: "ورشة عمل",
  ceremony: "احتفالية",
  other: "أخرى",
};

/** Activity types used to be stored as English keys; newer bookings store the Arabic label itself. */
export function activityLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return LEGACY_ACTIVITY[v] ?? v;
}

export const DEFAULT_ACTIVITY_TYPES = ["اجتماع", "ورشة عمل", "دورة تدريبية", "ندوة", "مؤتمر", "احتفالية", "مقابلات", "أخرى"];

export const BOOKING_STATUS: Record<string, { label: string; className: string; dot: string }> = {
  pending: { label: "قيد الانتظار", className: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  approved: { label: "مقبول", className: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  partially_approved: { label: "مقبول جزئياً", className: "bg-teal-100 text-teal-800 border-teal-200", dot: "bg-teal-500" },
  rejected: { label: "مرفوض", className: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
  cancelled: { label: "ملغى", className: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  emergency_cancelled: { label: "ملغى طارئ", className: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  completed: { label: "مكتمل", className: "bg-sky-100 text-sky-800 border-sky-200", dot: "bg-sky-500" },
  booked: { label: "محجوز", className: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-500" },
  maintenance: { label: "صيانة", className: "bg-rose-100 text-rose-700 border-rose-200", dot: "bg-rose-500" },
};

export const ASSET_CATEGORY: Record<string, string> = {
  audio: "صوتيات",
  video: "عرض مرئي",
  computing: "حاسبات",
  furniture: "أثاث",
  hvac: "تكييف وتهوية",
  lighting: "إنارة",
  network: "شبكات واتصالات",
  other: "أخرى",
};

export const ASSET_STATUS: Record<string, { label: string; className: string }> = {
  working: { label: "صالحة", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  needs_repair: { label: "تحتاج إصلاح", className: "bg-amber-100 text-amber-800 border-amber-200" },
  out_of_service: { label: "عاطلة", className: "bg-red-100 text-red-700 border-red-200" },
  retired: { label: "مستبعدة", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const MAINTENANCE_CATEGORY: Record<string, string> = {
  electrical: "كهربائية",
  plumbing: "صحية",
  hvac: "تكييف",
  furniture: "أثاث",
  technology: "تقنية",
  cleaning: "تنظيف",
  structural: "إنشائية",
  other: "أخرى",
};
