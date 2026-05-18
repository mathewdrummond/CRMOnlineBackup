import { normalizeDateOnly } from "./dateUtils";
import {
  createEntityRecord,
  deleteEntityRecord,
  getEntityRecord,
  listEntityRecords,
  runInTransaction,
  updateEntityRecord,
} from "./db";
import {
  ensureJobWorkflowTasks,
  reconcileJobWorkflowStatuses,
} from "./jobWorkflow";
import {
  autoScheduleInstallOperations,
  buildInstallPlannerLanes,
  InstallPlannerLaneRecord,
} from "./installScheduling";
import { buildInstallJobEstimates } from "./installEstimator";
import { RouteRequestError } from "./routeError";
import { EntityRecord, LocalUser } from "./types";

type InstallPlannerMutationContext = {
  actor: LocalUser | null;
  requestSource: string;
};

type SaveInstallPlannerEntryInput = {
  job_id: string;
  operation_id?: string;
  install_label?: string;
  title?: string;
  description?: string;
  install_type?: string;
  duration_hours?: number;
  priority?: string;
  deadline?: string;
  earliest_start?: string;
  latest_finish?: string;
  dependencies?: string[];
  assigned_staff_ids?: string[];
  assigned_crew_id?: string;
  required_crew_size?: number;
  required_skills?: string[];
  preferred_crew_id?: string;
  crew_assignment_locked?: boolean;
  lane_id?: string;
  location?: string;
  status?: string;
  manually_locked?: boolean;
  start_date: string;
  end_date?: string;
  notes?: string;
};

type DeleteInstallPlannerEntryInput = {
  job_id: string;
  operation_id?: string;
};

type InstallPlannerMutationResult = {
  jobs: EntityRecord[];
  operations: EntityRecord[];
  staff: EntityRecord[];
  crews: EntityRecord[];
  lanes: InstallPlannerLaneRecord[];
  estimator_settings: EntityRecord | null;
  job_estimates: Record<string, Record<string, unknown>>;
  job: EntityRecord;
  operation: EntityRecord | null;
};

export type InstallPlannerEntriesResult = {
  jobs: EntityRecord[];
  operations: EntityRecord[];
  staff: EntityRecord[];
  crews: EntityRecord[];
  lanes: InstallPlannerLaneRecord[];
  estimator_settings: EntityRecord | null;
  job_estimates: Record<string, Record<string, unknown>>;
};

const INSTALL_OPERATION_TYPES = new Set(["install"]);
const INSTALL_PHASES = new Set(["installation"]);
const DEFAULT_INSTALL_LABEL = "Installation";

function toText(value: unknown) {
  return String(value || "").trim();
}

function compareDateKeys(left: string, right: string) {
  return String(left || "").localeCompare(String(right || ""));
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
    // Legacy delimited strings are still allowed.
  }

  return raw.split(/[|,;]+/).map((item) => item.trim()).filter(Boolean);
}

function isInstallOperation(operation: EntityRecord | null | undefined) {
  const operationType = toText(operation?.operation).toLowerCase();
  const workflowPhase = toText(operation?.workflow_phase).toLowerCase();
  return INSTALL_OPERATION_TYPES.has(operationType) || (INSTALL_PHASES.has(workflowPhase) && !operationType);
}

function listInstallOperationsForJob(jobId: string) {
  return listEntityRecords("JobOperation", {
    filters: { job_id: jobId },
    limit: 5000,
  })
    .filter((operation) => isInstallOperation(operation))
    .sort((left, right) =>
      Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || compareDateKeys(toText(left.start_date), toText(right.start_date))
      || compareDateKeys(toText(left.created_date), toText(right.created_date))
    );
}

export function listInstallPlannerEntries(): InstallPlannerEntriesResult {
  return rebalanceInstallPlanner({
    actor: null,
    requestSource: "install-planner-list",
  });
}

