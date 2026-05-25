import {
  createEntityRecord,
  executeDatabaseStatement,
  getEntityRecord,
  listEntityRecords,
  runInTransaction,
  updateEntityRecord,
} from "./db";
import { formatLocalDate, normalizeDateOnly } from "./dateUtils";
import { reconcileJobWorkflowStatuses } from "./jobWorkflow";
import { RouteRequestError } from "./routeError";
import {
  activityRequiresJob,
  buildTimeReviewFlags,
  deriveLabourCategory,
  isChargeableActivity,
  normalizeLabourCategory,
  requiresCommentWhenJobless,
} from "./timeRules";
import { EntityData, EntityRecord, LocalUser } from "./types";

type MutationContext = {
  actor?: LocalUser | null;
  requestSource?: string;
  expectedRowVersion?: number | null;
  now?: Date;
  skipAudit?: boolean;
};

type TimeSegment = {
  started_at: string;
  ended_at?: string;
  duration_minutes?: number;
};

type StartTimerResult = {
  entry: EntityRecord;
  auto_paused_entry: EntityRecord | null;
};

function roundHours(value: unknown) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundMinutes(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeDateTime(value: unknown) {
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

export function normalizeTimeEntryStatus(value: unknown) {
  const normalized = String(value || "active").trim().toLowerCase();
  if (normalized === "complete") {
    return "completed";
  }
  if (normalized === "paused") {
    return "paused";
  }
  return normalized === "completed" ? "completed" : "active";
}

function calculateMinutesBetween(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return roundMinutes((end.getTime() - start.getTime()) / (1000 * 60));
}

function toSegment(value: unknown): TimeSegment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const startedAt = normalizeDateTime(source.started_at ?? source.startedAt);
  if (!startedAt) {
    return null;
  }

  const endedAt = normalizeDateTime(source.ended_at ?? source.endedAt);
  const durationMinutes = roundMinutes(
    source.duration_minutes ?? source.durationMinutes ?? (endedAt ? calculateMinutesBetween(startedAt, endedAt) : 0)
  );

  if (endedAt) {
    const end = new Date(endedAt).getTime();
    const start = new Date(startedAt).getTime();
    if (end <= start) {
      return null;
    }
  }

  return {
    started_at: startedAt,
    ended_at: endedAt || undefined,
    duration_minutes: endedAt ? durationMinutes : undefined,
  };
}

function normalizeSegmentArray(value: unknown): TimeSegment[] {
  const segments = Array.isArray(value) ? value.map(toSegment).filter(Boolean) as TimeSegment[] : [];
  segments.sort((left, right) => left.started_at.localeCompare(right.started_at));
  return segments;
}

function buildSyntheticLegacySegment(record: Record<string, unknown>): TimeSegment[] {
  const normalizedClockIn = normalizeDateTime(record.clock_in);
  const normalizedClockOut = normalizeDateTime(record.clock_out);
  const status = normalizeTimeEntryStatus(record.status);
  const storedHours = Number(record.hours || 0);

  if (normalizedClockIn && normalizedClockOut) {
    return [{
      started_at: normalizedClockIn,
      ended_at: normalizedClockOut,
      duration_minutes: calculateMinutesBetween(normalizedClockIn, normalizedClockOut),
    }];
  }

  if (normalizedClockIn && status === "active") {
    return [{ started_at: normalizedClockIn }];
  }

  if (normalizedClockIn) {
    return [{
      started_at: normalizedClockIn,
      ended_at: normalizedClockOut || normalizedClockIn,
      duration_minutes: roundMinutes(storedHours * 60),
    }];
  }

  if (storedHours > 0) {
    const anchor = normalizeDateTime(record.created_date || `${normalizeDateOnly(record.date) || formatLocalDate(new Date())}T08:00:00.000Z`);
    if (!anchor) {
      return [];
    }

    const endedAt = new Date(new Date(anchor).getTime() + roundMinutes(storedHours * 60) * 60 * 1000).toISOString();
    return [{
      started_at: anchor,
      ended_at: endedAt,
      duration_minutes: roundMinutes(storedHours * 60),
    }];
  }

  return [];
}

function normalizeStoredSegments(record: Record<string, unknown>): TimeSegment[] {
  const explicitSegments = normalizeSegmentArray(record.segments);
  return explicitSegments.length > 0 ? explicitSegments : buildSyntheticLegacySegment(record);
}

function getOpenSegmentIndex(segments: TimeSegment[]) {
  return segments.findIndex((segment) => !segment.ended_at);
}

function closeSegment(segment: TimeSegment, endedAt: string): TimeSegment {
  return {
    started_at: segment.started_at,
    ended_at: endedAt,
    duration_minutes: calculateMinutesBetween(segment.started_at, endedAt),
  };
}

function closeOpenSegments(segments: TimeSegment[], endedAt: string) {
  let openCount = 0;
  const nextSegments = segments.map((segment) => {
    if (segment.ended_at) {
      return {
        started_at: segment.started_at,
        ended_at: segment.ended_at,
        duration_minutes: roundMinutes(segment.duration_minutes ?? calculateMinutesBetween(segment.started_at, segment.ended_at)),
      };
    }

    openCount += 1;
    return closeSegment(segment, endedAt);
  });

  if (openCount <= 1) {
    return nextSegments;
  }

  nextSegments.sort((left, right) => left.started_at.localeCompare(right.started_at));
  return nextSegments.map((segment, index, array) => {
    if (segment.ended_at) {
      return segment;
    }

    const nextBoundary = array[index + 1]?.started_at || endedAt;
    return closeSegment(segment, nextBoundary);
  });
}

function trimSegmentsAtBoundary(segments: TimeSegment[], boundaryIso: string) {
  const boundaryTime = new Date(boundaryIso).getTime();
  if (Number.isNaN(boundaryTime)) {
    return segments;
  }

  return segments
    .map((segment) => {
      const startedAt = normalizeDateTime(segment.started_at);
      if (!startedAt) {
        return null;
      }

      const startedAtTime = new Date(startedAt).getTime();
      if (Number.isNaN(startedAtTime) || startedAtTime >= boundaryTime) {
        return null;
      }

      const endedAt = normalizeDateTime(segment.ended_at);
      if (!endedAt) {
        return {
          started_at: startedAt,
          ended_at: boundaryIso,
          duration_minutes: calculateMinutesBetween(startedAt, boundaryIso),
        };
      }

      const endedAtTime = new Date(endedAt).getTime();
      if (Number.isNaN(endedAtTime)) {
        return null;
      }

      if (endedAtTime <= boundaryTime) {
        return {
          started_at: startedAt,
          ended_at: endedAt,
          duration_minutes: roundMinutes(segment.duration_minutes ?? calculateMinutesBetween(startedAt, endedAt)),
        };
      }

      return {
        started_at: startedAt,
        ended_at: boundaryIso,
        duration_minutes: calculateMinutesBetween(startedAt, boundaryIso),
      };
    })
    .filter(Boolean) as TimeSegment[];
}

function normalizeSegmentForStorage(segment: TimeSegment) {
  const startedAt = normalizeDateTime(segment.started_at);
  if (!startedAt) {
    return null;
  }

  const endedAt = normalizeDateTime(segment.ended_at);
  if (!endedAt) {
    return { started_at: startedAt };
  }

  if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
    return null;
  }

  return {
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: calculateMinutesBetween(startedAt, endedAt),
  };
}

