import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PayPeriodPicker from "./PayPeriodPicker";
import { formatDate } from "../../lib/helpers";
import { Download, FileText, Clock, CheckCircle2 } from "lucide-react";

const ACTIVITY_MAP = {
  design: "DESIGN",
  ordering: "ORDERING",
  cnc: "CNC",
  machining: "MACHINING",
  edging: "EDGING",
  assembly: "ASSEMBLY",
  finishing: "FINISHING",
  delivery: "DELIVERY",
  install: "INSTALL",
  break: "BREAK",
  other: "OTHER",
};

export default function ExportTab({ user, staff }) {
  const [dateRange, setDateRange] = useState(null);
  const [exportType, setExportType] = useState("activity_slip");
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [exportHistory, setExportHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { if (dateRange) loadEntries(); }, [dateRange]);

  const loadEntries = async () => {
    setLoading(true);
    let all = await crmApi.entities.TimeEntry.filter({ status: "completed" }, "-date", 500);
    all = all.filter(e => e.date >= dateRange.start && e.date <= dateRange.end && !e.exported);
    setEntries(all);
    setSelected(new Set(all.map(e => e.id)));
    setLoading(false);
  };

  const loadHistory = async () => {
    const h = await crmApi.entities.ExportHistory.list("-exported_at", 20);
    setExportHistory(h);
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === entries.length ? new Set() : new Set(entries.map(e => e.id)));
  };

  const buildCSV = (rows) => {
    if (exportType === "activity_slip") {
      const header = "Co./Last Name,First Name,Card ID,Memo,Date,Activity,Job,Hours";
      const lines = rows.map(e => {
        const s = staff.find(s => s.name === e.staff_name);
        const nameParts = (e.staff_name || "").split(" ");
        const lastName = nameParts.pop() || "";
        const firstName = nameParts.join(" ");
        const activity = ACTIVITY_MAP[e.operation] || e.operation?.toUpperCase() || "";
        return `"${lastName}","${firstName}","${s?.employee_id || ""}","${e.notes || ""}","${e.date}","${activity}","${e.job_number || ""}","${e.hours?.toFixed(2) || "0"}"`;
      });
      return [header, ...lines].join("\n");
    } else {
      // Timesheet format
      const header = "Co./Last Name,First Name,Card ID,Date,Start Time,End Time,Hours";
      const lines = rows.map(e => {
        const s = staff.find(s => s.name === e.staff_name);
        const nameParts = (e.staff_name || "").split(" ");
        const lastName = nameParts.pop() || "";
        const firstName = nameParts.join(" ");
        const startTime = e.clock_in ? new Date(e.clock_in).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
        const endTime = e.clock_out ? new Date(e.clock_out).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
        return `"${lastName}","${firstName}","${s?.employee_id || ""}","${e.date}","${startTime}","${endTime}","${e.hours?.toFixed(2) || "0"}"`;
      });
      return [header, ...lines].join("\n");
    }
  };

  const doExport = async () => {
    const toExport = entries.filter(e => selected.has(e.id));
    if (toExport.length === 0) return;
    setExporting(true);

    const batchId = crypto.randomUUID();
    const exportedAt = new Date().toISOString();
    const exportedBy = user?.email || "";

    // Build CSV and download
    const csv = buildCSV(toExport);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportType}_${dateRange.start}_${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Mark entries as exported and save history
    await Promise.all([
      ...toExport.map(e => crmApi.entities.TimeEntry.update(e.id, { exported: true, exported_batch_id: batchId })),
      ...toExport.map(e => {
        const s = staff.find(s => s.name === e.staff_name);
        return crmApi.entities.ExportHistory.create({
          batch_id: batchId,
          exported_at: exportedAt,
          exported_by: exportedBy,
          export_type: exportType,
          time_entry_id: e.id,
          staff_name: e.staff_name,
          employee_id: s?.employee_id || "",
          job_number: e.job_number,
          job_name: e.job_title,
          activity: e.operation,
          date: e.date,
          hours: e.hours,
          description: e.notes,
        });
      }),
    ]);

    setExporting(false);
    loadEntries();
    loadHistory();
  };

  const selectedEntries = entries.filter(e => selected.has(e.id));
  const totalHours = selectedEntries.reduce((s, e) => s + (e.hours || 0), 0);

  return (
    <div className="space-y-6">
      {/* Config */}
      <Card className="p-5 space-y-4">
        <h3 className="font-semibold">Export Settings</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">Pay Period</Label>
            <PayPeriodPicker onRangeChange={setDateRange} />
          </div>
          <div>
            <Label className="mb-1.5 block">Export Type</Label>
            <Select value={exportType} onValueChange={setExportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activity_slip">Activity Slip (Job Costing)</SelectItem>
                <SelectItem value="timesheet">Timesheet (Payroll)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Entries to export */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 bg-muted/50 flex justify-between items-center border-b">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={selected.size === entries.length && entries.length > 0} onChange={toggleAll} className="w-4 h-4 cursor-pointer" />
            <span className="font-semibold">Pending Entries</span>
            {entries.length > 0 && <Badge variant="secondary">{entries.length}</Badge>}
          </div>
          {entries.length > 0 && (
            <span className="text-sm text-muted-foreground">{selected.size} selected · {totalHours.toFixed(1)}h</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
        ) : !dateRange ? (
          <div className="p-10 text-center text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Select a pay period above to load entries
          </div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            All entries for this period have been exported
          </div>
        ) : (
          <div className="divide-y">
            {entries.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="w-4 h-4 cursor-pointer" />
                <div className="w-24 text-muted-foreground">{formatDate(e.date)}</div>
                <div className="flex-1">
                  <span className="font-medium">{e.staff_name}</span>
                  <span className="text-muted-foreground ml-2">· {e.job_number} {e.job_title}</span>
                </div>
                <span className="text-muted-foreground">{e.operation}</span>
                <span className="font-mono">{e.hours?.toFixed(2)}h</span>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <div className="px-5 py-3 border-t flex justify-end">
            <Button onClick={doExport} disabled={selected.size === 0 || exporting}>
              <Download className="w-4 h-4 mr-1.5" />
              {exporting ? "Exporting..." : `Export ${selected.size} Entries as CSV`}
            </Button>
          </div>
        )}
      </Card>

      {/* Export history */}
      {exportHistory.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 bg-muted/50 border-b flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="font-semibold">Recent Exports</span>
          </div>
          <div className="divide-y">
            {Object.entries(
              exportHistory.reduce((acc, e) => {
                if (!acc[e.batch_id]) acc[e.batch_id] = { ...e, count: 0, totalHours: 0 };
                acc[e.batch_id].count++;
                acc[e.batch_id].totalHours += e.hours || 0;
                return acc;
              }, {})
            ).slice(0, 10).map(([batchId, batch]) => (
              <div key={batchId} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{batch.export_type === "activity_slip" ? "Activity Slip" : "Timesheet"}</span>
                  <span className="text-muted-foreground ml-2">· {batch.count} entries · {batch.totalHours.toFixed(1)}h</span>
                </div>
                <span className="text-muted-foreground text-xs">{formatDate(batch.exported_at?.split("T")[0])}</span>
                <span className="text-muted-foreground text-xs">{batch.exported_by}</span>
                <Badge variant="secondary">Exported</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}