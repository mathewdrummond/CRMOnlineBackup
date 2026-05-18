import { normalizeDateOnly } from "./dateUtils";
import { EntityRecord } from "./types";

const STANDARD_DAY_HOURS = 10.5;
const FRIDAY_STANDARD_HOURS = 5;
const FRIDAY_OVERTIME_HOURS = 5.5;
const SATURDAY_OVERTIME_HOURS = 5;
const WORKDAY_START_HOUR = 7;
export const AUTO_UNASSIGNED_LANE_ID = "install-unassigned";

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const DEFAULT_TASK_CONFIG: Record<string, { durationHours: number; priority: string; color: string }> = {
  install: { durationHours: 10.5, priority: "high", color: "emerald" },
  measure: { durationHours: 2, priority: "medium", color: "blue" },
  delivery: { durationHours: 4, priority: "medium", color: "amber" },
  service: { durationHours: 3, priority: "high", color: "orange" },
  admin: { durationHours: 1, priority: "low", color: "slate" },
  prep: { durationHours: 2, priority: "medium", color: "teal" },
};

export type CrewRecord = {
  id: string;
  name: string;
  is_active: boolean;
  assigned_staff_ids: string[];
  assigned_staff_names: string[];
  default_daily_capacity: number;
  skills: string[];
  notes: string;
  color: string;
};

export type InstallPlannerLaneRecord = {
  id: string;
  label: string;
  color: string;
  lane_type: string;
  staff_id: string;
  staff_name: string;
  crew_id?: string;
  crew_name?: string;
  member_staff_ids?: string[];
  skills?: string[];
  crew_size: number;
  capacity_hours_per_day: number;
  sort_order: number;
  is_active: boolean;
  is_virtual?: boolean;
};

type TaskSchedulePatch = {
  start_date: string;
  end_date: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  scheduled_day_allocations: Array<{ date: string; hours: number }>;
  lane_id: string;
  duration_hours: number;
  priority: string;
  install_type: string;
  manually_locked: boolean;
  schedule_manual_override: boolean;
  schedule_warnings: string[];
  assigned_crew_name?: string;
};

type SchedulerTask = {
  operation: EntityRecord;
  id: string;
  laneId: string;
  durationHours: number;
  priority: string;
  installType: string;
  deadline: string;
  earliestStart: string;
  latestFinish: string;
  dependencies: string[];
  manuallyLocked: boolean;
  assignedStaffIds: string[];
  assignedCrewId: string;
  assignedCrewName: string;
  requiredCrewSize: number;
  requiredSkills: string[];
  preferredCrewId: string;
  crewAssignmentLocked: boolean;
  allowFridayOvertime: boolean;
  allowSaturdayOvertime: boolean;
};

type SchedulerOptions = {
  crews?: CrewRecord[];
};

type CrewBookingMap = Map<string, Map<string, number>>;

function toText(value: unknown) {
  return String(value || "").trim();
}

function normalizeInstallType(value: unknown) {
  const normalized = toText(value).toLowerCase();
  if (normalized === "service call") return "service";
  if (normalized === "admin / prep") return "admin";
  return normalized || "install";
}

function normalizePriority(value: unknown, installType = "install") {
  const normalized = toText(value).toLowerCase();
  if (normalized && Object.prototype.hasOwnProperty.call(PRIORITY_WEIGHT, normalized)) {
    return normalized;
  }
  return DEFAULT_TASK_CONFIG[installType]?.priority || "medium";
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function createDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function addDays(dateKey: string, days: number) {
  const next = createDate(dateKey);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function compareDate(left: string, right: string) {
  return String(left || "").localeCompare(String(right || ""));
}

function dayOfWeek(dateKey: string) {
  return createDate(dateKey).getDay();
}

function toDateTime(dateKey: string, hoursFromStart = 0) {
  const base = createDate(dateKey);
  const wholeHours = Math.floor(hoursFromStart);
  const minutes = Math.round((hoursFromStart - wholeHours) * 60);
  base.setHours(WORKDAY_START_HOUR + wholeHours, minutes, 0, 0);
  return base.toISOString();
}

function getTaskConfig(installType: string) {
  return DEFAULT_TASK_CONFIG[installType] || DEFAULT_TASK_CONFIG.install;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }

  const raw = toText(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toText(item)).filter(Boolean);
    }
  } catch {
    // Keep plain text compatibility.
  }

  return raw.split(/[|,;]+/).map((item) => item.trim()).filter(Boolean);
}

