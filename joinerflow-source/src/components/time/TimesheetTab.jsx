import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PayPeriodPicker from "./PayPeriodPicker";
import { formatDate, formatCurrency, OPERATIONS, getStageConfig } from "../../lib/helpers";
import { Trash2 } from "lucide-react";

export default function TimesheetTab({ staff }) {
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
    if (dateRange) {
      all = all.filter(e => e.date >= dateRange.start && e.date <= dateRange.end);
    }
    if (filterStaff !== "all") {
      all = all.filter(e => e.staff_name === filterStaff);
    }
    setEntries(all);
    setLoading(false);
  };

  const deleteEntry = async (id) => {
    await crmApi.entities.TimeEntry.delete(id);
    loadEntries();
  };

  // Group by staff
  const grouped = entries.reduce((acc, e) => {
    const key = e.staff_name || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const totalCost = entries.reduce((s, e) => s + (e.total_cost || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <PayPeriodPicker onRangeChange={setDateRange} />
        </div>
        <Select value={filterStaff} onValueChange={setFilterStaff}>
          <SelectTrigger className="w-48">
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
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p></Card>
          <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Entries</p><p className="text-2xl font-bold">{entries.length}</p></Card>
          <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Cost</p><p className="text-2xl font-bold">{formatCurrency(totalCost)}</p></Card>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : entries.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No entries found for the selected period</Card>
      ) : (
        Object.entries(grouped).map(([staffName, staffEntries]) => (
          <Card key={staffName} className="overflow-hidden">
            <div className="px-5 py-3 bg-muted/50 flex justify-between items-center border-b">
              <span className="font-semibold">{staffName}</span>
              <span className="text-sm text-muted-foreground">
                {staffEntries.reduce((s, e) => s + (e.hours || 0), 0).toFixed(1)}h · {formatCurrency(staffEntries.reduce((s, e) => s + (e.total_cost || 0), 0))}
              </span>
            </div>
            <div className="divide-y">
              {staffEntries.map(entry => {
                const oc = getStageConfig(OPERATIONS, entry.operation);
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/30">
                    <div className="w-24 text-muted-foreground">{formatDate(entry.date)}</div>
                    <div className="flex-1">
                      <span className="font-medium">{entry.job_number}</span>
                      <span className="text-muted-foreground ml-2">{entry.job_title}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{oc?.label || entry.operation}</Badge>
                    <span className="font-mono w-14 text-right">{entry.hours?.toFixed(2)}h</span>
                    {entry.exported ? (
                      <Badge variant="secondary" className="text-xs">Exported</Badge>
                    ) : (
                      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteEntry(entry.id)}>
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