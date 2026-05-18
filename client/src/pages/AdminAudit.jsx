import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/helpers";

const EMPTY_FILTERS = {
  q: "",
  entity: "",
  action: "",
  actor_email: "",
  request_source: "",
  limit: 150,
};

function formatActionLabel(action) {
  const text = String(action || "").replace(/_/g, " ").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "Update";
}

function formatFields(summary) {
  const changedFields = Array.isArray(summary?.changed_fields) ? summary.changed_fields : [];
  if (changedFields.length === 0) {
    return "No field summary";
  }

  return changedFields.map((field) => String(field).replace(/_/g, " ")).join(", ");
}

function downloadBlob(payload, fallbackFileName) {
  const blob = payload?.blob instanceof Blob ? payload.blob : null;
  if (!blob) {
    throw new Error("Download data was empty.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName || fallbackFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function AdminAudit() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");

  const loadAudit = async (nextFilters = filters) => {
    setLoading(true);
    setError("");

    try {
      const records = await crmApi.admin.listAudit(nextFilters);
      setEntries(Array.isArray(records) ? records : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load audit history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit(filters);
  }, []);

  const summary = useMemo(() => {
    const byAction = entries.reduce((accumulator, entry) => {
      const key = String(entry.action || "update");
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(byAction).slice(0, 4);
  }, [entries]);

  const handleApply = () => {
    void loadAudit(filters);
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    void loadAudit(EMPTY_FILTERS);
  };

  const handleDownload = async (format) => {
    setExporting(format);

    try {
      const payload = await crmApi.admin.downloadAudit(filters, format);
      downloadBlob(payload, format === "json" ? "audit-export.json" : "audit-export.csv");
      toast({
        title: `Audit ${format.toUpperCase()} download started.`,
      });
    } catch (nextError) {
      toast({
        variant: "destructive",
        title: "Audit export failed",
        description: nextError instanceof Error ? nextError.message : "The audit export could not be generated.",
      });
    } finally {
      setExporting("");
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Audit"
        subtitle="Search record changes across the CRM by entity, actor, source, or free text."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => void handleDownload("csv")} disabled={Boolean(exporting)}>
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleDownload("json")} disabled={Boolean(exporting)}>
              <Download className="w-4 h-4 mr-1.5" />
              Export JSON
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              Reset
            </Button>
            <Button type="button" onClick={handleApply}>
              <Search className="w-4 h-4 mr-1.5" />
              Search
            </Button>
          </>
        )}
      />

      <Card className="p-5 mb-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
            placeholder="Search record ID, actor, or fields"
          />
          <Input
            value={filters.entity}
            onChange={(event) => setFilters((current) => ({ ...current, entity: event.target.value }))}
            placeholder="Entity, e.g. Job"
          />
          <Input
            value={filters.action}
            onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
            placeholder="Action, e.g. update"
          />
          <Input
            value={filters.actor_email}
            onChange={(event) => setFilters((current) => ({ ...current, actor_email: event.target.value }))}
            placeholder="Actor email"
          />
          <Input
            value={filters.request_source}
            onChange={(event) => setFilters((current) => ({ ...current, request_source: event.target.value }))}
            placeholder="Source, e.g. crm"
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Rows</p>
          <p className="mt-2 text-3xl font-semibold">{entries.length}</p>
        </Card>
        {summary.map(([action, count]) => (
          <Card key={action} className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{formatActionLabel(action)}</p>
            <p className="mt-2 text-3xl font-semibold">{count}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Recent Changes</h2>
            <p className="text-sm text-muted-foreground">Each entry shows who changed what, when, and from where.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => void loadAudit(filters)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">Loading audit history...</div>
        ) : error ? (
          <div className="px-5 py-10">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No audit entries matched the current filters.</div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{entry.entity}</Badge>
                  <Badge variant="secondary">{formatActionLabel(entry.action)}</Badge>
                  {entry.request_source ? <Badge variant="outline">{entry.request_source}</Badge> : null}
                  <span className="text-xs text-muted-foreground">{formatDate(entry.created_date)}</span>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Record</p>
                    <p className="mt-1 text-sm font-medium break-all">{entry.record_id}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Actor</p>
                    <p className="mt-1 text-sm">{entry.actor_name || entry.actor_email || "System"}</p>
                    {entry.actor_email ? <p className="text-xs text-muted-foreground break-all">{entry.actor_email}</p> : null}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Changed Fields</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatFields(entry.summary)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="w-4 h-4" />
        Audit history comes from the server-side change log and can now be exported with the current filters applied.
      </div>
    </div>
  );
}
