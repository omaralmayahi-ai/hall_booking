import type { CSSProperties, ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * Application shell — same structure as ناظم: right collapsible sidebar + slim header + scrolling content.
 * Mounted once around all authenticated routes (App.tsx) so the sidebar keeps its state between pages.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <SidebarProvider style={{ "--sidebar-width": "17rem", "--sidebar-width-icon": "3.5rem" } as CSSProperties}>
      <div className="flex h-svh w-full" dir="rtl">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <AppHeader />
          <main className="flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
      <ChangePasswordDialog open={!!user?.mustChangePassword} onOpenChange={() => undefined} forced />
    </SidebarProvider>
  );
}

/** Pages still wrap themselves in <MainLayout>; the shell itself is provided once by AppShell. */
export function MainLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