function getAssignedStaffIds(operation: EntityRecord) {
  const parsed = parseStringArray(operation.assigned_staff_ids);
  if (parsed.length > 0) {
    return parsed;
  }
  return parseStringArray(operation.assigned_to);
}

function normaliseSkills(value: unknown) {
  return parseStringArray(value).map((item) => item.toLowerCase());
}

function laneMatchesStaff(lane: InstallPlannerLaneRecord, staffId: string) {
  return toText(lane.staff_id) === staffId;
}

function laneMatchesCrew(lane: InstallPlannerLaneRecord, crewId: string) {
  return toText(lane.crew_id) === crewId;
}

function buildCrewRecord(record: EntityRecord): CrewRecord {
  return {
    id: toText(record.id),
    name: toText(record.name),
    is_active: record.is_active !== false,
    assigned_staff_ids: parseStringArray(record.assigned_staff_ids),
    assigned_staff_names: parseStringArray(record.assigned_staff_names),
    default_daily_capacity: Math.max(1, asNumber(record.default_daily_capacity || STANDARD_DAY_HOURS)),
    skills: normaliseSkills(record.skills),
    notes: toText(record.notes),
    color: toText(record.color || "emerald") || "emerald",
  };
}

function getLaneDailyCapacity(lane: InstallPlannerLaneRecord, task: SchedulerTask, dayKey: string) {
  const day = dayOfWeek(dayKey);
  if (day >= 1 && day <= 4) {
    return Number(lane.capacity_hours_per_day || STANDARD_DAY_HOURS);
  }
  if (day === 5) {
    const laneHours = Number(lane.capacity_hours_per_day || STANDARD_DAY_HOURS);
    const fridayHours = FRIDAY_STANDARD_HOURS + (task.allowFridayOvertime ? FRIDAY_OVERTIME_HOURS : 0);
    return Math.min(laneHours, fridayHours);
  }
  if (day === 6) {
    return task.allowSaturdayOvertime ? Math.min(Number(lane.capacity_hours_per_day || STANDARD_DAY_HOURS), SATURDAY_OVERTIME_HOURS) : 0;
  }
  return 0;
}

function getStaffDailyCapacity(task: SchedulerTask, dayKey: string) {
  const day = dayOfWeek(dayKey);
  if (day >= 1 && day <= 4) return STANDARD_DAY_HOURS;
  if (day === 5) return FRIDAY_STANDARD_HOURS + (task.allowFridayOvertime ? FRIDAY_OVERTIME_HOURS : 0);
  if (day === 6) return task.allowSaturdayOvertime ? SATURDAY_OVERTIME_HOURS : 0;
  return 0;
}

function compareTaskPriority(left: SchedulerTask, right: SchedulerTask) {
  return (PRIORITY_WEIGHT[left.priority] ?? PRIORITY_WEIGHT.medium) - (PRIORITY_WEIGHT[right.priority] ?? PRIORITY_WEIGHT.medium)
    || compareDate(left.deadline || "9999-12-31", right.deadline || "9999-12-31")
    || compareDate(left.latestFinish || "9999-12-31", right.latestFinish || "9999-12-31")
    || compareDate(left.earliestStart || "", right.earliestStart || "")
    || compareDate(toText(left.operation.created_date), toText(right.operation.created_date));
}

function buildBaseBookingMap(lanes: InstallPlannerLaneRecord[]) {
  return new Map<string, Map<string, number>>(lanes.map((lane) => [lane.id, new Map<string, number>()]));
}

function buildStaffBookingMap(staffIds: string[]) {
  return new Map<string, Map<string, number>>(staffIds.map((staffId) => [staffId, new Map<string, number>()]));
}

