/**
 * Request validation (zod) errors used to reach the browser as raw JSON, e.g.
 * [{"code":"too_small","minimum":8,...,"path":["password"]}]. This turns them
 * into one short Arabic sentence the user can act on.
 */
const FIELD_AR: Record<string, string> = {
  password: "كلمة المرور",
  newPassword: "كلمة المرور الجديدة",
  currentPassword: "كلمة المرور الحالية",
  username: "اسم المستخدم",
  role: "الدور",
  departmentName: "اسم الجهة",
  phoneNumber: "رقم الهاتف",
  name: "الاسم",
  nameAr: "الاسم",
  capacity: "السعة",
  startDate: "تاريخ البداية",
  endDate: "تاريخ النهاية",
  startTime: "وقت البداية",
  endTime: "وقت النهاية",
  hallId: "القاعة",
  title: "العنوان",
  message: "نص الرسالة",
  email: "البريد الإلكتروني",
};

interface Issue { code?: string; minimum?: number; maximum?: number; type?: string; path?: (string | number)[]; message?: string }

function one(i: Issue): string {
  const key = String(i.path?.[i.path.length - 1] ?? "");
  const field = FIELD_AR[key] ?? (key ? `الحقل «${key}»` : "القيمة");
  switch (i.code) {
    case "too_small":
      if (i.type === "string") return i.minimum === 1 ? `${field} مطلوب` : `${field} يجب أن تكون ${i.minimum} رموز على الأقل`;
      if (i.type === "array") return `${field}: اختر عنصراً واحداً على الأقل`;
      return `${field} يجب ألا تقل عن ${i.minimum}`;
    case "too_big":
      if (i.type === "string") return `${field} يجب ألا تزيد على ${i.maximum} رمزاً`;
      return `${field} يجب ألا تزيد على ${i.maximum}`;
    case "invalid_type":
      return `${field} مطلوب أو غير صالح`;
    case "invalid_enum_value":
    case "invalid_value":
      return `قيمة ${field} غير صالحة`;
    case "invalid_string":
    case "invalid_format":
      return `صيغة ${field} غير صحيحة`;
    default:
      return `قيمة ${field} غير صحيحة`;
  }
}

export function friendlyValidationError(error: unknown): string | null {
  if (typeof error !== "string") return null;
  const s = error.trim();
  if (!s.startsWith("[") || !s.includes('"code"')) return null;
  try {
    const issues = JSON.parse(s) as Issue[];
    if (!Array.isArray(issues) || !issues.length) return null;
    return Array.from(new Set(issues.slice(0, 3).map(one))).join(" — ");
  } catch {
    return null;
  }
}