function getInstallWindow(operations: EntityRecord[]) {
  const scheduledOperations = operations
    .filter((operation) => toText(operation.start_date))
    .map((operation) => ({
      operation_type: toText(operation.operation).toLowerCase(),
      start_date: normalizeDateOnly(operation.start_date),
      end_date: normalizeDateOnly(operation.end_date || operation.start_date),
    }))
    .filter((operation) => operation.start_date)
    .map((operation) => ({
      operation_type: operation.operation_type,
      start_date: operation.start_date,
      end_date: operation.end_date && operation.end_date >= operation.start_date
        ? operation.end_date
        : operation.start_date,
    }));

  if (scheduledOperations.length === 0) {
    return {
      installDate: "",
      installEndDate: "",
    };
  }

  const primaryInstallOperations = scheduledOperations.filter((operation) => operation.operation_type === "install");
  const installWindowOperations = primaryInstallOperations.length > 0
    ? primaryInstallOperations
    : scheduledOperations;

  const sortedByStart = installWindowOperations
    .slice()
    .sort((left, right) => compareDateKeys(left.start_date, right.start_date));
  const sortedByEnd = installWindowOperations
    .slice()
    .sort((left, right) => compareDateKeys(left.end_date, right.end_date));

  return {
    installDate: sortedByStart[0]?.start_date || "",
    installEndDate: sortedByEnd[sortedByEnd.length - 1]?.end_date || sortedByStart[0]?.start_date || "",
  };
}

function applyOperationStatusLifecycle(
  status: string,
  startDate: string,
  endDate: string,
  previousOperation?: EntityRecord | null
) {
  const normalizedStatus = toText(status).toLowerCase() || "scheduled";
  const previousActualStart = normalizeDateOnly(previousOperation?.actual_start_date);
  const previousActualCompletion = normalizeDateOnly(previousOperation?.actual_completion_date);

  const nextActualStart =
    normalizedStatus === "in_progress" || normalizedStatus === "complete" || normalizedStatus === "completed"
      ? (previousActualStart || startDate)
      : previousActualStart;
  const nextActualCompletion =
    normalizedStatus === "complete" || normalizedStatus === "completed"
      ? (previousActualCompletion || endDate || startDate)
      : previousActualCompletion;

  return {
    actual_start_date: nextActualStart,
    actual_completion_date: nextActualCompletion,
  };
}

function syncJobInstallWindow(
  jobId: string,
  context: InstallPlannerMutationContext
) {
  const currentJob = getEntityRecord("Job", jobId);
  if (!currentJob) {
    throw new RouteRequestError(404, "job_not_found", "The linked job could not be found.");
  }

  const installOperations = listInstallOperationsForJob(jobId);
  const { installDate, installEndDate } = getInstallWindow(installOperations);
  const nextJobPatch: Record<string, unknown> = {};

  if (toText(currentJob.install_date) !== installDate) {
    nextJobPatch.install_date = installDate;
  }
  if (toText(currentJob.install_end_date) !== installEndDate) {
    nextJobPatch.install_end_date = installEndDate;
  }

  const updatedJob = Object.keys(nextJobPatch).length > 0
    ? updateEntityRecord("Job", jobId, {
      ...nextJobPatch,
      row_version: currentJob.row_version,
    }, {
      actor: context.actor,
      request_source: context.requestSource,
      expected_row_version: currentJob.row_version,
    })
    : currentJob;
  if (!updatedJob) {
    throw new RouteRequestError(404, "job_not_found", "The linked job could not be found.");
  }

  ensureJobWorkflowTasks(updatedJob, {
    actor: context.actor,
    requestSource: context.requestSource,
  });
  reconcileJobWorkflowStatuses(jobId, {
    actor: context.actor,
    requestSource: context.requestSource,
  });

  return {
    job: getEntityRecord("Job", jobId) || updatedJob,
    operations: listInstallOperationsForJob(jobId),
  };
}

