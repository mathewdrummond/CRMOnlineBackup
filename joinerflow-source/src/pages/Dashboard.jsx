import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import PageHeader from "../components/PageHeader";
import { formatCurrency, formatDate, LEAD_STAGES, JOB_STATUSES, getStageConfig } from "../lib/helpers";
import { Target, FileText, Briefcase, DollarSign, AlertTriangle, ArrowRight, Plus, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      crmApi.entities.Lead.list("-created_date", 100),
      crmApi.entities.Job.list("-created_date", 100),
      crmApi.entities.Quote.list("-created_date", 50),
      crmApi.entities.AppAlert.filter({ is_resolved: false }, "-created_date", 10),
    ]).then(([l, j, q, a]) => {
      setLeads(l); setJobs(j); setQuotes(q); setAlerts(a);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const activeLeads = leads.filter(l => !["won","lost"].includes(l.stage));
  const pipelineValue = activeLeads.reduce((s, l) => s + (l.value || 0), 0);
  const activeJobs = jobs.filter(j => !["complete","cancelled"].includes(j.status));
  const jobsValue = activeJobs.reduce((s, j) => s + (j.quoted_value || 0), 0);
  const pendingQuotes = quotes.filter(q => q.status === "sent");
  const won = leads.filter(l => l.stage === "won").length;
  const lost = leads.filter(l => l.stage === "lost").length;
  const total = won + lost;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Dashboard" subtitle="Workshop overview"
        actions={
          <div className="flex gap-2">
            <Link to="/leads"><Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />New Lead</Button></Link>
            <Link to="/quotes"><Button size="sm"><Plus className="w-4 h-4 mr-1" />New Quote</Button></Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Pipeline" value={formatCurrency(pipelineValue)} subtitle={`${activeLeads.length} active leads`} icon={Target} />
        <StatCard title="Open Quotes" value={pendingQuotes.length} subtitle="Awaiting response" icon={FileText} />
        <StatCard title="Active Jobs" value={activeJobs.length} subtitle={formatCurrency(jobsValue)} icon={Briefcase} />
        <StatCard title="Alerts" value={alerts.length} subtitle="Need attention" icon={AlertTriangle} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Lead Pipeline</h2>
            <Link to="/leads" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {LEAD_STAGES.filter(s => !["won","lost","on_hold"].includes(s.value)).map(stage => {
              const stageLeads = leads.filter(l => l.stage === stage.value);
              return (
                <div key={stage.value} className="p-3 bg-muted/50 rounded-lg">
                  <StatusBadge label={stage.label} color={stage.color} className="mb-2 text-[10px]" />
                  <p className="text-lg font-bold">{stageLeads.length}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(stageLeads.reduce((s, l) => s + (l.value || 0), 0))}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Alerts</h2>
            <Link to="/alerts" className="text-xs text-primary font-medium hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No active alerts</p>
            ) : alerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${alert.type === "urgent" ? "bg-red-500" : alert.type === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Active Jobs</h2>
            <Link to="/jobs" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-1">
            {jobs.slice(0, 6).map(job => {
              const sc = getStageConfig(JOB_STATUSES, job.status);
              return (
                <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-xs font-mono text-muted-foreground w-20 flex-shrink-0">{job.job_number}</span>
                  <span className="text-sm font-medium flex-1 truncate">{job.title}</span>
                  <StatusBadge label={sc.label} color={sc.color} />
                  <span className="text-sm font-semibold flex-shrink-0">{formatCurrency(job.quoted_value)}</span>
                </Link>
              );
            })}
            {jobs.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No jobs yet</p>}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-sm mb-4">Win Rate</h2>
          <div className="text-center py-6">
            <p className="text-5xl font-bold text-primary">{winRate}%</p>
            <p className="text-xs text-muted-foreground mt-2">Quote to job conversion</p>
            <div className="flex justify-between mt-4 text-sm font-medium">
              <span className="text-emerald-600">{won} Won</span>
              <span className="text-red-500">{lost} Lost</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}