function findLatestStaffBoundaryBefore(
  entries: EntityRecord[],
  excludeId: string,
  earliestIso: string,
  latestIso: string
) {
  const earliestTime = new Date(earliestIso).getTime();
  const latestTime = new Date(latestIso).getTime();
  if (Number.isNaN(earliestTime) || Number.isNaN(latestTime) || latestTime < earliestTime) {
    return "";
  }

  let best = "";
  let bestTime = earliestTime;

  entries.forEach((entry) => {
    if (entry.id === excludeId) {
      return;
    }

    const endedAt = getLastEndedAt(normalizeStoredSegments(entry));
    if (!endedAt) {
      return;
    }

    const endedAtTime = new Date(endedAt).getTime();
    if (Number.isNaN(endedAtTime) || endedAtTime < earliestTime || endedAtTime > latestTime) {
      return;
    }

    if (!best || endedAtTime > bestTime) {
      best = endedAt;
      bestTime = endedAtTime;
    }
  });

  return best;
}

function getNormalizedStaffEntries(staffId: string) {
  return listEntityRecords("TimeEntry", { filters: { staff_id: staffId }, limit: 1000 })
    .map((entry) => normalizeTimeEntryPayload(entry, entry, { skipOverlapCheck: true }))
    .map((entry) => entry as unknown as EntityRecord);
}

function hasOpenAttendanceClockIn(staffId: string) {
  if (!staffId) {
    return false;
  }

  return listEntityRecords("ClockIn", { filters: { staff_id: staffId }, limit: 1000 }).some((record) => {
    const clockIn = normalizeDateTime(record.clock_in ?? record.clock_in_time);
    const clockOut = normalizeDateTime(record.clock_out ?? record.clock_out_time);
    return Boolean(clockIn) && !clockOut;
  });
}

function clampOpenSegmentStart(segments: TimeSegment[], minimumStartIso: string) {
  const minimumStart = normalizeDateTime(minimumStartIso);
  if (!minimumStart) {
    return segments;
  }

  let adjusted = false;
  const nextSegments = segments.map((segment, index) => {
    if (index !== segments.length - 1 || segment.ended_at) {
      return segment;
    }

    if (segment.started_at >= minimumStart) {
      return segment;
    }

    adjusted = true;
    return { started_at: minimumStart };
  });

  return adjusted ? nextSegments : segments;
}

function resolveTimerResumeBoundary(current: EntityRecord, requestedResumeAt: string, staffEntries: EntityRecord[]) {
  const currentSegments = normalizeStoredSegments(current);
  const currentEndedAt = getLastEndedAt(currentSegments) || requestedResumeAt;
  const latestStaffBoundary = findLatestStaffBoundaryBefore(
    staffEntries,
    current.id,
    currentEndedAt,
    requestedResumeAt
  );

  const candidates = [requestedResumeAt, currentEndedAt, latestStaffBoundary]
    .map((value) => normalizeDateTime(value))
    .filter(Boolean)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

  return candidates[candidates.length - 1] || requestedResumeAt;
}

function repairMalformedSegmentOrdering(entry: EntityRecord, staffEntries: EntityRecord[], now: Date) {
  const segments = normalizeStoredSegments(entry);
  if (segments.length < 2) {
    return null;
  }

  const repairedSegments: TimeSegment[] = [];
  const repairUpperBound = normalizeDateTime(entry.updated_date) || now.toISOString();
  let previousEndedAt = "";
  let repaired = false;

  segments.forEach((segment) => {
    const normalizedSegment = normalizeSegmentForStorage(segment);
    if (!normalizedSegment) {
      return;
    }

    if (!previousEndedAt) {
      repairedSegments.push(normalizedSegment);
      previousEndedAt = normalizedSegment.ended_at || previousEndedAt;
      return;
    }

    const segmentStartedAt = normalizedSegment.started_at;
    if (segmentStartedAt < previousEndedAt) {
      const latestStaffBoundary = findLatestStaffBoundaryBefore(staffEntries, entry.id, previousEndedAt, repairUpperBound);
      const repairedStart = latestStaffBoundary || previousEndedAt;
      const repairedSegment = normalizedSegment.ended_at
        ? normalizeSegmentForStorage({
            started_at: repairedStart,
            ended_at: normalizedSegment.ended_at,
          })
        : normalizeSegmentForStorage({
            started_at: repairedStart,
          });

      if (repairedSegment) {
        repairedSegments.push(repairedSegment);
        previousEndedAt = repairedSegment.ended_at || previousEndedAt;
      }
      repaired = true;
      return;
    }

    repairedSegments.push(normalizedSegment);
    previousEndedAt = normalizedSegment.ended_at || previousEndedAt;
  });

  if (!repaired || repairedSegments.length === 0) {
    return null;
  }

  return normalizeTimeEntryPayload({
    ...entry,
    segments: repairedSegments,
    clock_out: normalizeTimeEntryStatus(entry.status) === "active" ? "" : getLastEndedAt(repairedSegments),
    paused_at: normalizeTimeEntryStatus(entry.status) === "paused" ? getLastEndedAt(repairedSegments) : "",
  }, entry, { skipOverlapCheck: true });
}