function buildInstallOperationPayload(
  job: EntityRecord,
  input: SaveInstallPlannerEntryInput,
  existingOperation: EntityRecord | null,
  currentOperationCount: number,
  installEstimate: Record<string, unknown> | null,
  crewsById: Map<string, EntityRecord>
) {
  const startDate = normalizeDateOnly(input.start_date);
  const endDate = normalizeDateOnly(input.end_date || input.start_date) || startDate;
  const status = toText(input.status || existingOperation?.status || "scheduled") || "scheduled";
  const installLabel = toText(input.install_label || existingOperation?.task_name || DEFAULT_INSTALL_LABEL) || DEFAULT_INSTALL_LABEL;
  const notes = typeof input.notes === "string"
    ? input.notes.trim()
    : toText(existingOperation?.notes);
  const hasExplicitManualLock = typeof input.manually_locked === "boolean";
  const manuallyLocked = hasExplicitManualLock
    ? Boolean(input.manually_locked)
    : true;
  const dependencies = Array.isArray(input.dependencies)
    ? input.dependencies.map((value) => toText(value)).filter(Boolean)
    : Array.isArray(existingOperation?.dependencies)
      ? existingOperation.dependencies
      : existingOperation?.dependencies || existingOperation?.dependency_task_ids || [];
  const requiredSkills = Array.isArray(input.required_skills)
    ? input.required_skills.map((value) => toText(value)).filter(Boolean)
    : parseStringArray(existingOperation?.required_skills);
  const assignedCrewId = toText(input.assigned_crew_id || existingOperation?.assigned_crew_id || input.preferred_crew_id || existingOperation?.preferred_crew_id);
  const assignedCrew = crewsById.get(assignedCrewId) || null;
  const preferredCrewId = toText(input.preferred_crew_id || existingOperation?.preferred_crew_id || assignedCrewId);
  const assignedStaffIds = Array.isArray(input.assigned_staff_ids)
    ? input.assigned_staff_ids.map((value) => toText(value)).filter(Boolean)
    : parseStringArray(existingOperation?.assigned_staff_ids);
  const estimatedDurationHours = Number(
    installEstimate?.estimated_install_hours
      ?? existingOperation?.estimated_duration_hours_original
      ?? existingOperation?.estimated_hours
      ?? 10.5
  ) || 10.5;
  const nextDurationHours = Number(input.duration_hours ?? existingOperation?.duration_hours ?? existingOperation?.estimated_hours ?? estimatedDurationHours) || estimatedDurationHours;
  const suggestedCrewSize = Math.max(1, Number(
    existingOperation?.suggested_crew_size
      ?? installEstimate?.suggested_crew_size
      ?? input.required_crew_size
      ?? 1
  ) || 1);
  const requiredCrewSize = Math.max(1, Number(input.required_crew_size ?? existingOperation?.required_crew_size ?? suggestedCrewSize) || suggestedCrewSize);
  const originalEstimatedDuration = Number(existingOperation?.estimated_duration_hours_original ?? estimatedDurationHours) || estimatedDurationHours;
  const estimateAssumptions = existingOperation?.estimator_assumptions || installEstimate?.assumptions || {};
  const estimatedDurationDays = Number(existingOperation?.estimated_duration_days ?? installEstimate?.estimated_install_days ?? nextDurationHours / 10.5) || (nextDurationHours / 10.5);
  const estimateConfidence = toText(existingOperation?.estimated_duration_confidence || installEstimate?.confidence || "medium") || "medium";
  const durationManuallyOverridden = Math.abs(nextDurationHours - originalEstimatedDuration) > 0.01;
  const lifecyclePatch = applyOperationStatusLifecycle(status, startDate, endDate, existingOperation);

  return {
    task_name: installLabel,
    title: toText(input.title || existingOperation?.title || job.title || installLabel) || installLabel,
    description: toText(input.description || existingOperation?.description || notes),
    operation: "install",
    workflow_phase: "installation",
    install_type: toText(input.install_type || existingOperation?.install_type || "install") || "install",
    duration_hours: nextDurationHours,
    estimated_hours: nextDurationHours,
    estimated_duration_hours_original: originalEstimatedDuration,
    estimated_duration_days: estimatedDurationDays,
    estimated_duration_confidence: estimateConfidence,
    estimator_assumptions: estimateAssumptions,
    duration_manually_overridden: durationManuallyOverridden,
    priority: toText(input.priority || existingOperation?.priority || "medium") || "medium",
    deadline: normalizeDateOnly(input.deadline || existingOperation?.deadline),
    earliest_start: normalizeDateOnly(input.earliest_start || existingOperation?.earliest_start || startDate),
    latest_finish: normalizeDateOnly(input.latest_finish || existingOperation?.latest_finish),
    dependencies,
    dependency_task_ids: dependencies,
    status,
    start_date: startDate,
    end_date: endDate >= startDate ? endDate : startDate,
    notes,
    location: toText(input.location || existingOperation?.location || job.site_address),
    manually_locked: manuallyLocked,
    schedule_manual_override: manuallyLocked || Boolean(existingOperation?.schedule_manual_override),
    job_id: job.id,
    job_number: toText(job.job_number),
    job_title: toText(job.title),
    assigned_to: assignedCrew?.name || (existingOperation ? existingOperation.assigned_to : ""),
    assigned_staff_ids: assignedStaffIds,
    assigned_crew_id: assignedCrewId,
    assigned_crew_name: assignedCrew?.name || toText(existingOperation?.assigned_crew_name),
    suggested_crew_size: suggestedCrewSize,
    required_crew_size: requiredCrewSize,
    required_skills: requiredSkills,
    preferred_crew_id: preferredCrewId,
    crew_assignment_locked: typeof input.crew_assignment_locked === "boolean"
      ? Boolean(input.crew_assignment_locked)
      : Boolean(existingOperation?.crew_assignment_locked),
    lane_id: toText(input.lane_id || existingOperation?.lane_id),
    sort_order: existingOperation ? Number(existingOperation.sort_order || 0) : currentOperationCount,
    ...lifecyclePatch,
  };
}

