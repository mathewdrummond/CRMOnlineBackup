import React, { useEffect, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock3, History, RefreshCw } from "lucide-react";
import { formatDate } from "../lib/helpers";

function formatActionLabel(action) {
  const normalized = String(action || "").replace(/_/g, " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Updated";
}

function formatChangedFields(summary) {
  const fields = Array.isArray(summary?.changed_fields) ? summary.changed_fields : [];
  if (fields.length === 0) {
    return "No field summary";
  }

  return fields.map((field) => String(field).replace(/_/g, " ")).join(", ");
}

export default function RecordAuditPanel({
  entityName,
  recordId,
  title = "Change History",
  limit = 8,
  className = "",
}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const loadEntries = async () => {
    if (!entityName || !recordId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const nextEntries = await crmApi.audit.list(entityName, recordId, Math.max(limit, 50));
      setEntries(Array.isArray(nextEntries) ? nextEntries : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, [entityName, recordId]);

  const previewEntries = entries.slice(0, limit);

  return (
    <>
      <Card className={`p-5 ${className}`}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh history" onClick={() => void loadEntries()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              View All
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading history...</div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : previewEntries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No changes recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {previewEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-sm">{formatActionLabel(entry.action)}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="w-3.5 h-3.5" />
                    {formatDate(entry.created_date)}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.actor_name || entry.actor_email || "System"}{entry.request_source ? ` · ${entry.request_source}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatChangedFields(entry.summary)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Review recorded changes, actors, timestamps, and changed fields for this record.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto space-y-3">
            {entries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No changes recorded yet.</div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">{formatActionLabel(entry.action)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {entry.actor_name || entry.actor_email || "System"}{entry.actor_role ? ` · ${entry.actor_role}` : ""}{entry.request_source ? ` · ${entry.request_source}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDate(entry.created_date)}</div>
                  </div>
                  <div className="mt-3 text-sm">
                    <div className="text-muted-foreground text-xs uppercase tracking-wide">Changed Fields</div>
                    <div className="mt-1">{formatChangedFields(entry.summary)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
