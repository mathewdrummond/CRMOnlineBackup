import { useState, useEffect, useMemo } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { OPERATIONS, getStageConfig } from "../lib/helpers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

export default function Schedule() {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("week");
  const [filterOp, setFilterOp] = useState("all");

  useEffect(() => {
    crmApi.entities.JobOperation.list("-start_date", 500).then(setOperations).finally(() => setLoading(false));
  }, []);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = useMemo(() => {
    const count = view === "week" ? 7 : view === "2week" ? 14 : 5;
    return Array.from({ length: count }, (_, i) => addDays(weekStart, i));
  }, [weekStart, view]);

  const filteredOps = filterOp !== "all" ? operations.filter(op => op.operation === filterOp) : operations;

  const getOpsForDay = (day) => filteredOps.filter(op => {
    if (!op.start_date) return false;
    try {
      const start = startOfDay(parseISO(op.start_date));
      const end = endOfDay(op.end_date ? parseISO(op.end_date) : parseISO(op.start_date));
      return isWithinInterval(day, { start, end });
    } catch { return false; }
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Schedule" subtitle="Production & installation planning" />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(prev => subWeeks(prev, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(prev => addWeeks(prev, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <span className="text-sm font-medium">{format(days[0], "d MMM")} – {format(days[days.length-1], "d MMM yyyy")}</span>
        <div className="flex gap-2 ml-auto">
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="work">Work Week (5)</SelectItem>
              <SelectItem value="week">Full Week (7)</SelectItem>
              <SelectItem value="2week">2 Weeks</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterOp} onValueChange={setFilterOp}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Operations</SelectItem>
              {OPERATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(140px, 1fr))` }}>
          {days.map(day => (
            <div key={`h-${day}`} className={`p-2 border-b border-r text-center sticky top-0 bg-card z-10 ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}>
              <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
              <p className={`text-sm font-semibold ${isSameDay(day, new Date()) ? "text-primary" : ""}`}>{format(day, "d")}</p>
              <p className="text-xs text-muted-foreground">{format(day, "MMM")}</p>
            </div>
          ))}
          {days.map(day => {
            const dayOps = getOpsForDay(day);
            return (
              <div key={`c-${day}`} className={`min-h-32 p-1.5 border-r border-b space-y-1 align-top ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}>
                {dayOps.map(op => {
                  const oc = getStageConfig(OPERATIONS, op.operation);
                  return (
                    <div key={op.id} className="p-1.5 rounded border bg-white text-xs cursor-pointer hover:shadow-sm transition-shadow">
                      <StatusBadge label={oc.label} color={oc.color} className="mb-1 text-[10px]" />
                      <p className="font-medium truncate">{op.job_title}</p>
                      {op.assigned_to && <p className="text-muted-foreground truncate">{op.assigned_to}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {operations.filter(o => !o.start_date).length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Unscheduled Operations ({operations.filter(o => !o.start_date).length})</h3>
          <div className="flex flex-wrap gap-2">
            {operations.filter(o => !o.start_date).map(op => {
              const oc = getStageConfig(OPERATIONS, op.operation);
              return (
                <div key={op.id} className="flex items-center gap-2 p-2 rounded border bg-card text-xs">
                  <StatusBadge label={oc.label} color={oc.color} />
                  <span className="font-medium">{op.job_title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}