function listStaffRecords() {
  return listEntityRecords("Staff", {
    sort: "name",
    limit: 500,
  });
}

function listScheduleLanes() {
  return listEntityRecords("ScheduleLane", {
    sort: "sort_order",
    limit: 500,
  });
}

function listCrewRecords() {
  return listEntityRecords("Crew", {
    sort: "name",
    limit: 500,
  });
}

function listAllInstallOperations() {
  return listEntityRecords("JobOperation", { limit: 5000 })
    .filter((operation) => isInstallOperation(operation) && toText(operation.job_id))
    .sort((left, right) =>
      compareDateKeys(toText(left.start_date), toText(right.start_date))
      || compareDateKeys(toText(left.job_number), toText(right.job_number))
      || compareDateKeys(toText(left.created_date), toText(right.created_date))
    );
}

function readPlannerSnapshot(): InstallPlannerEntriesResult {
  const jobs = listEntityRecords("Job", {
    sort: "job_number",
    limit: 500,
  });
  const staff = listStaffRecords();
  const crews = listCrewRecords();
  const lanes = buildInstallPlannerLanes(staff, listScheduleLanes(), crews, "hybrid");
  const operations = listAllInstallOperations();
  const estimatorBundle = buildInstallJobEstimates(jobs);
  return {
    jobs,
    staff,
    crews,
    lanes,
    operations,
    estimator_settings: estimatorBundle.settings || null,
    job_estimates: estimatorBundle.estimates || {},
  };
}

export function rebalanceInstallPlanner(
  context: InstallPlannerMutationContext
): InstallPlannerEntriesResult {
  return runInTransaction(() => {
    const snapshot = readPlannerSnapshot();
    const scheduled = autoScheduleInstallOperations(snapshot.operations, snapshot.lanes, {
      crews: snapshot.crews as any,
    });
    const touchedJobIds = new Set<string>();

    scheduled.changedOperations.forEach(({ id, patch }) => {
      const currentOperation = getEntityRecord("JobOperation", id);
      if (!currentOperation) {
        return;
      }

      const updated = updateEntityRecord("JobOperation", id, {
        ...patch,
        row_version: currentOperation.row_version,
      }, {
        actor: context.actor,
        request_source: context.requestSource,
        expected_row_version: currentOperation.row_version,
      });

      if (updated?.job_id) {
        touchedJobIds.add(String(updated.job_id));
      }
    });

    touchedJobIds.forEach((jobId) => {
      syncJobInstallWindow(jobId, context);
    });

    return readPlannerSnapshot();
  });
}

