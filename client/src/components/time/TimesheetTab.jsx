import React, { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PayPeriodPicker from "./PayPeriodPicker";
import { formatDate, formatCurrency, OPERATIONS, getStageConfig } from "../../lib/helpers";
import { groupTimesheetDisplayEntries } from "@/lib/timeGrouping";
import { useClientMode } from "@/lib/clientMode.jsx";
import { Trash2 } from "lucide-react";

const IS_TIMECLOCK_APP = import.meta.env.VITE_APP_KIND === "timeclock";

export default function TimesheetTab({ staff }) {
  const { clientMode } = useClientMode();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStaff, setFilterStaff] = useState("all");
  const [dateRange, setDateRange] = useState(null);

  useEffect(() => {
    if (dateRange) loadEntries();
  }, [dateRange, filterStaff]);

  const loadEntries = async () => {
    setLoading(true);
    let all = await crmApi.entities.TimeEntry.filter({ status: "completed" }, "-date", 500);
    if (IS_TIMECLOCK_APP) {
      all = all.filter((entry) => entry.exported !== true);
    }
    if (dateRange) {
      all = all.filter(e => e.date >= dateRange.from && e.date <= dateRange.to);
    }
    if (filterStaff !== "all") {
      all = all.filter(e => e.staff_name === filterStaff);
    }
    setEntries(all);
    setLoading(false);
  };

  const getActivityLabel = (entry) => entry.activity || getStageConfig(OPERATIONS, entry.operation)?.label || entry.operation?.replace(/_/g, " ") || "—";
  const getJobLabel = (entry) => entry.job_title || entry.job_name || "—";
  const groupedEntries = groupTimesheetDisplayEntries(entries, { getActivityLabel, getJobLabel });

  const deleteEntryGroup = async (entryGroup) => {
    const sourceIds = Array.isArray(entryGroup?.source_ids) && entryGroup.source_ids.length > 0
      ? entryGroup.source_ids
      : [entryGroup?.id].filter(Boolean);

    if (sourceIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      sourceIds.length === 1
        ? "Delete this timesheet entry?"
        : `Delete ${sourceIds.length} merged timesheet entries? This will remove all underlying records in this row.`
    );
    if (!confirmed) {
      return;
    }

    await Promise.all(sourceIds.map((sourceId) => crmApi.entities.TimeEntry.delete(sourceId)));
    await loadEntries();
  };

  // Group by staff
  const grouped = groupedEntries.reduce((acc, e) => {
    const key = e.staff_name || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const totalCost = clientMode ? 0 : entries.reduce((s, e) => s + (e.total_cost || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <PayPeriodPicker onRangeChange={setDateRange} />
        </div>
        <Select value={filterStaff} onValueChange={setFilterStaff}>
          <SelectTrigger className="jf-workshop-touch w-48">
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staff.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className={`grid gap-3 ${clientMode ? "grid-cols-2" : "grid-cols-3"}`}>
          <Card className="jf-workshop-status-panel p-4 text-center"><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p></Card>
          <Card className="jf-workshop-status-panel p-4 text-center"><p className="text-xs text-muted-foreground">Entries</p><p className="text-2xl font-bold">{groupedEntries.length}</p></Card>
          {!clientMode ? <Card className="jf-workshop-status-panel p-4 text-center"><p className="text-xs text-muted-foreground">Total Cost</p><p className="text-2xl font-bold">{formatCurrency(totalCost)}</p></Card> : null}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : entries.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No entries found for the selected period</Card>
      ) : (
        Object.entries(grouped).map(([staffName, staffEntries]) => (
          <Card key={staffName} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/45 bg-white/55 px-5 py-3">
              <span className="text-lg font-semibold">{staffName}</span>
              <span className="text-sm text-muted-foreground">
                {staffEntries.reduce((s, e) => s + (e.hours || 0), 0).toFixed(1)}h{clientMode ? "" : ` · ${formatCurrency(staffEntries.reduce((s, e) => s + (e.total_cost || 0), 0))}`}
              </span>
            </div>
            <div className="divide-y">
              {staffEntries.map(entry => {
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-5 py-4 text-sm hover:bg-muted/30">
                    <div className="w-24 text-muted-foreground">{formatDate(entry.date)}</div>
                    <div className="flex-1">
                      <span className="font-medium">{entry.job_number}</span>
                      <span className="text-muted-foreground ml-2">{entry.job_label || getJobLabel(entry)}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{entry.activity_label || getActivityLabel(entry)}</Badge>
                    {entry.entry_count > 1 ? (
                      <Badge variant="secondary" className="text-xs">{entry.entry_count} merged</Badge>
                    ) : null}
                    <span className="font-mono w-14 text-right">{entry.hours?.toFixed(2)}h</span>
                    {entry.exported ? (
                      <Badge variant="secondary" className="text-xs">Exported</Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" onClick={() => deleteEntryGroup(entry)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
