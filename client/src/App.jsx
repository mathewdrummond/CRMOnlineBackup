import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from "react";
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ModuleProvider, useModules } from '@/lib/ModuleContext';
import { crmApi } from '@/api/localApiClient';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { HelpProvider } from "@/lib/HelpContext";
import { ClientModeProvider } from "@/lib/clientMode.jsx";

const APP_KIND = import.meta.env.VITE_APP_KIND || "crm";
const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const Layout = lazy(() => import('./components/Layout'));
const OperationsHub = lazy(() => import('./pages/OperationsHub'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const Contacts = lazy(() => import('./pages/Contacts'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const Quotes = lazy(() => import('./pages/Quotes'));
const QuoteDetail = lazy(() => import('./pages/QuoteDetail'));
const PricingModel = lazy(() => import('./pages/PricingModel'));
const DocumentTemplates = lazy(() => import('./pages/DocumentTemplates'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const WorkshopBoardPage = lazy(() => import('./pages/WorkshopBoardPage'));
const Schedule = lazy(() => import('./pages/Schedule'));
const TimeTracking = lazy(() => import('./pages/TimeTracking'));
const ManualEntry = lazy(() => import('./pages/ManualEntry'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Reports = lazy(() => import('./pages/Reports'));
const StaffAdmin = lazy(() => import('./pages/StaffAdmin'));
const Login = lazy(() => import('./pages/Login'));
const AccessAdmin = lazy(() => import('./pages/AccessAdmin'));
const AdminAudit = lazy(() => import('./pages/AdminAudit'));
const ExportHistoryPage = lazy(() => import('./pages/ExportHistoryPage'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const AiKnowledgeIndexing = lazy(() => import('./pages/AiKnowledgeIndexing'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const ComponentPreview = lazy(() => import('./pages/ComponentPreview'));

const RouteLoading = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="jf-loading-spinner"></div>
  </div>
);

const ThemeModeSync = () => {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = (prefersDark) => {
      document.documentElement.classList.toggle("dark", prefersDark);
      document.documentElement.style.colorScheme = prefersDark ? "dark" : "light";
    };

    applyTheme(mediaQuery.matches);

    const handleChange = (event) => {
      applyTheme(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return null;
};

const ApiRuntimeSync = () => {
  useEffect(() => crmApi.runtime.start(), []);
  return null;
};

const RequireAuth = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return <RouteLoading />;
  }

  if (!isAuthenticated) {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    const params = new URLSearchParams();
    if (nextPath && nextPath !== "/login") {
      params.set("next", nextPath);
    }
    return <Navigate to={`/login${params.toString() ? `?${params.toString()}` : ""}`} replace />;
  }

  return children;
};

const RequireAdmin = ({ children }) => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <AccessDenied />;
  }

  return children;
};

const RequireModule = ({ moduleKey, anyOf = [], fallback = "/", children }) => {
  const { modulesLoaded, isLoadingModules, isModuleEnabled, areAnyModulesEnabled } = useModules();

  if (isLoadingModules || !modulesLoaded) {
    return <RouteLoading />;
  }

  const allowed = anyOf.length > 0
    ? areAnyModulesEnabled(anyOf)
    : isModuleEnabled(moduleKey);

  if (!allowed) {
    return <Navigate to={fallback} replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();
  const { modulesLoaded, isLoadingModules } = useModules();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="jf-loading-spinner"></div>
      </div>
    );
  }

  if (isAuthenticated && (isLoadingModules || !modulesLoaded)) {
    return <RouteLoading />;
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/help" element={<HelpCenter />} />
          {APP_KIND === "timeclock" ? (
            <>
              <Route path="/" element={<TimeTracking />} />
              <Route path="/time-tracking" element={<TimeTracking />} />
            </>
          ) : (
            <>
              <Route path="/" element={<OperationsHub />} />
              <Route path="/dashboard" element={<RequireModule moduleKey="dashboard"><Dashboard /></RequireModule>} />
              <Route path="/leads" element={<RequireModule moduleKey="leads"><Leads /></RequireModule>} />
              <Route path="/leads/:id" element={<RequireModule moduleKey="leads"><LeadDetail /></RequireModule>} />
              <Route path="/contacts" element={<RequireModule moduleKey="contacts"><Contacts /></RequireModule>} />
              <Route path="/contacts/:id" element={<RequireModule moduleKey="contacts"><ContactDetail /></RequireModule>} />
              <Route path="/companies/:id" element={<RequireModule anyOf={["contacts", "suppliers"]}><CompanyDetail /></RequireModule>} />
              <Route path="/quotes" element={<RequireModule moduleKey="quotes"><Quotes /></RequireModule>} />
              <Route path="/quotes/:id" element={<RequireModule moduleKey="quotes"><QuoteDetail /></RequireModule>} />
              <Route path="/pricing" element={<RequireModule moduleKey="pricing"><PricingModel /></RequireModule>} />
              <Route path="/documents/templates" element={<RequireModule moduleKey="quotes"><DocumentTemplates /></RequireModule>} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/workshop-board" element={<WorkshopBoardPage />} />
              <Route path="/schedule" element={<RequireModule moduleKey="schedule"><Schedule /></RequireModule>} />
              <Route path="/time-tracking" element={<TimeTracking />} />
              <Route path="/log-time" element={<TimeTracking initialTab="clockin" />} />
              <Route path="/LogTime" element={<TimeTracking initialTab="clockin" />} />
              <Route path="/myob-export" element={<RequireModule moduleKey="myob_export"><TimeTracking initialTab="export" /></RequireModule>} />
              <Route path="/MYOBExport" element={<RequireModule moduleKey="myob_export"><TimeTracking initialTab="export" /></RequireModule>} />
              <Route path="/suppliers" element={<RequireModule moduleKey="suppliers"><Suppliers /></RequireModule>} />
              <Route path="/suppliers/:id" element={<RequireModule moduleKey="suppliers"><CompanyDetail /></RequireModule>} />
              <Route path="/reports" element={<RequireModule moduleKey="reports"><Reports /></RequireModule>} />
              <Route path="/staff" element={<RequireAdmin><StaffAdmin /></RequireAdmin>} />
              <Route path="/manual-entry" element={<RequireAdmin><RequireModule moduleKey="manual_entry"><ManualEntry /></RequireModule></RequireAdmin>} />
              <Route path="/ManualEntry" element={<RequireAdmin><RequireModule moduleKey="manual_entry"><ManualEntry /></RequireModule></RequireAdmin>} />
              <Route path="/export-history" element={<RequireAdmin><RequireModule moduleKey="export_history"><ExportHistoryPage /></RequireModule></RequireAdmin>} />
              <Route path="/ExportHistoryPage" element={<RequireAdmin><RequireModule moduleKey="export_history"><ExportHistoryPage /></RequireModule></RequireAdmin>} />
              <Route path="/access" element={<RequireAdmin><AccessAdmin /></RequireAdmin>} />
              <Route path="/admin/audit" element={<RequireAdmin><AdminAudit /></RequireAdmin>} />
              <Route path="/admin/health" element={<RequireAdmin><SystemHealth /></RequireAdmin>} />
              <Route path="/admin/ai-knowledge" element={<RequireAdmin><AiKnowledgeIndexing /></RequireAdmin>} />
              {import.meta.env.VITE_ENABLE_TEST_AUTH === "true" ? (
                <Route path="/__ui-preview" element={<RequireAdmin><ComponentPreview /></RequireAdmin>} />
              ) : null}
            </>
          )}
        </Route>
        <Route path="*" element={isAuthenticated ? <PageNotFound /> : <Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <ModuleProvider>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClientInstance}>
            <ThemeModeSync />
            <ApiRuntimeSync />
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <ClientModeProvider>
                <HelpProvider>
                  <AppRoutes />
                </HelpProvider>
              </ClientModeProvider>
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AppErrorBoundary>
      </ModuleProvider>
    </AuthProvider>
  )
}

export default App
