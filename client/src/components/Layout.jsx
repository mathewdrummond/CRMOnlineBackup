import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { 
  LayoutDashboard, Users, Target, FileText, Briefcase, Calendar, Calculator,
  Clock, BarChart3, Menu, X, Search, WifiOff, BookOpen,
  Truck, Shield, LogOut, Activity, History, KanbanSquare
} from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/AuthContext";
import { useModules } from "@/lib/ModuleContext";
import {
  getLayoutSearchSnapshot,
  loadLayoutSearchData,
} from "@/lib/layoutData";
import millbrookLogo from "@/assets/millbrook-logo.png";
import millbrookNavTimber from "@/assets/millbrook-nav-timber.jpg";
import ContextHelpActions from "@/components/help/ContextHelpActions";
import GuidedTourDialog from "@/components/help/GuidedTourDialog";
import OnboardingHint from "@/components/help/OnboardingHint";
import { useClientMode } from "@/lib/clientMode.jsx";
import { Switch } from "@/components/ui/switch";

const APP_KIND = import.meta.env.VITE_APP_KIND || "crm";

const CRM_NAV_SECTIONS = [
  {
    label: "Command",
    items: [
      { path: "/", icon: LayoutDashboard, label: "Operations" },
      { path: "/dashboard", icon: Activity, label: "Insights", moduleKey: "dashboard" },
    ],
  },
  {
    label: "Sales & CRM",
    items: [
      { path: "/leads", icon: Target, label: "Leads", moduleKey: "leads" },
      { path: "/contacts", icon: Users, label: "Contacts", moduleKey: "contacts" },
      { path: "/quotes", icon: FileText, label: "Quotes", moduleKey: "quotes" },
      { path: "/pricing", icon: Calculator, label: "Pricing", moduleKey: "pricing" },
    ],
  },
  {
    label: "Delivery & Ops",
    items: [
      { path: "/jobs", icon: Briefcase, label: "Jobs" },
      { path: "/workshop-board", icon: KanbanSquare, label: "Workshop Board" },
      { path: "/schedule", icon: Calendar, label: "Install Planner", moduleKey: "schedule" },
      { path: "/suppliers", icon: Truck, label: "Suppliers", moduleKey: "suppliers" },
      { path: "/time-tracking", icon: Clock, label: "Time Clock" },
      { path: "/staff", icon: Users, label: "Staff", adminOnly: true },
    ],
  },
  {
    label: "Business",
    items: [
      { path: "/reports", icon: BarChart3, label: "Reports", moduleKey: "reports" },
      { path: "/documents/templates", icon: FileText, label: "Documents", moduleKey: "quotes" },
      { path: "/help", icon: BookOpen, label: "Help Centre" },
    ],
  },
];