function sumClosedMinutes(segments: TimeSegment[]) {
  return segments.reduce((sum, segment) => sum + roundMinutes(segment.duration_minutes || 0), 0);
}

function getFirstStartedAt(segments: TimeSegment[]) {
  return segments[0]?.started_at || "";
}

function getLastEndedAt(segments: TimeSegment[]) {
  const closed = [...segments].reverse().find((segment) => segment.ended_at);
  return closed?.ended_at || "";
}

function getOpenSegment(segments: TimeSegment[]) {
  return segments.find((segment) => !segment.ended_at) || null;
}

function getLiveTrackedMinutes(record: Record<string, unknown>, nowValue = new Date()) {
  const segments = normalizeStoredSegments(record);
  const breakMinutes = roundMinutes(record.break_minutes || 0);
  const totalMinutes = record.total_minutes == null
    ? Math.max(0, sumClosedMinutes(segments) - breakMinutes)
    : roundMinutes(record.total_minutes);
  const openSegment = getOpenSegment(segments);
  if (!openSegment) {
    return totalMinutes;
  }

  return totalMinutes + calculateMinutesBetween(openSegment.started_at, nowValue.toISOString());
}

function buildDerivedFields(record: Record<string, unknown>, segments: TimeSegment[], status: "active" | "paused" | "completed") {
  const totalMinutes = Math.max(0, sumClosedMinutes(segments) - roundMinutes(record.break_minutes || 0));
  const hours = roundHours(totalMinutes / 60);
  const nextRecord = {
    ...record,
    status,
    segments,
    total_minutes: totalMinutes,
    hours,
    clock_in: getFirstStartedAt(segments),
    clock_out: status === "active" ? "" : getLastEndedAt(segments),
    paused_at: status === "paused" ? getLastEndedAt(segments) : "",
    total_cost: roundHours(hours * Number(record.hourly_rate || 0)),
  };
  const reviewFlags = buildTimeReviewFlags(nextRecord);

  return {
    ...nextRecord,
    review_flags: reviewFlags,
    review_required: reviewFlags.length > 0,
    review_status: reviewFlags.length > 0 ? "needs_attention" : "clear",
  };
}

function buildActiveDerivedFields(record: Record<string, unknown>, segments: TimeSegment[]) {
  const totalMinutes = Math.max(0, sumClosedMinutes(segments) - roundMinutes(record.break_minutes || 0));
  const hours = roundHours(totalMinutes / 60);
  const nextRecord = {
    ...record,
    status: "active",
    segments: segments.map((segment) => ({ ...segment })),
    total_minutes: totalMinutes,
    hours,
    clock_in: getFirstStartedAt(segments),
    clock_out: "",
    paused_at: "",
    total_cost: roundHours(hours * Number(record.hourly_rate || 0)),
  };
  const reviewFlags = buildTimeReviewFlags(nextRecord);

  return {
    ...nextRecord,
    review_flags: reviewFlags,
    review_required: reviewFlags.length > 0,
    review_status: reviewFlags.length > 0 ? "needs_attention" : "clear",
  };
}

