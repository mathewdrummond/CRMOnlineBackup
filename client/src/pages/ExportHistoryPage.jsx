import { useEffect, useMemo, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { formatDate } from "@/lib/helpers";

function cleanCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function downloadCsv(filename, rows) {
  const contents = rows.map((row) => row.map(cleanCsvValue).join(",")).join("\n");
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildCsvRows(records) {
  return [
    [
      "Batch ID",
      "Exported At",
      "Exported By",
      "Export Type",
      "Staff Name",
      "Employee ID",
      "Job Number",
      "Job Name",
      "Customer",
      "Activity",
      "Date",
      "Hours",
      "Description",
    ],
    ...records.map((record) => [
      record.batch_id,
      record.exported_at,
      record.exported_by,
      record.export_type,
      record.staff_name,
      record.employee_id,
      record.job_number,
      record.job_name,
      record.customer,
      record.activity,
      record.date,
      record.hours,
      record.description,
    ]),
  ];
}

export default function ExportHistoryPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const loadHistory = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const history = await crmApi.entities.ExportHistory.list("-exported_at", 2000);
      setRecords(Array.isArray(history) ? history : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Export history could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const recordDate = String(record.date || String(record.exported_at || "").slice(0, 10));
        if (dateFrom && recordDate < dateFrom) {
          return false;
        }
        if (dateTo && recordDate > dateTo) {
          return false;
        }
        return true;
      }),
    [dateFrom, dateTo, records]
  );

  const batches = useMemo(() => {
    const grouped = new Map();

    filteredRecords.forEach((record) => {
      const key = String(record.batch_id || record.id);
      const current = grouped.get(key) || {
        batchId: key,
        exportedAt: record.exported_at || record.created_date || "",
        exportedBy: record.exported_by || "",
        exportType: record.export_type || "",
        totalHours: 0,
        entryCount: 0,
        records: [],
      };

      current.totalHours += Number(record.hours || 0);
      current.entryCount += 1;
      current.records.push(record);
      grouped.set(key, current);
    });

    return [...grouped.values()].sort((left, right) => String(right.exportedAt).localeCompare(String(left.exportedAt)));
  }, [filteredRecords]);

  const toggleExpanded = (batchId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
      <PageHeader
        title="Export History"
        subtitle="Append-only MYOB export audit grouped by batch so finance and payroll changes stay traceable."
        actions={(
          <Button
            type="button"
            variant="outline"
            disabled={filteredRecords.length === 0}
            onClick={() => downloadCsv(`export_history_${dateFrom || "all"}_${dateTo || "all"}.csv`, buildCsvRows(filteredRecords))}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Download All CSV
          </Button>
        )}
      />
      {loadError ? (
        <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadHistory()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Batches</p>
            <p className="mt-2 text-3xl font-semibold">{batches.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Rows</p>
            <p className="mt-2 text-3xl font-semibold">{filteredRecords.length}</p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="export-history-from">Date From</label>
            <Input id="export-history-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground" htmlFor="export-history-to">Date To</label>
            <Input id="export-history-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-2 min-h-[44px]" />
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <Card className="p-8 text-sm text-muted-foreground">
          No export history matched the current filters.
        </Card>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const isOpen = expanded.has(batch.batchId);
            return (
              <Card key={batch.batchId} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-4 sm:px-5">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(batch.batchId)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{String(batch.exportType || "export").replace(/_/g, " ")}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(batch.exportedAt)} · {batch.exportedBy || "Unknown exporter"}
                      </p>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{batch.entryCount} rows</Badge>
                    <Badge variant="outline">{batch.totalHours.toFixed(2)}h</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => downloadCsv(`export_batch_${batch.batchId}.csv`, buildCsvRows(batch.records))}
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Download CSV
                    </Button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="divide-y">
                    {batch.records.map((record) => (
                      <div key={record.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[1.1fr_1fr_0.7fr_0.7fr]">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{record.staff_name || "Unknown staff"}</p>
                          <p className="text-sm text-muted-foreground">
                            {[record.job_number, record.job_name, record.customer].filter(Boolean).join(" · ") || "No linked job snapshot"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">{record.activity || "—"}</p>
                          <p className="text-xs text-muted-foreground">{record.description || "No description"}</p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p>{formatDate(record.date || record.exported_at)}</p>
                          <p>{record.employee_id || "No employee ID"}</p>
                        </div>
                        <div className="text-left md:text-right">
                          <p className="font-semibold text-foreground">{Number(record.hours || 0).toFixed(2)}h</p>
                          <p className="text-xs text-muted-foreground">{record.batch_id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