export function saveInstallPlannerEntry(
  rawInput: SaveInstallPlannerEntryInput,
  context: InstallPlannerMutationContext
): InstallPlannerMutationResult {
  const jobId = toText(rawInput.job_id);
  const startDate = normalizeDateOnly(rawInput.start_date);
  const endDate = normalizeDateOnly(rawInput.end_date || rawInput.start_date) || startDate;
  const operationId = toText(rawInput.operation_id);

  if (!jobId) {
    throw new RouteRequestError(400, "job_required", "A job is required to save an install plan.");
  }
  if (!startDate) {
    throw new RouteRequestError(400, "install_start_required", "Install start date is required.");
  }
  if (endDate && endDate < startDate) {
    throw new RouteRequestError(400, "install_range_invalid", "Install end date cannot be before the start date.");
  }

  return runInTransaction(() => {
    const plannerSnapshot = readPlannerSnapshot();
    const crewsById = new Map((plannerSnapshot.crews || []).map((crew) => [String(crew.id || ""), crew]));
    const job = getEntityRecord("Job", jobId);
    if (!job) {
      throw new RouteRequestError(404, "job_not_found", "The linked job could not be found.");
    }

    const installOperations = listInstallOperationsForJob(jobId);
    const targetOperation = operationId
      ? installOperations.find((operation) => operation.id === operationId) || null
      : installOperations.find((operation) => !toText(operation.start_date)) || null;

    if (operationId && !targetOperation) {
      throw new RouteRequestError(404, "install_operation_not_found", "The install entry could not be found for this job.");
    }

    const payload = buildInstallOperationPayload(
      job,
      rawInput,
      targetOperation,
      installOperations.length,
      plannerSnapshot.job_estimates?.[jobId] || null,
      crewsById
    );
    const savedOperation = targetOperation
      ? updateEntityRecord("JobOperation", targetOperation.id, {
        ...payload,
        row_version: targetOperation.row_version,
      }, {
        actor: context.actor,
        request_source: context.requestSource,
        expected_row_version: targetOperation.row_version,
      })
      : createEntityRecord("JobOperation", {
        ...payload,
        estimated_hours: 0,
        actual_hours: 0,
      }, {
        actor: context.actor,
        request_source: context.requestSource,
      });
    if (!savedOperation) {
      throw new RouteRequestError(404, "install_operation_not_found", "The install entry could not be found for this job.");
    }

    const synced = syncJobInstallWindow(jobId, context);
    const desiredTaskName = toText(rawInput.install_label);
    const desiredNotes = typeof rawInput.notes === "string" ? rawInput.notes.trim() : null;
    const refreshedOperation = getEntityRecord("JobOperation", savedOperation.id);
    const finalOperation = refreshedOperation
      && (
        (desiredTaskName && desiredTaskName !== toText(refreshedOperation.task_name))
        || (desiredNotes != null && desiredNotes !== toText(refreshedOperation.notes))
      )
      ? updateEntityRecord("JobOperation", savedOperation.id, {
        task_name: desiredTaskName || refreshedOperation.task_name,
        notes: desiredNotes != null ? desiredNotes : refreshedOperation.notes,
        schedule_manual_override: true,
        row_version: refreshedOperation.row_version,
      }, {
        actor: context.actor,
        request_source: context.requestSource,
        expected_row_version: refreshedOperation.row_version,
      })
      : (refreshedOperation || savedOperation);
    if (!finalOperation) {
      throw new RouteRequestError(404, "install_operation_not_found", "The install entry could not be found for this job.");
    }
    const planned = rebalanceInstallPlanner({
      actor: context.actor,
      requestSource: `${context.requestSource}-rebalance`,
    });
    let refreshedFinalOperation = planned.operations.find((record) => record.id === finalOperation.id) || finalOperation;
    if (
      refreshedFinalOperation
      && (
        (desiredTaskName && desiredTaskName !== toText(refreshedFinalOperation.task_name))
        || (desiredNotes != null && desiredNotes !== toText(refreshedFinalOperation.notes))
      )
    ) {
      const updatedAfterRebalance = updateEntityRecord("JobOperation", refreshedFinalOperation.id, {
        task_name: desiredTaskName || refreshedFinalOperation.task_name,
        notes: desiredNotes != null ? desiredNotes : refreshedFinalOperation.notes,
        schedule_manual_override: Boolean(refreshedFinalOperation.schedule_manual_override),
        row_version: refreshedFinalOperation.row_version,
      }, {
        actor: context.actor,
        request_source: context.requestSource,
        expected_row_version: refreshedFinalOperation.row_version,
      });
      if (updatedAfterRebalance) {
        refreshedFinalOperation = updatedAfterRebalance;
      }
    }
    return {
      jobs: planned.jobs,
      operations: planned.operations,
      staff: planned.staff,
      crews: planned.crews,
      lanes: planned.lanes,
      estimator_settings: planned.estimator_settings,
      job_estimates: planned.job_estimates,
      job: planned.jobs.find((record) => record.id === synced.job.id) || synced.job,
      operation: refreshedFinalOperation,
    };
  });
}