function getTimeEntryComparableRange(record: Record<string, unknown>, nowValue = new Date()) {
  const segments = normalizeStoredSegments(record);
  const startedAt = getFirstStartedAt(segments) || normalizeDateTime(record.clock_in);
  if (!startedAt) {
    return null;
  }

  const openSegment = getOpenSegment(segments);
  const endedAt = openSegment
    ? nowValue.toISOString()
    : getLastEndedAt(segments) || normalizeDateTime(record.clock_out);
  if (!endedAt) {
    return null;
  }

  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

function getTimeEntryComparableRanges(record: Record<string, unknown>, nowValue = new Date()) {
  const segments = normalizeStoredSegments(record);
  if (segments.length === 0) {
    const legacyRange = getTimeEntryComparableRange(record, nowValue);
    return legacyRange ? [legacyRange] : [];
  }

  return segments
    .map((segment) => {
      const startedAt = normalizeDateTime(segment.started_at);
      const endedAt = normalizeDateTime(segment.ended_at) || nowValue.toISOString();
      if (!startedAt || !endedAt) {
        return null;
      }

      const start = new Date(startedAt);
      const end = new Date(endedAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return null;
      }

      return { start, end };
    })
    .filter((range): range is { start: Date; end: Date } => Boolean(range));
}

function assertTimeEntryDoesNotOverlap(candidate: Record<string, unknown>, excludeId = "") {
  if (normalizeTimeEntryStatus(candidate.status) === "active") {
    return;
  }

  const staffId = String(candidate.staff_id || "").trim();
  if (!staffId) {
    return;
  }

  const candidateRanges = getTimeEntryComparableRanges(candidate);
  if (candidateRanges.length === 0) {
    return;
  }

  const conflicting = listEntityRecords("TimeEntry", { filters: { staff_id: staffId }, limit: 1000 }).find((record) => {
    if (record.id === excludeId) {
      return false;
    }

    const ranges = getTimeEntryComparableRanges(record);
    if (ranges.length === 0) {
      return false;
    }

    return candidateRanges.some((candidateRange) =>
      ranges.some((range) => candidateRange.start < range.end && candidateRange.end > range.start)
    );
  });

  if (conflicting) {
    throw new RouteRequestError(409, "time_entry_overlap", "This time entry overlaps another recorded session for the same staff member.");
  }
}

function findRelatedStaffRecord(nextRecord: Record<string, unknown>, previousRecord?: Record<string, unknown> | null) {
  const directStaffId = String(nextRecord.staff_id ?? previousRecord?.staff_id ?? "").trim();
  if (directStaffId) {
    return getEntityRecord("Staff", directStaffId);
  }

  const desiredEmail = String(nextRecord.staff_email ?? previousRecord?.staff_email ?? "").trim().toLowerCase();
  const desiredEmployeeId = String(nextRecord.employee_id ?? previousRecord?.employee_id ?? "").trim();
  const desiredName = String(nextRecord.staff_name ?? previousRecord?.staff_name ?? "").trim().toLowerCase();
  if (!desiredEmail && !desiredEmployeeId && !desiredName) {
    return null;
  }

  return listEntityRecords("Staff", { limit: 500 }).find((record) => {
    const recordEmail = String(record.email || "").trim().toLowerCase();
    const recordEmployeeId = String(record.employee_id || "").trim();
    const recordName = String(record.name || "").trim().toLowerCase();

    return Boolean(
      (desiredEmail && recordEmail && desiredEmail === recordEmail)
      || (desiredEmployeeId && recordEmployeeId && desiredEmployeeId === recordEmployeeId)
      || (desiredName && recordName && desiredName === recordName)
    );
  }) || null;
}

function prepareBaseTimeEntry(nextInput: Record<string, unknown>, previousRecord?: Record<string, unknown> | null) {
  const nextRecord = { ...nextInput };
  const relatedStaff = findRelatedStaffRecord(nextRecord, previousRecord);
  const staffId = String(nextRecord.staff_id ?? previousRecord?.staff_id ?? relatedStaff?.id ?? "").trim();
  if (!staffId) {
    throw new RouteRequestError(400, "invalid_time_entry", "Staff member is required.");
  }

  nextRecord.staff_id = staffId;
  nextRecord.job_id = String(nextRecord.job_id ?? previousRecord?.job_id ?? "").trim();
  nextRecord.job_operation_id = String(nextRecord.job_operation_id ?? previousRecord?.job_operation_id ?? "").trim();
  nextRecord.job_operation_label = String(nextRecord.job_operation_label ?? previousRecord?.job_operation_label ?? "").trim().slice(0, 160);
  nextRecord.workflow_phase = String(nextRecord.workflow_phase ?? previousRecord?.workflow_phase ?? "").trim().slice(0, 80);
  nextRecord.activity = String(nextRecord.activity ?? previousRecord?.activity ?? "Labour").trim().slice(0, 120) || "Labour";
  nextRecord.description = String(nextRecord.description ?? previousRecord?.description ?? "").trim().slice(0, 2000);
  nextRecord.notes = String(nextRecord.notes ?? nextRecord.description ?? previousRecord?.notes ?? "").trim().slice(0, 2000);
  nextRecord.location_type = String(nextRecord.location_type ?? previousRecord?.location_type ?? "workshop").trim().slice(0, 40) || "workshop";
  nextRecord.session_group_id = String(nextRecord.session_group_id ?? previousRecord?.session_group_id ?? "").trim().slice(0, 160);
  nextRecord.manual_override = Boolean(nextRecord.manual_override ?? previousRecord?.manual_override ?? false);
  nextRecord.manual_reason = String(nextRecord.manual_reason ?? previousRecord?.manual_reason ?? "").trim().slice(0, 500);
  nextRecord.resume_context =
    nextRecord.resume_context && typeof nextRecord.resume_context === "object"
      ? nextRecord.resume_context
      : previousRecord?.resume_context && typeof previousRecord.resume_context === "object"
        ? previousRecord.resume_context
        : null;

  const breakMinutes = Number(nextRecord.break_minutes ?? previousRecord?.break_minutes ?? 0);
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) {
    throw new RouteRequestError(400, "invalid_time_entry", "Break minutes must be between 0 and 600.");
  }
  nextRecord.break_minutes = breakMinutes;

  const isBreak = Boolean(nextRecord.is_break ?? previousRecord?.is_break ?? false) || String(nextRecord.activity || "").trim().toLowerCase() === "break";
  nextRecord.is_break = isBreak;
  nextRecord.entry_kind = isBreak ? "break" : String(nextRecord.entry_kind ?? previousRecord?.entry_kind ?? "work").trim().toLowerCase().slice(0, 40) || "work";
  if (isBreak) {
    nextRecord.activity = "Break";
  }

  nextRecord.staff_name = String(nextRecord.staff_name ?? relatedStaff?.name ?? previousRecord?.staff_name ?? "").trim().slice(0, 160);
  nextRecord.employee_id = String(nextRecord.employee_id ?? relatedStaff?.employee_id ?? previousRecord?.employee_id ?? "").trim().slice(0, 80);
  nextRecord.hourly_rate = Number(nextRecord.hourly_rate ?? relatedStaff?.hourly_rate ?? previousRecord?.hourly_rate ?? 0) || 0;

  const relatedJob = nextRecord.job_id ? getEntityRecord("Job", String(nextRecord.job_id)) : null;
  nextRecord.job_number = String(nextRecord.job_number ?? relatedJob?.job_number ?? previousRecord?.job_number ?? "").trim().slice(0, 80);
  nextRecord.job_name = String(nextRecord.job_name ?? relatedJob?.title ?? relatedJob?.job_name ?? previousRecord?.job_name ?? "").trim().slice(0, 180);
  nextRecord.job_title = String(nextRecord.job_title ?? relatedJob?.title ?? relatedJob?.job_name ?? previousRecord?.job_title ?? "").trim().slice(0, 180);
  nextRecord.customer = String(nextRecord.customer ?? relatedJob?.contact_name ?? relatedJob?.company_name ?? previousRecord?.customer ?? "").trim().slice(0, 180);
  nextRecord.company_name = String(nextRecord.company_name ?? relatedJob?.company_name ?? previousRecord?.company_name ?? "").trim().slice(0, 180);

  const relatedOperation = nextRecord.job_operation_id ? getEntityRecord("JobOperation", String(nextRecord.job_operation_id)) : null;
  nextRecord.job_operation_label = String(nextRecord.job_operation_label ?? relatedOperation?.name ?? relatedOperation?.title ?? relatedOperation?.operation ?? previousRecord?.job_operation_label ?? "").trim().slice(0, 160);
  nextRecord.workflow_phase = String(nextRecord.workflow_phase ?? relatedOperation?.workflow_phase ?? previousRecord?.workflow_phase ?? "").trim().slice(0, 80);
  nextRecord.operation = String(nextRecord.operation ?? relatedOperation?.operation ?? previousRecord?.operation ?? "").trim().slice(0, 80);

  const isChargeable = !isBreak && isChargeableActivity(nextRecord.activity);
  const requiresJob = !isBreak && activityRequiresJob(nextRecord.activity);
  if (requiresJob && !nextRecord.job_id) {
    throw new RouteRequestError(400, "job_link_required", "Chargeable labour must be linked to a job.");
  }

  if (!isBreak && !isChargeable && !nextRecord.job_id && requiresCommentWhenJobless(nextRecord.activity) && !nextRecord.description) {
    throw new RouteRequestError(400, "comment_required", "Add a comment before saving non-chargeable time without a job.");
  }

  if (nextRecord.manual_override && !nextRecord.manual_reason) {
    throw new RouteRequestError(400, "manual_reason_required", "Manual corrections must include a reason.");
  }

  const labourCategory = normalizeLabourCategory(nextRecord.labour_category) || deriveLabourCategory(nextRecord);
  if (!isBreak && !labourCategory) {
    throw new RouteRequestError(400, "labour_category_required", "Every job-costing entry must include a labour category.");
  }

  nextRecord.labour_category = isBreak ? "Other" : labourCategory;
  nextRecord.is_chargeable = isChargeable;
  nextRecord.excluded_from_costing = Boolean(nextRecord.excluded_from_costing ?? previousRecord?.excluded_from_costing ?? isBreak);
  nextRecord.excluded_from_payroll = Boolean(nextRecord.excluded_from_payroll ?? previousRecord?.excluded_from_payroll ?? false);

  return nextRecord;
}

