import { normalizeQuoteStatus } from "./helpers";

const ACTIVE_JOB_STATUSES = new Set(["planning", "approved", "production", "ready_to_install", "installed", "on_hold"]);
const CLOSED_JOB_STATUSES = new Set(["complete", "completed", "cancelled", "inactive"]);
const INCOMPLETE_OPERATION_STATUSES = new Set(["pending", "ready", "scheduled", "in_progress", "on_hold"]);
const COMPLETE_OPERATION_STATUSES = new Set(["complete", "completed"]);
const INSTALL_OPERATION_TYPES = new Set(["install", "delivery"]);
const MANUFACTURING_PHASES = new Set(["manufacturing", "pre_production"]);

function parseDateValue(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getDayDifference(targetValue, referenceValue = new Date()) {
  const targetTimestamp = parseDateValue(targetValue);
  const referenceTimestamp = referenceValue instanceof Date ? referenceValue.getTime() : parseDateValue(referenceValue);
  if (!targetTimestamp || !referenceTimestamp) {
    return null;
  }

  return Math.ceil((targetTimestamp - referenceTimestamp) / (1000 * 60 * 60 * 24));
}

function sortByDate(left, right) {
  return parseDateValue(left) - parseDateValue(right);
}

function getInclusiveDaySpan(startValue, endValue) {
  const startTimestamp = parseDateValue(startValue);
  const endTimestamp = parseDateValue(endValue);
  if (!startTimestamp || !endTimestamp) {
    return 0;
  }

  return Math.max(1, Math.round((endTimestamp - startTimestamp) / (1000 * 60 * 60 * 24)) + 1);
}

function normalizeOperationStatus(status) {
  const normalized = String(status || "pending").trim().toLowerCase();
  if (normalized === "completed") {
    return "complete";
  }
  if (normalized === "scheduled") {
    return "ready";
  }
  return normalized || "pending";
}

function areDependenciesMet(operation, operationsById) {
  const dependencyIds = Array.isArray(operation.dependency_task_ids)
    ? operation.dependency_task_ids
    : String(operation.dependency_task_ids || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  if (dependencyIds.length === 0) {
    return true;
  }

  return dependencyIds.every((dependencyId) => {
    const dependency = operationsById.get(dependencyId);
    return dependency ? COMPLETE_OPERATION_STATUSES.has(normalizeOperationStatus(dependency.status)) : false;
  });
}

export function isActiveJob(job) {
  return ACTIVE_JOB_STATUSES.has(String(job?.status || "").trim().toLowerCase());
}

export function getJobOperationalSummary(job, allOperations = [], today = new Date()) {
  const relevantOperations = (allOperations || []).filter((operation) => String(operation.job_id || "") === String(job?.id || ""));
  const operationsById = new Map(relevantOperations.map((operation) => [operation.id, operation]));

  const incompleteOperations = relevantOperations.filter((operation) => INCOMPLETE_OPERATION_STATUSES.has(normalizeOperationStatus(operation.status)));
  const completedCount = relevantOperations.filter((operation) => COMPLETE_OPERATION_STATUSES.has(normalizeOperationStatus(operation.status))).length;
  const inProgressCount = incompleteOperations.filter((operation) => normalizeOperationStatus(operation.status) === "in_progress").length;
  const readyCount = incompleteOperations.filter((operation) => normalizeOperationStatus(operation.status) === "ready").length;
  const onHoldCount = incompleteOperations.filter((operation) => normalizeOperationStatus(operation.status) === "on_hold").length;
  const blockedCount = incompleteOperations.filter((operation) => !areDependenciesMet(operation, operationsById)).length;
  const unscheduledCount = incompleteOperations.filter((operation) => !String(operation.start_date || "").trim()).length;
  const manufacturingRemainingCount = incompleteOperations.filter((operation) => MANUFACTURING_PHASES.has(String(operation.workflow_phase || "").trim().toLowerCase())).length;
  const installOperations = relevantOperations.filter((operation) => INSTALL_OPERATION_TYPES.has(String(operation.operation || "").trim().toLowerCase()));
  const incompleteInstallOperations = installOperations.filter((operation) => !COMPLETE_OPERATION_STATUSES.has(normalizeOperationStatus(operation.status)));
  const installDates = [
    String(job?.install_date || "").trim(),
    ...installOperations.map((operation) => String(operation.start_date || "").trim()),
  ].filter(Boolean).sort(sortByDate);
  const installEndDates = [
    String(job?.install_end_date || "").trim(),
    ...installOperations.map((operation) => String(operation.end_date || operation.start_date || "").trim()),
  ].filter(Boolean).sort(sortByDate);
  const nextScheduledDates = incompleteOperations
    .map((operation) => String(operation.start_date || "").trim())
    .filter(Boolean)
    .sort(sortByDate);
  const dueTimestamp = parseDateValue(job?.due_date);
  const installStartDate = installDates[0] || "";
  const installEndDate = installEndDates[installEndDates.length - 1] || installStartDate;
  const installTimestamp = parseDateValue(installStartDate);
  const todayTimestamp = today instanceof Date ? today.getTime() : parseDateValue(today);
  const daysUntilInstall = installTimestamp ? Math.ceil((installTimestamp - todayTimestamp) / (1000 * 60 * 60 * 24)) : null;
  const progressPercent = relevantOperations.length > 0 ? Math.round((completedCount / relevantOperations.length) * 100) : 0;

  const summary = {
    totalTasks: relevantOperations.length,
    completedCount,
    incompleteCount: incompleteOperations.length,
    inProgressCount,
    readyCount,
    blockedCount,
    onHoldCount,
    unscheduledCount,
    manufacturingRemainingCount,
    installTaskCount: installOperations.length,
    incompleteInstallCount: incompleteInstallOperations.length,
    installDate: installStartDate,
    installStartDate,
    installEndDate,
    installSpanDays: installStartDate ? getInclusiveDaySpan(installStartDate, installEndDate) : 0,
    daysUntilInstall,
    nextScheduledDate: nextScheduledDates[0] || "",
    progressPercent,
    phaseLabel: incompleteOperations[0]?.workflow_phase || relevantOperations[0]?.workflow_phase || "",
    nextTaskName: incompleteOperations
      .slice()
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))[0]?.task_name || "",
  };

  let health = { label: "Planned", color: "slate", rank: 50, reason: "Job is planned but not yet actively moving through work." };

  if (!job || CLOSED_JOB_STATUSES.has(String(job.status || "").trim().toLowerCase())) {
    health = { label: "Closed", color: "slate", rank: 99, reason: "This job is no longer active." };
  } else if (dueTimestamp && dueTimestamp < todayTimestamp) {
    health = { label: "Overdue", color: "red", rank: 0, reason: "The due date has already passed while work is still open." };
  } else if (summary.totalTasks === 0) {
    health = { label: "Needs setup", color: "amber", rank: 1, reason: "Workflow tasks have not been created for this job yet." };
  } else if (summary.unscheduledCount > 0 && ["approved", "production", "ready_to_install", "installed"].includes(String(job.status || "").trim().toLowerCase())) {
    health = { label: "Needs scheduling", color: "red", rank: 2, reason: `${summary.unscheduledCount} open task${summary.unscheduledCount === 1 ? "" : "s"} still need dates.` };
  } else if (summary.daysUntilInstall != null && summary.daysUntilInstall <= 14 && summary.manufacturingRemainingCount > 0) {
    health = { label: "Install risk", color: "red", rank: 3, reason: "Installation is approaching while manufacturing work is still incomplete." };
  } else if (summary.blockedCount > 0 && summary.inProgressCount === 0) {
    health = { label: "Blocked", color: "amber", rank: 4, reason: "Later tasks are waiting on prerequisite work to finish." };
  } else if (summary.inProgressCount > 0) {
    health = { label: "In flight", color: "blue", rank: 5, reason: "Work is underway and currently moving through the workflow." };
  } else if (summary.readyCount > 0 || summary.nextScheduledDate) {
    health = { label: "Queued", color: "emerald", rank: 6, reason: "The next work is scheduled or ready to start." };
  } else if (summary.completedCount === summary.totalTasks && summary.totalTasks > 0) {
    health = { label: "Ready to close", color: "emerald", rank: 7, reason: "Workflow tasks are complete and the job looks ready for final close-out." };
  }

  return {
    ...summary,
    health,
  };
}

