import { getLastSegment, getLiveTrackedMinutes, getTimeEntrySegments, isBreakEntry, normalizeDateOnly, roundHours } from "./timeclock";

export const LABOUR_CATEGORIES = [
  "Cutting",
  "Assembly",
  "Hardware",
  "Install",
  "Site Measure",
  "Delivery",
  "Plans/Admin",
  "Other",
];

export const DEFAULT_LABOUR_CATEGORY_RULES = [
  { category: "Install", patterns: ["install", "on site", "onsite", "fit off", "fitoff"] },
  { category: "Site Measure", patterns: ["site measure", "measure", "check measure", "site visit"] },
  { category: "Cutting", patterns: ["cut", "cutting", "saw", "cnc", "nest"] },
  { category: "Assembly", patterns: ["assembly", "assemble", "build", "bench"] },
  { category: "Hardware", patterns: ["hardware", "hinge", "runner", "blum", "handle", "drawer"] },
  { category: "Delivery", patterns: ["delivery", "deliver", "freight", "pickup", "pick up"] },
  { category: "Plans/Admin", patterns: ["admin", "plan", "plans", "drawing", "design", "quote", "paperwork"] },
];

export function normaliseActualLabourId(value) {
  return String(value ?? "").trim();
}

export function isManualLabourEntry(entry) {
  return Boolean(entry?.manual_override)
    || String(entry?.source || "").toLowerCase() === "manual"
    || Boolean(entry?.manual_reason);
}

export function isExcludedFromLabourCosting(entry) {
  return Boolean(entry?.exclude_from_costing || entry?.costing_excluded || entry?.excluded_from_costing);
}

export function isCostableTimeEntry(entry) {
  return Boolean(entry) && !isBreakEntry(entry) && !isExcludedFromLabourCosting(entry);
}

export function getActualLabourDurationHours(entry, nowValue = new Date()) {
  if (!entry) return 0;
  if (entry.total_minutes != null || Array.isArray(entry.segments)) {
    return roundHours(getLiveTrackedMinutes(entry, nowValue) / 60);
  }
  if (entry.hours != null) {
    return roundHours(Number(entry.hours) || 0);
  }
  return roundHours(getLiveTrackedMinutes(entry, nowValue) / 60);
}

export function getTimeEntryStartValue(entry) {
  const segments = getTimeEntrySegments(entry);
  return segments[0]?.started_at || entry?.clock_in || entry?.start_time || "";
}

export function getTimeEntryEndValue(entry) {
  const lastSegment = getLastSegment(entry);
  return lastSegment?.ended_at || entry?.clock_out || entry?.end_time || "";
}

function categoryFromText(text, rules) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) return "";
  const match = rules.find((rule) => (rule.patterns || []).some((pattern) => haystack.includes(String(pattern).toLowerCase())));
  return match?.category || "";
}

export function mapTimeEntryToLabourCategory(entry, rules = DEFAULT_LABOUR_CATEGORY_RULES) {
  const explicit = String(entry?.labour_category || entry?.labourCategory || "").trim();
  if (LABOUR_CATEGORIES.includes(explicit)) return explicit;

  const text = [
    entry?.activity,
    entry?.operation,
    entry?.task_name,
    entry?.job_operation_label,
    entry?.workflow_phase,
    entry?.description,
    entry?.notes,
  ].filter(Boolean).join(" ");

  return categoryFromText(text, rules) || "Other";
}

export function isTimeEntryLinkedToScope(entry, { quoteId = "", jobIds = [] } = {}) {
  const quoteKey = normaliseActualLabourId(quoteId);
  const jobKeys = new Set((jobIds || []).map(normaliseActualLabourId).filter(Boolean));
  const entryQuoteId = normaliseActualLabourId(entry?.quote_id || entry?.linked_quote_id);
  const entryJobId = normaliseActualLabourId(entry?.job_id || entry?.linked_job_id);

  if (quoteKey && entryQuoteId === quoteKey) return true;
  return Boolean(entryJobId && jobKeys.has(entryJobId));
}

export function isUnassignedTimeEntry(entry) {
  return isCostableTimeEntry(entry)
    && !normaliseActualLabourId(entry?.quote_id || entry?.linked_quote_id)
    && !normaliseActualLabourId(entry?.job_id || entry?.linked_job_id);
}

function addBreakdownRow(map, key, seed, hours, cost) {
  const safeKey = key || "Unspecified";
  const current = map.get(safeKey) || { ...seed, hours: 0, cost: 0, count: 0 };
  current.hours = roundHours(current.hours + hours);
  current.cost = Math.round((current.cost + cost) * 100) / 100;
  current.count += 1;
  map.set(safeKey, current);
}