function addBooking(bookings: CrewBookingMap, key: string, allocations: Array<{ date: string; hours: number }>) {
  if (!key) return;
  if (!bookings.has(key)) {
    bookings.set(key, new Map<string, number>());
  }
  const byDate = bookings.get(key)!;
  allocations.forEach((allocation) => {
    byDate.set(allocation.date, roundHours((byDate.get(allocation.date) || 0) + allocation.hours));
  });
}

function buildWarnings(task: SchedulerTask, lane: InstallPlannerLaneRecord | null) {
  const warnings: string[] = [];
  if (!task.assignedCrewId && task.installType !== "admin" && task.installType !== "prep") {
    warnings.push("No crew assigned.");
  }
  if (lane?.crew_id && task.requiredCrewSize > Math.max(1, (lane.member_staff_ids || []).length || lane.crew_size || 1)) {
    warnings.push("Task requires more people than the assigned crew contains.");
  }
  if (lane?.crew_id && task.requiredSkills.length > 0) {
    const laneSkills = new Set((lane.skills || []).map((skill) => skill.toLowerCase()));
    if (task.requiredSkills.some((skill) => !laneSkills.has(skill.toLowerCase()))) {
      warnings.push("Assigned crew does not cover all required skills.");
    }
  }
  if (lane?.crew_id && (lane.member_staff_ids || []).length === 0) {
    warnings.push("Assigned crew has no active staff members.");
  }
  return warnings;
}

function buildTask(
  operation: EntityRecord,
  lanes: InstallPlannerLaneRecord[],
  crewsById: Map<string, CrewRecord>
) {
  const installType = normalizeInstallType(operation.install_type || operation.operation || operation.workflow_phase);
  const priority = normalizePriority(operation.priority, installType);
  const config = getTaskConfig(installType);
  const explicitStaffIds = getAssignedStaffIds(operation);
  const assignedCrewId = toText(operation.assigned_crew_id || operation.preferred_crew_id);
  const crew = crewsById.get(assignedCrewId) || null;
  const effectiveStaffIds = explicitStaffIds.length > 0
    ? explicitStaffIds
    : crew?.assigned_staff_ids || [];

  const explicitLaneId = toText(operation.lane_id);
  const matchingLane = lanes.find((lane) => lane.id === explicitLaneId)
    || (assignedCrewId ? lanes.find((lane) => laneMatchesCrew(lane, assignedCrewId)) : null)
    || (effectiveStaffIds[0] ? lanes.find((lane) => laneMatchesStaff(lane, effectiveStaffIds[0])) : null)
    || lanes.find((lane) => lane.id === AUTO_UNASSIGNED_LANE_ID)
    || lanes[0];

  const durationHours = Math.max(0.25, asNumber(operation.duration_hours || operation.estimated_hours || config.durationHours));

  return {
    operation,
    id: toText(operation.id),
    laneId: matchingLane?.id || AUTO_UNASSIGNED_LANE_ID,
    durationHours,
    priority,
    installType,
    deadline: normalizeDateOnly(operation.deadline),
    earliestStart: normalizeDateOnly(operation.earliest_start || operation.start_date),
    latestFinish: normalizeDateOnly(operation.latest_finish),
    dependencies: parseStringArray(operation.dependencies).length > 0
      ? parseStringArray(operation.dependencies)
      : parseStringArray(operation.dependency_task_ids),
    manuallyLocked: Boolean(operation.manually_locked),
    assignedStaffIds: effectiveStaffIds,
    assignedCrewId,
    assignedCrewName: toText(operation.assigned_crew_name || crew?.name),
    requiredCrewSize: Math.max(1, asNumber(operation.required_crew_size || operation.suggested_crew_size || 1)),
    requiredSkills: normaliseSkills(operation.required_skills),
    preferredCrewId: toText(operation.preferred_crew_id),
    crewAssignmentLocked: Boolean(operation.crew_assignment_locked),
    allowFridayOvertime: Boolean(operation.allow_friday_overtime),
    allowSaturdayOvertime: Boolean(operation.allow_saturday_overtime),
  } satisfies SchedulerTask;
}

