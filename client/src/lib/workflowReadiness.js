import { normalizeQuoteStatus } from "./helpers";

export const APPROVAL_STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "pending_internal", label: "Pending Internal", color: "amber" },
  { value: "pending_client", label: "Pending Client", color: "blue" },
  { value: "changes_requested", label: "Changes Requested", color: "red" },
  { value: "approved", label: "Approved", color: "emerald" },
  { value: "rejected", label: "Rejected", color: "slate" },
];

export const PROCUREMENT_STATUS_OPTIONS = [
  { value: "not_applicable", label: "Not Applicable", color: "slate" },
  { value: "not_started", label: "Not Started", color: "slate" },
  { value: "in_progress", label: "In Progress", color: "amber" },
  { value: "ready", label: "Ready", color: "blue" },
  { value: "ordered", label: "Ordered", color: "teal" },
  { value: "complete", label: "Complete", color: "emerald" },
];

export const HANDOFF_STATUS_OPTIONS = [
  { value: "not_ready", label: "Not Ready", color: "slate" },
  { value: "in_progress", label: "In Progress", color: "amber" },
  { value: "ready", label: "Ready", color: "blue" },
  { value: "released", label: "Released", color: "emerald" },
];

export const CHANGE_ORDER_STATUS_OPTIONS = [
  { value: "pricing", label: "Pricing", color: "slate" },
  { value: "awaiting_approval", label: "Awaiting Approval", color: "amber" },
  { value: "approved", label: "Approved", color: "emerald" },
  { value: "rejected", label: "Rejected", color: "red" },
  { value: "implemented", label: "Implemented", color: "teal" },
];

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isCompleteStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "complete" || normalized === "completed";
}

export function getOptionMeta(options, value, fallbackLabel = "Unknown") {
  return (
    options.find((option) => option.value === value)
    || { value, label: value ? String(value).replace(/_/g, " ") : fallbackLabel, color: "slate" }
  );
}

export function buildChangeOrderEntry(values = {}) {
  return {
    id: values.id || createId("change-order"),
    title: String(values.title || "").trim(),
    amount: Number(values.amount || 0),
    status: String(values.status || "pricing"),
    requested_by: String(values.requested_by || "").trim(),
    requested_date: String(values.requested_date || "").trim(),
    due_date: String(values.due_date || "").trim(),
    impact: String(values.impact || "").trim(),
    notes: String(values.notes || "").trim(),
    created_date: String(values.created_date || new Date().toISOString()),
  };
}

export function buildApprovalHistoryEntry(values = {}) {
  return {
    id: values.id || createId("approval"),
    status: String(values.status || "pending_internal"),
    note: String(values.note || "").trim(),
    actor: String(values.actor || "").trim(),
    date: String(values.date || new Date().toISOString()),
  };
}

