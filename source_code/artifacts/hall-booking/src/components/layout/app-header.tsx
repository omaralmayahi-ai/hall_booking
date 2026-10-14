import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useLogout,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { Bell, CheckCheck, ChevronDown, Clock, KeyRound, LogOut, Moon, Palette, PanelRight, RotateCcw, Sun, Type } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, useAuth } from "@/hooks/use-auth";
import { FONT_OPTIONS, SIDEBAR_STYLES, THEME_OPTIONS, useAppearance } from "@/hooks/use-appearance";
import { notificationsPathFor, pageTitleFor } from "./nav";
import { ChangePasswordDialog } from "./change-password-dialog";
import { formatDateTime } from "@/lib/format";

function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: notifications } = useListNotifications(undefined, { query: { refetchInterval: 60_000 } as any });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;
  const allPath = notificationsPathFor(user?.role);
  const refresh = () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative" aria-label="الإشعارات">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80 p-0" dir="rtl">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">الإشعارات</h3>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={async () => { await markAll.mutateAsync(undefined as any); refresh(); }}>
              <CheckCheck className="w-3 h-3" />
              قراءة الكل
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          {!notifications?.length ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              لا توجد إشعارات
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`block w-full text-right p-3 text-sm hover:bg-muted/50 transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
                  onClick={async () => {
                    if (!n.isRead) { await markRead.mutateAsync({ id: n.id }); refresh(); }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`leading-relaxed ${!n.isRead ? "font-semibold" : "text-muted-foreground"}`}>{n.titleAr || n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.messageAr || n.message}</p>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(n.createdAt)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        {allPath && (
          <div className="p-2 border-t">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); setLocation(allPath); }}>
              عرض جميع الإشعارات
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const logoutMutation = useLogout();
  const [location, setLocation] = useLocation();
  const appearance = useAppearance();
  const [pwOpen, setPwOpen] = useState(false);
  const displayName = user?.departmentName || user?.username || "";
  const initials = displayName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  const title = pageTitleFor(user?.role, location);

  const handleLogout = async () => {
    try { await logoutMutation.mutateAsync(undefined as any); } catch { /* ignore */ }
    logout();
    setLocation("/login");
  };

  return (
    <>
      <header data-app-header className="flex items-center justify-between gap-2 px-3 border-b h-12 shrink-0 bg-background sticky top-0 z-20" dir="rtl">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger aria-label="إظهار/إخفاء القائمة" />
          {title && <span className="text-sm font-semibold text-muted-foreground truncate hidden sm:inline">{title}</span>}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="الوضع الداكن"
            onClick={() => appearance.update({ dark: !appearance.dark })}
          >
            {appearance.dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {user?.role !== "admin" && <NotificationsPopover />}

          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline max-w-40 truncate">{displayName}</span>
                {user?.role && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 hidden md:inline-flex">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-muted-foreground text-right" dir="ltr">{user?.username}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPwOpen(true)}>
                <KeyRound className="w-4 h-4" />
                تغيير كلمة المرور
              </DropdownMenuItem>
              {!appearance.locked && (
                <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="w-4 h-4 ml-2" />
                  لون النظام
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={appearance.theme} onValueChange={(v) => appearance.update({ theme: v })}>
                    {THEME_OPTIONS.map((t) => (
                      <DropdownMenuRadioItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                          {t.label}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PanelRight className="w-4 h-4 ml-2" />
                  نمط القائمة الجانبية
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={appearance.sidebarStyle} onValueChange={(v) => appearance.update({ sidebarStyle: v })}>
                    {SIDEBAR_STYLES.map((s) => (
                      <DropdownMenuRadioItem key={s.value} value={s.value}>{s.label}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Type className="w-4 h-4 ml-2" />
                  نوع الخط
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={appearance.font} onValueChange={(v) => appearance.update({ font: v })}>
                    {FONT_OPTIONS.map((f) => (
                      <DropdownMenuRadioItem key={f.value} value={f.value}>{f.label}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
                  <DropdownMenuItem onClick={appearance.resetToDefault}>
                    <RotateCcw className="w-4 h-4" />
                    المظهر الافتراضي للمنصة
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => appearance.update({ dark: !appearance.dark })}>
                {appearance.dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {appearance.dark ? "الوضع الفاتح" : "الوضع الداكن"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
