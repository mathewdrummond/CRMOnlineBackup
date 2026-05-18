import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { JOB_STATUSES, formatCurrency, formatDate, getStageConfig } from "../lib/helpers";
import { Briefcase, Search, Filter } from "lucide-react";

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    crmApi.entities.Job.list("-created_date", 200).then(setJobs).finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(j => {
    const matchSearch = `${j.title} ${j.job_number} ${j.contact_name} ${j.company_name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Jobs" subtitle={`${jobs.length} jobs · ${formatCurrency(jobs.reduce((s,j)=>s+(j.quoted_value||0),0))} total`} />
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {JOB_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Job #</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Title</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Client</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Value</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Due Date</th>
            </tr></thead>
            <tbody>
              {filtered.map(job => {
                const sc = getStageConfig(JOB_STATUSES, job.status);
                return (
                  <tr key={job.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{job.job_number}</td>
                    <td className="py-3 px-4 font-medium">{job.title}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{job.contact_name || job.company_name || "—"}</td>
                    <td className="py-3 px-4"><StatusBadge label={sc.label} color={sc.color} /></td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(job.quoted_value)}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(job.due_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={Briefcase} title="No jobs found" description="Jobs are created from accepted quotes" />}
      </Card>
    </div>
  );
}