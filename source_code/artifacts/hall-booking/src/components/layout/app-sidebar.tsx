import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { NAV } from "./nav";
import { systemNameOf, usePublicSettings } from "./use-public-settings";
import { useListBookings } from "@workspace/api-client-react";

function PendingBadge() {
  const { data } = useListBookings({ status: "pending" } as any, { query: { refetchInterval: 60_000 } as any });
  const n = data?.length ?? 0;
  if (!n) return null;
  return (
    <SidebarMenuBadge className="!left-1 !right-auto bg-primary text-primary-foreground rounded-full min-w-5 h-5 px-1.5 text-[10px] font-bold">
      {n > 99 ? "99+" : n}
    </SidebarMenuBadge>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: settings, isLoading } = usePublicSettings();
  const groups = NAV[user?.role ?? ""] ?? [];
  const systemName = systemNameOf(settings);
  const tagline = settings?.options?.identity?.taglineAr || "إدارة القاعات والحجوزات";
  const footer = settings?.footerTextAr || settings?.footerText;

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="p-3.5 border-b border-sidebar-border group-data-[collapsible=icon]:p-2.5 group-data-[collapsible=icon]:items-center">
        <div className="flex items-center gap-3 w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          {isLoading ? (
            <div className="w-9 h-9 rounded-lg shrink-0 bg-muted/40 animate-pulse" />
          ) : settings?.logoUrl ? (
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-background/60 border border-sidebar-border/60">
              <img src={settings.logoUrl} alt="الشعار" className="w-full h-full object-contain p-0.5" />
            </div>
          ) : (
            <img src={`/icons/icon-192.png?v=${settings?.iconVersion ?? ""}`} alt="" className="w-9 h-9 rounded-lg shrink-0" />
          )}
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-sm truncate text-sidebar-foreground">{systemName}</span>
            <span className="text-xs text-muted-foreground truncate">{tagline}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:w-full">
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground px-2">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1.5">
                {group.items.map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href} className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className="rounded-lg data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:p-0"
                      >
                        {item.external ? (
                          <a href={item.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                            <item.icon className="w-4 h-4 shrink-0" />
                            <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                          </a>
                        ) : (
                          <Link href={item.href} data-active={isActive} className="flex items-center gap-2.5 w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                            <item.icon className="w-4 h-4 shrink-0" />
                            <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>
                      {item.href === "/manager/bookings" && <PendingBadge />}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          {footer || <>جميع الحقوق محفوظة &copy; {new Date().getFullYear()}</>}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