function shouldHoldOperationInBacklog(task: SchedulerTask) {
  return Boolean(task.operation.schedule_manual_override) && !normalizeDateOnly(task.operation.start_date);
}

function deriveLockedAllocations(task: SchedulerTask, lane: InstallPlannerLaneRecord | null) {
  const startDate = normalizeDateOnly(task.operation.start_date);
  const endDate = normalizeDateOnly(task.operation.end_date || task.operation.start_date) || startDate;
  if (!startDate) {
    return [];
  }

  let remaining = task.durationHours;
  const allocations: Array<{ date: string; hours: number }> = [];
  let cursor = startDate;
  let loopGuard = 0;
  while (compareDate(cursor, endDate) <= 0 && loopGuard < 120) {
    const dayHours = getLaneDailyCapacity(lane || {
      id: AUTO_UNASSIGNED_LANE_ID,
      label: "Unassigned",
      color: "slate",
      lane_type: "install_queue",
      staff_id: "",
      staff_name: "",
      crew_size: 1,
      capacity_hours_per_day: STANDARD_DAY_HOURS,
      sort_order: 0,
      is_active: true,
    }, task, cursor);
    if (dayHours > 0) {
      const hours = roundHours(Math.min(dayHours, remaining > 0 ? remaining : dayHours));
      allocations.push({ date: cursor, hours });
      remaining = roundHours(Math.max(0, remaining - hours));
    }
    cursor = addDays(cursor, 1);
    loopGuard += 1;
  }

  if (allocations.length === 0) {
    allocations.push({ date: startDate, hours: task.durationHours });
  }
  return allocations;
}