export function isOpenQuote(quote) {
  return !["won", "archived"].includes(normalizeQuoteStatus(quote?.status));
}

export function getQuoteOperationalSummary(quote, today = new Date()) {
  const normalizedStatus = normalizeQuoteStatus(quote?.status);
  const ageDaysRaw = getDayDifference(quote?.created_date, today);
  const ageDays = ageDaysRaw == null ? null : Math.max(0, -ageDaysRaw);
  const daysUntilValid = getDayDifference(quote?.valid_until, today);
  const totalValue = Number(quote?.total || 0);

  let health = { label: "Draft", color: "slate", rank: 50, reason: "Quote is still being prepared." };

  if (normalizedStatus === "archived") {
    health = { label: "Archived", color: "slate", rank: 100, reason: "Quote is stored for reference and can be restored if needed." };
  } else if (normalizedStatus === "won") {
    health = { label: "Won", color: "emerald", rank: 99, reason: "Quote has already been accepted." };
  } else if (daysUntilValid != null && daysUntilValid < 0) {
    health = { label: "Expired", color: "red", rank: 0, reason: "Validity has passed and the quote needs refresh or follow-up." };
  } else if (normalizedStatus === "awaiting_confirmation" && ageDays != null && ageDays > 14) {
    health = { label: "Follow up", color: "red", rank: 1, reason: "Customer decision is overdue and should be chased." };
  } else if (daysUntilValid != null && daysUntilValid <= 7) {
    health = { label: "Expiring soon", color: "amber", rank: 2, reason: "Validity is approaching and should be followed up promptly." };
  } else if (normalizedStatus === "quote_complete") {
    health = { label: "Ready to send", color: "blue", rank: 3, reason: "Pricing is complete and the quote is ready to issue." };
  } else if (normalizedStatus === "awaiting_confirmation") {
    health = { label: "Awaiting decision", color: "teal", rank: 4, reason: "Quote has been sent and is waiting on the client." };
  } else if (totalValue > 0 && ageDays != null && ageDays > 7) {
    health = { label: "Needs progress", color: "amber", rank: 5, reason: "Quote has commercial value but needs the next action to keep moving." };
  }

  return {
    normalizedStatus,
    ageDays,
    daysUntilValid,
    totalValue,
    health,
  };
}

export function getUpcomingInstallJobs(jobs = [], operations = [], today = new Date(), horizonDays = 14) {
  return (jobs || [])
    .filter((job) => isActiveJob(job))
    .map((job) => ({
      job,
      summary: getJobOperationalSummary(job, operations, today),
    }))
    .filter(({ summary }) => summary.daysUntilInstall != null && summary.daysUntilInstall >= 0 && summary.daysUntilInstall <= horizonDays)
    .sort((left, right) => parseDateValue(left.summary.installDate) - parseDateValue(right.summary.installDate));
}
