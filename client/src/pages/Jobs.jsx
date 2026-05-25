import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { JOB_STATUSES, formatCurrency, formatDate, getStageConfig } from "../lib/helpers";
import { getNextSequentialJobNumber } from "../lib/coreFlowHelpers";
import { getJobOperationalSummary, isActiveJob } from "../lib/crmOpsInsights";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useSortableRows } from "@/lib/tableSorting";
import { Briefcase, Search, Filter, Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

function getContactDisplayName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.full_name || contact.email || "Unnamed Contact";
}

const JOB_SORT_COLUMNS = {
  job_number: { accessor: ({ job }) => job.job_number, type: "text" },
  title: { accessor: ({ job }) => job.title, type: "text" },
  client: { accessor: ({ job }) => job.contact_name || job.company_name, type: "text" },
  status: { accessor: ({ job }) => job.status, type: "status" },
  workflow: { accessor: ({ operational }) => operational.progressPercent, type: "percent" },
  install: { accessor: ({ operational }) => operational.installDate, type: "date" },
  budget_hours: { accessor: ({ job }) => job.budget_hours, type: "number" },
  value: { accessor: ({ job }) => job.quoted_value, type: "currency" },
  due_date: { accessor: ({ job }) => job.due_date, type: "date" },
};

const ALL_STATUSES_EXCLUDED = new Set(["cancelled", "canceled"]);

function matchesJobStatusFilter(job, statusFilter) {
  const normalizedStatus = String(job?.status || "").trim().toLowerCase();

  if (statusFilter === "all") {
    return !ALL_STATUSES_EXCLUDED.has(normalizedStatus);
  }

  return normalizedStatus === String(statusFilter || "").trim().toLowerCase();
}

