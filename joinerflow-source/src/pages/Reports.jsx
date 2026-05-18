import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { formatCurrency, LEAD_STAGES, JOB_STATUSES } from "../lib/helpers";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users, Briefcase, DollarSign } from "lucide-react";

const COLORS = ["#3b82f6","#f59e0b","#10b981","#ef4444","#8b5cf6","#06b6d4","#ec4899"];

export default function Reports() {
  const [leads, setLeads] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      crmApi.entities.Lead.list("-created_date", 500),
      crmApi.entities.Job.list("-created_date", 500),
      crmApi.entities.Quote.list("-created_date", 500),
      crmApi.entities.TimeEntry.list("-created_date", 500),
      crmApi.entities.PurchaseOrder.list("-created_date", 200),
    ]).then(([l, j, q, t, p]) => { setLeads(l); setJobs(j); setQuotes(q); setTimeEntries(t); setPOs(p); })
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  // Pipeline by stage
  const pipelineData = LEAD_STAGES.filter(s => !["won","lost"].includes(s.value)).map(s => ({
    name: s.label, count: leads.filter(l => l.stage === s.value).length,
    value: leads.filter(l => l.stage === s.value).reduce((sum, l) => sum + (l.value || 0), 0),
  }));

  // Jobs by status
  const jobStatusData = JOB_STATUSES.map(s => ({
    name: s.label, count: jobs.filter(j => j.status === s.value).length,
  })).filter(d => d.count > 0);

  // Profitability
  const totalQuotedValue = jobs.reduce((s, j) => s + (j.quoted_value || 0), 0);
  const totalLabour = timeEntries.reduce((s, t) => s + (t.total_cost || 0), 0);
  const totalMaterials = pos.reduce((s, p) => s + (p.total || 0), 0);
  const totalCost = totalLabour + totalMaterials;
  const avgMargin = totalQuotedValue > 0 ? ((totalQuotedValue - totalCost) / totalQuotedValue * 100) : 0;

  // Win rate
  const won = leads.filter(l => l.stage === "won").length;
  const lost = leads.filter(l => l.stage === "lost").length;
  const winRate = (won + lost) > 0 ? Math.round(won / (won + lost) * 100) : 0;

  // Labour by operation
  const labourByOp = {};
  timeEntries.forEach(t => {
    if (!t.operation) return;
    labourByOp[t.operation] = (labourByOp[t.operation] || 0) + (t.hours || 0);
  });
  const labourData = Object.entries(labourByOp).map(([op, h]) => ({ name: op.replace(/_/g," "), hours: h })).sort((a,b) => b.hours - a.hours);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Reports" subtitle="Business performance overview" />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Pipeline Value" value={formatCurrency(leads.filter(l=>!["won","lost"].includes(l.stage)).reduce((s,l)=>s+(l.value||0),0))} icon={TrendingUp} />
        <StatCard title="Win Rate" value={`${winRate}%`} subtitle={`${won} won / ${lost} lost`} icon={Users} />
        <StatCard title="Jobs Value" value={formatCurrency(totalQuotedValue)} subtitle={`${jobs.length} jobs`} icon={Briefcase} />
        <StatCard title="Avg Margin" value={`${avgMargin.toFixed(1)}%`} subtitle={formatCurrency(totalQuotedValue - totalCost)} icon={DollarSign} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Pipeline chart */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Lead Pipeline by Stage</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pipelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, name) => name === "value" ? formatCurrency(v) : v} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Jobs by status */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Jobs by Status</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={jobStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" paddingAngle={3}>
                  {jobStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {jobStatusData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /><span>{d.name}</span></div>
                  <span className="font-semibold">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Labour by operation */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Labour Hours by Operation</h3>
          {labourData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No time entries yet</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={labourData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="hours" fill="hsl(var(--chart-2))" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Profitability summary */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Profitability Summary</h3>
          <div className="space-y-4">
            {[
              { label: "Total Quoted Value", value: formatCurrency(totalQuotedValue), color: "text-foreground" },
              { label: "Labour Cost", value: `−${formatCurrency(totalLabour)}`, color: "text-red-500" },
              { label: "Material Cost (POs)", value: `−${formatCurrency(totalMaterials)}`, color: "text-red-500" },
              { label: "Gross Profit", value: formatCurrency(totalQuotedValue - totalCost), color: avgMargin >= 20 ? "text-emerald-600" : "text-amber-600" },
              { label: "Gross Margin", value: `${avgMargin.toFixed(1)}%`, color: avgMargin >= 20 ? "text-emerald-600" : "text-amber-600" },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b last:border-b-0">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}