function normaliseLabourEntry(entry, { categoryRules, fallbackRate, nowValue }) {
  const hours = getActualLabourDurationHours(entry, nowValue);
  const rate = Number(entry?.hourly_rate ?? entry?.labour_rate ?? fallbackRate ?? 0) || 0;
  const category = mapTimeEntryToLabourCategory(entry, categoryRules);
  const date = normalizeDateOnly(entry?.date || getTimeEntryStartValue(entry));
  return {
    ...entry,
    source: isManualLabourEntry(entry) ? "manual" : "timeclock",
    labour_category: category,
    actual_hours: hours,
    labour_cost: Math.round(hours * rate * 100) / 100,
    start_time: getTimeEntryStartValue(entry),
    end_time: getTimeEntryEndValue(entry),
    labour_date: date,
  };
}

export function buildActualLabourSummary({
  quoteId = "",
  jobIds = [],
  entries = [],
  operations = [],
  quoteItems = [],
  labourRate = 0,
  labourSellAllowance,
  categoryRules = DEFAULT_LABOUR_CATEGORY_RULES,
  nowValue = new Date(),
} = {}) {
  const allEntries = Array.isArray(entries) ? entries : [];
  const linkedEntries = allEntries
    .filter(isCostableTimeEntry)
    .filter((entry) => isTimeEntryLinkedToScope(entry, { quoteId, jobIds }))
    .map((entry) => normaliseLabourEntry(entry, { categoryRules, fallbackRate: labourRate, nowValue }));

  const unassignedEntries = allEntries
    .filter(isUnassignedTimeEntry)
    .map((entry) => normaliseLabourEntry(entry, { categoryRules, fallbackRate: labourRate, nowValue }));

  const actualHours = roundHours(linkedEntries.reduce((sum, entry) => sum + entry.actual_hours, 0));
  const estimatedHours = roundHours((Array.isArray(operations) ? operations : []).reduce((sum, operation) => sum + (Number(operation?.estimated_hours) || 0), 0));
  const varianceHours = roundHours(actualHours - estimatedHours);
  const variancePercent = estimatedHours > 0 ? Math.round((varianceHours / estimatedHours) * 1000) / 10 : (actualHours > 0 ? 100 : 0);
  const labourCost = Math.round(linkedEntries.reduce((sum, entry) => sum + entry.labour_cost, 0) * 100) / 100;
  const sellAllowance = labourSellAllowance != null
    ? Number(labourSellAllowance) || 0
    : (Array.isArray(quoteItems) ? quoteItems : [])
      .filter((item) => String(item?.category || "").toLowerCase().includes("labour") || String(item?.category || "").toLowerCase().includes("install"))
      .reduce((sum, item) => sum + (Number(item?.total) || 0), 0);

  const byCategory = new Map();
  const byStaff = new Map();
  const byDate = new Map();
  const byWorkflowTask = new Map();

  linkedEntries.forEach((entry) => {
    addBreakdownRow(byCategory, entry.labour_category, { category: entry.labour_category }, entry.actual_hours, entry.labour_cost);
    addBreakdownRow(byStaff, entry.staff_name || entry.staff_id, { staff_id: entry.staff_id || "", staff_name: entry.staff_name || "Unassigned staff" }, entry.actual_hours, entry.labour_cost);
    addBreakdownRow(byDate, entry.labour_date, { date: entry.labour_date || "No date" }, entry.actual_hours, entry.labour_cost);
    addBreakdownRow(byWorkflowTask, entry.workflow_task_id || entry.job_operation_id || entry.job_operation_label || entry.operation, {
      workflow_task_id: entry.workflow_task_id || entry.job_operation_id || "",
      task_name: entry.job_operation_label || entry.operation || "No workflow task",
    }, entry.actual_hours, entry.labour_cost);
  });

  return {
    estimatedHours,
    actualHours,
    varianceHours,
    variancePercent,
    labourCost,
    labourSellAllowance: Math.round(sellAllowance * 100) / 100,
    labourProfitLossImpact: Math.round((sellAllowance - labourCost) * 100) / 100,
    entries: linkedEntries,
    unassignedEntries,
    breakdown: {
      byCategory: [...byCategory.values()],
      byStaff: [...byStaff.values()],
      byDate: [...byDate.values()],
      byWorkflowTask: [...byWorkflowTask.values()],
    },
  };
}

export function buildTimeEntryAssignmentPatch(entry, { quoteId = "", jobId = "", labourCategory = "" } = {}) {
  const category = labourCategory || mapTimeEntryToLabourCategory(entry);
  return {
    quote_id: quoteId || entry?.quote_id || "",
    job_id: jobId || entry?.job_id || "",
    labour_category: category,
    costing_reviewed: false,
    excluded_from_costing: false,
    exclude_from_costing: false,
  };
}

export function buildTimeEntryAuditEvent(action, entry, actor = "JoinerFlow") {
  return {
    action,
    time_entry_id: entry?.id || "",
    actor,
    timestamp: new Date().toISOString(),
  };
}
