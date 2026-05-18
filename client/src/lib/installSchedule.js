import { addDays, differenceInCalendarDays, format, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { getJobOperationalSummary, isActiveJob } from "./crmOpsInsights";
import { buildAssignedStaffDisplay } from "./staffIdentity";
import { normaliseDateString } from "./scheduleTimeline";

export const INSTALL_TIMELINE_LANE_ID = "install-planner";
export const UNASSIGNED_INSTALL_LANE_ID = "install-unassigned";
export const NEXT_WORKING_DAY_OFFSET = 1;
const INSTALL_OPERATION_TYPES = new Set(["install"]);
const INSTALL_PHASES = new Set(["installation"]);
const READY_FOR_INSTALL_JOB_STATUSES = new Set(["ready_to_install"]);
const DEFAULT_INSTALL_LABEL = "Installation";

export const INSTALL_TYPE_OPTIONS = [
  { value: "install", label: "Install", color: "emerald", defaultDuration: 10.5, defaultPriority: "high" },
  { value: "measure", label: "Measure", color: "blue", defaultDuration: 2, defaultPriority: "medium" },
  { value: "delivery", label: "Delivery", color: "amber", defaultDuration: 4, defaultPriority: "medium" },
  { value: "service", label: "Service call", color: "orange", defaultDuration: 3, defaultPriority: "high" },
  { value: "admin", label: "Admin / prep", color: "slate", defaultDuration: 1, defaultPriority: "low" },
  { value: "prep", label: "Prep", color: "teal", defaultDuration: 2, defaultPriority: "medium" },
];

export const INSTALL_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function getDateSafely(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = startOfDay(parseISO(String(value)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function normaliseStatusLabel(value) {
  return String(value || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normaliseInstallType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "install";
  }
  if (normalized === "service call") {
    return "service";
  }
  if (normalized === "admin / prep") {
    return "admin";
  }
  return normalized;
}

function getInstallTypeConfig(installType) {
  return INSTALL_TYPE_OPTIONS.find((option) => option.value === normaliseInstallType(installType)) || INSTALL_TYPE_OPTIONS[0];
}

function parseStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // Legacy text values are still allowed.
  }

  return raw.split(/[|,;]+/).map((item) => item.trim()).filter(Boolean);
}

function parseNumeric(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildSiteLabel(job = {}) {
  const clientName = String(job.contact_name || job.company_name || "").trim();
  const siteName = String(job.site_address || "").trim();
  return [clientName, siteName].filter(Boolean).join(" · ");
}

function buildInstallLabel(operation = {}) {
  return String(operation.task_name || operation.title || operation.operation || DEFAULT_INSTALL_LABEL).trim() || DEFAULT_INSTALL_LABEL;
}

function buildNoteExcerpt(value) {
  const note = String(value || "").trim();
  if (!note) {
    return "";
  }

  if (note.length <= 60) {
    return note;
  }

  return `${note.slice(0, 57).trim()}...`;
}

function compareDateKeys(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

export function isInstallOperation(operation = {}) {
  const operationType = String(operation.operation || "").trim().toLowerCase();
  const workflowPhase = String(operation.workflow_phase || "").trim().toLowerCase();
  return INSTALL_OPERATION_TYPES.has(operationType) || (INSTALL_PHASES.has(workflowPhase) && !operationType);
}

function resolveInstallRange(startDate, endDate) {
  const safeStart = normaliseDateString(startDate);
  const safeEnd = normaliseDateString(endDate || startDate) || safeStart;

  if (!safeStart) {
    return { startDate: "", endDate: "" };
  }

  return safeEnd && safeEnd >= safeStart
    ? { startDate: safeStart, endDate: safeEnd }
    : { startDate: safeStart, endDate: safeStart };
}

function createUnifiedLane() {
  return {
    id: INSTALL_TIMELINE_LANE_ID,
    label: "Installation timeline",
    color: "emerald",
    lane_type: "installation_planner",
    description: "Unified install planner view",
  };
}

function buildAvailableLanes(lanes = [], laneMode = "staff") {
  const safeLanes = Array.isArray(lanes) ? lanes : [];
  if (laneMode === "unified") {
    return [createUnifiedLane()];
  }

  const includeCrewLanes = laneMode === "crew";
  const filtered = safeLanes.filter((lane) => {
    if (String(lane.id || "") === UNASSIGNED_INSTALL_LANE_ID) {
      return true;
    }
    if (includeCrewLanes) {
      return String(lane.lane_type || "") === "install_crew";
    }
    return String(lane.lane_type || "") === "install_staff";
  });

  if (filtered.length > 0) {
    return filtered;
  }
  return [
    {
      id: UNASSIGNED_INSTALL_LANE_ID,
      label: "Unassigned installs",
      color: "slate",
      lane_type: "install_queue",
      description: "Install work without an assigned staff lane yet.",
    },
  ];
}

function buildBaseItem(job, overrides = {}) {
  const siteLabel = buildSiteLabel(job);
  const installType = normaliseInstallType(overrides.installType || "install");
  const installTypeConfig = getInstallTypeConfig(installType);
  const assignedStaffIds = parseStringArray(overrides.assignedStaffIds);
  const assignedCrewName = String(overrides.assignedCrewName || "").trim();
  const assignedCrewId = String(overrides.assignedCrewId || "").trim();

  return {
    id: String(overrides.id || ""),
    laneId: String(overrides.laneId || INSTALL_TIMELINE_LANE_ID),
    jobId: String(job?.id || ""),
    jobNumber: String(job?.job_number || ""),
    jobTitle: String(job?.title || "").trim() || "Untitled job",
    title: String(overrides.title || job?.title || "").trim() || "Untitled job",
    clientSiteLabel: siteLabel,
    detailLabel: String(overrides.detailLabel || "").trim(),
    installLabel: String(overrides.installLabel || DEFAULT_INSTALL_LABEL).trim() || DEFAULT_INSTALL_LABEL,
    installStatusLabel: String(overrides.installStatusLabel || "").trim(),
    jobStatusLabel: normaliseStatusLabel(job?.status),
    notes: String(overrides.notes || "").trim(),
    startDate: String(overrides.startDate || ""),
    endDate: String(overrides.endDate || overrides.startDate || ""),
    status: String(overrides.status || job?.status || "scheduled").trim() || "scheduled",
    canResize: overrides.canResize !== false,
    sourceType: overrides.sourceType || "operation",
    recordId: String(overrides.recordId || ""),
    taskName: String(overrides.taskName || "").trim(),
    phase: "installation",
    type: "install",
    isBacklog: Boolean(overrides.isBacklog),
    noteExcerpt: buildNoteExcerpt(overrides.notes),
    source: overrides.source || null,
    installType,
    installTypeLabel: installTypeConfig.label,
    colorKey: installTypeConfig.color,
    durationHours: parseNumeric(overrides.durationHours, installTypeConfig.defaultDuration),
    estimatedDurationHoursOriginal: parseNumeric(overrides.estimatedDurationHoursOriginal, 0),
    estimatedDurationDays: parseNumeric(overrides.estimatedDurationDays, 0),
    estimatedDurationConfidence: String(overrides.estimatedDurationConfidence || "").trim(),
    suggestedCrewSize: Math.max(1, parseNumeric(overrides.suggestedCrewSize, 1)),
    requiredCrewSize: Math.max(1, parseNumeric(overrides.requiredCrewSize, 1)),
    priority: String(overrides.priority || installTypeConfig.defaultPriority || "medium").trim() || "medium",
    deadline: String(overrides.deadline || "").trim(),
    earliestStart: String(overrides.earliestStart || "").trim(),
    latestFinish: String(overrides.latestFinish || "").trim(),
    assignedStaffIds,
    assignedCrewId,
    assignedCrewName,
    assignedToDisplay: String(overrides.assignedToDisplay || "").trim(),
    location: String(overrides.location || job?.site_address || "").trim(),
    dependencies: parseStringArray(overrides.dependencies),
    requiredSkills: parseStringArray(overrides.requiredSkills),
    preferredCrewId: String(overrides.preferredCrewId || "").trim(),
    crewAssignmentLocked: Boolean(overrides.crewAssignmentLocked),
    durationManuallyOverridden: Boolean(overrides.durationManuallyOverridden),
    estimatorAssumptions: overrides.estimatorAssumptions || {},
    manuallyLocked: Boolean(overrides.manuallyLocked),
    scheduleWarnings: Array.isArray(overrides.scheduleWarnings) ? overrides.scheduleWarnings : [],
  };
}

function buildOperationInstallItem(job, operation, options = {}) {
  const { startDate, endDate } = resolveInstallRange(operation?.start_date, operation?.end_date);
  const assignedStaffIds = parseStringArray(operation?.assigned_staff_ids);
  const assignedCrewId = String(operation?.assigned_crew_id || "").trim();
  const assignedCrewName = String(operation?.assigned_crew_name || "").trim();

  return buildBaseItem(job, {
    id: `install-op-${String(operation?.id || "").trim()}`,
    sourceType: "operation",
    recordId: String(operation?.id || ""),
    installLabel: buildInstallLabel(operation),
    installStatusLabel: normaliseStatusLabel(operation?.status || "scheduled"),
    taskName: String(operation?.task_name || "").trim(),
    detailLabel: buildSiteLabel(job),
    notes: String(operation?.notes || operation?.description || "").trim(),
    startDate,
    endDate,
    status: String(operation?.status || "scheduled").trim() || "scheduled",
    canResize: true,
    source: operation,
    installType: operation?.install_type || operation?.operation || "install",
    durationHours: operation?.duration_hours || operation?.estimated_hours,
    estimatedDurationHoursOriginal: operation?.estimated_duration_hours_original,
    estimatedDurationDays: operation?.estimated_duration_days,
    estimatedDurationConfidence: operation?.estimated_duration_confidence,
    suggestedCrewSize: operation?.suggested_crew_size,
    requiredCrewSize: operation?.required_crew_size || operation?.suggested_crew_size,
    priority: operation?.priority,
    deadline: operation?.deadline,
    earliestStart: operation?.earliest_start,
    latestFinish: operation?.latest_finish,
    assignedStaffIds,
    assignedCrewId,
    assignedCrewName,
    assignedToDisplay: assignedCrewName || operation?.assigned_to || options.staffDisplay || "",
    location: operation?.location || job?.site_address || "",
    dependencies: operation?.dependencies || operation?.dependency_task_ids || [],
    requiredSkills: operation?.required_skills || [],
    preferredCrewId: operation?.preferred_crew_id,
    crewAssignmentLocked: operation?.crew_assignment_locked,
    durationManuallyOverridden: operation?.duration_manually_overridden,
    estimatorAssumptions: operation?.estimator_assumptions || {},
    manuallyLocked: operation?.manually_locked,
    scheduleWarnings: operation?.schedule_warnings || [],
    laneId: options.laneMode === "staff"
      ? (String(operation?.lane_id || "").trim() || UNASSIGNED_INSTALL_LANE_ID)
      : options.laneMode === "crew"
        ? (String(operation?.lane_id || "").trim() || (assignedCrewId ? `install-crew-${assignedCrewId}` : UNASSIGNED_INSTALL_LANE_ID))
        : INSTALL_TIMELINE_LANE_ID,
    title: operation?.title || operation?.task_name || job?.title,
  });
}

function buildJobInstallItem(job, options = {}) {
  const { startDate, endDate } = resolveInstallRange(job?.install_date, job?.install_end_date || job?.install_date);
  const plannerStatus = String(options.status || (options.isBacklog ? "pending" : "scheduled")).trim() || "scheduled";

  return buildBaseItem(job, {
    id: `${options.isBacklog ? "install-job-backlog" : "install-job"}-${String(job?.id || "").trim()}`,
    sourceType: options.sourceType || "job",
    recordId: String(job?.id || ""),
    installLabel: DEFAULT_INSTALL_LABEL,
    installStatusLabel: options.installStatusLabel || normaliseStatusLabel(job?.status),
    detailLabel: buildSiteLabel(job),
    startDate,
    endDate,
    status: plannerStatus,
    canResize: Boolean(startDate) && !options.isBacklog,
    isBacklog: Boolean(options.isBacklog),
    source: job,
    laneId: options.laneMode === "staff" ? UNASSIGNED_INSTALL_LANE_ID : INSTALL_TIMELINE_LANE_ID,
    location: job?.site_address || "",
  });
}

export function createInstallPlannerLane() {
  return createUnifiedLane();
}

export function emptyInstallForm() {
  return {
    job_id: "",
    install_label: "",
    title: "",
    description: "",
    install_type: "install",
    duration_hours: "10.5",
    priority: "high",
    deadline: "",
    earliest_start: "",
    latest_finish: "",
    assigned_staff_id: "__unassigned",
    assigned_crew_id: "__unassigned",
    required_crew_size: "1",
    required_skills_text: "",
    preferred_crew_id: "__unassigned",
    crew_assignment_locked: false,
    lane_id: "",
    location: "",
    dependencies_text: "",
    manually_locked: false,
    status: "scheduled",
    start_date: "",
    end_date: "",
    notes: "",
    estimated_duration_hours_original: "",
    estimated_duration_days: "",
    estimated_duration_confidence: "",
    suggested_crew_size: "1",
  };
}

export function sanitizeInstallForm(form = {}) {
  const { startDate, endDate } = resolveInstallRange(form.start_date, form.end_date);
  const dependencies = String(form.dependencies_text || "")
    .split(/[|,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const assignedStaffId = String(form.assigned_staff_id || "").trim();

  return {
    job_id: String(form.job_id || "").trim(),
    install_label: String(form.install_label || "").trim(),
    title: String(form.title || "").trim(),
    description: String(form.description || "").trim(),
    install_type: normaliseInstallType(form.install_type || "install"),
    duration_hours: Math.max(0.25, parseNumeric(form.duration_hours, getInstallTypeConfig(form.install_type).defaultDuration)),
    priority: String(form.priority || "medium").trim() || "medium",
    deadline: normaliseDateString(form.deadline),
    earliest_start: normaliseDateString(form.earliest_start),
    latest_finish: normaliseDateString(form.latest_finish),
    dependencies,
    assigned_staff_ids: assignedStaffId && assignedStaffId !== "__unassigned" ? [assignedStaffId] : [],
    assigned_crew_id: String(form.assigned_crew_id || "").trim() === "__unassigned" ? "" : String(form.assigned_crew_id || "").trim(),
    required_crew_size: Math.max(1, parseNumeric(form.required_crew_size, 1)),
    required_skills: String(form.required_skills_text || "")
      .split(/[|,;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    preferred_crew_id: String(form.preferred_crew_id || "").trim() === "__unassigned" ? "" : String(form.preferred_crew_id || "").trim(),
    crew_assignment_locked: Boolean(form.crew_assignment_locked),
    lane_id: String(form.lane_id || "").trim(),
    location: String(form.location || "").trim(),
    manually_locked: Boolean(form.manually_locked),
    status: String(form.status || "scheduled").trim() || "scheduled",
    start_date: startDate,
    end_date: endDate,
    notes: String(form.notes || "").trim(),
  };
}

function buildInstallBacklogItem(job, operations, summary, options = {}) {
  const openInstallOperation = operations.find((operation) => !String(operation.start_date || "").trim()) || null;
  if (openInstallOperation) {
    return buildOperationInstallItem(job, openInstallOperation, {
      laneMode: options.laneMode,
      staffDisplay: "",
      backlog: true,
    });
  }

  return buildJobInstallItem(job, {
    sourceType: "job",
    installStatusLabel: summary?.health?.label === "Needs scheduling" ? "Needs scheduling" : "Ready to plan",
    isBacklog: true,
    laneMode: options.laneMode,
  });
}

export function buildInstallPlannerLanes(lanes = [], laneMode = "staff") {
  return buildAvailableLanes(lanes, laneMode);
}

export function buildInstallationTimelineState(jobs = [], operations = [], filter = "all", options = {}) {
  const safeJobs = Array.isArray(jobs) ? jobs.filter((job) => isActiveJob(job)) : [];
  const installOperations = Array.isArray(operations)
    ? operations.filter((operation) => isInstallOperation(operation) && String(operation.job_id || "").trim())
    : [];
  const operationsByJobId = installOperations.reduce((map, operation) => {
    const jobId = String(operation.job_id || "").trim();
    if (!map.has(jobId)) {
      map.set(jobId, []);
    }
    map.get(jobId).push(operation);
    return map;
  }, new Map());

  const laneMode = options.laneMode === "staff"
    ? "staff"
    : options.laneMode === "crew"
      ? "crew"
      : "unified";
  const availableLanes = buildAvailableLanes(options.lanes, laneMode);
  const staff = Array.isArray(options.staff) ? options.staff : [];

  const scheduledItems = [];
  const unscheduledItems = [];

  safeJobs.forEach((job) => {
    const jobOperations = operationsByJobId.get(String(job.id || "")) || [];
    const scheduledInstallOperations = jobOperations.filter((operation) => String(operation.start_date || "").trim());
    const summary = getJobOperationalSummary(job, installOperations);

    if (scheduledInstallOperations.length > 0) {
      scheduledInstallOperations.forEach((operation) => {
        scheduledItems.push(buildOperationInstallItem(job, operation, {
          laneMode,
          staffDisplay: buildAssignedStaffDisplay(operation?.assigned_staff_ids || [], staff, operation?.assigned_to || ""),
        }));
      });
      return;
    }

    if (String(job.install_date || "").trim()) {
      scheduledItems.push(buildJobInstallItem(job, { laneMode }));
      return;
    }

    const normalizedStatus = String(job.status || "").trim().toLowerCase();
    if (jobOperations.length > 0 || READY_FOR_INSTALL_JOB_STATUSES.has(normalizedStatus)) {
      unscheduledItems.push(buildInstallBacklogItem(job, jobOperations, summary, { laneMode }));
    }
  });

  const matchesExtraFilters = (item) => {
    const staffFilter = String(options.staffFilter || "all");
    const installTypeFilter = String(options.installTypeFilter || "all");
    const selectedLaneId = String(options.selectedLaneId || "all");

    if (staffFilter !== "all") {
      const hasStaff = item.assignedStaffIds?.includes?.(staffFilter) || item.source?.assigned_staff_ids?.includes?.(staffFilter);
      if (!hasStaff) {
        return false;
      }
    }

    if (installTypeFilter !== "all" && String(item.installType || "install") !== installTypeFilter) {
      return false;
    }

    if (selectedLaneId !== "all" && String(item.laneId || "") !== selectedLaneId) {
      return false;
    }

    return true;
  };

  const filteredScheduledItems = scheduledItems.filter((item) => {
    if (!matchesExtraFilters(item)) {
      return false;
    }
    if (filter === "all") {
      return true;
    }
    if (filter === "scheduled") {
      return Boolean(item.startDate);
    }
    if (filter === "multi_day") {
      return item.startDate && item.endDate && item.endDate > item.startDate;
    }
    if (filter === "job_date_only") {
      return item.sourceType === "job";
    }
    return true;
  });

  const filteredUnscheduledItems = unscheduledItems.filter((item) => {
    if (!matchesExtraFilters(item)) {
      return false;
    }
    if (filter === "all") {
      return true;
    }
    return filter === "needs_planning";
  });

  const visibleLanes = availableLanes.filter((lane) => {
    if (laneMode === "unified") {
      return true;
    }
    if (String(options.selectedLaneId || "all") !== "all") {
      return String(options.selectedLaneId) === String(lane.id);
    }
    return filteredScheduledItems.some((item) => String(item.laneId || "") === String(lane.id))
      || String(lane.id) === UNASSIGNED_INSTALL_LANE_ID;
  });

  return {
    lanes: visibleLanes.length > 0 ? visibleLanes : buildAvailableLanes([], laneMode),
    scheduledItems: filteredScheduledItems
      .slice()
      .sort((left, right) =>
        compareDateKeys(left.startDate, right.startDate)
        || compareDateKeys(left.laneId, right.laneId)
        || String(left.jobNumber || "").localeCompare(String(right.jobNumber || ""))
      ),
    unscheduledItems: filteredUnscheduledItems
      .slice()
      .sort((left, right) => String(left.jobNumber || "").localeCompare(String(right.jobNumber || ""))),
    outsideLaneItems: [],
  };
}

function getItemDate(item, key) {
  return getDateSafely(key === "start" ? item?.startDate : item?.endDate || item?.startDate);
}

export function buildInstallMoveRange(item, targetDate, laneId = "") {
  const nextStart = normaliseDateString(targetDate);
  if (!nextStart) {
    return null;
  }

  const currentStart = getItemDate(item, "start");
  const currentEnd = getItemDate(item, "end") || currentStart;
  const spanDays = currentStart && currentEnd ? Math.max(0, differenceInCalendarDays(currentEnd, currentStart)) : 0;
  const safeEnd = format(addDays(parseISO(`${nextStart}T00:00:00`), spanDays), "yyyy-MM-dd");

  return {
    start_date: nextStart,
    end_date: safeEnd,
    lane_id: laneId || item?.laneId || "",
    manually_locked: true,
  };
}

export function buildInstallResizeRange(item, edge, targetDate, laneId = "") {
  const nextDate = normaliseDateString(targetDate);
  const currentStart = normaliseDateString(item?.startDate);
  const currentEnd = normaliseDateString(item?.endDate || item?.startDate);

  if (!nextDate || !currentStart) {
    return {
      start_date: currentStart,
      end_date: currentEnd || currentStart,
      lane_id: laneId || item?.laneId || "",
      manually_locked: true,
    };
  }

  if (edge === "start") {
    const safeStart = currentEnd && nextDate > currentEnd ? currentEnd : nextDate;
    return {
      start_date: safeStart,
      end_date: currentEnd || safeStart,
      lane_id: laneId || item?.laneId || "",
      manually_locked: true,
    };
  }

  const safeEnd = currentStart && nextDate < currentStart ? currentStart : nextDate;
  return {
    start_date: currentStart,
    end_date: safeEnd,
    lane_id: laneId || item?.laneId || "",
    manually_locked: true,
  };
}

export function buildInstallLoadModel(items = [], days = []) {
  const safeDays = days
    .map((day) => (day instanceof Date ? startOfDay(day) : getDateSafely(day)))
    .filter(Boolean);

  const dayEntries = safeDays.map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const matchingItems = items.filter((item) => {
      const itemStart = getItemDate(item, "start");
      const itemEnd = getItemDate(item, "end") || itemStart;
      if (!itemStart || !itemEnd) {
        return false;
      }
      return !isBefore(day, itemStart) && !isAfter(day, itemEnd);
    });

    return {
      dateKey,
      date: day,
      installCount: matchingItems.length,
      jobRefs: matchingItems.map((item) => item.jobNumber || item.jobTitle).slice(0, 3),
    };
  });

  const peakInstallCount = Math.max(0, ...dayEntries.map((entry) => entry.installCount));
  const enrichedDays = dayEntries.map((entry) => ({
    ...entry,
    relativeLoadPercent: peakInstallCount > 0 ? Math.round((entry.installCount / peakInstallCount) * 100) : 0,
    hasOverlap: entry.installCount > 1,
  }));
  const activeDays = enrichedDays.filter((entry) => entry.installCount > 0).length;
  const busyDays = enrichedDays.filter((entry) => entry.installCount > 1).length;
  const totalPlacements = enrichedDays.reduce((sum, entry) => sum + entry.installCount, 0);
  const busiestDay = enrichedDays
    .slice()
    .sort((left, right) => right.installCount - left.installCount || compareDateKeys(left.dateKey, right.dateKey))[0] || null;

  return {
    days: enrichedDays,
    byDateKey: new Map(enrichedDays.map((entry) => [entry.dateKey, entry])),
    peakInstallCount,
    activeDays,
    busyDays,
    totalPlacements,
    busiestDay,
  };
}

export function buildInstallDateSyncValue(jobId, operations = []) {
  const scheduledStartDates = (operations || [])
    .filter((operation) => isInstallOperation(operation) && String(operation.job_id || "") === String(jobId || "").trim())
    .map((operation) => normaliseDateString(operation.start_date))
    .filter(Boolean)
    .sort(compareDateKeys);

  return scheduledStartDates[0] || "";
}

export function mergeInstallPlannerMutationResult(state = {}, mutationResult = {}) {
  const nextJobs = Array.isArray(mutationResult?.jobs) ? mutationResult.jobs : state.jobs || [];
  const nextOperations = Array.isArray(mutationResult?.operations)
    ? mutationResult.operations.filter((operation) => isInstallOperation(operation))
    : state.operations || [];
  const nextStaff = Array.isArray(mutationResult?.staff) ? mutationResult.staff : state.staff || [];
  const nextCrews = Array.isArray(mutationResult?.crews) ? mutationResult.crews : state.crews || [];
  const nextLanes = Array.isArray(mutationResult?.lanes) ? mutationResult.lanes : state.lanes || [];
  const nextEstimatorSettings = mutationResult?.estimator_settings || state.estimatorSettings || null;
  const nextJobEstimates = mutationResult?.job_estimates || state.jobEstimates || {};

  return {
    jobs: nextJobs,
    operations: nextOperations,
    staff: nextStaff,
    crews: nextCrews,
    lanes: nextLanes,
    estimatorSettings: nextEstimatorSettings,
    jobEstimates: nextJobEstimates,
  };
}
