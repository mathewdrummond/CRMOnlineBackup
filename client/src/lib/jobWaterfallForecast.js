import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import { getStageConfig, OPERATIONS, WORKFLOW_PHASES, WORKFLOW_TASK_STATUSES } from "./helpers";
import { getOperationSchedulingOptions, getScheduleDayMeta, parseAssignedNames, snapDateToWorkingDate } from "./scheduleTimeline";

export const DEFAULT_ROLE_CAPACITY = {
  management: { label: "Management", units: 2, color: "blue" },
  joiner: { label: "Joiner", units: 2, color: "amber" },
  install: { label: "Install", units: 3, color: "emerald" },
  other: { label: "Other", units: 1, color: "slate" },
};

const PHASE_SORT_ORDER = WORKFLOW_PHASES.reduce((lookup, phase, index) => {
  lookup[phase.value] = index;
  return lookup;
}, {});

function asDate(value) {
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

function asDateKey(value) {
  const date = value instanceof Date ? startOfDay(value) : asDate(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

function todayKey(value) {
  return asDateKey(value || new Date());
}

function normaliseHours(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
}

function resolveRoleKey(operation = {}) {
  const explicitRole = String(operation.assigned_role || operation.workflow_role || "").trim().toLowerCase();
  if (explicitRole) {
    return explicitRole;
  }

  const operationType = String(operation.operation || "").trim().toLowerCase();
  if (["install", "delivery"].includes(operationType)) {
    return "install";
  }
  if (["assembly", "machining", "edging", "cnc", "finishing"].includes(operationType)) {
    return "joiner";
  }
  if (["design", "ordering"].includes(operationType)) {
    return "management";
  }
  return "other";
}

function resolveRoleConfig(roleKey, roleMappings = []) {
  const normalizedRoleKey = String(roleKey || "other").trim().toLowerCase() || "other";
  const roleMapping = roleMappings.find(
    (mapping) => String(mapping.role_key || "").trim().toLowerCase() === normalizedRoleKey
  );
  const fallback = DEFAULT_ROLE_CAPACITY[normalizedRoleKey] || DEFAULT_ROLE_CAPACITY.other;
  const mappedUnits = Array.isArray(roleMapping?.default_staff_names)
    ? roleMapping.default_staff_names.length
    : parseAssignedNames(roleMapping?.default_staff_names).length;

  return {
    roleKey: normalizedRoleKey,
    label: String(roleMapping?.label || fallback.label || normalizedRoleKey),
    color: String(roleMapping?.color || fallback.color || "slate"),
    units: Math.max(1, mappedUnits || Number(fallback.units || 1)),
  };
}

function sortOperations(operations = []) {
  const recordsById = new Map(operations.map((record) => [record.id, record]));
  const visited = new Set();
  const active = new Set();
  const ordered = [];

  function visit(record) {
    if (!record?.id || visited.has(record.id)) {
      return;
    }

    if (active.has(record.id)) {
      ordered.push(record);
      visited.add(record.id);
      return;
    }

    active.add(record.id);
    const dependencies = Array.isArray(record.dependency_task_ids)
      ? record.dependency_task_ids
      : String(record.dependency_task_ids || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    dependencies.forEach((dependencyId) => {
      const dependencyRecord = recordsById.get(dependencyId);
      if (dependencyRecord) {
        visit(dependencyRecord);
      }
    });

    active.delete(record.id);
    visited.add(record.id);
    ordered.push(record);
  }

  [...operations]
    .sort((left, right) => {
      const phaseDifference = Number(PHASE_SORT_ORDER[left.workflow_phase] ?? 999) - Number(PHASE_SORT_ORDER[right.workflow_phase] ?? 999);
      if (phaseDifference !== 0) {
        return phaseDifference;
      }

      const sortDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0);
      if (sortDifference !== 0) {
        return sortDifference;
      }

      return String(left.task_name || left.operation || "").localeCompare(String(right.task_name || right.operation || ""));
    })
    .forEach(visit);

  return ordered;
}

function buildBookingKey(roleKey, dateKey) {
  return `${roleKey}::${dateKey}`;
}

function getBookedHours(bookings, roleKey, dateKey) {
  return Number(bookings.get(buildBookingKey(roleKey, dateKey)) || 0);
}

function addBookedHours(bookings, roleKey, dateKey, hours) {
  const key = buildBookingKey(roleKey, dateKey);
  bookings.set(key, getBookedHours(bookings, roleKey, dateKey) + hours);
}

function getTaskDailyCapacity(dateValue, roleConfig, options = {}) {
  const dayMeta = getScheduleDayMeta(dateValue, options);
  return {
    ...dayMeta,
    taskHours: dayMeta.hours,
    roleHours: dayMeta.hours * Math.max(1, Number(roleConfig.units || 1)),
  };
}

function allocateHours({ roleConfig, earliestDate, hours, bookings, options }) {
  const alignedStart = snapDateToWorkingDate(earliestDate, options);
  if (!alignedStart) {
    return {
      startDate: "",
      finishDate: "",
      days: [],
      resourceDelayDays: 0,
    };
  }

  const totalHours = Math.max(0, normaliseHours(hours, 0));
  if (totalHours <= 0) {
    return {
      startDate: alignedStart,
      finishDate: alignedStart,
      days: [],
      resourceDelayDays: 0,
    };
  }

  const startDate = asDate(alignedStart);
  let cursor = startDate;
  let remainingHours = totalHours;
  let forecastStartDate = "";
  let forecastFinishDate = alignedStart;
  let firstDayWithCapacity = "";
  const days = [];

  for (let index = 0; index < 730; index += 1) {
    const dateKey = asDateKey(cursor);
    const dayMeta = getTaskDailyCapacity(cursor, roleConfig, options);
    if (dayMeta.taskHours <= 0 || dayMeta.roleHours <= 0) {
      cursor = addDays(cursor, 1);
      continue;
    }

    const bookedHours = getBookedHours(bookings, roleConfig.roleKey, dateKey);
    const availableHours = Math.max(0, dayMeta.roleHours - bookedHours);
    if (!firstDayWithCapacity && availableHours > 0) {
      firstDayWithCapacity = dateKey;
    }

    if (availableHours <= 0) {
      cursor = addDays(cursor, 1);
      continue;
    }

    const allocatedHours = Math.min(availableHours, remainingHours);
    addBookedHours(bookings, roleConfig.roleKey, dateKey, allocatedHours);
    days.push({
      date: dateKey,
      hours: allocatedHours,
      availableHours,
      bookedHoursBefore: bookedHours,
      capacityHours: dayMeta.roleHours,
    });

    if (!forecastStartDate) {
      forecastStartDate = dateKey;
    }
    forecastFinishDate = dateKey;
    remainingHours -= allocatedHours;
    if (remainingHours <= 0.0001) {
      break;
    }

    cursor = addDays(cursor, 1);
  }

  return {
    startDate: forecastStartDate || alignedStart,
    finishDate: forecastFinishDate || alignedStart,
    days,
    resourceDelayDays: firstDayWithCapacity
      ? Math.max(0, differenceInCalendarDays(asDate(firstDayWithCapacity), startDate))
      : 0,
  };
}

function reserveExistingOperation(operation, bookings, roleMappings, referenceDate) {
  const roleConfig = resolveRoleConfig(resolveRoleKey(operation), roleMappings);
  const options = getOperationSchedulingOptions(operation);
  const startDate = asDateKey(operation.start_date || operation.actual_start_date || operation.created_date);
  if (!startDate) {
    return;
  }

  const today = todayKey(referenceDate);
  const status = String(operation.status || "pending").trim().toLowerCase();
  const totalHours = status === "in_progress"
    ? Math.max(0, normaliseHours(operation.estimated_hours, 0) - normaliseHours(operation.actual_hours, 0))
    : normaliseHours(operation.estimated_hours, 0);

  if (status === "complete" || totalHours <= 0) {
    return;
  }

  const earliestDate = asDateKey(asDate(startDate) && asDate(startDate) < asDate(today) ? today : startDate);
  allocateHours({
    roleConfig,
    earliestDate,
    hours: totalHours,
    bookings,
    options,
  });
}

function buildDependencyList(operation) {
  return Array.isArray(operation.dependency_task_ids)
    ? operation.dependency_task_ids
    : String(operation.dependency_task_ids || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
}

function buildForecastReason({
  dependencyRows,
  roleConfig,
  dependencyReadyDate,
  forecastStartDate,
  manualOverride,
  resourceDelayDays,
}) {
  if (manualOverride) {
    return "Manual schedule kept as the earliest allowed slot.";
  }

  if (dependencyRows.length > 0) {
    const dependencyNames = dependencyRows.map((row) => row.taskName).join(", ");
    if (forecastStartDate && dependencyReadyDate && forecastStartDate > dependencyReadyDate) {
      return `Waiting for ${dependencyNames}, then the next ${roleConfig.label.toLowerCase()} slot.`;
    }
    return `Starts after ${dependencyNames}.`;
  }

  if (resourceDelayDays > 0) {
    return `Next ${roleConfig.label.toLowerCase()} slot after current workload.`;
  }

  return `Next available ${roleConfig.label.toLowerCase()} capacity.`;
}

function getRiskState({ row, job }) {
  const dueDate = asDateKey(job?.due_date || "");
  const installDate = asDateKey(job?.install_date || "");
  const baselineFinishDate = asDateKey(row.baselineFinishDate || "");
  const forecastFinishDate = asDateKey(row.forecastFinishDate || "");

  if (forecastFinishDate && installDate && forecastFinishDate > installDate && ["installation", "completion"].includes(row.phaseKey)) {
    return { label: "Install risk", color: "red" };
  }

  if (forecastFinishDate && dueDate && forecastFinishDate > dueDate) {
    return { label: "Late", color: "red" };
  }

  if (baselineFinishDate && forecastFinishDate && forecastFinishDate > baselineFinishDate) {
    return { label: "Slipping", color: "amber" };
  }

  if (row.resourceDelayDays > 0) {
    return { label: "Capacity wait", color: "amber" };
  }

  return { label: "On track", color: "emerald" };
}

export function forecastJobWaterfall({ job, currentOperations = [], allOperations = [], roleMappings = [], today = new Date() }) {
  const referenceDate = todayKey(today);
  const bookings = new Map();
  const currentJobId = String(job?.id || "");
  const orderedOperations = sortOperations(currentOperations);

  allOperations
    .filter((operation) => String(operation.job_id || "") !== currentJobId)
    .forEach((operation) => reserveExistingOperation(operation, bookings, roleMappings, referenceDate));

  const rowsById = new Map();
  const rows = orderedOperations.map((operation) => {
    const phase = getStageConfig(WORKFLOW_PHASES, operation.workflow_phase || "");
    const roleConfig = resolveRoleConfig(resolveRoleKey(operation), roleMappings);
    const status = getStageConfig(WORKFLOW_TASK_STATUSES, operation.status || "pending");
    const operationType = getStageConfig(OPERATIONS, operation.operation || "other");
    const dependencyIds = buildDependencyList(operation);
    const dependencyRows = dependencyIds.map((dependencyId) => rowsById.get(dependencyId)).filter(Boolean);
    const dependencyReadyDate = dependencyRows.reduce((latestDate, dependencyRow) => {
      const dependencyFinishDate = dependencyRow?.forecastFinishDate || dependencyRow?.actualCompletionDate || dependencyRow?.baselineFinishDate || latestDate;
      return dependencyFinishDate > latestDate ? dependencyFinishDate : latestDate;
    }, referenceDate);

    const baselineStartDate = asDateKey(operation.start_date || "");
    const baselineFinishDate = asDateKey(operation.end_date || "");
    const actualStartDate = asDateKey(operation.actual_start_date || operation.start_date || "");
    const actualCompletionDate = asDateKey(operation.actual_completion_date || (String(operation.status || "").toLowerCase() === "complete" ? operation.end_date : ""));
    const manualOverride = Boolean(operation.schedule_manual_override && baselineStartDate);
    const assignedLabel = String(operation.assigned_to || "").trim();
    const options = getOperationSchedulingOptions(operation);

    let forecastStartDate = baselineStartDate || referenceDate;
    let forecastFinishDate = baselineFinishDate || forecastStartDate;
    let days = [];
    let resourceDelayDays = 0;

    if (String(status.value) === "complete") {
      forecastStartDate = actualStartDate || baselineStartDate || dependencyReadyDate || referenceDate;
      forecastFinishDate = actualCompletionDate || baselineFinishDate || forecastStartDate;
    } else {
      const earliestDate = [
        referenceDate,
        dependencyReadyDate,
        manualOverride ? baselineStartDate : "",
      ]
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || referenceDate;

      const remainingHours = String(status.value) === "in_progress"
        ? Math.max(0, normaliseHours(operation.estimated_hours, 0) - normaliseHours(operation.actual_hours, 0))
        : normaliseHours(operation.estimated_hours, 0);

      const allocation = allocateHours({
        roleConfig,
        earliestDate,
        hours: remainingHours,
        bookings,
        options,
      });

      forecastStartDate = String(status.value) === "in_progress"
        ? actualStartDate || allocation.startDate || earliestDate
        : allocation.startDate || earliestDate;
      forecastFinishDate = allocation.finishDate || forecastStartDate;
      days = allocation.days;
      resourceDelayDays = allocation.resourceDelayDays;
    }

    const row = {
      id: operation.id,
      taskName: String(operation.task_name || operationType.label || "Task"),
      phaseKey: String(operation.workflow_phase || ""),
      phaseLabel: phase.label,
      phaseColor: phase.color || "slate",
      roleKey: roleConfig.roleKey,
      roleLabel: roleConfig.label,
      roleColor: roleConfig.color,
      assignee: assignedLabel,
      operationLabel: operationType.label,
      status: status.value,
      statusLabel: status.label,
      dependencyIds,
      dependencyNames: dependencyRows.map((dependencyRow) => dependencyRow.taskName),
      estimatedHours: normaliseHours(operation.estimated_hours, 0),
      actualHours: normaliseHours(operation.actual_hours, 0),
      baselineStartDate,
      baselineFinishDate,
      actualStartDate,
      actualCompletionDate,
      forecastStartDate,
      forecastFinishDate,
      days,
      resourceDelayDays,
      isBlocked: dependencyRows.some((dependencyRow) => dependencyRow.status !== "complete") && !["complete", "in_progress"].includes(String(status.value)),
      isResourceConstrained: resourceDelayDays > 0,
      reason: buildForecastReason({
        dependencyRows,
        roleConfig,
        dependencyReadyDate,
        forecastStartDate,
        manualOverride,
        resourceDelayDays,
      }),
      dependencyReadyDate,
      manualOverride,
    };

    row.risk = getRiskState({ row, job });
    rowsById.set(row.id, row);
    return row;
  });

  const projectedCompletionDate = rows.reduce((latestDate, row) => (
    row.forecastFinishDate > latestDate ? row.forecastFinishDate : latestDate
  ), "");

  const dateBounds = rows.reduce((accumulator, row) => {
    const startDate = asDate(row.forecastStartDate || referenceDate);
    const finishDate = asDate(row.forecastFinishDate || row.forecastStartDate || referenceDate);

    if (!accumulator.min || (startDate && startDate < accumulator.min)) {
      accumulator.min = startDate;
    }
    if (!accumulator.max || (finishDate && finishDate > accumulator.max)) {
      accumulator.max = finishDate;
    }
    return accumulator;
  }, { min: asDate(referenceDate), max: asDate(referenceDate) });

  const days = dateBounds.min && dateBounds.max
    ? eachDayOfInterval({ start: dateBounds.min, end: dateBounds.max }).map((date) => ({
      dateKey: asDateKey(date),
      shortLabel: format(date, "d"),
      weekLabel: format(date, "EEE"),
      monthLabel: format(date, "MMM"),
      isToday: asDateKey(date) === referenceDate,
    }))
    : [];

  const rowsWithPositions = rows.map((row) => {
    const startIndex = days.findIndex((day) => day.dateKey === row.forecastStartDate);
    const finishIndex = days.findIndex((day) => day.dateKey === row.forecastFinishDate);
    return {
      ...row,
      startIndex: startIndex >= 0 ? startIndex : 0,
      spanDays: finishIndex >= startIndex && startIndex >= 0 ? finishIndex - startIndex + 1 : 1,
    };
  });

  const phases = [];
  rowsWithPositions.forEach((row) => {
    let phaseGroup = phases.find((phase) => phase.phaseKey === row.phaseKey);
    if (!phaseGroup) {
      phaseGroup = {
        phaseKey: row.phaseKey,
        phaseLabel: row.phaseLabel || "General",
        phaseColor: row.phaseColor || "slate",
        rows: [],
      };
      phases.push(phaseGroup);
    }
    phaseGroup.rows.push(row);
  });

  return {
    projectedCompletionDate,
    forecastStartDate: days[0]?.dateKey || referenceDate,
    days,
    rows: rowsWithPositions,
    phases,
    summary: {
      totalTasks: rowsWithPositions.length,
      blockedTasks: rowsWithPositions.filter((row) => row.isBlocked).length,
      constrainedTasks: rowsWithPositions.filter((row) => row.isResourceConstrained).length,
      completedTasks: rowsWithPositions.filter((row) => row.status === "complete").length,
    },
  };
}
