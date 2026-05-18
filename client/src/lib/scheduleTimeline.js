import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isAfter,
  isBefore,
  max as dateMax,
  min as dateMin,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const STANDARD_DAY_HOURS = 10.5;
export const FRIDAY_STANDARD_HOURS = 5;
export const FRIDAY_OVERTIME_HOURS = 5.5;
export const SATURDAY_OVERTIME_HOURS = 5;

export const SCHEDULE_DAY_LABELS = {
  mondayToThursday: "7:00-17:30",
  friday: "7:00-12:00",
  fridayOvertime: "Friday PM OT",
  saturdayOvertime: "Saturday OT",
  closed: "Closed",
};

export function parseAssignedNames(value) {
  return [...new Set(
    String(value || "")
      .split(/[;,|•]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function joinAssignedNames(values) {
  return [...new Set(
    values
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  )].join(", ");
}

export function getOperationSchedulingOptions(operation = {}) {
  return {
    allowFridayOvertime: Boolean(operation.allow_friday_overtime),
    allowSaturdayOvertime: Boolean(operation.allow_saturday_overtime),
  };
}

function getDateSafely(value) {
  if (!value) {
    return null;
  }

  try {
    const date = startOfDay(parseISO(String(value)));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function normaliseDateString(value) {
  const date = getDateSafely(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function getScheduleDayMeta(value, options = {}) {
  const date = value instanceof Date ? startOfDay(value) : getDateSafely(value);
  if (!date) {
    return {
      dateKey: "",
      hours: 0,
      label: SCHEDULE_DAY_LABELS.closed,
      isClosed: true,
      isSunday: false,
      isSaturday: false,
      isFriday: false,
      isOvertimeOnly: false,
      isShortDay: false,
    };
  }

  const day = getDay(date);
  const allowFridayOvertime = Boolean(options.allowFridayOvertime);
  const allowSaturdayOvertime = Boolean(options.allowSaturdayOvertime);

  if (day >= 1 && day <= 4) {
    return {
      dateKey: format(date, "yyyy-MM-dd"),
      hours: STANDARD_DAY_HOURS,
      label: SCHEDULE_DAY_LABELS.mondayToThursday,
      isClosed: false,
      isSunday: false,
      isSaturday: false,
      isFriday: false,
      isOvertimeOnly: false,
      isShortDay: false,
    };
  }

  if (day === 5) {
    return {
      dateKey: format(date, "yyyy-MM-dd"),
      hours: FRIDAY_STANDARD_HOURS + (allowFridayOvertime ? FRIDAY_OVERTIME_HOURS : 0),
      label: allowFridayOvertime
        ? `${SCHEDULE_DAY_LABELS.friday} + ${SCHEDULE_DAY_LABELS.fridayOvertime}`
        : SCHEDULE_DAY_LABELS.friday,
      isClosed: false,
      isSunday: false,
      isSaturday: false,
      isFriday: true,
      isOvertimeOnly: false,
      isShortDay: !allowFridayOvertime,
    };
  }

  if (day === 6) {
    return {
      dateKey: format(date, "yyyy-MM-dd"),
      hours: allowSaturdayOvertime ? SATURDAY_OVERTIME_HOURS : 0,
      label: allowSaturdayOvertime ? SCHEDULE_DAY_LABELS.saturdayOvertime : SCHEDULE_DAY_LABELS.closed,
      isClosed: !allowSaturdayOvertime,
      isSunday: false,
      isSaturday: true,
      isFriday: false,
      isOvertimeOnly: true,
      isShortDay: false,
    };
  }

  return {
    dateKey: format(date, "yyyy-MM-dd"),
    hours: 0,
    label: SCHEDULE_DAY_LABELS.closed,
    isClosed: true,
    isSunday: true,
    isSaturday: false,
    isFriday: false,
    isOvertimeOnly: false,
    isShortDay: false,
  };
}

export function snapDateToWorkingDate(value, options = {}) {
  let date = getDateSafely(value);
  if (!date) {
    return "";
  }

  for (let index = 0; index < 21; index += 1) {
    if (getScheduleDayMeta(date, options).hours > 0) {
      return format(date, "yyyy-MM-dd");
    }
    date = addDays(date, 1);
  }

  return format(date, "yyyy-MM-dd");
}

export function calculateScheduleEndDate(startDate, estimatedHours, options = {}) {
  const numericHours = Number(estimatedHours || 0);
  const alignedStart = snapDateToWorkingDate(startDate, options);

  if (!alignedStart) {
    return "";
  }

  if (!(numericHours > 0)) {
    return alignedStart;
  }

  let remaining = numericHours;
  let cursor = getDateSafely(alignedStart);
  let finalDate = cursor;

  for (let index = 0; index < 366; index += 1) {
    const dayMeta = getScheduleDayMeta(cursor, options);
    if (dayMeta.hours > 0) {
      remaining -= dayMeta.hours;
      finalDate = cursor;
      if (remaining <= 0.0001) {
        return format(finalDate, "yyyy-MM-dd");
      }
    }
    cursor = addDays(cursor, 1);
  }

  return format(finalDate, "yyyy-MM-dd");
}

export function resolveOperationEndDate(operation = {}) {
  const options = getOperationSchedulingOptions(operation);
  const startDate = snapDateToWorkingDate(operation.start_date, options);

  if (!startDate) {
    return "";
  }

  if (operation.schedule_manual_override) {
    return normaliseDateString(operation.end_date || startDate) || startDate;
  }

  if (Number(operation.estimated_hours || 0) > 0) {
    return calculateScheduleEndDate(startDate, operation.estimated_hours, options);
  }

  return normaliseDateString(operation.end_date || startDate) || startDate;
}

export function getTimelineSections(currentDate, view) {
  const safeCurrentDate = currentDate instanceof Date ? currentDate : new Date();
  const monthStart = startOfMonth(safeCurrentDate);
  const monthEnd = endOfMonth(safeCurrentDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const weekStart = startOfWeek(safeCurrentDate, { weekStartsOn: 1 });

  if (view === "month") {
    const allDays = eachDayOfInterval({ start: monthGridStart, end: monthGridEnd });
    const sections = [];

    for (let index = 0; index < allDays.length; index += 7) {
      const days = allDays.slice(index, index + 7);
      sections.push({
        id: `week-${format(days[0], "yyyy-MM-dd")}`,
        label: `${format(days[0], "d MMM")} – ${format(days[days.length - 1], "d MMM")}`,
        days,
      });
    }

    return sections;
  }

  const count = view === "work" ? 5 : view === "2week" ? 14 : 7;
  return [
    {
      id: `${view}-${format(weekStart, "yyyy-MM-dd")}`,
      label: `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, count - 1), "d MMM")}`,
      days: Array.from({ length: count }, (_, index) => addDays(weekStart, index)),
    },
  ];
}

function intervalsOverlap(left, right) {
  return !(left.endColumn < right.startColumn || right.endColumn < left.startColumn);
}

export function buildSectionSegments(items = [], sectionDays = []) {
  if (sectionDays.length === 0) {
    return [];
  }

  const sectionStart = startOfDay(sectionDays[0]);
  const sectionEnd = startOfDay(sectionDays[sectionDays.length - 1]);

  return items
    .map((item) => {
      const itemStart = getDateSafely(item.startDate);
      const itemEnd = getDateSafely(item.endDate || item.startDate);
      if (!itemStart || !itemEnd) {
        return null;
      }

      if (isAfter(itemStart, sectionEnd) || isBefore(itemEnd, sectionStart)) {
        return null;
      }

      const visibleStart = dateMax([itemStart, sectionStart]);
      const visibleEnd = dateMin([itemEnd, sectionEnd]);
      const startColumn = differenceInCalendarDays(visibleStart, sectionStart) + 1;
      const endColumn = differenceInCalendarDays(visibleEnd, sectionStart) + 1;

      return {
        ...item,
        sectionStart: format(sectionStart, "yyyy-MM-dd"),
        startColumn,
        endColumn,
        span: endColumn - startColumn + 1,
        continuesBefore: isBefore(itemStart, sectionStart),
        continuesAfter: isAfter(itemEnd, sectionEnd),
      };
    })
    .filter(Boolean);
}

export function layoutTimelineSegments(segments = []) {
  const segmentsByLane = new Map();
  segments.forEach((segment) => {
    const laneId = segment.laneId || "__unassigned";
    if (!segmentsByLane.has(laneId)) {
      segmentsByLane.set(laneId, []);
    }
    segmentsByLane.get(laneId).push(segment);
  });

  const laidOut = [];

  for (const laneSegments of segmentsByLane.values()) {
    const sortedSegments = [...laneSegments].sort((left, right) => {
      if (left.startColumn !== right.startColumn) {
        return left.startColumn - right.startColumn;
      }

      return right.span - left.span;
    });

    const stacks = [];

    sortedSegments.forEach((segment) => {
      let stackIndex = 0;

      while (stacks[stackIndex]?.some((existing) => intervalsOverlap(existing, segment))) {
        stackIndex += 1;
      }

      if (!stacks[stackIndex]) {
        stacks[stackIndex] = [];
      }

      stacks[stackIndex].push(segment);
      laidOut.push({
        ...segment,
        stackIndex,
      });
    });
  }

  return laidOut;
}

export function getLaneRowCount(segments = []) {
  return Math.max(1, ...segments.map((segment) => Number(segment.stackIndex || 0) + 1));
}
