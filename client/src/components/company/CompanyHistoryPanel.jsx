import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/helpers";
import { Building2, FileText, MessageSquare } from "lucide-react";

const HISTORY_COLORS = {
  note: "blue",
  document: "slate",
  company_change: "slate",
  status_change: "amber",
};

const HISTORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "document", label: "Documents" },
  { key: "change", label: "Changes" },
  { key: "note", label: "Notes" },
];

function getHistoryIcon(type) {
  if (type === "document") {
    return FileText;
  }
  if (type === "company_change" || type === "status_change") {
    return Building2;
  }
  return MessageSquare;
}

function matchesFilter(event, filter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "change") {
    return event.type === "company_change" || event.type === "status_change";
  }
  return event.type === filter;
}

export default function CompanyHistoryPanel({
  history = [],
  onOpenDocument,
}) {
  const [activeFilter, setActiveFilter] = useState("all");

  const visibleHistory = history.filter((event) => !["purchase_order", "stock_item", "stock_transaction"].includes(event.type));
  const filteredHistory = visibleHistory.filter((event) => matchesFilter(event, activeFilter));
  const recentHistory = filteredHistory.slice(0, 20);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-sm">History</h3>
          <p className="mt-1 text-sm text-muted-foreground">Recent supplier activity across notes, documents, and supplier record changes.</p>
        </div>
        <StatusBadge label={`${visibleHistory.length} events`} color="slate" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {HISTORY_FILTERS.map((filter) => (
          <Button
            key={filter.key}
            type="button"
            size="sm"
            variant={activeFilter === filter.key ? "secondary" : "outline"}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {recentHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No supplier history recorded yet.</p>
        ) : (
          recentHistory.map((event) => {
            const Icon = getHistoryIcon(event.type);
            return (
              <div key={event.id} className="flex gap-3 rounded-xl border p-4">
                <div className="rounded-lg bg-muted/40 p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{event.title || "Activity"}</p>
                        <StatusBadge label={String(event.type || "activity").replace(/_/g, " ")} color={HISTORY_COLORS[event.type] || "slate"} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{event.description || "—"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(event.created_date)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {event.actor_name ? <span>{event.actor_name}</span> : null}
                    {typeof event.amount === "number" && Number.isFinite(event.amount) ? <span>{formatCurrency(event.amount)}</span> : null}
                    {event.href && event.type !== "document" ? (
                      <Link to={event.href} className="font-medium text-primary hover:underline">
                        Open record
                      </Link>
                    ) : null}
                    {event.type === "document" && event.href ? (
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => onOpenDocument({ url: event.href })}>
                        Open file
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
