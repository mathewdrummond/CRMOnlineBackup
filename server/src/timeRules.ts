type ActivityRule = {
  chargeable: boolean;
  requiresJob: boolean;
  defaultLabourCategory: string;
};

export const TIME_RULES = {
  lunchDeductionMinutes: 30,
  lunchDeductionThresholdHours: 5.5,
  longRunningTimerHours: 10,
} as const;

export const LABOUR_CATEGORIES = [
  "Cutting",
  "Assembly",
  "Hardware",
  "Install",
  "Site Measure",
  "Delivery",
  "Plans/Admin",
  "Other",
] as const;

export const TIME_REVIEW_FLAGS = {
  overnight_timer: "overnight_timer",
  long_running_timer: "long_running_timer",
  unassigned_chargeable_time: "unassigned_chargeable_time",
  other_category: "other_category",
  manual_correction: "manual_correction",
  export_error: "export_error",
} as const;

const ACTIVITY_RULES: Record<string, ActivityRule> = {
  acc: { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "annual leave": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "bereavement leave": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "breavement leave": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  break: { chargeable: false, requiresJob: false, defaultLabourCategory: "Other" },
  cleaning: { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "covid -19": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "covid-19": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  labour: { chargeable: true, requiresJob: true, defaultLabourCategory: "Assembly" },
  "material handling": { chargeable: false, requiresJob: false, defaultLabourCategory: "Delivery" },
  "other chargeable": { chargeable: true, requiresJob: true, defaultLabourCategory: "Other" },
  quoting: { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  rework: { chargeable: true, requiresJob: true, defaultLabourCategory: "Assembly" },
  sanding: { chargeable: true, requiresJob: true, defaultLabourCategory: "Assembly" },
  "shop work nc": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "sick leave": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "staff meetings": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "staff traning": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "staff training": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "statutory holiday": { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  supervision: { chargeable: false, requiresJob: false, defaultLabourCategory: "Plans/Admin" },
  "van mileage": { chargeable: true, requiresJob: true, defaultLabourCategory: "Delivery" },
  "warranty rework": { chargeable: false, requiresJob: false, defaultLabourCategory: "Other" },
};

function normalizeActivityKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function getActivityRule(activity: unknown): ActivityRule {
  const key = normalizeActivityKey(activity);
  return ACTIVITY_RULES[key] || { chargeable: true, requiresJob: true, defaultLabourCategory: "Other" };
}

export function isChargeableActivity(activity: unknown) {
  return getActivityRule(activity).chargeable;
}

export function activityRequiresJob(activity: unknown) {
  return getActivityRule(activity).requiresJob;
}

export function requiresCommentWhenJobless(activity: unknown) {
  return !isChargeableActivity(activity);
}

export function normalizeLabourCategory(value: unknown) {
  const rawValue = String(value || "").trim();
  const match = LABOUR_CATEGORIES.find((category) => category.toLowerCase() === rawValue.toLowerCase());
  return match || "";
}

export function deriveLabourCategory(input: Record<string, unknown>) {
  const explicit = normalizeLabourCategory(input.labour_category);
  if (explicit) {
    return explicit;
  }

  const text = [
    input.activity,
    input.operation,
    input.job_operation_label,
    input.workflow_phase,
    input.description,
    input.notes,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (text.includes("install")) return "Install";
  if (text.includes("site measure") || text.includes("measure")) return "Site Measure";
  if (text.includes("cut")) return "Cutting";
  if (text.includes("hardware") || text.includes("hinge") || text.includes("runner") || text.includes("handle")) return "Hardware";
  if (text.includes("deliver") || text.includes("delivery") || text.includes("freight")) return "Delivery";
  if (text.includes("plan") || text.includes("quote") || text.includes("admin") || text.includes("meeting") || text.includes("training")) return "Plans/Admin";
  if (text.includes("assembly") || text.includes("assemble") || text.includes("labour") || text.includes("rework") || text.includes("sanding")) return "Assembly";

  return getActivityRule(input.activity).defaultLabourCategory;
}

export function applyPayrollLunchDeduction(hours: unknown) {
  const rounded = Math.round((Number(hours) || 0) * 100) / 100;
  if (rounded > TIME_RULES.lunchDeductionThresholdHours) {
    return Math.max(0, Math.round((rounded - TIME_RULES.lunchDeductionMinutes / 60) * 100) / 100);
  }
  return rounded;
}

export function buildTimeReviewFlags(input: {
  status?: unknown;
  is_break?: unknown;
  clock_in?: unknown;
  clock_out?: unknown;
  hours?: unknown;
  labour_category?: unknown;
  manual_override?: unknown;
  is_chargeable?: unknown;
  job_id?: unknown;
}, now = new Date()) {
  const flags: string[] = [];
  const status = String(input.status || "").trim().toLowerCase();
  const isBreak = Boolean(input.is_break);
  const chargeable = Boolean(input.is_chargeable);
  const jobId = String(input.job_id || "").trim();
  const labourCategory = normalizeLabourCategory(input.labour_category) || "Other";
  const clockIn = String(input.clock_in || "").trim();
  const clockOut = String(input.clock_out || "").trim();
  const start = clockIn ? new Date(clockIn) : null;
  const end = clockOut ? new Date(clockOut) : now;
  const durationHours = Number(input.hours || 0);

  if (!isBreak && chargeable && !jobId) {
    flags.push(TIME_REVIEW_FLAGS.unassigned_chargeable_time);
  }

  if (!isBreak && labourCategory === "Other") {
    flags.push(TIME_REVIEW_FLAGS.other_category);
  }

  if (Boolean(input.manual_override)) {
    flags.push(TIME_REVIEW_FLAGS.manual_correction);
  }

  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    const crossedMidnight =
      start.getUTCFullYear() !== end.getUTCFullYear()
      || start.getUTCMonth() !== end.getUTCMonth()
      || start.getUTCDate() !== end.getUTCDate();
    if (crossedMidnight) {
      flags.push(TIME_REVIEW_FLAGS.overnight_timer);
    }
  }

  if ((status === "active" || status === "paused" || durationHours >= TIME_RULES.longRunningTimerHours) && durationHours >= TIME_RULES.longRunningTimerHours) {
    flags.push(TIME_REVIEW_FLAGS.long_running_timer);
  }

  return [...new Set(flags)];
}
