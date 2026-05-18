import { Outlet, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, Users, Target, FileText, Briefcase, Calendar, 
  Clock, ShoppingCart, BarChart3, Bell, Menu, X, Search, ChevronDown,
  Building2, Truck
} from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/leads", icon: Target, label: "Leads" },
  { path: "/contacts", icon: Users, label: "Contacts" },
  { path: "/quotes", icon: FileText, label: "Quotes" },
  { path: "/jobs", icon: Briefcase, label: "Jobs" },
  { path: "/schedule", icon: Calendar, label: "Schedule" },
  { path: "/time-tracking", icon: Clock, label: "Time Clock" },
  { path: "/staff", icon: Users, label: "Staff" },
  { path: "/purchasing", icon: ShoppingCart, label: "Purchasing" },
  { path: "/suppliers", icon: Truck, label: "Suppliers" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    crmApi.auth.me().then(setUser).catch(() => {});
    crmApi.entities.AppAlert.filter({ is_read: false }).then(a => setAlertCount(a.length)).catch(() => {});
  }, []);

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-5 border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-4.5 h-4.5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-sidebar-foreground tracking-tight">Workshop</span>
            </Link>
            <button className="lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                    ${active 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }
                  `}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User */}
          {user && (
            <div className="p-3 border-t border-sidebar-border">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-foreground">
                  {user.full_name?.charAt(0) || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user.full_name}</p>
                  <p className="text-xs text-sidebar-foreground/50 truncate">{user.role || "user"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search jobs, contacts, quotes..." 
                className="w-72 pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-card"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/alerts">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-[18px] h-[18px]" />
                {alertCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}