export function normalizeTimeEntryPayload(
  nextInput: Record<string, unknown>,
  previousRecord?: Record<string, unknown> | null,
  options: { skipOverlapCheck?: boolean } = {}
) {
  const nextRecord = prepareBaseTimeEntry(nextInput, previousRecord);
  const status = normalizeTimeEntryStatus(nextRecord.status ?? previousRecord?.status);
  const nowIso = new Date().toISOString();
  const explicitClockIn = normalizeDateTime(nextInput.clock_in ?? previousRecord?.clock_in);
  const explicitClockOut = normalizeDateTime(nextInput.clock_out ?? previousRecord?.clock_out);
  const explicitPausedAt = normalizeDateTime(nextInput.paused_at ?? previousRecord?.paused_at);

  let segments = normalizeSegmentArray(nextInput.segments);
  if (segments.length === 0) {
    if ((explicitClockIn && explicitClockOut) || (explicitClockIn && status === "active")) {
      segments = explicitClockOut
        ? [{ started_at: explicitClockIn, ended_at: explicitClockOut, duration_minutes: calculateMinutesBetween(explicitClockIn, explicitClockOut) }]
        : [{ started_at: explicitClockIn }];
    } else {
      segments = normalizeStoredSegments({
        ...previousRecord,
        ...nextRecord,
        status,
        clock_in: explicitClockIn,
        clock_out: explicitClockOut,
      });
    }
  }

  if (status === "active") {
    const openIndex = getOpenSegmentIndex(segments);
    if (openIndex === -1) {
      segments = [
        ...segments,
        {
          started_at: explicitClockIn || nowIso,
        },
      ];
    }
  } else {
    const closeAt = explicitClockOut || explicitPausedAt || nowIso;
    segments = closeOpenSegments(segments, closeAt);
  }

  nextRecord.date = normalizeDateOnly(nextRecord.date ?? previousRecord?.date ?? getFirstStartedAt(segments) ?? nowIso);
  if (!nextRecord.date) {
    throw new RouteRequestError(400, "invalid_time_entry", "A valid time entry date is required.");
  }

  const derived = buildDerivedFields(nextRecord, segments, status);
  if (!options.skipOverlapCheck) {
    assertTimeEntryDoesNotOverlap(derived, String(previousRecord?.id || ""));
  }
  return derived;
}

function syncJobOperationFromTimeEntries(jobOperationId: string, actor: LocalUser | null, requestSource: string) {
  const normalizedOperationId = String(jobOperationId || "").trim();
  if (!normalizedOperationId) {
    return;
  }

  const operation = getEntityRecord("JobOperation", normalizedOperationId);
  if (!operation) {
    return;
  }

  const linkedEntries = listEntityRecords("TimeEntry", { filters: { job_operation_id: normalizedOperationId }, limit: 2000 });
  const workEntries = linkedEntries.filter((entry) => !Boolean(entry.is_break));
  const actualHours = roundHours(workEntries.reduce((sum, entry) => sum + getLiveTrackedMinutes(entry) / 60, 0));
  const activeEntries = workEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) === "active");

  const actualStartDate = normalizeDateOnly(
    workEntries
      .map((entry) => getFirstStartedAt(normalizeStoredSegments(entry)) || String(entry.date || ""))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))[0] || operation.actual_start_date
  );

  let nextStatus = String(operation.status || "pending").trim().toLowerCase() || "pending";
  if (activeEntries.length > 0 || actualHours > 0) {
    if (nextStatus === "pending" || nextStatus === "ready") {
      nextStatus = "in_progress";
    }
  } else if (nextStatus === "in_progress") {
    nextStatus = "pending";
  }

  const updatedOperation = updateEntityRecord("JobOperation", normalizedOperationId, {
    actual_hours: actualHours,
    actual_start_date: actualStartDate,
    status: nextStatus,
  }, {
    actor,
    request_source: requestSource,
  });

  if (updatedOperation?.job_id) {
    reconcileJobWorkflowStatuses(String(updatedOperation.job_id), {
      actor,
      requestSource,
    });
  }
}

