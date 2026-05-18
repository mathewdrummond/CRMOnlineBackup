export const LEAD_STAGES = [
  { value: "new_enquiry", label: "New Enquiry", color: "blue" },
  { value: "contacted", label: "Contacted", color: "cyan" },
  { value: "site_visit_booked", label: "Site Visit", color: "purple" },
  { value: "measuring", label: "Measuring", color: "pink" },
  { value: "waiting_on_info", label: "Waiting on Info", color: "orange" },
  { value: "quote_in_progress", label: "Quote in Progress", color: "amber" },
  { value: "quote_sent", label: "Quote Sent", color: "teal" },
  { value: "won", label: "Won", color: "emerald" },
  { value: "lost", label: "Lost", color: "red" },
  { value: "on_hold", label: "On Hold", color: "slate" },
];

export const JOB_STATUSES = [
  { value: "planning", label: "Planning", color: "blue" },
  { value: "approved", label: "Approved", color: "cyan" },
  { value: "production", label: "Production", color: "amber" },
  { value: "ready_to_install", label: "Ready to Install", color: "purple" },
  { value: "installed", label: "Installed", color: "teal" },
  { value: "callback", label: "Callback", color: "orange" },
  { value: "complete", label: "Complete", color: "emerald" },
  { value: "on_hold", label: "On Hold", color: "slate" },
  { value: "cancelled", label: "Cancelled", color: "red" },
];

export const OPERATIONS = [
  { value: "design", label: "Design", color: "purple" },
  { value: "ordering", label: "Ordering", color: "blue" },
  { value: "cnc", label: "CNC", color: "cyan" },
  { value: "machining", label: "Machining", color: "teal" },
  { value: "edging", label: "Edging", color: "amber" },
  { value: "assembly", label: "Assembly", color: "orange" },
  { value: "finishing", label: "Finishing", color: "pink" },
  { value: "delivery", label: "Delivery", color: "emerald" },
  { value: "install", label: "Install", color: "green" },
  { value: "other", label: "Other", color: "slate" },
];

export const WORKFLOW_PHASES = [
  { value: "enquiry", label: "Enquiry", color: "blue" },
  { value: "measure", label: "Measure", color: "cyan" },
  { value: "design_pricing", label: "Design & Pricing", color: "purple" },
  { value: "client_follow_up", label: "Client Follow-Up", color: "teal" },
  { value: "pre_production", label: "Pre-Production", color: "amber" },
  { value: "manufacturing", label: "Manufacturing", color: "orange" },
  { value: "installation", label: "Installation", color: "green" },
  { value: "completion", label: "Completion", color: "emerald" },
];

export const WORKFLOW_TASK_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "on_hold", label: "On Hold" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
];

export const QUOTE_STATUSES = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "awaiting_bruce", label: "Awaiting Bruce", color: "blue" },
  { value: "awaiting_mathew", label: "Awaiting Mathew", color: "cyan" },
  { value: "quote_complete", label: "Quote Complete", color: "purple" },
  { value: "awaiting_confirmation", label: "Awaiting Confirmation", color: "amber" },
  { value: "won", label: "Won", color: "emerald" },
  { value: "sent", label: "Awaiting Confirmation", color: "amber" },
  { value: "accepted", label: "Won", color: "emerald" },
  { value: "revised", label: "Awaiting Mathew", color: "cyan" },
  { value: "declined", label: "Awaiting Confirmation", color: "amber" },
  { value: "expired", label: "Awaiting Confirmation", color: "amber" },
  { value: "archived", label: "Archived", color: "slate" },
];

export function normalizeQuoteStatus(status) {
  const normalized = String(status || "draft").toLowerCase();

  if (normalized === "sent" || normalized === "declined" || normalized === "expired") {
    return "awaiting_confirmation";
  }

  if (normalized === "accepted") {
    return "won";
  }

  if (normalized === "revised") {
    return "awaiting_mathew";
  }

  return normalized;
}

export const PO_STATUSES = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "sent", label: "Sent", color: "blue" },
  { value: "acknowledged", label: "Acknowledged", color: "cyan" },
  { value: "part_received", label: "Part Received", color: "amber" },
  { value: "received", label: "Received", color: "emerald" },
  { value: "cancelled", label: "Cancelled", color: "red" },
];

export const GST_RATE = 0.15;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseDateValue(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  if (DATE_ONLY_PATTERN.test(rawValue)) {
    const [year, month, day] = rawValue.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateForInput(value = new Date()) {
  const parsed = value instanceof Date ? value : parseDateValue(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

export function formatCurrency(amount, options = {}) {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
  } = options;
  return new Intl.NumberFormat("en-NZ", {
    style: "currency", currency: "NZD",
    minimumFractionDigits, maximumFractionDigits,
  }).format(amount || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const parsed = parseDateValue(dateStr);
    if (!parsed) {
      return "—";
    }

    return parsed.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export function getStageConfig(stages, value) {
  return stages.find(s => s.value === value) || { label: value || "Unknown", color: "slate" };
}

export function generateNumber(prefix, count) {
  return `${prefix}-${String((count || 0) + 1).padStart(4, "0")}`;
}