function nextWorkingDate(dateKey: string, task: SchedulerTask, lane: InstallPlannerLaneRecord | null) {
  let cursor = normalizeDateOnly(dateKey) || normalizeDateOnly(new Date());
  for (let index = 0; index < 30; index += 1) {
    if (getLaneDailyCapacity(lane || {
      id: AUTO_UNASSIGNED_LANE_ID,
      label: "Unassigned",
      color: "slate",
      lane_type: "install_queue",
      staff_id: "",
      staff_name: "",
      crew_size: 1,
      capacity_hours_per_day: STANDARD_DAY_HOURS,
      sort_order: 0,
      is_active: true,
    }, task, cursor) > 0) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function computeStaffAvailability(
  task: SchedulerTask,
  dateKey: string,
  staffBookings: CrewBookingMap
) {
  if (task.assignedStaffIds.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return task.assignedStaffIds.reduce((lowest, staffId) => {
    const booked = staffBookings.get(staffId)?.get(dateKey) || 0;
    const available = roundHours(Math.max(0, getStaffDailyCapacity(task, dateKey) - booked));
    return Math.min(lowest, available);
  }, Number.POSITIVE_INFINITY);
}

function planTaskWindow(
  task: SchedulerTask,
  lane: InstallPlannerLaneRecord | null,
  laneBookings: CrewBookingMap,
  staffBookings: CrewBookingMap,
  dependencyEndDate: string
) {
  const resourceLane = lane || {
    id: AUTO_UNASSIGNED_LANE_ID,
    label: "Unassigned installs",
    color: "slate",
    lane_type: "install_queue",
    staff_id: "",
    staff_name: "",
    crew_size: 1,
    capacity_hours_per_day: STANDARD_DAY_HOURS,
    sort_order: 0,
    is_active: true,
  };
  const laneId = resourceLane.id;
  const bookedByDate = laneBookings.get(laneId) || new Map<string, number>();
  const warnings = buildWarnings(task, lane);

  let startCursor = normalizeDateOnly(task.earliestStart) || normalizeDateOnly(task.operation.start_date) || normalizeDateOnly(new Date());
  if (dependencyEndDate) {
    const dependencyStart = nextWorkingDate(addDays(dependencyEndDate, 1), task, lane);
    if (!startCursor || compareDate(dependencyStart, startCursor) > 0) {
      startCursor = dependencyStart;
    }
  }
  startCursor = nextWorkingDate(startCursor, task, lane);

  const latestFinish = normalizeDateOnly(task.latestFinish || task.deadline);
  let bestPlan: { allocations: Array<{ date: string; hours: number }>; warnings: string[] } | null = null;

  for (let offset = 0; offset < 365; offset += 1) {
    const candidateStart = nextWorkingDate(addDays(startCursor, offset), task, lane);
    let remaining = task.durationHours;
    let cursor = candidateStart;
    const candidateAllocations: Array<{ date: string; hours: number }> = [];
    let invalid = false;

    for (let inner = 0; inner < 180 && remaining > 0.001; inner += 1) {
      const dayCapacity = getLaneDailyCapacity(resourceLane, task, cursor);
      if (dayCapacity <= 0) {
        cursor = addDays(cursor, 1);
        continue;
      }

      if (latestFinish && compareDate(cursor, latestFinish) > 0) {
        warnings.push("Scheduled beyond preferred finish window.");
      }

      const crewBooked = bookedByDate.get(cursor) || 0;
      const crewAvailable = roundHours(Math.max(0, dayCapacity - crewBooked));
      const staffAvailable = computeStaffAvailability(task, cursor, staffBookings);
      const available = roundHours(Math.min(crewAvailable, staffAvailable));

      if (available <= 0.001) {
        invalid = true;
        break;
      }

      const bookedHours = roundHours(Math.min(available, remaining));
      candidateAllocations.push({ date: cursor, hours: bookedHours });
      remaining = roundHours(Math.max(0, remaining - bookedHours));
      cursor = addDays(cursor, 1);
    }

    if (!invalid && remaining <= 0.001) {
      bestPlan = {
        allocations: candidateAllocations,
        warnings: [...new Set(warnings)],
      };
      break;
    }
  }

  if (!bestPlan) {
    bestPlan = {
      allocations: [{ date: startCursor, hours: task.durationHours }],
      warnings: [...new Set([...warnings, "Insufficient availability within the preferred window."])],
    };
  }

  const first = bestPlan.allocations[0];
  const last = bestPlan.allocations[bestPlan.allocations.length - 1];

  return {
    start_date: first.date,
    end_date: last.date,
    scheduled_start_at: toDateTime(first.date, 0),
    scheduled_end_at: toDateTime(last.date, last.hours),
    scheduled_day_allocations: bestPlan.allocations,
    lane_id: laneId,
    duration_hours: task.durationHours,
    priority: task.priority,
    install_type: task.installType,
    manually_locked: task.manuallyLocked,
    schedule_manual_override: task.manuallyLocked,
    schedule_warnings: bestPlan.warnings,
    assigned_crew_name: task.assignedCrewName,
  } satisfies TaskSchedulePatch;
}

function shallowEqualArray(left: unknown, right: unknown) {
  const safeLeft = Array.isArray(left) ? left : [];
  const safeRight = Array.isArray(right) ? right : [];
  return JSON.stringify(safeLeft) === JSON.stringify(safeRight);
}

function hasPatchChanged(operation: EntityRecord, patch: TaskSchedulePatch) {
  return normalizeDateOnly(operation.start_date) !== patch.start_date
    || normalizeDateOnly(operation.end_date) !== patch.end_date
    || toText(operation.scheduled_start_at) !== patch.scheduled_start_at
    || toText(operation.scheduled_end_at) !== patch.scheduled_end_at
    || toText(operation.lane_id) !== patch.lane_id
    || roundHours(asNumber(operation.duration_hours)) !== roundHours(patch.duration_hours)
    || normalizePriority(operation.priority, normalizeInstallType(operation.install_type || operation.operation)) !== patch.priority
    || normalizeInstallType(operation.install_type || operation.operation) !== patch.install_type
    || Boolean(operation.manually_locked) !== Boolean(patch.manually_locked)
    || Boolean(operation.schedule_manual_override) !== Boolean(patch.schedule_manual_override)
    || !shallowEqualArray(operation.scheduled_day_allocations, patch.scheduled_day_allocations)
    || !shallowEqualArray(operation.schedule_warnings, patch.schedule_warnings)
    || toText(operation.assigned_crew_name) !== toText(patch.assigned_crew_name);
}

export function buildInstallPlannerLanes(
  staffRecords: EntityRecord[] = [],
  scheduleLanes: EntityRecord[] = [],
  crewRecords: EntityRecord[] = [],
  mode: "staff" | "crew" | "hybrid" = "staff"
): InstallPlannerLaneRecord[] {
  const activeStaff = (Array.isArray(staffRecords) ? staffRecords : [])
    .filter((record) => toText(record.status || "active").toLowerCase() !== "inactive")
    .sort((left, right) => toText(left.name).localeCompare(toText(right.name)));
  const activeCrews = (Array.isArray(crewRecords) ? crewRecords : [])
    .map(buildCrewRecord)
    .filter((crew) => crew.is_active)
    .sort((left, right) => left.name.localeCompare(right.name));
  const existingLanes = Array.isArray(scheduleLanes) ? scheduleLanes.filter((lane) => lane.is_active !== false) : [];

  const staffLanes: InstallPlannerLaneRecord[] = activeStaff.map((staff, index) => {
    const matchingLane = existingLanes.find((lane) => toText(lane.staff_id) === toText(staff.id))
      || existingLanes.find((lane) => toText(lane.staff_name).toLowerCase() === toText(staff.name).toLowerCase())
      || null;
    return {
      id: toText(matchingLane?.id) || `install-staff-${toText(staff.id)}`,
      label: toText(matchingLane?.label) || toText(staff.name) || `Installer ${index + 1}`,
      color: toText(matchingLane?.color) || "emerald",
      lane_type: "install_staff",
      staff_id: toText(staff.id),
      staff_name: toText(staff.name),
      crew_size: Math.max(1, asNumber(matchingLane?.crew_size || 1)),
      capacity_hours_per_day: Math.max(1, asNumber(matchingLane?.capacity_hours_per_day || STANDARD_DAY_HOURS)),
      sort_order: asNumber(matchingLane?.sort_order || index),
      is_active: true,
    };
  });

  const crewLanes: InstallPlannerLaneRecord[] = activeCrews.map((crew, index) => {
    const matchingLane = existingLanes.find((lane) => toText(lane.crew_id) === crew.id)
      || existingLanes.find((lane) => toText(lane.label).toLowerCase() === crew.name.toLowerCase())
      || null;
    return {
      id: toText(matchingLane?.id) || `install-crew-${crew.id}`,
      label: toText(matchingLane?.label) || crew.name,
      color: toText(matchingLane?.color) || crew.color || "emerald",
      lane_type: "install_crew",
      staff_id: "",
      staff_name: "",
      crew_id: crew.id,
      crew_name: crew.name,
      member_staff_ids: crew.assigned_staff_ids,
      skills: crew.skills,
      crew_size: Math.max(1, crew.assigned_staff_ids.length || asNumber(matchingLane?.crew_size || 1)),
      capacity_hours_per_day: Math.max(1, asNumber(matchingLane?.capacity_hours_per_day || crew.default_daily_capacity || STANDARD_DAY_HOURS)),
      sort_order: asNumber(matchingLane?.sort_order || index),
      is_active: true,
    };
  });

  const lanes = mode === "crew"
    ? crewLanes
    : mode === "hybrid"
      ? [...crewLanes, ...staffLanes]
      : staffLanes;

  lanes.push({
    id: AUTO_UNASSIGNED_LANE_ID,
    label: "Unassigned installs",
    color: "slate",
    lane_type: "install_queue",
    staff_id: "",
    staff_name: "",
    crew_size: 1,
    capacity_hours_per_day: STANDARD_DAY_HOURS,
    sort_order: lanes.length,
    is_active: true,
    is_virtual: true,
  });

  return lanes.sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label));
}

export function autoScheduleInstallOperations(
  operations: EntityRecord[] = [],
  lanes: InstallPlannerLaneRecord[] = [],
  options: SchedulerOptions = {}
) {
  const crews = (options.crews || []).map((crew) => ({
    ...crew,
    assigned_staff_ids: crew.assigned_staff_ids || [],
    assigned_staff_names: crew.assigned_staff_names || [],
    skills: crew.skills || [],
  }));
  const crewsById = new Map(crews.map((crew) => [crew.id, crew]));
  const tasks = operations.map((operation) => buildTask(operation, lanes, crewsById));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const laneBookings = buildBaseBookingMap(lanes);
  const uniqueStaffIds = [...new Set(tasks.flatMap((task) => task.assignedStaffIds).filter(Boolean))];
  const staffBookings = buildStaffBookingMap(uniqueStaffIds);
  const dependencyEndDates = new Map<string, string>();
  const patchesById = new Map<string, TaskSchedulePatch>();

  const lockedTasks = tasks
    .filter((task) => task.manuallyLocked && normalizeDateOnly(task.operation.start_date))
    .sort(compareTaskPriority);

  lockedTasks.forEach((task) => {
    const lane = lanes.find((item) => item.id === task.laneId) || null;
    const allocations = deriveLockedAllocations(task, lane);
    addBooking(laneBookings, task.laneId, allocations);
    task.assignedStaffIds.forEach((staffId) => addBooking(staffBookings, staffId, allocations));
    const startDate = allocations[0]?.date || normalizeDateOnly(task.operation.start_date);
    const endDate = allocations[allocations.length - 1]?.date || normalizeDateOnly(task.operation.end_date || task.operation.start_date);
    dependencyEndDates.set(task.id, endDate);
    patchesById.set(task.id, {
      start_date: startDate,
      end_date: endDate,
      scheduled_start_at: toDateTime(startDate, 0),
      scheduled_end_at: toDateTime(endDate, allocations[allocations.length - 1]?.hours || task.durationHours),
      scheduled_day_allocations: allocations,
      lane_id: task.laneId,
      duration_hours: task.durationHours,
      priority: task.priority,
      install_type: task.installType,
      manually_locked: true,
      schedule_manual_override: true,
      schedule_warnings: buildWarnings(task, lane),
      assigned_crew_name: task.assignedCrewName,
    });
  });

  const pending = tasks
    .filter((task) => !(task.manuallyLocked && normalizeDateOnly(task.operation.start_date)))
    .filter((task) => !shouldHoldOperationInBacklog(task))
    .sort(compareTaskPriority);
  const scheduledUnlocked = new Set<string>();

  for (let pass = 0; pass < pending.length + 1; pass += 1) {
    let scheduledThisPass = false;
    pending.forEach((task) => {
      if (scheduledUnlocked.has(task.id)) return;

      const unresolvedDependencies = task.dependencies.filter((dependencyId) => tasksById.has(dependencyId) && !dependencyEndDates.has(dependencyId));
      if (unresolvedDependencies.length > 0 && pass < pending.length) {
        return;
      }

      const dependencyEndDate = task.dependencies
        .map((dependencyId) => dependencyEndDates.get(dependencyId) || "")
        .filter(Boolean)
        .sort(compareDate)
        .slice(-1)[0] || "";
      const lane = lanes.find((item) => item.id === task.laneId) || null;
      const patch = planTaskWindow(task, lane, laneBookings, staffBookings, dependencyEndDate);
      addBooking(laneBookings, patch.lane_id, patch.scheduled_day_allocations);
      task.assignedStaffIds.forEach((staffId) => addBooking(staffBookings, staffId, patch.scheduled_day_allocations));
      dependencyEndDates.set(task.id, patch.end_date);
      patchesById.set(task.id, patch);
      scheduledUnlocked.add(task.id);
      scheduledThisPass = true;
    });
    if (!scheduledThisPass) break;
  }

  const nextOperations = operations.map((operation) => {
    const patch = patchesById.get(toText(operation.id));
    return patch ? { ...operation, ...patch } : operation;
  });

  const changedOperations = nextOperations
    .filter((operation) => {
      const original = operations.find((item) => item.id === operation.id);
      const patch = patchesById.get(toText(operation.id));
      return Boolean(original && patch && hasPatchChanged(original, patch));
    })
    .map((operation) => ({
      id: operation.id,
      patch: patchesById.get(toText(operation.id))!,
    }));

  return {
    operations: nextOperations,
    changedOperations,
  };
}