export function syncTimeEntrySideEffects(
  previousRecord: Record<string, unknown> | null | undefined,
  nextRecord: Record<string, unknown> | null | undefined,
  actor: LocalUser | null,
  requestSource: string
) {
  const operationIds = new Set([
    String(previousRecord?.job_operation_id || "").trim(),
    String(nextRecord?.job_operation_id || "").trim(),
  ]);

  operationIds.forEach((operationId) => {
    if (operationId) {
      syncJobOperationFromTimeEntries(operationId, actor, requestSource);
    }
  });
}

function getActiveTimerForStaff(staffId: string, excludeId = "") {
  return listEntityRecords("TimeEntry", { filters: { staff_id: staffId }, limit: 1000 })
    .map((record) => normalizeTimeEntryPayload(record, record) as unknown as EntityRecord)
    .filter((record) => record.id !== excludeId && normalizeTimeEntryStatus(record.status) === "active")
    .sort((left, right) => String(getOpenSegment(normalizeStoredSegments(right))?.started_at || "").localeCompare(String(getOpenSegment(normalizeStoredSegments(left))?.started_at || "")))[0] || null;
}

function pauseRecordInternally(
  record: EntityRecord,
  updates: Record<string, unknown>,
  context: Required<Pick<MutationContext, "actor" | "requestSource">> & { expectedRowVersion?: number | null; now: Date; skipAudit?: boolean }
) {
  const current = normalizeTimeEntryPayload(record, record) as unknown as EntityRecord;
  if (normalizeTimeEntryStatus(current.status) === "completed") {
    throw new RouteRequestError(409, "invalid_time_entry_state", "Completed timers cannot be paused.");
  }
  if (normalizeTimeEntryStatus(current.status) === "paused") {
    return current;
  }

  const closedRecord = normalizeTimeEntryPayload({
    ...current,
    ...updates,
    status: "paused",
    paused_at: normalizeDateTime(updates.paused_at ?? updates.clock_out ?? context.now.toISOString()) || context.now.toISOString(),
    clock_out: normalizeDateTime(updates.clock_out ?? updates.paused_at ?? context.now.toISOString()) || context.now.toISOString(),
  }, current);

  return updateEntityRecord("TimeEntry", current.id, closedRecord, {
    actor: context.actor,
    request_source: context.requestSource,
    expected_row_version: context.expectedRowVersion ?? current.row_version,
    skip_audit: context.skipAudit,
  });
}

function sameTimerContext(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  return [
    "staff_id",
    "job_id",
    "job_operation_id",
    "activity",
    "location_type",
    "entry_kind",
    "is_break",
  ].every((key) => String(existing[key] || "") === String(incoming[key] || ""));
}

export function startTimer(payload: Record<string, unknown>, context: MutationContext = {}): StartTimerResult {
  const actor = context.actor || null;
  const requestSource = context.requestSource || "";
  const now = context.now || new Date();

  return runInTransaction(() => {
    const baseRecord = prepareBaseTimeEntry({
      ...payload,
      status: "active",
    });
    baseRecord.date = normalizeDateOnly(baseRecord.date || now) || formatLocalDate(now);
    if (!baseRecord.is_break && !hasOpenAttendanceClockIn(String(baseRecord.staff_id || ""))) {
      throw new RouteRequestError(409, "attendance_clock_in_required", "Clock in before starting job time.");
    }

    const existingActive = getActiveTimerForStaff(String(baseRecord.staff_id || ""));
    if (existingActive && sameTimerContext(existingActive, baseRecord)) {
      return {
        entry: existingActive,
        auto_paused_entry: null,
      };
    }

    const transitionAt = normalizeDateTime(payload.clock_in) || now.toISOString();
    const autoPausedEntry = existingActive
      ? pauseRecordInternally(existingActive, {
          paused_at: transitionAt,
          clock_out: transitionAt,
        }, {
          actor,
          requestSource,
          now,
          skipAudit: false,
        })
      : null;

    const created = createEntityRecord("TimeEntry", normalizeTimeEntryPayload({
      ...baseRecord,
      ...payload,
      status: "active",
      clock_in: transitionAt,
      segments: [{ started_at: transitionAt }],
    }), {
      actor,
      request_source: requestSource,
      skip_audit: context.skipAudit,
    });

    return {
      entry: created,
      auto_paused_entry: autoPausedEntry || null,
    };
  });
}

export function pauseTimer(entryId: string, updates: Record<string, unknown> = {}, context: MutationContext = {}) {
  const actor = context.actor || null;
  const requestSource = context.requestSource || "";
  const now = context.now || new Date();

  return runInTransaction(() => {
    const existing = getEntityRecord("TimeEntry", entryId);
    if (!existing) {
      return null;
    }

    const current = normalizeTimeEntryPayload(existing, existing, { skipOverlapCheck: true }) as unknown as EntityRecord;
    const staffEntries = getNormalizedStaffEntries(String(current.staff_id || ""));
    const requestedPauseAt = normalizeDateTime(updates.paused_at ?? updates.clock_out) || now.toISOString();
    const latestBoundary = findLatestStaffBoundaryBefore(
      staffEntries,
      current.id,
      getLastEndedAt(normalizeStoredSegments(current)) || requestedPauseAt,
      requestedPauseAt
    );
    const effectivePauseAt = requestedPauseAt;
    const repairedCurrent = repairMalformedSegmentOrdering(current, staffEntries, now)
      || (normalizeTimeEntryStatus(current.status) === "active" && latestBoundary
        ? {
            ...current,
            segments: clampOpenSegmentStart(normalizeStoredSegments(current), latestBoundary),
          }
        : current);

    return pauseRecordInternally(repairedCurrent as EntityRecord, {
      ...updates,
      paused_at: effectivePauseAt,
      clock_out: effectivePauseAt,
    }, {
      actor,
      requestSource,
      expectedRowVersion: context.expectedRowVersion ?? (typeof updates.row_version === "number" ? updates.row_version : null),
      now,
      skipAudit: context.skipAudit,
    });
  });
}