export function deleteInstallPlannerEntry(
  rawInput: DeleteInstallPlannerEntryInput,
  context: InstallPlannerMutationContext
): InstallPlannerMutationResult {
  const jobId = toText(rawInput.job_id);
  const operationId = toText(rawInput.operation_id);

  if (!jobId) {
    throw new RouteRequestError(400, "job_required", "A job is required to remove an install plan.");
  }

  return runInTransaction(() => {
    const job = getEntityRecord("Job", jobId);
    if (!job) {
      throw new RouteRequestError(404, "job_not_found", "The linked job could not be found.");
    }

    let deletedOperation: EntityRecord | null = null;

    if (operationId) {
      const existingOperation = getEntityRecord("JobOperation", operationId);
      if (!existingOperation || String(existingOperation.job_id || "") !== jobId || !isInstallOperation(existingOperation)) {
        throw new RouteRequestError(404, "install_operation_not_found", "The install entry could not be found for this job.");
      }

      if (existingOperation.is_workflow_task || existingOperation.is_system_generated) {
        deletedOperation = updateEntityRecord("JobOperation", operationId, {
          start_date: "",
          end_date: "",
          schedule_manual_override: true,
          row_version: existingOperation.row_version,
        }, {
          actor: context.actor,
          request_source: context.requestSource,
          expected_row_version: existingOperation.row_version,
        });
        if (!deletedOperation) {
          throw new RouteRequestError(404, "install_operation_not_found", "The install entry could not be found for this job.");
        }
      } else {
        deleteEntityRecord("JobOperation", operationId, {
          actor: context.actor,
          request_source: context.requestSource,
          expected_row_version: existingOperation.row_version,
        });
        deletedOperation = existingOperation;
      }
    } else {
      updateEntityRecord("Job", jobId, {
        install_date: "",
        install_end_date: "",
        row_version: job.row_version,
      }, {
        actor: context.actor,
        request_source: context.requestSource,
        expected_row_version: job.row_version,
      });
    }

    const synced = syncJobInstallWindow(jobId, context);
    const planned = rebalanceInstallPlanner({
      actor: context.actor,
      requestSource: `${context.requestSource}-rebalance`,
    });
    return {
      jobs: planned.jobs,
      operations: planned.operations,
      staff: planned.staff,
      crews: planned.crews,
      lanes: planned.lanes,
      estimator_settings: planned.estimator_settings,
      job_estimates: planned.job_estimates,
      job: planned.jobs.find((record) => record.id === synced.job.id) || synced.job,
      operation: deletedOperation,
    };
  });
}
