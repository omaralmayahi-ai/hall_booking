import {
  LayoutDashboard, Users, CalendarRange, FileText, Settings, Bell, KeyRound, Send, Wrench, Star, CalendarCheck2, History,
  CalendarOff, UserCog, Presentation, Armchair, BarChart3, MonitorPlay, ClipboardList, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Opens in a new tab (public display screens). */
  external?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: Record<string, NavGroup[]> = {
  admin: [
    {
      label: "القائمة الرئيسية",
      items: [
        { href: "/admin/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
        { href: "/admin/calendar", label: "تقويم القاعات", icon: CalendarRange },
        { href: "/admin/reports", label: "التقارير والإحصاءات", icon: BarChart3 },
      ],
    },
    {
      label: "الإدارة",
      items: [
        { href: "/admin/users", label: "إدارة المستخدمين", icon: Users },
        { href: "/admin/password-reset", label: "طلبات استعادة كلمة المرور", icon: KeyRound },
        { href: "/admin/notifications", label: "إرسال الإشعارات", icon: Send },
        { href: "/admin/audit", label: "سجل الأحداث", icon: FileText },
        { href: "/admin/settings", label: "إعدادات النظام", icon: Settings },
      ],
    },
  ],
  relations_manager: [
    {
      label: "القائمة الرئيسية",
      items: [
        { href: "/manager/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
        { href: "/manager/calendar", label: "تقويم القاعات", icon: CalendarRange },
        { href: "/manager/bookings", label: "طلبات الحجز", icon: CalendarCheck2 },
        { href: "/manager/booking-log", label: "سجل الحجوزات", icon: History },
        { href: "/manager/notifications", label: "الإشعارات", icon: Bell },
      ],
    },
    {
      label: "القاعات",
      items: [
        { href: "/manager/halls", label: "إدارة القاعات", icon: Presentation },
        { href: "/manager/assets", label: "محتويات القاعات", icon: Armchair },
        { href: "/manager/maintenance", label: "متابعة الصيانة", icon: Wrench },
        { href: "/manager/reviews", label: "التقييمات", icon: Star },
        { href: "/manager/settings", label: "العطل الرسمية", icon: CalendarOff },
      ],
    },
    {
      label: "التقارير",
      items: [
        { href: "/manager/reports", label: "التقارير والتجهيز اليومي", icon: BarChart3 },
        { href: "/display", label: "شاشة حالة القاعات", icon: MonitorPlay, external: true },
      ],
    },
    { label: "الحساب", items: [{ href: "/manager/profile", label: "ملف الحساب", icon: UserCog }] },
  ],
  requesting_department: [
    {
      label: "القائمة الرئيسية",
      items: [
        { href: "/department/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
        { href: "/department/halls", label: "حجز قاعة", icon: Presentation },
        { href: "/department/calendar", label: "تقويم القاعات", icon: CalendarRange },
        { href: "/department/bookings", label: "حجوزاتي", icon: ClipboardList },
        { href: "/department/notifications", label: "الإشعارات", icon: Bell },
      ],
    },
    { label: "الحساب", items: [{ href: "/department/profile", label: "ملف الحساب", icon: UserCog }] },
  ],
};

export function notificationsPathFor(role?: string | null): string | null {
  if (role === "relations_manager") return "/manager/notifications";
  if (role === "requesting_department") return "/department/notifications";
  return null;
}

export function pageTitleFor(role: string | undefined, path: string): string | undefined {
  for (const g of NAV[role ?? ""] ?? []) for (const i of g.items) if (path.startsWith(i.href)) return i.label;
  return undefined;
}
