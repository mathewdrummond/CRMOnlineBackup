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

export const QUOTE_STATUSES = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "sent", label: "Sent", color: "blue" },
  { value: "accepted", label: "Accepted", color: "emerald" },
  { value: "declined", label: "Declined", color: "red" },
  { value: "expired", label: "Expired", color: "orange" },
  { value: "revised", label: "Revised", color: "purple" },
];

export const PO_STATUSES = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "sent", label: "Sent", color: "blue" },
  { value: "acknowledged", label: "Acknowledged", color: "cyan" },
  { value: "part_received", label: "Part Received", color: "amber" },
  { value: "received", label: "Received", color: "emerald" },
  { value: "cancelled", label: "Cancelled", color: "red" },
];

export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency: "AUD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export function getStageConfig(stages, value) {
  return stages.find(s => s.value === value) || { label: value || "Unknown", color: "slate" };
}

export function generateNumber(prefix, count) {
  return `${prefix}-${String((count || 0) + 1).padStart(4, "0")}`;
}