export function summarizeQuoteWorkflow(quote = {}, items = [], linkedJobs = []) {
  const normalizedStatus = normalizeQuoteStatus(quote.status);
  const approval = getOptionMeta(APPROVAL_STATUS_OPTIONS, String(quote.approval_status || "draft"));
  const handoff = getOptionMeta(HANDOFF_STATUS_OPTIONS, String(quote.production_handoff_status || "not_ready"));
  const signoffItems = [
    {
      key: "quote_scope_signed_off",
      label: "Scope and exclusions confirmed",
      hint: "Commercial scope is aligned with what will actually be delivered.",
      checked: Boolean(quote.quote_scope_signed_off),
    },
    {
      key: "quote_drawings_signed_off",
      label: "Drawings / design intent checked",
      hint: "The team is comfortable that pricing matches the current design intent.",
      checked: Boolean(quote.quote_drawings_signed_off),
    },
    {
      key: "quote_pricing_signed_off",
      label: "Pricing reviewed internally",
      hint: "Margin, labour allowance, and bought-out costs have been reviewed.",
      checked: Boolean(quote.quote_pricing_signed_off),
    },
    {
      key: "quote_client_brief_signed_off",
      label: "Client brief locked",
      hint: "Key assumptions, lead times, and customer expectations are aligned.",
      checked: Boolean(quote.quote_client_brief_signed_off),
    },
  ];

  const signoffCompleteCount = signoffItems.filter((item) => item.checked).length;
  const changeOrders = asArray(quote.change_orders).map(buildChangeOrderEntry);
  const approvedChangeValue = changeOrders
    .filter((entry) => entry.status === "approved" || entry.status === "implemented")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const blockers = [];
  if (items.length === 0) {
    blockers.push("Quote still needs line items or pricing detail.");
  }
  if (approval.value !== "approved") {
    blockers.push("Internal approval has not been completed.");
  }
  if (signoffCompleteCount < signoffItems.length) {
    blockers.push(`${signoffItems.length - signoffCompleteCount} signoff checkpoint${signoffItems.length - signoffCompleteCount === 1 ? "" : "s"} still open.`);
  }
  if (normalizedStatus === "draft") {
    blockers.push("Quote status is still draft.");
  }

  let readiness = { label: "Needs review", color: "amber" };
  let nextStep = "Complete approvals and signoff checks before sending or converting.";

  if (linkedJobs.length > 0) {
    readiness = { label: "Converted", color: "emerald" };
    nextStep = `Already converted to ${linkedJobs[0].job_number || "a linked job"}.`;
  } else if (approval.value === "approved" && signoffCompleteCount === signoffItems.length && normalizedStatus === "awaiting_confirmation") {
    readiness = { label: "Awaiting client", color: "blue" };
    nextStep = "Commercial package is complete. Follow up with the client decision.";
  } else if (approval.value === "approved" && signoffCompleteCount === signoffItems.length && normalizedStatus === "won") {
    readiness = { label: "Ready for handoff", color: "emerald" };
    nextStep = "Create the job and issue the production handoff pack.";
  } else if (approval.value === "approved" && signoffCompleteCount === signoffItems.length) {
    readiness = { label: "Ready to issue", color: "emerald" };
    nextStep = "Quote can move to client issue or final decision follow-up.";
  } else if (approval.value === "changes_requested") {
    readiness = { label: "Revision required", color: "red" };
    nextStep = "Resolve the approval comments and update pricing before progressing.";
  }

  return {
    approval,
    handoff,
    signoffItems,
    signoffCompleteCount,
    signoffTotalCount: signoffItems.length,
    changeOrders,
    changeOrderCount: changeOrders.length,
    approvedChangeValue,
    blockers,
    readiness,
    nextStep,
    linkedJob: linkedJobs[0] || null,
  };
}