export default function Jobs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const requestedStatus = searchParams.get("status");
  const validStatusFilter = requestedStatus && JOB_STATUSES.some((status) => status.value === requestedStatus) ? requestedStatus : "all";
  const [statusFilter, setStatusFilter] = useState(validStatusFilter);
  const [healthFilter, setHealthFilter] = useState("all");
  const [form, setForm] = useState({
    title: "",
    job_number: "",
    contact_id: "",
    contact_name: "",
    site_address: "",
    billing_basis: "time_and_materials",
    budget_hours: "",
    due_date: "",
  });

  const loadData = async () => {
    setLoadError("");
    const [jobRecords, contactRecords, operationRecords] = await Promise.all([
      crmApi.entities.Job.list("-created_date", 500),
      crmApi.entities.Contact.list("-created_date"),
      crmApi.entities.JobOperation?.list ? crmApi.entities.JobOperation.list("-sort_order", 2000) : Promise.resolve([]),
    ]);
    setJobs(Array.isArray(jobRecords) ? jobRecords : []);
    setContacts(Array.isArray(contactRecords) ? contactRecords : []);
    setOperations(Array.isArray(operationRecords) ? operationRecords : []);
  };

  const reloadData = async () => {
    setLoading(true);
    try {
      await loadData();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Jobs could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadData();
  }, []);

  useEffect(() => {
    setStatusFilter(validStatusFilter);
  }, [validStatusFilter]);

  const resetForm = () => {
    setForm({
      title: "",
      job_number: getNextSequentialJobNumber(jobs),
      contact_id: "",
      contact_name: "",
      site_address: "",
      billing_basis: "time_and_materials",
      budget_hours: "",
      due_date: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const sortedContacts = [...contacts].sort((left, right) =>
    getContactDisplayName(left).localeCompare(getContactDisplayName(right), undefined, { sensitivity: "base", numeric: true })
  );

  const jobRows = useMemo(
    () =>
      jobs.map((job) => ({
        job,
        operational: getJobOperationalSummary(job, operations),
      })),
    [jobs, operations]
  );

  const filtered = useMemo(
    () =>
      jobRows.filter(({ job, operational }) => {
        const matchSearch = `${job.title} ${job.job_number} ${job.contact_name} ${job.company_name} ${operational.nextTaskName}`.toLowerCase().includes(search.toLowerCase());
        const matchStatus = matchesJobStatusFilter(job, statusFilter);
        const matchHealth = healthFilter === "all" || operational.health.label.toLowerCase().replace(/\s+/g, "_") === healthFilter;
        return matchSearch && matchStatus && matchHealth;
      }),
    [healthFilter, jobRows, search, statusFilter]
  );
  const { sortedRows: sortedJobs, sortState, requestSort } = useSortableRows(filtered, JOB_SORT_COLUMNS);

  const activeJobRows = jobRows.filter(({ job }) => isActiveJob(job));
  const installsSoon = activeJobRows.filter(({ operational }) => operational.daysUntilInstall != null && operational.daysUntilInstall >= 0 && operational.daysUntilInstall <= 14);
  const atRiskJobs = activeJobRows.filter(({ operational }) => operational.health.rank <= 4);
  const unscheduledTasks = activeJobRows.reduce((sum, { operational }) => sum + operational.unscheduledCount, 0);

  const createJob = async () => {
    const trimmedTitle = String(form.title || "").trim();
    const trimmedJobNumber = String(form.job_number || "").trim();
    const selectedContact = contacts.find((contact) => contact.id === form.contact_id) || null;
    const contactName = selectedContact
      ? getContactDisplayName(selectedContact)
      : String(form.contact_name || "").trim();

    if (!trimmedTitle || !trimmedJobNumber || !contactName) {
      toast({
        variant: "destructive",
        title: "Missing job details",
        description: "Job title, job number, and client name are required.",
      });
      return;
    }

    const duplicateNumber = jobs.some(
      (job) => String(job.job_number || "").trim().toLowerCase() === trimmedJobNumber.toLowerCase()
    );
    if (duplicateNumber) {
      toast({
        variant: "destructive",
        title: "Duplicate job number",
        description: "That job number is already in use.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const createdJob = await crmApi.entities.Job.create({
        title: trimmedTitle,
        job_number: trimmedJobNumber,
        contact_id: selectedContact?.id,
        contact_name: contactName,
        company_id: selectedContact?.company_id || "",
        company_name: selectedContact?.company_name || "",
        site_address: String(form.site_address || "").trim(),
        status: "planning",
        budget_hours: Number(form.budget_hours || 0) || 0,
        quoted_value: 0,
        billing_basis: form.billing_basis,
        job_source: "direct",
        is_walk_in: !selectedContact,
        due_date: form.due_date || "",
      });

      setShowCreate(false);
      navigate(`/jobs/${createdJob.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Job could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Jobs"
        subtitle={`${jobs.length} jobs · ${formatCurrency(jobs.reduce((s,j)=>s+(j.quoted_value||0),0))} total`}
        actions={<Button size="sm" className="min-h-[40px]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Add Job</Button>}
      />
      {loadError ? (
        <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void reloadData()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="mb-4 border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
        MYOB alignment matters here. Keep job numbers exact so exports and costing stay tied to the same MYOB job.
      </Card>
      <div className="grid gap-3 mb-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active Jobs", value: activeJobRows.length, hint: "Open work across the business" },
          { label: "Installs 14 Days", value: installsSoon.length, hint: "Upcoming site commitments" },
          { label: "At Risk", value: atRiskJobs.length, hint: "Overdue, blocked, or install-risk jobs" },
          { label: "Unscheduled Tasks", value: unscheduledTasks, hint: "Open workflow tasks without dates" },
        ].map((metric) => (
          <Card key={metric.label} className="rounded-2xl border-border/80 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
          </Card>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(value) => {
          setStatusFilter(value);
          const nextParams = new URLSearchParams(searchParams);
          if (value === "all") {
            nextParams.delete("status");
          } else {
            nextParams.set("status", value);
          }
          setSearchParams(nextParams, { replace: true });
        }}>
          <SelectTrigger className="h-10 w-full min-w-[176px] sm:w-44"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {JOB_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="h-10 w-full min-w-[192px] sm:w-48"><SelectValue placeholder="All Health" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Health</SelectItem>
            {["overdue", "needs_scheduling", "install_risk", "blocked", "in_flight", "queued", "ready_to_close", "needs_setup", "planned"].map((value) => (
              <SelectItem key={value} value={value}>
                {value.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <SortableHeader columnKey="job_number" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground">Job #</SortableHeader>
              <SortableHeader columnKey="title" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground">Title</SortableHeader>
              <SortableHeader columnKey="client" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Client</SortableHeader>
              <SortableHeader columnKey="status" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground">Status</SortableHeader>
              <SortableHeader columnKey="workflow" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Workflow</SortableHeader>
              <SortableHeader columnKey="install" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden xl:table-cell">Install</SortableHeader>
              <SortableHeader columnKey="budget_hours" sortState={sortState} onSort={requestSort} align="right" className="text-right py-3 px-4 font-medium text-muted-foreground hidden xl:table-cell">Budget Hrs</SortableHeader>
              <SortableHeader columnKey="value" sortState={sortState} onSort={requestSort} align="right" className="text-right py-3 px-4 font-medium text-muted-foreground">Value</SortableHeader>
              <SortableHeader columnKey="due_date" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Due Date</SortableHeader>
            </tr></thead>
            <tbody>
              {sortedJobs.map(({ job, operational }) => {
                const sc = getStageConfig(JOB_STATUSES, job.status);
                return (
                  <tr key={job.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{job.job_number}</td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{job.title}</p>
                          <StatusBadge label={operational.health.label} color={operational.health.color} className="text-[10px]" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            operational.nextTaskName ? `Next: ${operational.nextTaskName}` : "",
                            operational.unscheduledCount > 0 ? `${operational.unscheduledCount} unscheduled` : "",
                            operational.blockedCount > 0 ? `${operational.blockedCount} blocked` : "",
                          ].filter(Boolean).join(" · ") || "Workflow looks clear"}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{job.contact_name || job.company_name || "—"}</td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <StatusBadge label={sc.label} color={sc.color} />
                        <p className="text-xs text-muted-foreground">{operational.progressPercent}% complete</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <p className="font-medium text-foreground">{operational.completedCount}/{operational.totalTasks || 0} tasks</p>
                      <p className="text-xs text-muted-foreground">
                        {[operational.readyCount ? `${operational.readyCount} ready` : "", operational.inProgressCount ? `${operational.inProgressCount} active` : ""].filter(Boolean).join(" · ") || "No workflow tasks"}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden xl:table-cell">{formatDate(operational.installDate)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground hidden xl:table-cell">{Number(job.budget_hours || 0) ? `${Number(job.budget_hours || 0).toFixed(1)}h` : "—"}</td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(job.quoted_value)}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(job.due_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={Briefcase} title="No jobs found" description="Create a direct job for walk-ins, time billing, or quoted work" actionLabel="Add Job" onAction={openCreate} />}
      </Card>

      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) {
          resetForm();
        }
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New Job</DialogTitle>
            <DialogDescription>Create a direct job record with contact, address, dates, and budget details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Job Title *</Label>
                <Input
                  className="min-h-[44px]"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="e.g. Walk-in benchtop repair"
                />
              </div>
              <div>
                <Label>Job Number *</Label>
                <Input
                  className="min-h-[44px]"
                  value={form.job_number}
                  onChange={(event) => setForm({ ...form, job_number: event.target.value.toUpperCase() })}
                  placeholder="JOB-0001"
                />
              </div>
            </div>

            <div>
              <Label>Existing Contact</Label>
              <Select
                value={form.contact_id || "__none"}
                onValueChange={(value) => {
                  if (value === "__none") {
                    setForm({ ...form, contact_id: "", contact_name: "", });
                    return;
                  }

                  const selectedContact = contacts.find((contact) => contact.id === value);
                  setForm({
                    ...form,
                    contact_id: value,
                    contact_name: selectedContact ? getContactDisplayName(selectedContact) : form.contact_name,
                  });
                }}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No existing contact</SelectItem>
                  {sortedContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {`${getContactDisplayName(contact)}${contact.company_name ? ` · ${contact.company_name}` : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Client Name *</Label>
              <Input
                className="min-h-[44px]"
                value={form.contact_name}
                onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                placeholder="For walk-ins or direct billed work"
                disabled={Boolean(form.contact_id)}
              />
            </div>

            <div>
              <Label>Site Address</Label>
              <AddressAutocompleteInput
                value={form.site_address}
                onChange={(nextValue) => setForm({ ...form, site_address: nextValue })}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Billing Basis</Label>
                <Select value={form.billing_basis} onValueChange={(value) => setForm({ ...form, billing_basis: value })}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_and_materials">Time & Materials</SelectItem>
                    <SelectItem value="walk_in">Walk-In</SelectItem>
                    <SelectItem value="fixed_price">Fixed Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Budget Hours</Label>
                <Input
                  className="min-h-[44px]"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.budget_hours}
                  onChange={(event) => setForm({ ...form, budget_hours: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Due Date</Label>
                <Input
                  className="min-h-[44px]"
                  type="date"
                  value={form.due_date}
                  onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button className="min-h-[44px]" variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>Cancel</Button>
              <Button className="min-h-[44px]" onClick={createJob} disabled={submitting || !form.title || !form.job_number || !form.contact_name}>Create Job</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