export function resumeTimer(entryId: string, updates: Record<string, unknown> = {}, context: MutationContext = {}): StartTimerResult | null {
  const actor = context.actor || null;
  const requestSource = context.requestSource || "";
  const now = context.now || new Date();

  return runInTransaction(() => {
    const existing = getEntityRecord("TimeEntry", entryId);
    if (!existing) {
      return null;
    }

    const current = normalizeTimeEntryPayload(existing, existing) as unknown as EntityRecord;
    const currentStatus = normalizeTimeEntryStatus(current.status);
    if (currentStatus === "completed") {
      throw new RouteRequestError(409, "invalid_time_entry_state", "Completed timers cannot be resumed.");
    }
    if (currentStatus === "active") {
      return {
        entry: current,
        auto_paused_entry: null,
      };
    }
    if (!current.is_break && !hasOpenAttendanceClockIn(String(current.staff_id || ""))) {
      throw new RouteRequestError(409, "attendance_clock_in_required", "Clock in before starting job time.");
    }

    const staffEntries = getNormalizedStaffEntries(String(current.staff_id || ""));
    const requestedResumeAt = normalizeDateTime(updates.clock_in) || now.toISOString();
    const resumedAt = resolveTimerResumeBoundary(current, requestedResumeAt, staffEntries);
    const existingActive = getActiveTimerForStaff(String(current.staff_id || ""), current.id);
    const autoPausedEntry = existingActive
      ? pauseRecordInternally(existingActive, {
          paused_at: resumedAt,
          clock_out: resumedAt,
        }, {
          actor,
          requestSource,
          now,
          skipAudit: false,
        })
      : null;

    const reopenedSegments = [
      ...normalizeStoredSegments(current),
      { started_at: resumedAt },
    ];
    const updated = updateEntityRecord("TimeEntry", current.id, buildActiveDerivedFields({
      ...current,
      ...updates,
      paused_at: "",
      clock_out: "",
    }, reopenedSegments), {
      actor,
      request_source: requestSource,
      expected_row_version: context.expectedRowVersion ?? (typeof updates.row_version === "number" ? updates.row_version : current.row_version),
      skip_audit: context.skipAudit,
    });

    if (!updated) {
      return null;
    }

    const repairedUpdated = repairMalformedSegmentOrdering(updated, [
      ...staffEntries.filter((entry) => entry.id !== updated.id),
      updated,
    ], now);
    const finalEntry = repairedUpdated
      ? (updateEntityRecord("TimeEntry", current.id, repairedUpdated, {
          actor,
          request_source: requestSource,
          expected_row_version: updated.row_version,
          skip_audit: context.skipAudit,
        }) || updated)
      : updated;

    return {
      entry: finalEntry,
      auto_paused_entry: autoPausedEntry || null,
    };
  });
}

export function completeTimer(entryId: string, updates: Record<string, unknown> = {}, context: MutationContext = {}) {
  const actor = context.actor || null;
  const requestSource = context.requestSource || "";
  const now = context.now || new Date();

  return runInTransaction(() => {
    const existing = getEntityRecord("TimeEntry", entryId);
    if (!existing) {
      return null;
    }

    const current = normalizeTimeEntryPayload(existing, existing, { skipOverlapCheck: true }) as unknown as EntityRecord;
    if (normalizeTimeEntryStatus(current.status) === "completed") {
      return current;
    }

    const staffEntries = getNormalizedStaffEntries(String(current.staff_id || ""));
    const requestedCompletedAt = normalizeDateTime(updates.clock_out ?? updates.completed_at) || now.toISOString();
    const latestBoundary = findLatestStaffBoundaryBefore(
      staffEntries,
      current.id,
      getLastEndedAt(normalizeStoredSegments(current)) || requestedCompletedAt,
      requestedCompletedAt
    );
    const completedAt = requestedCompletedAt;
    const repairedCurrent = repairMalformedSegmentOrdering(current, staffEntries, now)
      || (normalizeTimeEntryStatus(current.status) === "active" && latestBoundary
        ? {
            ...current,
            segments: clampOpenSegmentStart(normalizeStoredSegments(current), latestBoundary),
          }
        : current);

    return updateEntityRecord("TimeEntry", current.id, normalizeTimeEntryPayload({
      ...repairedCurrent,
      ...updates,
      status: "completed",
      clock_out: completedAt,
      paused_at: "",
    }, current), {
      actor,
      request_source: requestSource,
      expected_row_version: context.expectedRowVersion ?? (typeof updates.row_version === "number" ? updates.row_version : current.row_version),
      skip_audit: context.skipAudit,
    });
  });
}

