import { formatDateForInput } from "./helpers";

export const BREAK_ACTIVITY = "Break";
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
export const TIME_REVIEW_FLAGS = {
  overnight_timer: "overnight_timer",
  long_running_timer: "long_running_timer",
  unassigned_chargeable_time: "unassigned_chargeable_time",
  other_category: "other_category",
  manual_correction: "manual_correction",
  export_error: "export_error",
};

export const ACTIVITY_OPTIONS = [
  { value: "ACC", label: "ACC", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Annual Leave", label: "Annual Leave", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Breavement Leave", label: "Breavement Leave", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "cleaning", label: "cleaning", type: "Non-Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Covid -19", label: "Covid -19", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Labour", label: "Labour", type: "Hourly", status: "Chargeable", requiresJob: true },
  { value: "Material handling", label: "Material handling", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Other Chargeable", label: "Other Chargeable", type: "Hourly", status: "Chargeable", requiresJob: true },
  { value: "Quoting", label: "Quoting", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Rework", label: "Rework", type: "Hourly", status: "Chargeable", requiresJob: true },
  { value: "Sanding", label: "Sanding", type: "Hourly", status: "Chargeable", requiresJob: true },
  { value: "Shop Work NC", label: "Shop Work NC", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Sick Leave", label: "Sick Leave", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Staff meetings", label: "Staff meetings", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Staff Traning", label: "Staff Traning", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Statutory Holiday", label: "Statutory Holiday", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Supervision", label: "Supervision", type: "Non-Hourly", status: "Non-Chargeable", requiresJob: false },
  { value: "Van Mileage", label: "Van Mileage", type: "Non-Hourly", status: "Chargeable", requiresJob: true },
  { value: "Warranty Rework", label: "Warranty Rework", type: "Hourly", status: "Non-Chargeable", requiresJob: false },
];

export function getActivityMeta(activity) {
  return ACTIVITY_OPTIONS.find((option) => option.value === activity) || null;
}

export function roundHours(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function normalizeDateOnly(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(rawValue)) {
    return rawValue.slice(0, 10);
  }

  return formatDateForInput(rawValue);
}

export function formatElapsedSeconds(totalSeconds) {
  const wholeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function calculateHoursBetween(startValue, endValue, breakMinutes = 0) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const rawHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const deductedHours = rawHours - (Number(breakMinutes) || 0) / 60;
  return roundHours(Math.max(0, deductedHours));
}

export function normalizeTimeEntryStatus(value) {
  const normalized = String(value || "active").trim().toLowerCase();
  if (normalized === "complete") {
    return "completed";
  }
  if (normalized === "paused") {
    return "paused";
  }
  return normalized === "completed" ? "completed" : "active";
}

function normalizeDateTime(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

export function getTimeEntrySegments(entry) {
  const explicitSegments = Array.isArray(entry?.segments)
    ? entry.segments
        .map((segment) => {
          const startedAt = normalizeDateTime(segment?.started_at ?? segment?.startedAt);
          const endedAt = normalizeDateTime(segment?.ended_at ?? segment?.endedAt);
          if (!startedAt) {
            return null;
          }

          return {
            started_at: startedAt,
            ended_at: endedAt || "",
            duration_minutes: endedAt
              ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / (1000 * 60)))
              : Number(segment?.duration_minutes ?? segment?.durationMinutes ?? 0) || 0,
          };
        })
        .filter(Boolean)
    : [];

  if (explicitSegments.length > 0) {
    return explicitSegments.sort((left, right) => String(left.started_at).localeCompare(String(right.started_at)));
  }

  const clockIn = normalizeDateTime(entry?.clock_in || entry?.start_time);
  const clockOut = normalizeDateTime(entry?.clock_out || entry?.end_time);
  if (!clockIn) {
    return [];
  }

  return [{
    started_at: clockIn,
    ended_at: clockOut || "",
    duration_minutes: clockOut ? Math.max(0, Math.round((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / (1000 * 60))) : 0,
  }];
}

export function getOpenSegment(entry) {
  return getTimeEntrySegments(entry).find((segment) => !segment.ended_at) || null;
}

export function getLastSegment(entry) {
  const segments = getTimeEntrySegments(entry);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

export function getClosedTrackedMinutes(entry) {
  if (entry?.total_minutes != null) {
    return Math.max(0, Number(entry.total_minutes) || 0);
  }

  const segments = getTimeEntrySegments(entry);
  if (segments.length === 0 && entry?.hours != null) {
    return Math.max(0, Math.round((Number(entry.hours) || 0) * 60));
  }
  const segmentMinutes = segments.reduce((sum, segment) => sum + (segment.ended_at ? Number(segment.duration_minutes || 0) : 0), 0);
  return Math.max(0, segmentMinutes - (Number(entry?.break_minutes || 0) || 0));
}

export function getLiveTrackedMinutes(entry, nowValue = new Date()) {
  const closedMinutes = getClosedTrackedMinutes(entry);
  const openSegment = getOpenSegment(entry);
  if (!openSegment) {
    return closedMinutes;
  }

  const liveMinutes = Math.max(
    0,
    Math.round((new Date(nowValue).getTime() - new Date(openSegment.started_at).getTime()) / (1000 * 60))
  );
  return closedMinutes + liveMinutes;
}

export function getLiveTrackedSeconds(entry, nowValue = new Date()) {
  return Math.max(0, Math.round(getLiveTrackedMinutes(entry, nowValue) * 60));
}

export function sortTimeEntries(entries) {
  return [...(entries || [])].sort((left, right) => {
    const leftStamp = getOpenSegment(left)?.started_at || getLastSegment(left)?.ended_at || getLastSegment(left)?.started_at || left.updated_date || left.created_date || left.date || "";
    const rightStamp = getOpenSegment(right)?.started_at || getLastSegment(right)?.ended_at || getLastSegment(right)?.started_at || right.updated_date || right.created_date || right.date || "";
    return String(rightStamp).localeCompare(String(leftStamp));
  });
}

export function isBreakEntry(entry) {
  return Boolean(entry?.is_break) || String(entry?.entry_kind || "").trim().toLowerCase() === "break" || String(entry?.activity || "").trim().toLowerCase() === "break";
}

export function hasOpenAttendance(clockIns = [], staffId = "") {
  return (clockIns || []).some((record) => record.staff_id === staffId && record.clock_in && !record.clock_out);
}

export function activityRequiresJob(activity) {
  const match = getActivityMeta(activity);
  return match ? match.requiresJob : true;
}

export function isChargeableActivity(activity) {
  const match = getActivityMeta(activity);
  return match ? String(match.status || "").toLowerCase() === "chargeable" : true;
}

export function requiresCommentWhenJobless(activity) {
  return !isChargeableActivity(activity);
}

export function normalizeLabourCategory(value) {
  const rawValue = String(value || "").trim();
  return LABOUR_CATEGORIES.find((category) => category.toLowerCase() === rawValue.toLowerCase()) || "";
}

export function deriveLabourCategory(entry = {}) {
  const explicit = normalizeLabourCategory(entry.labour_category);
  if (explicit) {
    return explicit;
  }

  const text = [
    entry.activity,
    entry.operation,
    entry.job_operation_label,
    entry.workflow_phase,
    entry.description,
    entry.notes,
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join(" ");

  if (text.includes("install")) return "Install";
  if (text.includes("site measure") || text.includes("measure")) return "Site Measure";
  if (text.includes("cut")) return "Cutting";
  if (text.includes("hardware") || text.includes("hinge") || text.includes("runner") || text.includes("handle")) return "Hardware";
  if (text.includes("deliver") || text.includes("delivery") || text.includes("freight")) return "Delivery";
  if (text.includes("plan") || text.includes("quote") || text.includes("admin") || text.includes("meeting") || text.includes("training")) return "Plans/Admin";
  return "Assembly";
}

export function getTimeRange(entry, nowValue = new Date()) {
  const segments = getTimeEntrySegments(entry);
  const startValue = segments[0]?.started_at || entry?.clock_in || entry?.start_time || "";
  const openSegment = segments.find((segment) => !segment.ended_at);
  const endValue = openSegment ? new Date(nowValue).toISOString() : segments[segments.length - 1]?.ended_at || entry?.clock_out || entry?.end_time || "";
  if (!startValue) {
    return null;
  }

  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : new Date(nowValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return {
    start,
    end,
  };
}

export function detectTimeEntryOverlap(candidate, entries = [], excludeId = "") {
  const candidateRange = getTimeRange(candidate);
  if (!candidateRange || candidateRange.end <= candidateRange.start || !candidate.staff_id) {
    return null;
  }

  return entries.find((entry) => {
    if (!entry || entry.id === excludeId || entry.staff_id !== candidate.staff_id) {
      return false;
    }

    const range = getTimeRange(entry);
    if (!range) {
      return false;
    }

    return candidateRange.start < range.end && candidateRange.end > range.start;
  }) || null;
}

export function buildTimeEntryReviewFlags(entry, nowValue = new Date()) {
  const flags = new Set(Array.isArray(entry?.review_flags) ? entry.review_flags : []);
  const labourCategory = normalizeLabourCategory(entry?.labour_category) || deriveLabourCategory(entry);
  const chargeable = entry?.is_chargeable != null ? Boolean(entry.is_chargeable) : isChargeableActivity(entry?.activity);
  const clockIn = entry?.clock_in ? new Date(entry.clock_in) : null;
  const openSegment = getOpenSegment(entry);
  const clockOut = entry?.clock_out ? new Date(entry.clock_out) : openSegment ? new Date(nowValue) : null;
  const durationHours = getLiveTrackedMinutes(entry, nowValue) / 60;

  if (!isBreakEntry(entry) && chargeable && !String(entry?.job_id || "").trim()) {
    flags.add(TIME_REVIEW_FLAGS.unassigned_chargeable_time);
  }
  if (!isBreakEntry(entry) && labourCategory === "Other") {
    flags.add(TIME_REVIEW_FLAGS.other_category);
  }
  if (entry?.manual_override) {
    flags.add(TIME_REVIEW_FLAGS.manual_correction);
  }
  if (clockIn && clockOut && !Number.isNaN(clockIn.getTime()) && !Number.isNaN(clockOut.getTime()) && clockIn.toDateString() !== clockOut.toDateString()) {
    flags.add(TIME_REVIEW_FLAGS.overnight_timer);
  }
  if (["active", "paused"].includes(normalizeTimeEntryStatus(entry?.status)) && durationHours >= 10) {
    flags.add(TIME_REVIEW_FLAGS.long_running_timer);
  }

  return [...flags];
}

export function buildDailyReviewQueue(entries = [], exportErrors = [], nowValue = new Date()) {
  const today = normalizeDateOnly(nowValue);
  const queue = [];

  (entries || []).forEach((entry) => {
    const dateKey = normalizeDateOnly(entry.date || entry.clock_in || entry.clock_out);
    if (dateKey !== today && normalizeTimeEntryStatus(entry.status) === "completed") {
      return;
    }

    const flags = buildTimeEntryReviewFlags(entry, nowValue);
    if (flags.length === 0) {
      return;
    }

    queue.push({
      id: `time-${entry.id}`,
      type: "time_entry",
      entry,
      staff_name: entry.staff_name || "Unknown staff member",
      date: dateKey,
      job_label: entry.job_number || entry.job_name || entry.job_title || "No linked job",
      activity: entry.activity || "Work",
      flags,
    });
  });

  (exportErrors || []).forEach((error, index) => {
    queue.push({
      id: `export-${error.id || index}`,
      type: "export_error",
      flags: [TIME_REVIEW_FLAGS.export_error],
      date: today,
      staff_name: error.staff_name || "Export validation",
      job_label: error.job_number || error.job || "Review export record",
      activity: error.activity || error.payroll_category || "Export error",
      error,
    });
  });

  return queue;
}

export function getActiveEntryForStaff(entries = [], staffId = "") {
  return (entries || []).find((entry) => entry.staff_id === staffId && normalizeTimeEntryStatus(entry.status) === "active") || null;
}

export function getOperationOptionsForJob(jobOperations = [], jobId = "") {
  return [...(jobOperations || [])]
    .filter((operation) => operation.job_id === jobId)
    .sort((left, right) => {
      const leftStatus = String(left.status || "");
      const rightStatus = String(right.status || "");
      const activeBias = leftStatus === "in_progress" ? -1 : rightStatus === "in_progress" ? 1 : 0;
      if (activeBias !== 0) {
        return activeBias;
      }

      const leftOrder = Number(left.sort_order || 0);
      const rightOrder = Number(right.sort_order || 0);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(left.name || left.title || "").localeCompare(String(right.name || right.title || ""));
    });
}

export function getRecentSuggestions(entries = [], staffId = "", limit = 3) {
  if (!staffId) {
    return [];
  }

  const seen = new Set();
  return sortTimeEntries(entries)
    .filter((entry) => entry.staff_id === staffId && normalizeTimeEntryStatus(entry.status) !== "active" && !isBreakEntry(entry))
    .filter((entry) => {
      const key = [entry.job_id || "", entry.activity || ""].join("|");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildTimeclockOverview({ activeEntries = [], completedEntries = [], staff = [], todayValue = new Date() }) {
  const today = normalizeDateOnly(todayValue);
  const activeNow = activeEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) === "active");
  const onBreak = activeNow.filter(isBreakEntry);
  const todayTrackedEntries = [...activeEntries, ...completedEntries].filter((entry) => normalizeDateOnly(entry.date || entry.clock_out || entry.clock_in) === today && !isBreakEntry(entry));
  const trackedTodayHours = roundHours(todayTrackedEntries.reduce((sum, entry) => sum + getLiveTrackedMinutes(entry, todayValue) / 60, 0));
  const activeStaffIds = new Set(activeNow.map((entry) => entry.staff_id).filter(Boolean));
  const availableStaff = Math.max(0, (staff || []).filter((person) => String(person.status || "active").toLowerCase() === "active").length - activeStaffIds.size);

  return {
    activeNow: activeNow.length,
    onBreak: onBreak.length,
    trackedTodayHours,
    availableStaff,
  };
}

export function buildShiftSummary(entry) {
  const jobLabel = entry.job_number
    ? `${entry.job_number}${entry.job_name || entry.job_title ? ` · ${entry.job_name || entry.job_title}` : ""}`
    : entry.job_name || entry.job_title || "Unassigned work";

  const operationLabel = entry.activity || entry.job_operation_label || entry.workflow_phase || "General";

  return {
    jobLabel,
    operationLabel,
    activityLabel: entry.activity || operationLabel,
  };
}