const TIMECLOCK_NAV_SECTIONS = [
  {
    label: "Kiosk",
    items: [
      { path: "/time-tracking", icon: Clock, label: "Time Clock" },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState(() => crmApi.apiStatus.getSnapshot());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchData, setSearchData] = useState({ jobs: [], quotes: [], contacts: [], leads: [], companies: [] });
  const [semanticResults, setSemanticResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const mainRef = useRef(null);
  const { user, isAdmin, logout } = useAuth();
  const { isModuleEnabled } = useModules();
  const { clientMode, setClientMode } = useClientMode();
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const contactsEnabled = isModuleEnabled("contacts");
  const suppliersEnabled = isModuleEnabled("suppliers");
  const navSections = APP_KIND === "timeclock" ? TIMECLOCK_NAV_SECTIONS : CRM_NAV_SECTIONS;
  const homePath = APP_KIND === "timeclock" ? "/time-tracking" : "/";
  const searchDataOptions = useMemo(() => ({
    contactsEnabled,
    leadsEnabled,
    quotesEnabled,
    suppliersEnabled,
  }), [contactsEnabled, leadsEnabled, quotesEnabled, suppliersEnabled]);
  const shouldPrimeSearchData = searchFocused || searchQuery.trim().length >= 2;

  useEffect(() => {
    return crmApi.apiStatus.subscribe(setApiStatus);
  }, []);

  useEffect(() => {
    if (APP_KIND === "timeclock" || !shouldPrimeSearchData) {
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchData(getLayoutSearchSnapshot(searchDataOptions));
    setSearchLoading(true);

    void loadLayoutSearchData(searchDataOptions)
      .then((nextSearchData) => {
        if (!cancelled) {
          setSearchData(nextSearchData);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchDataOptions, shouldPrimeSearchData]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (APP_KIND === "timeclock" || query.length < 3) {
      setSemanticResults([]);
      setSemanticLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setSemanticLoading(true);
      if (!crmApi.ai?.search) {
        setSemanticResults([]);
        setSemanticLoading(false);
        return;
      }

      void Promise.all([
        crmApi.ai.search({
          query,
          entity_types: ["Job", "Quote", "Contact", "Company", "Note", "Attachment", "PricingItem"],
          limit: 6,
        }),
        crmApi.ai.knowledgeSearch
          ? crmApi.ai.knowledgeSearch({
              query,
              limit: 4,
            })
          : Promise.resolve({ results: [] }),
      ])
        .then(([semanticResponse, knowledgeResponse]) => {
          if (!cancelled) {
            const combined = [
              ...(Array.isArray(semanticResponse?.results) ? semanticResponse.results : []),
              ...(Array.isArray(knowledgeResponse?.results) ? knowledgeResponse.results.map((result) => {
                const metadata = result?.metadata && typeof result.metadata === "object" ? result.metadata : {};
                const entityType = String(metadata.entity_type || "").toLowerCase();
                const entityId = String(metadata.entity_id || "");
                const href = entityType === "job" && entityId
                  ? `/jobs/${entityId}`
                  : entityType === "quote" && entityId
                    ? `/quotes/${entityId}`
                    : entityType === "contact" && entityId
                      ? `/contacts/${entityId}`
                      : entityType === "company" && entityId
                        ? `/companies/${entityId}`
                        : "/admin/ai-knowledge";
                return {
                  ...result,
                  entity: "Knowledge",
                  title: result.source_reference ? `${result.source_reference}` : result.relative_path || "Knowledge file",
                  snippet: result.snippet || result.chunk_text || "",
                  href,
                };
              }) : []),
            ];
            setSemanticResults(combined);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSemanticResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSemanticLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    setSearchQuery("");
    setSearchFocused(false);
    setSidebarOpen(false);
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }

    const jobs = searchData.jobs
      .filter((job) =>
        `${job.job_number || ""} ${job.title || ""} ${job.contact_name || ""} ${job.company_name || ""}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 4)
      .map((job) => ({
        id: `job-${job.id}`,
        href: `/jobs/${job.id}`,
        type: "Job",
        title: `${job.job_number || "Job"}${job.title ? ` — ${job.title}` : ""}`,
        subtitle: job.contact_name || job.company_name || "",
      }));

    const quotes = searchData.quotes
      .filter((quote) =>
        `${quote.quote_number || ""} ${quote.title || ""} ${quote.contact_name || ""} ${quote.company_name || ""}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 4)
      .map((quote) => ({
        id: `quote-${quote.id}`,
        href: `/quotes/${quote.id}`,
        type: "Quote",
        title: `${quote.quote_number || "Quote"}${quote.title ? ` — ${quote.title}` : ""}`,
        subtitle: quote.contact_name || quote.company_name || "",
      }));

    const contacts = searchData.contacts
      .filter((contact) =>
        `${contact.first_name || ""} ${contact.last_name || ""} ${contact.full_name || ""} ${contact.company_name || ""} ${contact.email || ""}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 4)
      .map((contact) => ({
        id: `contact-${contact.id}`,
        href: `/contacts/${contact.id}`,
        type: "Contact",
        title:
          `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
          contact.full_name ||
          contact.email ||
          "Contact",
        subtitle: contact.company_name || contact.email || "",
      }));

    const leads = searchData.leads
      .filter((lead) =>
        `${lead.title || ""} ${lead.contact_name || ""} ${lead.company_name || ""} ${lead.site_address || ""}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 4)
      .map((lead) => ({
        id: `lead-${lead.id}`,
        href: `/leads/${lead.id}`,
        type: "Enquiry",
        title: lead.title || "Lead",
        subtitle: [lead.contact_name, lead.company_name].filter(Boolean).join(" · "),
      }));

    const companies = searchData.companies
      .filter((company) =>
        `${company.name || ""} ${company.email || ""} ${company.phone || ""}`
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 4)
      .map((company) => ({
        id: `company-${company.id}`,
        href: `/companies/${company.id}`,
        type: "Company",
        title: company.name || "Company",
        subtitle: company.email || company.phone || "",
      }));

    const semantic = semanticResults
      .filter((result) => result.href)
      .map((result) => ({
        id: `semantic-${result.entity}-${result.record_id}`,
        href: result.href,
        type: result.entity,
        title: result.title || result.entity,
        subtitle: result.snippet || "",
      }));

    const visibleResults = [
      ...semantic,
      ...jobs,
      ...(quotesEnabled ? quotes : []),
      ...(contactsEnabled ? contacts : []),
      ...(leadsEnabled ? leads : []),
      ...((contactsEnabled || suppliersEnabled) ? companies : []),
    ];

    const seen = new Set();
    return visibleResults
      .filter((result) => {
        const key = result.href || result.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);
  }, [contactsEnabled, leadsEnabled, quotesEnabled, searchData.companies, searchData.contacts, searchData.jobs, searchData.leads, searchData.quotes, searchQuery, semanticResults, suppliersEnabled]);

  const showSearchResults = searchFocused && searchQuery.trim().length >= 2;

  const openSearchResult = (href) => {
    setSearchQuery("");
    setSearchFocused(false);
    navigate(href);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter" && searchResults.length > 0) {
      event.preventDefault();
      openSearchResult(searchResults[0].href);
    }

    if (event.key === "Escape") {
      setSearchFocused(false);
    }
  };

  return (
    <div className="jf-app-shell flex min-h-dvh bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        style={{ "--jf-sidebar-image": `url(${millbrookNavTimber})` }}
        className={`
        jf-sidebar fixed inset-y-0 left-0 z-50 w-[14rem] transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="jf-sidebar-logo flex items-center justify-between px-4 py-5">
            <Link to={homePath} className="flex min-w-0 flex-1 items-center justify-center rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10">
              <img
                src={millbrookLogo}
                alt="Millbrook Furniture and Joinery"
                className="h-auto max-h-[92px] w-full max-w-[180px] object-contain object-center brightness-0 invert drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
              />
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              className="ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-white/10 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="jf-sidebar-nav flex-1 space-y-4 overflow-y-auto px-3 py-5">
            {navSections.map((section) => (
              <div key={section.label} className="space-y-2">
                <p className="jf-sidebar-section-label px-3 text-[11px] font-semibold uppercase text-sidebar-foreground/50">
                  {section.label}
                </p>
                {section.items
                  .filter((item) => (!item.adminOnly || isAdmin) && (!item.moduleKey || isModuleEnabled(item.moduleKey)))
                  .map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        jf-sidebar-link flex min-h-[42px] items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150
                        ${active
                          ? "jf-sidebar-link-active text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/75 hover:bg-white/10 hover:text-sidebar-foreground"
                        }
                      `}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
            {APP_KIND !== "timeclock" && isAdmin && (
              <div className="space-y-2 border-t border-sidebar-border/60 pt-5">
                <p className="jf-sidebar-section-label px-3 text-[11px] font-semibold uppercase text-sidebar-foreground/50">
                  Admin
                </p>
                {[
                  { path: "/manual-entry", icon: FileText, label: "Manual Entry", moduleKey: "manual_entry" },
                  { path: "/export-history", icon: History, label: "Export History", moduleKey: "export_history" },
                  { path: "/access", icon: Shield, label: "Access" },
                  { path: "/admin/audit", icon: History, label: "Audit" },
                  { path: "/admin/health", icon: Activity, label: "System" },
                  { path: "/admin/ai-knowledge", icon: Search, label: "AI Knowledge" },
                ].filter((item) => !item.moduleKey || isModuleEnabled(item.moduleKey)).map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        jf-sidebar-link flex min-h-[42px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150
                        ${active
                          ? "jf-sidebar-link-active text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/75 hover:bg-white/10 hover:text-sidebar-foreground"
                        }
                      `}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          {/* User */}
          {user && (
            <div className="border-t border-sidebar-border/60 p-4">
              <div className="jf-sidebar-user flex items-center gap-3 rounded-lg px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-sm font-semibold text-sidebar-foreground shadow-sm">
                  {user.full_name?.charAt(0) || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user.full_name}</p>
                  <p className="text-xs text-sidebar-foreground/50 truncate">{user.role || "user"}</p>
                </div>
                <Button data-testid="logout-button" variant="ghost" size="icon" className="h-10 w-10 rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="jf-topbar relative z-40 flex min-h-[72px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              className="flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted/70 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            {APP_KIND !== "timeclock" ? (
              <div className="jf-global-search relative hidden md:flex">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search jobs, enquiries, contacts, companies..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                  onKeyDown={handleSearchKeyDown}
                  className="h-9 w-[min(30rem,calc(100vw-10rem))] rounded-full border-border/50 bg-white/65 pl-10 pr-4 text-xs shadow-sm focus-visible:bg-card lg:w-80 xl:w-[24rem]"
                />
                {showSearchResults && (
                  <div className="absolute left-0 top-[calc(100%+0.65rem)] z-50 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-jf-overlay">
                    {searchLoading || semanticLoading ? (
                      <div className="px-4 py-4 text-sm text-muted-foreground">Loading search index...</div>
                    ) : searchResults.length > 0 ? (
                      <div className="py-2">
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => openSearchResult(result.href)}
                            className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/55"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                              {result.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{result.subtitle}</p>}
                            </div>
                            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary-foreground">
                              {result.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-4 text-sm text-muted-foreground">No matching jobs, enquiries, quotes, contacts, or companies.</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Time Clock</p>
                <p className="text-xs text-muted-foreground">Clock in, record time, and review current timesheets.</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={clientMode}
              onCheckedChange={(checked) => setClientMode(checked, { silent: true })}
              className="mx-1"
            />
            {!clientMode ? (
              <ContextHelpActions />
            ) : null}
          </div>
        </header>

        {(!apiStatus.connected || apiStatus.queueCount > 0) && (
          <div className="px-4 pt-3 lg:px-7">
            <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
              <WifiOff className="h-4 w-4" />
              <AlertDescription>
                {!apiStatus.connected
                  ? `Local API unavailable. The app is running from cached data${apiStatus.queueCount > 0 ? ` and has ${apiStatus.queueCount} queued change${apiStatus.queueCount === 1 ? "" : "s"} ready to sync.` : "."}`
                  : `${apiStatus.queueCount} queued change${apiStatus.queueCount === 1 ? "" : "s"} waiting to sync to the local API.`}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {APP_KIND !== "timeclock" && !clientMode ? <OnboardingHint pathname={location.pathname} /> : null}

        {/* Page content */}
        <main ref={mainRef} className="jf-app-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div key={location.pathname} className="jf-page-transition min-h-full">
            <Outlet />
          </div>
        </main>
        {!clientMode ? <GuidedTourDialog /> : null}
      </div>
    </div>
  );
}
