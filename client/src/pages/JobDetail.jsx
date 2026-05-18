import React, { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import StaffMultiSelect from "../components/StaffMultiSelect";
import RecordAuditPanel from "../components/RecordAuditPanel";
import AttachmentVersionDialog from "../components/AttachmentVersionDialog";
import JobWaterfallForecast from "../components/JobWaterfallForecast";
import StatusBadge from "../components/StatusBadge";
import ActualLabourPanel from "../components/time/ActualLabourPanel";
import ApprovalPanel from "../components/workflow/ApprovalPanel";
import ChecklistPanel from "../components/workflow/ChecklistPanel";
import ChangeOrderPanel from "../components/workflow/ChangeOrderPanel";
import { buildTimeEntryReviewFlags } from "../lib/timeclock";
import {
  JOB_STATUSES,
  OPERATIONS,
  WORKFLOW_PHASES,
  WORKFLOW_TASK_STATUSES,
  formatCurrency,
  formatDate,
  formatDateForInput,
  getStageConfig,
} from "../lib/helpers";
import { buildAssignedStaffDisplay, resolveAssignedStaffIds } from "../lib/staffIdentity";
import { calculateScheduleEndDate, getOperationSchedulingOptions, snapDateToWorkingDate } from "../lib/scheduleTimeline";
import { getJobOperationalSummary } from "../lib/crmOpsInsights";
import {
  HANDOFF_STATUS_OPTIONS,
  buildApprovalHistoryEntry,
  buildChangeOrderEntry,
  getOptionMeta,
  summarizeJobWorkflow,
} from "../lib/workflowReadiness";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HELP_TEXT } from "../lib/uploadRules";
import { useClientMode } from "@/lib/clientMode.jsx";
import { toast } from "@/components/ui/use-toast";
import { ChevronRight, Edit2, Plus, MessageSquare, File as FileIcon, FileImage, FileText, UploadCloud } from "lucide-react";

function formatFileSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(attachment) {
  const mimeType = String(attachment.mime_type || "");
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  return "file";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function JobDetail() {
  const { id } = useParams();
  const { clientMode } = useClientMode();
  const fileInputRef = useRef(null);
  const [job, setJob] = useState(null);
  const [operations, setOperations] = useState([]);
  const [allOperations, setAllOperations] = useState([]);
  const [roleMappings, setRoleMappings] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [allTimeEntries, setAllTimeEntries] = useState([]);
  const [notes, setNotes] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [showOp, setShowOp] = useState(false);
  const [opForm, setOpForm] = useState({
    task_name: "",
    operation: "design",
    status: "pending",
    estimated_hours: 0,
    actual_hours: 0,
    actual_start_date: "",
    actual_completion_date: "",
    assigned_to: "",
    assigned_staff_ids: [],
    assigned_role: "",
    workflow_phase: "",
    start_date: "",
    end_date: "",
    allow_friday_overtime: false,
    allow_saturday_overtime: false,
  });
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [operationForm, setOperationForm] = useState({
    task_name: "",
    operation: "design",
    estimated_hours: 0,
    actual_hours: 0,
    actual_start_date: "",
    actual_completion_date: "",
    assigned_to: "",
    assigned_staff_ids: [],
    assigned_role: "",
    workflow_phase: "",
    status: "pending",
    start_date: "",
    end_date: "",
    allow_friday_overtime: false,
    allow_saturday_overtime: false,
  });
  const [noteText, setNoteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [versionAttachment, setVersionAttachment] = useState(null);
  const [similarJobs, setSimilarJobs] = useState([]);
  const [jobKnowledgeResults, setJobKnowledgeResults] = useState([]);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    const loadAllTimeEntries = typeof crmApi.entities.TimeEntry.list === "function"
      ? crmApi.entities.TimeEntry.list("-date", 1000)
      : crmApi.entities.TimeEntry.filter({});
    const [all, allOps, roleMap, time, allTime, n, files] = await Promise.all([
      crmApi.entities.Job.list(),
      crmApi.entities.JobOperation.list(),
      crmApi.entities.WorkflowRoleMapping.list(),
      crmApi.entities.TimeEntry.filter({ job_id: id }),
      loadAllTimeEntries,
      crmApi.entities.Note.filter({ related_id: id, related_type: "job" }, "-created_date"),
      crmApi.entities.Attachment.filter({ related_id: id, related_type: "job" }, "-created_date"),
    ]);
    const j = all.find(x => x.id === id);
    const ops = allOps.filter((operation) => operation.job_id === id);
    setJob(j);
    setForm(j || {});
    setOperations(ops);
    setAllOperations(allOps);
    setRoleMappings(roleMap);
    setTimeEntries(time);
    setAllTimeEntries(Array.isArray(allTime) ? allTime : []);
    setNotes(n);
    setAttachments(files);
    if (j?.id && crmApi.ai?.similarJobs) {
      crmApi.ai.similarJobs(j.id, { limit: 4 })
        .then((response) => setSimilarJobs(Array.isArray(response?.results) ? response.results : []))
        .catch(() => setSimilarJobs([]));
      if (crmApi.ai?.knowledgeSearch) {
        const query = [j.job_number, j.title, j.contact_name || j.customer_name || j.company_name]
          .filter(Boolean)
          .join(" ");
        crmApi.ai.knowledgeSearch({
          query: query || String(j.title || j.job_number || "job"),
          limit: 4,
          entity_type: "Job",
        })
          .then((response) => setJobKnowledgeResults(Array.isArray(response?.results) ? response.results : []))
          .catch(() => setJobKnowledgeResults([]));
      }
    } else {
      setSimilarJobs([]);
      setJobKnowledgeResults([]);
    }
  };

  const updateJobTimeEntry = async (entryId, patch) => {
    await crmApi.entities.TimeEntry.update(entryId, patch);
    await loadData();
    toast({
      title: "Time entry updated",
      description: "Actual labour has been refreshed from the timeclock record.",
    });
  };

  const updateJobStatus = async (nextStatus) => {
    const nextStatusValue = String(nextStatus || "").toLowerCase();
    const reviewItems = (allTimeEntries || []).filter((entry) => String(entry.job_id || "") === String(id || ""))
      .filter((entry) => buildTimeEntryReviewFlags(entry).length > 0);

    if (["complete", "completed", "archived", "archive"].includes(nextStatusValue) && reviewItems.length > 0) {
      const confirmed = window.confirm(`This job still has ${reviewItems.length} time entr${reviewItems.length === 1 ? "y" : "ies"} needing attention. Continue anyway?`);
      if (!confirmed) {
        return;
      }
    }

    await crmApi.entities.Job.update(id, { status: nextStatus });
    await loadData();
  };

  const saveJob = async () => {
    const trimmedTitle = String(form.title || "").trim();
    const trimmedJobNumber = String(form.job_number || "").trim();

    if (!trimmedTitle || !trimmedJobNumber) {
      toast({
        variant: "destructive",
        title: "Missing job details",
        description: "Job title and job number are required.",
      });
      return;
    }

    const existingJobs = await crmApi.entities.Job.list();
    const duplicateNumber = existingJobs.some((candidate) =>
      candidate.id !== id
      && String(candidate.job_number || "").trim().toLowerCase() === trimmedJobNumber.toLowerCase()
    );

    if (duplicateNumber) {
      toast({
        variant: "destructive",
        title: "Duplicate job number",
        description: "That job number is already in use.",
      });
      return;
    }

    await crmApi.entities.Job.update(id, {
      ...form,
      title: trimmedTitle,
      job_number: trimmedJobNumber,
      budget_hours: Number(form.budget_hours || 0) || 0,
    });
    setEditing(false);
    loadData();
  };

  const addOperation = async () => {
    if (opForm.estimated_hours < 0 || opForm.actual_hours < 0) {
      toast({
        variant: "destructive",
        title: "Hours must be positive",
        description: "Estimated and actual hours cannot be negative.",
      });
      return;
    }

    const options = getOperationSchedulingOptions(opForm);
    await crmApi.entities.JobOperation.create({
      ...opForm,
      status: opForm.status || "pending",
      actual_start_date: opForm.actual_start_date || "",
      actual_completion_date: opForm.actual_completion_date || "",
      assigned_staff_ids: Array.isArray(opForm.assigned_staff_ids) ? opForm.assigned_staff_ids : [],
      assigned_to: buildAssignedStaffDisplay(opForm.assigned_staff_ids, [], opForm.assigned_to),
      assigned_role: opForm.assigned_role || "",
      workflow_role: opForm.assigned_role || "",
      start_date: snapDateToWorkingDate(opForm.start_date, options),
      end_date: calculateScheduleEndDate(opForm.start_date, opForm.estimated_hours, options),
      schedule_manual_override: false,
      job_id: id,
      job_number: job.job_number,
      job_title: job.title,
      sort_order: operations.length,
    });
    setShowOp(false);
    setOpForm({
      task_name: "",
      operation: "design",
      estimated_hours: 0,
      actual_hours: 0,
      actual_start_date: "",
      actual_completion_date: "",
      assigned_to: "",
      assigned_staff_ids: [],
      assigned_role: "",
      workflow_phase: "",
      status: "pending",
      start_date: "",
      end_date: "",
      allow_friday_overtime: false,
      allow_saturday_overtime: false,
    });
    loadData();
  };

  const openOperation = (operation) => {
    setSelectedOperation(operation);
    setOperationForm({
      task_name: operation.task_name || "",
      operation: operation.operation || "design",
      status: operation.status || "pending",
      workflow_phase: operation.workflow_phase || "",
      assigned_role: operation.assigned_role || operation.workflow_role || "",
      start_date: operation.start_date || "",
      end_date: operation.end_date || "",
      estimated_hours: operation.estimated_hours || 0,
      actual_hours: operation.actual_hours || 0,
      actual_start_date: operation.actual_start_date || "",
      actual_completion_date: operation.actual_completion_date || "",
      assigned_to: operation.assigned_to || "",
      assigned_staff_ids: resolveAssignedStaffIds({
        assignedStaffIds: operation.assigned_staff_ids,
        assignedTo: operation.assigned_to,
      }),
      notes: operation.notes || "",
      allow_friday_overtime: Boolean(operation.allow_friday_overtime),
      allow_saturday_overtime: Boolean(operation.allow_saturday_overtime),
    });
  };

  const saveOperation = async () => {
    if (!selectedOperation) return;
    if (operationForm.estimated_hours < 0 || operationForm.actual_hours < 0) {
      toast({
        variant: "destructive",
        title: "Hours must be positive",
        description: "Estimated and actual hours cannot be negative.",
      });
      return;
    }

    const options = getOperationSchedulingOptions(operationForm);
    await crmApi.entities.JobOperation.update(selectedOperation.id, {
      ...operationForm,
      actual_start_date: operationForm.actual_start_date || "",
      actual_completion_date: operationForm.actual_completion_date || "",
      assigned_staff_ids: Array.isArray(operationForm.assigned_staff_ids) ? operationForm.assigned_staff_ids : [],
      assigned_to: buildAssignedStaffDisplay(operationForm.assigned_staff_ids, [], operationForm.assigned_to),
      assigned_role: operationForm.assigned_role || "",
      workflow_role: operationForm.assigned_role || "",
      start_date: snapDateToWorkingDate(operationForm.start_date, options),
      end_date: calculateScheduleEndDate(operationForm.start_date, operationForm.estimated_hours, options),
      schedule_manual_override: false,
    });
    setSelectedOperation(null);
    loadData();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await crmApi.entities.Note.create({ content: noteText, related_id: id, related_type: "job", type: "note" });
    setNoteText(""); loadData();
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        await crmApi.filesystem.create({
          related_id: id,
          related_type: "job",
          name: file.name,
          mime_type: file.type || "application/octet-stream",
          size: file.size,
          data_base64: dataUrl,
        });
      }

      await loadData();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      setUploading(false);
      setDragActive(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const patchJob = async (patch) => {
    await crmApi.entities.Job.update(id, patch);
    await loadData();
  };

  const toggleJobChecklist = async (field, checked) => {
    await patchJob({ [field]: checked });
  };

  const saveOperationalNotes = async (patch) => {
    await patchJob(patch);
  };

  const addJobChangeOrder = async (values) => {
    const nextChangeOrders = [...(Array.isArray(job.change_orders) ? job.change_orders : []), buildChangeOrderEntry(values)];
    await patchJob({ change_orders: nextChangeOrders });
  };

  const updateJobChangeOrderStatus = async (changeOrderId, status) => {
    const nextChangeOrders = (Array.isArray(job.change_orders) ? job.change_orders : []).map((entry) =>
      entry.id === changeOrderId ? { ...entry, status } : entry
    );
    await patchJob({ change_orders: nextChangeOrders });
  };

  const patchApprovalFields = async (patch) => {
    await patchJob(patch);
  };

  const logApprovalAction = async (status, note) => {
    const nextHistory = [
      ...(Array.isArray(job.approval_history) ? job.approval_history : []),
      buildApprovalHistoryEntry({
        status,
        note,
        actor: job.approval_owner || "CRM",
      }),
    ];

    await patchJob({
      approval_status: status,
      approval_requested_date: status === "pending_internal" ? formatDateForInput(new Date()) : job.approval_requested_date || formatDateForInput(new Date()),
      approval_completed_date: status === "approved" ? formatDateForInput(new Date()) : job.approval_completed_date || "",
      approval_history: nextHistory,
    });
  };

  if (!job) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const sc = getStageConfig(JOB_STATUSES, job.status);
  const totalLabourHours = timeEntries.reduce((s, t) => s + (t.hours || 0), 0);
  const totalLabourCost = timeEntries.reduce((s, t) => s + (t.total_cost || 0), 0);
  const totalCost = totalLabourCost;
  const margin = job.quoted_value > 0 ? ((job.quoted_value - totalCost) / job.quoted_value * 100) : 0;
  const opPreviewStart = snapDateToWorkingDate(opForm.start_date, getOperationSchedulingOptions(opForm));
  const opPreviewEnd = calculateScheduleEndDate(opForm.start_date, opForm.estimated_hours, getOperationSchedulingOptions(opForm));
  const editPreviewStart = snapDateToWorkingDate(operationForm.start_date, getOperationSchedulingOptions(operationForm));
  const editPreviewEnd = calculateScheduleEndDate(operationForm.start_date, operationForm.estimated_hours, getOperationSchedulingOptions(operationForm));
  const workflowSummary = summarizeJobWorkflow(job, operations, [], { procurementEnabled: false });
  const operationalSummary = getJobOperationalSummary(job, operations);
  const handoffMeta = getOptionMeta(HANDOFF_STATUS_OPTIONS, job.handoff_status || "not_ready", "Handoff");
  const installWindowLabel = operationalSummary.installDate
    ? operationalSummary.installEndDate && operationalSummary.installEndDate !== operationalSummary.installDate
      ? `${formatDate(operationalSummary.installDate)} → ${formatDate(operationalSummary.installEndDate)}`
      : formatDate(operationalSummary.installDate)
    : "Not scheduled";

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/jobs" className="hover:text-foreground">Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{job.job_number}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-mono text-muted-foreground">{job.job_number}</span>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
          </div>
          <p className="text-sm text-muted-foreground">{[job.contact_name, job.site_address].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          <Select value={job.status} onValueChange={v => void updateJobStatus(v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{JOB_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-6">
        {[
          { label: "Quoted", value: formatCurrency(job.quoted_value) },
          { label: "Budget Hours", value: Number(job.budget_hours || 0) ? `${Number(job.budget_hours || 0).toFixed(1)}h` : "—" },
          { label: "Labour", value: `${totalLabourHours.toFixed(1)}h`, sub: clientMode ? "" : formatCurrency(totalLabourCost) },
          !clientMode ? { label: "Total Cost", value: formatCurrency(totalCost) } : null,
          { label: "Readiness", value: workflowSummary.readiness.label, sub: workflowSummary.nextStep },
        ].filter(Boolean).map(item => (
          <Card key={item.label} className="p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-bold">{item.value}</p>
            {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
          </Card>
        ))}
        {!clientMode ? (
          <Card className={`p-4 ${margin >= 30 ? "bg-emerald-50 border-emerald-200" : margin >= 15 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
            <p className="text-xs text-muted-foreground">Margin</p>
            <p className="text-lg font-bold">{margin.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(job.quoted_value - totalCost)}</p>
          </Card>
        ) : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="operations">Operations ({operations.length})</TabsTrigger>
          <TabsTrigger value="waterfall">Delivery Forecast</TabsTrigger>
          <TabsTrigger value="time">Time ({timeEntries.length})</TabsTrigger>
          <TabsTrigger value="files">Files ({attachments.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Production Readiness</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    See whether the job is commercially signed off and safe to hand over to the workshop.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <StatusBadge label={workflowSummary.readiness.label} color={workflowSummary.readiness.color} />
                  <StatusBadge label={operationalSummary.health.label} color={operationalSummary.health.color} />
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next Step</p>
                  <p className="mt-2 text-sm text-foreground">{workflowSummary.nextStep}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Operational Signal</p>
                  <p className="mt-2 text-sm text-foreground">{operationalSummary.health.reason}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Install Window</p>
                  <p className="mt-2 text-sm text-foreground">{installWindowLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {operationalSummary.installSpanDays > 1
                      ? `${operationalSummary.installSpanDays} day site phase`
                      : operationalSummary.installDate
                        ? "Single-day install"
                        : "Book the install from the planner or job details."}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Handoff</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{handoffMeta.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{workflowSummary.handoffCompleteCount}/{workflowSummary.handoffTotalCount} checkpoints complete</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Change Orders</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{workflowSummary.changeOrders.length} tracked</p>
                  <p className="mt-1 text-xs text-muted-foreground">{workflowSummary.preProductionOpenCount} pre-production task{workflowSummary.preProductionOpenCount === 1 ? "" : "s"} open</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-1">
                <div className="space-y-2">
                  <Label>Handoff Status</Label>
                  <Select value={job.handoff_status || "not_ready"} onValueChange={value => void saveOperationalNotes({ handoff_status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HANDOFF_STATUS_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current Blockers</p>
                {workflowSummary.blockers.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                    No major blockers. The job is in a strong state to move forward.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {workflowSummary.blockers.map((blocker) => (
                      <div key={blocker} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{blocker}</div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <div className="space-y-2">
                  <Label>Internal Operational Notes</Label>
                  <Textarea
                    value={job.internal_operational_notes || ""}
                    onChange={e => setJob((current) => ({ ...current, internal_operational_notes: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void saveOperationalNotes({ internal_operational_notes: job.internal_operational_notes || "" })}>
                    Save Notes
                  </Button>
                </div>
              </div>
            </Card>

            <div className="space-y-5">
              {similarJobs.length > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-foreground">Similar Jobs</h3>
                  <div className="mt-3 space-y-2">
                    {similarJobs.map((result) => (
                      <Link key={result.record_id} to={result.href || `/jobs/${result.record_id}`} className="block rounded-lg border px-3 py-2 hover:bg-muted/45">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.snippet}</p>
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground">{Math.round(Number(result.score || 0) * 100)}%</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              ) : null}

              {jobKnowledgeResults.length > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-foreground">Knowledge Matches</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Indexed documents and notes related to this job context.</p>
                  <div className="mt-3 space-y-2">
                    {jobKnowledgeResults.slice(0, 5).map((result) => (
                      <div key={result.chunk_id || `${result.file_id}:${result.line_start || 0}`} className="rounded-lg border px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-xs font-medium text-muted-foreground">{result.source_reference || result.relative_path}</p>
                          <span className="text-xs font-semibold text-muted-foreground">{Math.round(Number(result.score || 0) * 100)}%</span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-foreground">{result.snippet || result.chunk_text}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <ApprovalPanel
                title="Approvals"
                description="Record management signoff and keep a clear history of release decisions."
                status={job.approval_status || "pending_internal"}
                owner={job.approval_owner || ""}
                requestedDate={job.approval_requested_date || ""}
                completedDate={job.approval_completed_date || ""}
                history={Array.isArray(job.approval_history) ? job.approval_history : []}
                onPatch={(patch) => void patchApprovalFields(patch)}
                onQuickAction={(status, note) => logApprovalAction(status, note)}
              />

            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <ChecklistPanel
              title="Workshop Handoff"
              description="Track whether the information pack, site facts, and install planning are ready for production release."
              items={workflowSummary.handoffItems}
              badgeLabel={handoffMeta.label}
              badgeColor={handoffMeta.color}
              note={job.handoff_notes || ""}
              onNoteChange={(value) => setJob((current) => ({ ...current, handoff_notes: value }))}
              onToggle={(field, checked) => void toggleJobChecklist(field, checked)}
            />

            <ChangeOrderPanel
              title="Change Orders"
              description="Track approved variations and their effect on programme, cost, and workshop scope."
              changeOrders={workflowSummary.changeOrders}
              onAdd={(values) => addJobChangeOrder(values)}
              onUpdateStatus={(changeOrderId, status) => updateJobChangeOrderStatus(changeOrderId, status)}
            />
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => void saveOperationalNotes({ handoff_notes: job.handoff_notes || "" })}>
              Save Handoff Notes
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="operations">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Operations</h3>
              <Button size="sm" onClick={() => setShowOp(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              {operations.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No operations yet.</p>}
              {operations.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(op => {
                const oc = getStageConfig(OPERATIONS, op.operation);
                const phase = getStageConfig(WORKFLOW_PHASES, op.workflow_phase);
                return (
                  <div key={op.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => openOperation(op)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge label={oc.label} color={oc.color} />
                        {op.workflow_phase && <StatusBadge label={phase.label} color={phase.color} />}
                        {op.is_system_generated ? <StatusBadge label="Auto" color="slate" /> : null}
                        {!op.assigned_to && op.is_unassigned_placeholder ? <StatusBadge label="Unassigned" color="amber" /> : null}
                        {op.task_name && <span className="text-sm font-medium">{op.task_name}</span>}
                        {op.assigned_to && <span className="text-sm">{op.assigned_to}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {op.start_date && `${formatDate(op.start_date)} → ${formatDate(op.end_date)} · `}
                        {op.estimated_hours > 0 && `${op.estimated_hours}h est`}
                        {op.actual_hours > 0 && ` · ${op.actual_hours}h actual`}
                        {op.schedule_category ? ` · ${String(op.schedule_category).replace(/_/g, " ")}` : ""}
                        {op.allow_friday_overtime ? " · Fri OT" : ""}
                        {op.allow_saturday_overtime ? " · Sat OT" : ""}
                      </p>
                    </button>
                    <Select value={op.status} onValueChange={v => crmApi.entities.JobOperation.update(op.id, { status: v }).then(loadData)}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_TASK_STATUSES.map((statusOption) => (
                          <SelectItem key={statusOption.value} value={statusOption.value}>{statusOption.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="waterfall">
          <JobWaterfallForecast
            job={job}
            operations={operations}
            allOperations={allOperations}
            roleMappings={roleMappings}
          />
        </TabsContent>

        <TabsContent value="time">
          <div className="space-y-5">
            <ActualLabourPanel
              quoteId={job.quote_id || ""}
              jobIds={[id]}
              jobs={[job]}
              entries={allTimeEntries.length ? allTimeEntries : timeEntries}
              operations={operations}
              labourSellAllowance={job.quoted_value || 0}
              onUpdateTimeEntry={updateJobTimeEntry}
            />
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Time Entries</h3>
            {timeEntries.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No time recorded.</p> : (
              <div className="space-y-2">
                {timeEntries.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{t.staff_name}</p>
                      <p className="text-xs text-muted-foreground">{t.operation?.replace(/_/g," ")} · {formatDate(t.date)}</p>
                    </div>
                    <span className="font-semibold">{t.hours?.toFixed(1)}h</span>
                    {!clientMode ? <span className="text-muted-foreground">{formatCurrency(t.total_cost)}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <Card className="p-5">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold text-sm">Job Files</h3>
                <p className="text-sm text-muted-foreground mt-1">Drag and drop files here or browse from your computer. Uploaded files are stored locally and linked to this job.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => uploadFiles(event.target.files)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  void uploadFiles(event.dataTransfer.files);
                }}
                className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                  dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <UploadCloud className="w-8 h-8 mx-auto mb-3 text-primary" />
                <p className="text-base font-semibold">{uploading ? "Uploading files..." : "Drop files here to upload"}</p>
                <p className="text-sm text-muted-foreground mt-1">{ATTACHMENT_HELP_TEXT}</p>
                <div className="mt-4">
                  <span className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                    Choose Files
                  </span>
                </div>
              </button>

              {uploadError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {uploadError}
                </div>
              )}

              {attachments.length === 0 ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                  No files uploaded for this job yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {attachments.map((attachment) => {
                    const kind = getAttachmentKind(attachment);
                    return (
                      <div key={attachment.id} className="overflow-hidden rounded-xl border bg-card">
                        <div className="aspect-[4/3] border-b bg-muted/30 flex items-center justify-center overflow-hidden">
                          {kind === "image" ? (
                            <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                          ) : kind === "pdf" ? (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <FileText className="w-10 h-10" />
                              <span className="text-xs font-medium uppercase tracking-wide">PDF Document</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <FileImage className="w-10 h-10" />
                              <span className="text-xs font-medium uppercase tracking-wide">File</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-muted-foreground">
                              {kind === "image" ? <FileImage className="w-4 h-4" /> : kind === "pdf" ? <FileText className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{attachment.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatFileSize(attachment.size)} · {formatDate(attachment.created_date)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setVersionAttachment(attachment)}>
                              Versions
                            </Button>
                            <Button size="sm" asChild>
                              <a href={attachment.url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Notes</h3>
            <div className="flex gap-2 mb-4">
              <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." rows={2} className="flex-1" />
              <Button onClick={addNote} size="sm" className="self-end">Add</Button>
            </div>
            <div className="space-y-2">
              {notes.map(note => (
                <div key={note.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div><p className="text-sm">{note.content}</p><p className="text-xs text-muted-foreground mt-1">{formatDate(note.created_date)}</p></div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <RecordAuditPanel entityName="Job" recordId={id} title="Job Change History" limit={10} />
        </TabsContent>
      </Tabs>

      <Dialog open={showOp} onOpenChange={setShowOp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Operation</DialogTitle>
            <DialogDescription>Schedule a job operation with workflow phase, capacity, assigned staff, and timing details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Task Name</Label><Input value={opForm.task_name || ""} onChange={e => setOpForm({...opForm, task_name: e.target.value})} /></div>
            <div><Label>Operation</Label>
              <Select value={opForm.operation} onValueChange={v => setOpForm({...opForm, operation: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Phase</Label>
                <Select value={opForm.workflow_phase || "__none"} onValueChange={v => setOpForm({ ...opForm, workflow_phase: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No workflow phase</SelectItem>
                    {WORKFLOW_PHASES.map(phase => <SelectItem key={phase.value} value={phase.value}>{phase.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={opForm.status || "pending"} onValueChange={v => setOpForm({ ...opForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_TASK_STATUSES.map((statusOption) => (
                      <SelectItem key={statusOption.value} value={statusOption.value}>{statusOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="job-op-start-date">Start Date</Label>
              <Input
                id="job-op-start-date"
                type="date"
                value={opForm.start_date || ""}
                onChange={e => setOpForm({ ...opForm, start_date: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Calculated finish: {opPreviewEnd ? formatDate(opPreviewEnd) : "Not scheduled"}
                {opPreviewStart && opPreviewStart !== opForm.start_date ? ` · starts on ${formatDate(opPreviewStart)}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="job-op-actual-start-date">Actual Start</Label>
                <Input
                  id="job-op-actual-start-date"
                  type="date"
                  value={opForm.actual_start_date || ""}
                  onChange={e => setOpForm({ ...opForm, actual_start_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="job-op-actual-complete-date">Actual Completion</Label>
                <Input
                  id="job-op-actual-complete-date"
                  type="date"
                  value={opForm.actual_completion_date || ""}
                  onChange={e => setOpForm({ ...opForm, actual_completion_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Est. Hours</Label><Input type="number" value={opForm.estimated_hours} onChange={e => setOpForm({...opForm, estimated_hours: parseFloat(e.target.value)||0})} /></div>
              <div><Label>Actual Hours</Label><Input type="number" value={opForm.actual_hours} onChange={e => setOpForm({...opForm, actual_hours: parseFloat(e.target.value)||0})} /></div>
              <div>
                <Label>Assigned To</Label>
                <StaffMultiSelect
                  value={opForm.assigned_to}
                  selectedIds={opForm.assigned_staff_ids}
                  onChange={(nextValue, assignedStaffIds) => setOpForm({ ...opForm, assigned_to: nextValue, assigned_staff_ids: assignedStaffIds })}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={Boolean(opForm.allow_friday_overtime)}
                  onCheckedChange={(checked) => setOpForm({ ...opForm, allow_friday_overtime: checked === true })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Friday PM overtime</span>
                  <span className="block text-xs text-muted-foreground">Use Friday afternoon capacity for this operation.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={Boolean(opForm.allow_saturday_overtime)}
                  onCheckedChange={(checked) => setOpForm({ ...opForm, allow_saturday_overtime: checked === true })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Saturday overtime</span>
                  <span className="block text-xs text-muted-foreground">Allow Saturday scheduling for this operation.</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowOp(false)}>Cancel</Button>
              <Button onClick={addOperation}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
            <DialogDescription>Update job details, install dates, budget hours, and internal notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title||""} onChange={e => setForm({...form, title: e.target.value})} /></div>
            <div>
              <Label>Site Address</Label>
              <AddressAutocompleteInput
                value={form.site_address || ""}
                onChange={(nextValue) => setForm({ ...form, site_address: nextValue })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date||""} onChange={e => setForm({...form, start_date: e.target.value})} /></div>
              <div><Label>Due Date</Label><Input type="date" value={form.due_date||""} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
            </div>
            <div><Label>Budget Hours</Label><Input type="number" min="0" step="0.5" value={form.budget_hours||""} onChange={e => setForm({...form, budget_hours: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Install Start</Label><Input type="date" value={form.install_date||""} onChange={e => setForm({...form, install_date: e.target.value})} /></div>
              <div><Label>Install End</Label><Input type="date" value={form.install_end_date||""} onChange={e => setForm({...form, install_end_date: e.target.value})} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes||""} onChange={e => setForm({...form, notes: e.target.value})} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={saveJob}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.name || "File Preview"}</DialogTitle>
            <DialogDescription>Preview the selected attachment without leaving the job record.</DialogDescription>
          </DialogHeader>
          {previewAttachment && getAttachmentKind(previewAttachment) === "image" && (
            <div className="max-h-[75vh] overflow-auto rounded-lg border bg-muted/20">
              <img src={previewAttachment.url} alt={previewAttachment.name} className="w-full h-auto" />
            </div>
          )}
          {previewAttachment && getAttachmentKind(previewAttachment) === "pdf" && (
            <iframe
              src={previewAttachment.url}
              title={previewAttachment.name}
              className="h-[75vh] w-full rounded-lg border"
            />
          )}
          {previewAttachment && getAttachmentKind(previewAttachment) === "file" && (
            <div className="rounded-lg border bg-muted/20 p-6 text-sm">
              <p className="font-medium">This file type cannot be previewed inside JoinerFlow.</p>
              <p className="mt-1 text-muted-foreground">Open it in the right program to check the document.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <a href={previewAttachment.url} target="_blank" rel="noreferrer">Open File</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={previewAttachment.url} download={previewAttachment.name}>Download</a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AttachmentVersionDialog
        attachment={versionAttachment}
        open={Boolean(versionAttachment)}
        onOpenChange={(open) => !open && setVersionAttachment(null)}
      />

      <Dialog open={Boolean(selectedOperation)} onOpenChange={(open) => !open && setSelectedOperation(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Operation Details</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Task Name</Label><Input value={operationForm.task_name || ""} onChange={e => setOperationForm({ ...operationForm, task_name: e.target.value })} /></div>
            <div>
              <Label>Operation</Label>
              <Select value={operationForm.operation} onValueChange={v => setOperationForm({ ...operationForm, operation: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={operationForm.status} onValueChange={v => setOperationForm({ ...operationForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKFLOW_TASK_STATUSES.map((statusOption) => (
                    <SelectItem key={statusOption.value} value={statusOption.value}>{statusOption.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Actual Start</Label>
                <Input
                  type="date"
                  value={operationForm.actual_start_date || ""}
                  onChange={e => setOperationForm({ ...operationForm, actual_start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Actual Completion</Label>
                <Input
                  type="date"
                  value={operationForm.actual_completion_date || ""}
                  onChange={e => setOperationForm({ ...operationForm, actual_completion_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Phase</Label>
              <Select value={operationForm.workflow_phase || "__none"} onValueChange={v => setOperationForm({ ...operationForm, workflow_phase: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No workflow phase</SelectItem>
                  {WORKFLOW_PHASES.map(phase => <SelectItem key={phase.value} value={phase.value}>{phase.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="job-op-edit-start-date">Start Date</Label>
              <Input
                id="job-op-edit-start-date"
                type="date"
                value={operationForm.start_date || ""}
                onChange={e => setOperationForm({ ...operationForm, start_date: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Calculated finish: {editPreviewEnd ? formatDate(editPreviewEnd) : "Not scheduled"}
                {editPreviewStart && editPreviewStart !== operationForm.start_date ? ` · starts on ${formatDate(editPreviewStart)}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Est. Hours</Label><Input type="number" value={operationForm.estimated_hours || 0} onChange={e => setOperationForm({ ...operationForm, estimated_hours: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Actual Hours</Label><Input type="number" value={operationForm.actual_hours || 0} onChange={e => setOperationForm({ ...operationForm, actual_hours: parseFloat(e.target.value) || 0 })} /></div>
              <div>
                <Label>Assigned To</Label>
                <StaffMultiSelect
                  value={operationForm.assigned_to}
                  selectedIds={operationForm.assigned_staff_ids}
                  onChange={(nextValue, assignedStaffIds) => setOperationForm({ ...operationForm, assigned_to: nextValue, assigned_staff_ids: assignedStaffIds })}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={Boolean(operationForm.allow_friday_overtime)}
                  onCheckedChange={(checked) => setOperationForm({ ...operationForm, allow_friday_overtime: checked === true })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Friday PM overtime</span>
                  <span className="block text-xs text-muted-foreground">Use Friday afternoon capacity for this operation.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={Boolean(operationForm.allow_saturday_overtime)}
                  onCheckedChange={(checked) => setOperationForm({ ...operationForm, allow_saturday_overtime: checked === true })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Saturday overtime</span>
                  <span className="block text-xs text-muted-foreground">Allow Saturday scheduling for this operation.</span>
                </span>
              </label>
            </div>
            <div><Label>Notes</Label><Textarea value={operationForm.notes || ""} onChange={e => setOperationForm({ ...operationForm, notes: e.target.value })} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedOperation(null)}>Close</Button>
              <Button onClick={saveOperation}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