export function summarizeJobWorkflow(job = {}, operations = [], _purchaseOrders = [], options = {}) {
  const procurementEnabled = options.procurementEnabled !== false;
  const approval = getOptionMeta(APPROVAL_STATUS_OPTIONS, String(job.approval_status || "pending_internal"));
  const procurement = getOptionMeta(PROCUREMENT_STATUS_OPTIONS, String(job.procurement_status || "not_started"));
  const handoff = getOptionMeta(HANDOFF_STATUS_OPTIONS, String(job.handoff_status || "not_ready"));
  const procurementItems = [
    {
      key: "procurement_takeoff_complete",
      label: "Take-off and bought-out list complete",
      hint: "Materials and bought-out items have been fully identified.",
      checked: Boolean(job.procurement_takeoff_complete),
    },
    {
      key: "procurement_supplier_confirmed",
      label: "Suppliers / lead times confirmed",
      hint: "Critical suppliers and realistic lead times are known.",
      checked: Boolean(job.procurement_supplier_confirmed),
    },
    {
      key: "procurement_pos_raised",
      label: "Purchase orders raised",
      hint: "Orders are no longer only planned; they have been issued.",
      checked: Boolean(job.procurement_pos_raised),
    },
    {
      key: "procurement_critical_items_received",
      label: "Critical items received or secured",
      hint: "High-risk materials are on hand or locked in.",
      checked: Boolean(job.procurement_critical_items_received),
    },
  ];
  const handoffItems = [
    {
      key: "handoff_site_measure_complete",
      label: "Site measure confirmed",
      hint: "Final dimensions and site assumptions are locked.",
      checked: Boolean(job.handoff_site_measure_complete),
    },
    {
      key: "handoff_drawings_ready",
      label: "Workshop drawings ready",
      hint: "Production drawings are ready for manufacture.",
      checked: Boolean(job.handoff_drawings_ready),
    },
    {
      key: "handoff_materials_confirmed",
      label: "Materials and finishes confirmed",
      hint: "Workshop knows exactly what materials and finishes to build to.",
      checked: Boolean(job.handoff_materials_confirmed),
    },
    {
      key: "handoff_production_brief_complete",
      label: "Production brief complete",
      hint: "Workshop handoff notes, risks, and sequencing are clear.",
      checked: Boolean(job.handoff_production_brief_complete),
    },
    {
      key: "handoff_install_plan_confirmed",
      label: "Install / delivery plan confirmed",
      hint: "Install dependencies, access, and sequencing are known.",
      checked: Boolean(job.handoff_install_plan_confirmed),
    },
  ];

  const procurementCompleteCount = procurementItems.filter((item) => item.checked).length;
  const handoffCompleteCount = handoffItems.filter((item) => item.checked).length;
  const changeOrders = asArray(job.change_orders).map(buildChangeOrderEntry);
  const approvalHistory = asArray(job.approval_history).map((entry) => ({
    id: entry.id || createId("approval"),
    status: String(entry.status || "pending_internal"),
    note: String(entry.note || ""),
    actor: String(entry.actor || ""),
    date: String(entry.date || ""),
  }));

  const preProductionOpenCount = operations.filter((operation) => String(operation.workflow_phase || "") === "pre_production" && !isCompleteStatus(operation.status)).length;
  const manufacturingOpenCount = operations.filter((operation) => String(operation.workflow_phase || "") === "manufacturing" && !isCompleteStatus(operation.status)).length;
  const blockers = [];

  if (approval.value !== "approved") {
    blockers.push("Management signoff is still outstanding.");
  }
  if (handoffCompleteCount < handoffItems.length) {
    blockers.push(`${handoffItems.length - handoffCompleteCount} handoff checkpoint${handoffItems.length - handoffCompleteCount === 1 ? "" : "s"} still open.`);
  }
  if (procurementEnabled && procurementCompleteCount < procurementItems.length) {
    blockers.push("Procurement has not been fully prepared.");
  }
  if (preProductionOpenCount > 0) {
    blockers.push(`${preProductionOpenCount} pre-production task${preProductionOpenCount === 1 ? "" : "s"} remain open.`);
  }

  let readiness = { label: "Needs setup", color: "amber" };
  let nextStep = procurementEnabled
    ? "Work through signoff, procurement, and handoff checks to release the job cleanly."
    : "Work through signoff and handoff checks to release the job cleanly.";

  if (
    approval.value === "approved"
    && handoffCompleteCount === handoffItems.length
    && (!procurementEnabled || procurementCompleteCount === procurementItems.length)
  ) {
    readiness = { label: "Ready for workshop", color: "emerald" };
    nextStep = manufacturingOpenCount > 0
      ? procurementEnabled
        ? "Workshop can continue under a clean handoff and procurement plan."
        : "Workshop can continue under a clean handoff plan."
      : "Job is ready to move into active workshop production.";
  } else if (procurementEnabled && procurementCompleteCount < procurementItems.length) {
    readiness = { label: "Procurement focus", color: "amber" };
    nextStep = "Close procurement gaps before committing to manufacture dates.";
  } else if (handoffCompleteCount < handoffItems.length) {
    readiness = { label: "Handoff incomplete", color: "amber" };
    nextStep = "Finish the workshop handoff pack before releasing production.";
  } else if (approval.value === "changes_requested") {
    readiness = { label: "Changes required", color: "red" };
    nextStep = "Resolve commercial or technical changes before continuing.";
  }

  return {
    approval,
    procurement,
    handoff,
    procurementItems,
    handoffItems,
    procurementCompleteCount: procurementEnabled ? procurementCompleteCount : procurementItems.length,
    handoffCompleteCount,
    procurementTotalCount: procurementEnabled ? procurementItems.length : 0,
    handoffTotalCount: handoffItems.length,
    approvalHistory,
    changeOrders,
    pendingSupplierTasks: [],
    preProductionOpenCount,
    manufacturingOpenCount,
    blockers,
    readiness,
    nextStep,
  };
}
