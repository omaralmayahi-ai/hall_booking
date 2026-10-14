import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, AUTH_EXPIRED_EVENT, homePathFor } from "@/hooks/use-auth";
import { LanguageProvider } from "@/hooks/use-translation";
import { AppShell } from "@/components/layout/main-layout";
import Login from "@/pages/login";
import { systemNameOf, usePublicSettings } from "@/components/layout/use-public-settings";
import { setSystemAppearance } from "@/hooks/use-appearance";

// Admin Pages
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminAudit = lazy(() => import("@/pages/admin/audit"));
const AdminNotifications = lazy(() => import("@/pages/admin/notifications"));
const AdminPasswordReset = lazy(() => import("@/pages/admin/password-reset"));
const AdminSettings = lazy(() => import("@/pages/admin/settings"));

// Manager Pages
const ManagerDashboard = lazy(() => import("@/pages/manager/dashboard"));
const ManagerHalls = lazy(() => import("@/pages/manager/halls"));
const ManagerBookings = lazy(() => import("@/pages/manager/bookings"));
const ManagerBookingLog = lazy(() => import("@/pages/manager/booking-log"));
const ManagerMaintenance = lazy(() => import("@/pages/manager/maintenance"));
const ManagerReviews = lazy(() => import("@/pages/manager/reviews"));
const ManagerNotifications = lazy(() => import("@/pages/manager/notifications"));
const ManagerSettings = lazy(() => import("@/pages/manager/settings"));
const ManagerProfile = lazy(() => import("@/pages/manager/profile"));

// Department Pages
const DepartmentDashboard = lazy(() => import("@/pages/department/dashboard"));
const DepartmentHalls = lazy(() => import("@/pages/department/halls"));
const DepartmentBookings = lazy(() => import("@/pages/department/bookings"));
const DepartmentNotifications = lazy(() => import("@/pages/department/notifications"));
const DepartmentProfile = lazy(() => import("@/pages/department/profile"));

// Shared Pages
const CalendarPage = lazy(() => import("@/pages/shared/calendar"));
const ReportsPage = lazy(() => import("@/pages/shared/reports"));
const ManagerAssets = lazy(() => import("@/pages/manager/assets"));

// Print Pages (authenticated, outside the app shell)
const PrintBooking = lazy(() => import("@/pages/print/booking"));
const PrintReport = lazy(() => import("@/pages/print/report"));
const PrintDaily = lazy(() => import("@/pages/print/daily"));

// Public Pages
const PublicHall = lazy(() => import("@/pages/public/hall"));
const VerifyBooking = lazy(() => import("@/pages/public/verify"));
const HallDoorDisplay = lazy(() => import("@/pages/display/display").then((m) => ({ default: m.HallDoorDisplay })));
const LobbyDisplay = lazy(() => import("@/pages/display/display").then((m) => ({ default: m.LobbyDisplay })));

import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Loader2 } from "lucide-react";

function onApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
});

function FullPageLoader() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background text-muted-foreground" dir="rtl">
      <Loader2 className="w-6 h-6 animate-spin ml-2" /> جارِ التحميل...
    </div>
  );
}

function DashboardRedirect() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(isAuthenticated ? homePathFor(user?.role) : "/login", { replace: true });
  }, [isAuthenticated, user, setLocation]);
  return <FullPageLoader />;
}

type RouteDef = { path: string; component: ComponentType };

const ROUTES: Record<string, RouteDef[]> = {
  admin: [
    { path: "/admin/dashboard", component: AdminDashboard },
    { path: "/admin/calendar", component: CalendarPage },
    { path: "/admin/reports", component: ReportsPage },
    { path: "/admin/users", component: AdminUsers },
    { path: "/admin/audit", component: AdminAudit },
    { path: "/admin/notifications", component: AdminNotifications },
    { path: "/admin/password-reset", component: AdminPasswordReset },
    { path: "/admin/settings", component: AdminSettings },
  ],
  relations_manager: [
    { path: "/manager/dashboard", component: ManagerDashboard },
    { path: "/manager/calendar", component: CalendarPage },
    { path: "/manager/assets", component: ManagerAssets },
    { path: "/manager/reports", component: ReportsPage },
    { path: "/manager/halls", component: ManagerHalls },
    { path: "/manager/bookings", component: ManagerBookings },
    { path: "/manager/booking-log", component: ManagerBookingLog },
    { path: "/manager/maintenance", component: ManagerMaintenance },
    { path: "/manager/reviews", component: ManagerReviews },
    { path: "/manager/notifications", component: ManagerNotifications },
    { path: "/manager/settings", component: ManagerSettings },
    { path: "/manager/profile", component: ManagerProfile },
  ],
  requesting_department: [
    { path: "/department/dashboard", component: DepartmentDashboard },
    { path: "/department/calendar", component: CalendarPage },
    { path: "/department/halls", component: DepartmentHalls },
    { path: "/department/bookings", component: DepartmentBookings },
    { path: "/department/notifications", component: DepartmentNotifications },
    { path: "/department/profile", component: DepartmentProfile },
  ],
};

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const routes = ROUTES[user?.role ?? ""] ?? [];
  return (
    <AppShell>
      <Suspense fallback={<div className="py-20 flex justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
      <Switch>
        {routes.map((r) => (
          <Route key={r.path} path={r.path} component={r.component} />
        ))}
        <Route>
          <DashboardRedirect />
        </Route>
      </Switch>
      </Suspense>
    </AppShell>
  );
}

function Router() {
  const { isAuthenticated } = useAuth();
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/public/hall/:id">
        <Suspense fallback={<FullPageLoader />}><PublicHall /></Suspense>
      </Route>
      <Route path="/public/booking/:code">
        <Suspense fallback={<FullPageLoader />}><VerifyBooking /></Suspense>
      </Route>
      <Route path="/display/hall/:id">
        <Suspense fallback={<FullPageLoader />}><HallDoorDisplay /></Suspense>
      </Route>
      <Route path="/display">
        <Suspense fallback={<FullPageLoader />}><LobbyDisplay /></Suspense>
      </Route>
      <Route path="/print/*">
        {isAuthenticated ? (
          <Suspense fallback={<FullPageLoader />}>
            <Switch>
              <Route path="/print/booking/:id" component={PrintBooking} />
              <Route path="/print/report" component={PrintReport} />
              <Route path="/print/daily" component={PrintDaily} />
            </Switch>
          </Suspense>
        ) : <DashboardRedirect />}
      </Route>
      <Route path="/" component={DashboardRedirect} />
      <Route>{isAuthenticated ? <AuthenticatedRoutes /> : <DashboardRedirect />}</Route>
    </Switch>
  );
}

/** Applies organisation-wide settings: default appearance, tab title and platform icon. */
function PlatformSync() {
  const { data } = usePublicSettings();
  useEffect(() => {
    if (!data) return;
    setSystemAppearance(data.options?.appearance);
    const name = systemNameOf(data);
    if (!document.title || document.title === "منصة حجز القاعات" || document.title === document.documentElement.dataset.appTitle) {
      document.title = name;
      document.documentElement.dataset.appTitle = name;
    }
    const v = data.iconVersion;
    for (const [rel, href] of [["icon", `/favicon.ico?v=${v}`], ["apple-touch-icon", `/apple-touch-icon.png?v=${v}`]] as const) {
      let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.removeAttribute("type");
      link.href = href;
    }
  }, [data]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformSync />
      <AuthProvider>
        <LanguageProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