export function repairTimeTrackingData(context: MutationContext = {}) {
  const actor = context.actor || null;
  const requestSource = context.requestSource || "time-tracking-repair";
  const now = context.now || new Date();

  runInTransaction(() => {
    const allEntries = listEntityRecords("TimeEntry", { limit: 10_000 });

    allEntries.forEach((entry) => {
      const normalized = normalizeTimeEntryPayload(entry, entry, { skipOverlapCheck: true });
      const currentJson = JSON.stringify({
        ...entry,
        row_version: undefined,
        created_date: undefined,
        updated_date: undefined,
      });
      const nextJson = JSON.stringify({
        ...normalized,
        row_version: undefined,
        created_date: undefined,
        updated_date: undefined,
      });

      if (currentJson !== nextJson) {
        updateEntityRecord("TimeEntry", entry.id, normalized, {
          actor,
          request_source: requestSource,
          expected_row_version: entry.row_version,
          skip_audit: true,
        });
      }
    });

    const groupedByStaff = new Map<string, EntityRecord[]>();
    listEntityRecords("TimeEntry", { limit: 10_000 })
      .filter((entry) => normalizeTimeEntryStatus(entry.status) === "active")
      .forEach((entry) => {
        const staffId = String(entry.staff_id || "").trim();
        if (!staffId) {
          return;
        }

        const collection = groupedByStaff.get(staffId) || [];
        collection.push(entry);
        groupedByStaff.set(staffId, collection);
      });

    groupedByStaff.forEach((entries) => {
      if (entries.length <= 1) {
        return;
      }

      const sorted = entries
        .map((entry) => normalizeTimeEntryPayload(entry, entry, { skipOverlapCheck: true }))
        .map((entry) => entry as unknown as EntityRecord)
        .sort((left, right) => String(getOpenSegment(normalizeStoredSegments(right))?.started_at || "").localeCompare(String(getOpenSegment(normalizeStoredSegments(left))?.started_at || "")));

      const keeper = sorted[0];
      const keeperStartedAt = getOpenSegment(normalizeStoredSegments(keeper))?.started_at || now.toISOString();

      sorted.slice(1).forEach((entry) => {
        const pauseAt = entry.clock_in && entry.clock_in < keeperStartedAt ? keeperStartedAt : now.toISOString();
        pauseRecordInternally(entry, { paused_at: pauseAt, clock_out: pauseAt }, {
          actor,
          requestSource,
          expectedRowVersion: entry.row_version,
          now,
          skipAudit: true,
        });
      });
    });

    listEntityRecords("TimeEntry", { limit: 10_000 })
      .reduce((accumulator, entry) => {
        const staffId = String(entry.staff_id || "").trim();
        if (!staffId) {
          return accumulator;
        }

        const collection = accumulator.get(staffId) || [];
        collection.push(entry);
        accumulator.set(staffId, collection);
        return accumulator;
      }, new Map<string, EntityRecord[]>())
      .forEach((entries) => {
        const sorted = entries
          .map((entry) => normalizeTimeEntryPayload(entry, entry, { skipOverlapCheck: true }))
          .map((entry) => entry as unknown as EntityRecord)
          .sort((left, right) => {
            const leftStartedAt = getFirstStartedAt(normalizeStoredSegments(left));
            const rightStartedAt = getFirstStartedAt(normalizeStoredSegments(right));
            return leftStartedAt.localeCompare(rightStartedAt);
          });

        for (let index = 0; index < sorted.length - 1; index += 1) {
          const current = sorted[index];
          const next = sorted[index + 1];

          if (normalizeTimeEntryStatus(current.status) === "active") {
            continue;
          }

          const currentSegments = normalizeStoredSegments(current);
          const nextSegments = normalizeStoredSegments(next);
          const currentEndedAt = getLastEndedAt(currentSegments);
          const nextStartedAt = getFirstStartedAt(nextSegments);
          if (!currentEndedAt || !nextStartedAt) {
            continue;
          }

          const currentEndedAtMs = new Date(currentEndedAt).getTime();
          const nextStartedAtMs = new Date(nextStartedAt).getTime();
          if (Number.isNaN(currentEndedAtMs) || Number.isNaN(nextStartedAtMs) || currentEndedAtMs <= nextStartedAtMs) {
            continue;
          }

          const overlapMs = currentEndedAtMs - nextStartedAtMs;
          if (overlapMs > 60_000) {
            continue;
          }

          const trimmedSegments = trimSegmentsAtBoundary(currentSegments, nextStartedAt);
          if (trimmedSegments.length === 0) {
            continue;
          }

          const repaired = normalizeTimeEntryPayload({
            ...current,
            segments: trimmedSegments,
            clock_out: nextStartedAt,
            paused_at: normalizeTimeEntryStatus(current.status) === "paused" ? nextStartedAt : "",
          }, current, { skipOverlapCheck: true });

          const updated = updateEntityRecord("TimeEntry", current.id, repaired, {
            actor,
            request_source: requestSource,
            expected_row_version: current.row_version,
            skip_audit: true,
          }) as EntityRecord | null;

          if (updated) {
            sorted[index] = updated;
          }
        }
      });

    listEntityRecords("TimeEntry", { limit: 10_000 })
      .reduce((accumulator, entry) => {
        const staffId = String(entry.staff_id || "").trim();
        if (!staffId) {
          return accumulator;
        }

        const collection = accumulator.get(staffId) || [];
        collection.push(entry);
        accumulator.set(staffId, collection);
        return accumulator;
      }, new Map<string, EntityRecord[]>())
      .forEach((entries) => {
        const normalizedEntries = entries
          .map((entry) => normalizeTimeEntryPayload(entry, entry, { skipOverlapCheck: true }))
          .map((entry) => entry as unknown as EntityRecord);

        normalizedEntries.forEach((entry) => {
          const repaired = repairMalformedSegmentOrdering(entry, normalizedEntries, now);
          if (!repaired) {
            return;
          }

          updateEntityRecord("TimeEntry", entry.id, repaired, {
            actor,
            request_source: requestSource,
            expected_row_version: entry.row_version,
            skip_audit: true,
          });
        });
      });
  });
}

export function ensureTimeTrackingConstraints() {
  executeDatabaseStatement(`
    CREATE UNIQUE INDEX IF NOT EXISTS entity_records_time_entry_active_staff_unique
    ON entity_records(json_extract(data, '$.staff_id'))
    WHERE entity = 'TimeEntry' AND json_extract(data, '$.status') = 'active'
  `);
}
