import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/PageHeader";
import { formatDate } from "../lib/helpers";
import { Bell, CheckCircle, AlertTriangle, Info, AlertCircle } from "lucide-react";

const TYPE_CONFIG = {
  urgent: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50 border-red-200" },
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 border-amber-200" },
  overdue: { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50 border-orange-200" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-50 border-blue-200" },
};

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("unresolved");

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = () => crmApi.entities.AppAlert.list("-created_date", 100).then(setAlerts).finally(() => setLoading(false));

  const resolve = async (alertId) => {
    await crmApi.entities.AppAlert.update(alertId, { is_resolved: true, is_read: true });
    loadAlerts();
  };

  const markRead = async (alertId) => {
    await crmApi.entities.AppAlert.update(alertId, { is_read: true });
    loadAlerts();
  };

  const filtered = alerts.filter(a => {
    if (filter === "unresolved") return !a.is_resolved;
    if (filter === "resolved") return a.is_resolved;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const unread = alerts.filter(a => !a.is_read && !a.is_resolved).length;

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <PageHeader title="Alerts" subtitle={`${unread} unread · ${alerts.filter(a=>!a.is_resolved).length} unresolved`}
        actions={
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
            {["unresolved","resolved","all"].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === f ? "bg-card shadow-sm" : ""}`}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>
            ))}
          </div>
        }
      />

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-12 text-center">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No {filter} alerts</p>
          </Card>
        )}
        {filtered.map(alert => {
          const config = TYPE_CONFIG[alert.type] || TYPE_CONFIG.info;
          const Icon = config.icon;
          return (
            <div key={alert.id} className={`flex items-start gap-4 p-4 rounded-lg border ${config.bg} ${!alert.is_read ? "ring-1 ring-inset ring-current/10" : ""}`}>
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  {!alert.is_read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-2">{formatDate(alert.created_date)}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {!alert.is_read && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => markRead(alert.id)}>Mark read</Button>}
                {!alert.is_resolved && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => resolve(alert.id)}><CheckCircle className="w-3.5 h-3.5 mr-1" />Resolve</Button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}