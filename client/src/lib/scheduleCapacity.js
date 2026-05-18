import { eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import {
  STANDARD_DAY_HOURS,
  getScheduleDayMeta,
  getOperationSchedulingOptions,
  normaliseDateString,
  resolveOperationEndDate,
} from "./scheduleTimeline";
import { getAssignedStaffMembers, normalizeScheduleLaneStaff } from "./staffIdentity";

function roundHours(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

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

export function getLaneDailyCapacity(lane, day) {
  const dayMeta = getScheduleDayMeta(day);
  if (dayMeta.hours <= 0) {
    return 0;
  }

  const crewSize = Math.max(1, Number(lane?.crew_size || 1));
  const normalizedDayFactor = dayMeta.hours / STANDARD_DAY_HOURS;
  const configuredDailyCapacity = Number(lane?.capacity_hours_per_day || 0);
  const fallbackDailyCapacity = STANDARD_DAY_HOURS * crewSize;
  const baseCapacity = configuredDailyCapacity > 0 ? configuredDailyCapacity : fallbackDailyCapacity;

  return roundHours(baseCapacity * normalizedDayFactor);
}

function getOperationLaneId(operation, lanes) {
  const explicitLaneId = String(operation.lane_id || "").trim();
  if (explicitLaneId && lanes.some((lane) => lane.id === explicitLaneId)) {
    return explicitLaneId;
  }

  const firstAssignee = getAssignedStaffMembers({
    assignedStaffIds: operation.assigned_staff_ids,
    assignedTo: operation.assigned_to,
    staff: lanes.map((lane) => ({ id: lane.staff_id, name: lane.staff_name })),
  })[0];
  if (!firstAssignee?.id) {
    return "";
  }

  const matchingLane = lanes.find((lane) => normalizeScheduleLaneStaff(lane).staff_id === String(firstAssignee.id || "").trim());
  return matchingLane?.id || "";
}

function getDistributionDays(operation) {
  const startDate = asDate(normaliseDateString(operation.start_date));
  const endDate = asDate(resolveOperationEndDate(operation));
  if (!startDate || !endDate) {
    return [];
  }

  const options = getOperationSchedulingOptions(operation);
  const days = eachDayOfInterval({ start: startDate, end: endDate }).map((day) => ({
    date: day,
    dateKey: format(day, "yyyy-MM-dd"),
    hours: Math.max(0, getScheduleDayMeta(day, options).hours),
  }));

  const positiveHoursDays = days.filter((day) => day.hours > 0);
  return positiveHoursDays.length > 0 ? positiveHoursDays : [{ date: startDate, dateKey: format(startDate, "yyyy-MM-dd"), hours: 1 }];
}

export function buildScheduleCapacityModel({ lanes = [], operations = [], days = [] }) {
  const safeDays = days.map((day) => (day instanceof Date ? day : asDate(day))).filter(Boolean);
  const visibleDayKeys = new Set(safeDays.map((day) => format(day, "yyyy-MM-dd")));
  const laneRows = (lanes || []).map((lane) => {
    const byDay = new Map(
      safeDays.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        return [dateKey, { dateKey, bookedHours: 0, capacityHours: getLaneDailyCapacity(lane, day) }];
      })
    );

    return {
      lane,
      byDay,
    };
  });

  const laneRowById = new Map(laneRows.map((row) => [row.lane.id, row]));

  (operations || []).forEach((operation) => {
    const laneId = getOperationLaneId(operation, lanes);
    const laneRow = laneRowById.get(laneId);
    if (!laneRow) {
      return;
    }

    const distributionDays = getDistributionDays(operation);
    const totalWeightedHours = distributionDays.reduce((sum, day) => sum + day.hours, 0) || distributionDays.length || 1;
    const estimatedHours = Math.max(0, Number(operation.estimated_hours || 0));

    distributionDays.forEach((day) => {
      if (!visibleDayKeys.has(day.dateKey)) {
        return;
      }

      const slot = laneRow.byDay.get(day.dateKey);
      if (!slot) {
        return;
      }

      const ratio = totalWeightedHours > 0 ? day.hours / totalWeightedHours : 1 / distributionDays.length;
      slot.bookedHours = roundHours(slot.bookedHours + (estimatedHours * ratio));
    });
  });

  const rows = laneRows.map((row) => {
    const daysSummary = [...row.byDay.values()].map((day) => {
      const overloadHours = Math.max(0, roundHours(day.bookedHours - day.capacityHours));
      const utilisationPercent = day.capacityHours > 0 ? Math.round((day.bookedHours / day.capacityHours) * 100) : 0;
      return {
        ...day,
        overloadHours,
        utilisationPercent,
      };
    });

    const bookedHours = roundHours(daysSummary.reduce((sum, day) => sum + day.bookedHours, 0));
    const capacityHours = roundHours(daysSummary.reduce((sum, day) => sum + day.capacityHours, 0));
    const overloadHours = roundHours(daysSummary.reduce((sum, day) => sum + day.overloadHours, 0));
    const overloadDays = daysSummary.filter((day) => day.overloadHours > 0).length;
    const peakDay = daysSummary.slice().sort((left, right) => right.utilisationPercent - left.utilisationPercent)[0] || null;
    const utilisationPercent = capacityHours > 0 ? Math.round((bookedHours / capacityHours) * 100) : 0;

    return {
      lane: row.lane,
      days: daysSummary,
      bookedHours,
      capacityHours,
      overloadHours,
      overloadDays,
      utilisationPercent,
      peakDay,
    };
  });

  const totalBookedHours = roundHours(rows.reduce((sum, row) => sum + row.bookedHours, 0));
  const totalCapacityHours = roundHours(rows.reduce((sum, row) => sum + row.capacityHours, 0));
  const totalOverloadHours = roundHours(rows.reduce((sum, row) => sum + row.overloadHours, 0));
  const overloadedLaneDays = rows.reduce((sum, row) => sum + row.overloadDays, 0);
  const mostConstrainedLane = rows.slice().sort((left, right) => right.utilisationPercent - left.utilisationPercent)[0] || null;

  return {
    rows,
    totalBookedHours,
    totalCapacityHours,
    totalOverloadHours,
    overloadedLaneDays,
    overallUtilisationPercent: totalCapacityHours > 0 ? Math.round((totalBookedHours / totalCapacityHours) * 100) : 0,
    mostConstrainedLane,
  };
}
