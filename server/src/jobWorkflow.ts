import {
  createEntityRecord,
  getEntityRecord,
  listEntityRecords,
  updateEntityRecord,
} from "./db";
import { formatLocalDate, normalizeDateOnly } from "./dateUtils";
import { EntityRecord, MutationActor } from "./types";

export const JOB_WORKFLOW_PHASES = [
  "enquiry",
  "measure",
  "design_pricing",
  "client_follow_up",
  "pre_production",
  "manufacturing",
  "installation",
  "completion",
] as const;

export const WORKFLOW_ROLE_KEYS = [
  "management",
  "joiner",
  "install",
] as const;

type WorkflowRoleKey = typeof WORKFLOW_ROLE_KEYS[number];
type WorkflowRecordScope = "quote" | "job";

type WorkflowTemplateDefinition = {
  id: string;
  template_key: string;
  record_scope: WorkflowRecordScope;
  trigger_event: "quote_created" | "quote_progressed" | "job_created" | "job_progressed";
  name: string;
  phase: string;
  role_key: WorkflowRoleKey;
  operation_type: string;
  schedule_category: "commercial" | "planning" | "manufacturing" | "installation" | "completion";
  estimated_hours: number;
  estimated_hours_ratio?: number;
  sort_order: number;
  job_types: string[];
  dependencies?: string[];
  is_active?: boolean;
  notes?: string;
  planned_anchor: string;
  anchor_offset_days?: number;
  explicit_duration_days?: number;
};

type MutationOptions = {
  actor?: MutationActor | null;
  requestSource?: string;
  skipAudit?: boolean;
};

type WorkflowTaskBuildContext = {
  record: EntityRecord;
  templatesByKey: Map<string, EntityRecord>;
  roleMappings: Map<string, EntityRecord>;
  laneMap: Map<string, EntityRecord>;
  existingTasksByKey: Map<string, EntityRecord>;
};

const DEFAULT_ROLE_MAPPINGS = [
  {
    id: "workflow-role-management",
    role_key: "management",
    label: "Management",
    description: "Commercial decisions, production coordination, procurement, and handoff tasks.",
    color: "blue",
    default_staff_names: [],
    sort_order: 0,
    is_active: true,
  },
  {
    id: "workflow-role-joiner",
    role_key: "joiner",
    label: "Joiner",
    description: "Workshop preparation, manufacture, assembly, and QA packing work.",
    color: "amber",
    default_staff_names: [],
    sort_order: 1,
    is_active: true,
  },
  {
    id: "workflow-role-install",
    role_key: "install",
    label: "Install",
    description: "Pre-install checks, delivery, installation, snagging, and practical completion.",
    color: "emerald",
    default_staff_names: [],
    sort_order: 2,
    is_active: true,
  },
];

const DEFAULT_TASK_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: "quote-template-brief-review",
    template_key: "quote_brief_review",
    record_scope: "quote",
    trigger_event: "quote_created",
    name: "Review client brief and scope gaps",
    phase: "enquiry",
    role_key: "management",
    operation_type: "design",
    schedule_category: "commercial",
    estimated_hours: 1.5,
    sort_order: 0,
    job_types: ["default", "cabinetry_standard"],
    planned_anchor: "quote_created_date",
    anchor_offset_days: 0,
  },
  {
    id: "quote-template-measure-confirmation",
    template_key: "quote_measure_confirmation",
    record_scope: "quote",
    trigger_event: "quote_created",
    name: "Confirm site measure / dimensions",
    phase: "measure",
    role_key: "management",
    operation_type: "design",
    schedule_category: "commercial",
    estimated_hours: 2,
    sort_order: 1,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_brief_review"],
    planned_anchor: "quote_created_date",
    anchor_offset_days: 1,
  },
  {
    id: "quote-template-missing-info",
    template_key: "quote_missing_information",
    record_scope: "quote",
    trigger_event: "quote_created",
    name: "Collect missing information and approvals",
    phase: "enquiry",
    role_key: "management",
    operation_type: "other",
    schedule_category: "commercial",
    estimated_hours: 1.25,
    sort_order: 2,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_brief_review"],
    planned_anchor: "quote_created_date",
    anchor_offset_days: 1,
  },
  {
    id: "quote-template-scope-pack",
    template_key: "quote_scope_pack",
    record_scope: "quote",
    trigger_event: "quote_created",
    name: "Prepare drawings, scope, and allowances",
    phase: "design_pricing",
    role_key: "management",
    operation_type: "design",
    schedule_category: "commercial",
    estimated_hours: 4,
    sort_order: 3,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_measure_confirmation", "quote_missing_information"],
    planned_anchor: "quote_created_date",
    anchor_offset_days: 2,
    explicit_duration_days: 2,
  },
  {
    id: "quote-template-pricing",
    template_key: "quote_pricing_pack",
    record_scope: "quote",
    trigger_event: "quote_created",
    name: "Prepare pricing and bought-out costs",
    phase: "design_pricing",
    role_key: "management",
    operation_type: "design",
    schedule_category: "commercial",
    estimated_hours: 3,
    sort_order: 4,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_measure_confirmation", "quote_missing_information"],
    planned_anchor: "quote_created_date",
    anchor_offset_days: 3,
  },
  {
    id: "quote-template-review",
    template_key: "quote_internal_review",
    record_scope: "quote",
    trigger_event: "quote_created",
    name: "Internal quote review and signoff",
    phase: "design_pricing",
    role_key: "management",
    operation_type: "other",
    schedule_category: "commercial",
    estimated_hours: 1,
    sort_order: 5,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_scope_pack", "quote_pricing_pack"],
    planned_anchor: "quote_created_date",
    anchor_offset_days: 4,
  },
  {
    id: "quote-template-send",
    template_key: "quote_send",
    record_scope: "quote",
    trigger_event: "quote_progressed",
    name: "Send quote and confirm issue pack",
    phase: "client_follow_up",
    role_key: "management",
    operation_type: "other",
    schedule_category: "commercial",
    estimated_hours: 0.5,
    sort_order: 6,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_internal_review"],
    planned_anchor: "quote_send_target",
  },
  {
    id: "quote-template-followup",
    template_key: "quote_follow_up",
    record_scope: "quote",
    trigger_event: "quote_progressed",
    name: "Follow up quote decision",
    phase: "client_follow_up",
    role_key: "management",
    operation_type: "other",
    schedule_category: "commercial",
    estimated_hours: 0.75,
    sort_order: 7,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["quote_send"],
    planned_anchor: "quote_follow_up_target",
  },
  {
    id: "job-template-site-measure",
    template_key: "site_measure",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Final site check and measure confirmation",
    phase: "measure",
    role_key: "management",
    operation_type: "design",
    schedule_category: "planning",
    estimated_hours: 2,
    sort_order: 10,
    job_types: ["default", "cabinetry_standard"],
    planned_anchor: "job_site_check_date",
  },
  {
    id: "job-template-pre-production",
    template_key: "pre_production_review",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Confirm final scope and production handoff",
    phase: "pre_production",
    role_key: "management",
    operation_type: "other",
    schedule_category: "planning",
    estimated_hours: 1.5,
    sort_order: 11,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["site_measure"],
    planned_anchor: "job_handoff_date",
  },
  {
    id: "job-template-design-pricing",
    template_key: "design_pricing",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Production drawings and job pack",
    phase: "pre_production",
    role_key: "management",
    operation_type: "design",
    schedule_category: "planning",
    estimated_hours: 6,
    sort_order: 12,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["site_measure"],
    planned_anchor: "job_drawings_date",
    explicit_duration_days: 2,
  },
  {
    id: "job-template-procurement-review",
    template_key: "procurement_review",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Hardware and material review",
    phase: "pre_production",
    role_key: "management",
    operation_type: "ordering",
    schedule_category: "planning",
    estimated_hours: 2,
    sort_order: 13,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["pre_production_review", "design_pricing"],
    planned_anchor: "job_procurement_review_date",
  },
  {
    id: "job-template-ordering",
    template_key: "order_materials",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Order materials and bought-out items",
    phase: "pre_production",
    role_key: "management",
    operation_type: "ordering",
    schedule_category: "planning",
    estimated_hours: 2,
    sort_order: 14,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["procurement_review"],
    planned_anchor: "job_ordering_date",
  },
  {
    id: "job-template-manufacturing",
    template_key: "manufacturing",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Workshop manufacture and assembly",
    phase: "manufacturing",
    role_key: "joiner",
    operation_type: "assembly",
    schedule_category: "manufacturing",
    estimated_hours: 24,
    estimated_hours_ratio: 0.55,
    sort_order: 15,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["procurement_review"],
    planned_anchor: "job_manufacture_start",
  },
  {
    id: "job-template-preinstall-check",
    template_key: "preinstall_check",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Pre-install check and access confirmation",
    phase: "installation",
    role_key: "management",
    operation_type: "delivery",
    schedule_category: "installation",
    estimated_hours: 1.5,
    sort_order: 16,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["order_materials"],
    planned_anchor: "job_preinstall_date",
  },
  {
    id: "job-template-installation",
    template_key: "installation",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Installation and site completion",
    phase: "installation",
    role_key: "install",
    operation_type: "install",
    schedule_category: "installation",
    estimated_hours: 12,
    estimated_hours_ratio: 0.2,
    sort_order: 17,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["manufacturing", "preinstall_check"],
    planned_anchor: "job_install_start",
  },
  {
    id: "job-template-completion",
    template_key: "completion_handover",
    record_scope: "job",
    trigger_event: "job_created",
    name: "Snag list, handover, and close-out",
    phase: "completion",
    role_key: "management",
    operation_type: "other",
    schedule_category: "completion",
    estimated_hours: 2,
    sort_order: 18,
    job_types: ["default", "cabinetry_standard"],
    dependencies: ["installation"],
    planned_anchor: "job_completion_follow_up",
  },
];

const FALLBACK_ROLE_DAY_CAPACITY: Record<string, number> = {
  management: 8,
  joiner: 16,
  install: 16,
};

function normaliseStatus(value: unknown) {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (normalized === "completed") {
    return "complete";
  }
  if (normalized === "scheduled") {
    return "ready";
  }
  if (["pending", "ready", "in_progress", "complete", "on_hold"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}

function normaliseJobType(value: unknown) {
  return String(value || "").trim().toLowerCase() || "cabinetry_standard";
}

function normaliseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normaliseRecordScope(value: unknown): WorkflowRecordScope {
  return String(value || "").trim().toLowerCase() === "quote" ? "quote" : "job";
}

function resolveWorkflowRecordScope(record: EntityRecord) {
  const explicitScope = String(record.record_scope || "").trim().toLowerCase();
  if (explicitScope === "quote" || explicitScope === "job") {
    return explicitScope;
  }

  if (String(record.quote_id || "").trim() && !String(record.job_id || "").trim()) {
    return "quote";
  }

  if (String(record.id || "").trim().toLowerCase().startsWith("quotetask-")) {
    return "quote";
  }

  return "job";
}

function addBusinessDays(value: unknown, days = 0) {
  const startDate = normalizeDateOnly(value) || normalizeDateOnly(new Date());
  if (!startDate) {
    return "";
  }

  const cursor = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(cursor.getTime())) {
    return "";
  }

  const direction = days >= 0 ? 1 : -1;
  let remaining = Math.abs(Number(days || 0));
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + direction);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return formatLocalDate(cursor);
}

function maxDateKey(...values: Array<unknown>) {
  const normalized = values.map(normalizeDateOnly).filter(Boolean);
  if (normalized.length === 0) {
    return "";
  }

  return normalized.sort((left, right) => left.localeCompare(right)).slice(-1)[0];
}

function minDateKey(...values: Array<unknown>) {
  const normalized = values.map(normalizeDateOnly).filter(Boolean);
  if (normalized.length === 0) {
    return "";
  }

  return normalized.sort((left, right) => left.localeCompare(right))[0];
}

function coalesceDateKey(...values: Array<unknown>) {
  return values.map(normalizeDateOnly).find(Boolean) || "";
}

function clampNotBefore(value: unknown, floorValue: unknown) {
  return maxDateKey(value, floorValue);
}

function matchesTemplateToRecord(template: EntityRecord, record: EntityRecord) {
  const templateJobTypes = normaliseStringArray(template.job_types);
  if (templateJobTypes.length === 0) {
    return true;
  }

  const jobType = normaliseJobType(record.job_type || record.workflow_template_key);
  return templateJobTypes.some((value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return normalizedValue === "default" || normalizedValue === jobType;
  });
}

function sortWorkflowTemplates(templates: EntityRecord[]) {
  return [...templates].sort((left, right) => {
    const sortDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    if (sortDifference !== 0) {
      return sortDifference;
    }
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function haveSameValues(existing: EntityRecord, nextValues: Record<string, unknown>) {
  return Object.entries(nextValues).every(([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value));
}

function listRoleMappings() {
  return listEntityRecords("WorkflowRoleMapping", { sort: "sort_order" });
}

function listWorkflowTemplates(scope?: WorkflowRecordScope) {
  return sortWorkflowTemplates(
    listEntityRecords("JobTaskTemplate", { sort: "sort_order" }).filter((record) => {
      if (record.is_active === false) {
        return false;
      }

      if (!scope) {
        return true;
      }

      return normaliseRecordScope(record.record_scope) === scope;
    })
  );
}

function getRoleLaneMap() {
  const lanes = listEntityRecords("ScheduleLane", { sort: "sort_order" });
  return new Map(
    lanes
      .filter((lane) => String(lane.workflow_role || "").trim())
      .map((lane) => [String(lane.workflow_role || "").trim().toLowerCase(), lane])
  );
}

function listWorkflowTasksForRecord(scope: WorkflowRecordScope, recordId: string) {
  const filters = scope === "quote" ? { quote_id: recordId } : { job_id: recordId };
  return listEntityRecords("JobOperation", {
    filters,
    sort: "sort_order",
  }).filter((record) => Boolean(record.is_workflow_task) && resolveWorkflowRecordScope(record) === scope);
}

function calculateEstimatedHours(template: EntityRecord, record: EntityRecord) {
  const baseHours = Number(template.estimated_hours || 0);
  const budgetHours = Number(record.budget_hours || 0);
  const ratioHours = Number(template.estimated_hours_ratio || 0) > 0 && budgetHours > 0
    ? Math.round((budgetHours * Number(template.estimated_hours_ratio || 0)) * 100) / 100
    : 0;

  return Math.max(baseHours, ratioHours);
}

function calculateDurationDays(template: EntityRecord, estimatedHours: number, roleKey: string) {
  const explicitDuration = Number(template.explicit_duration_days || 0);
  if (explicitDuration > 0) {
    return explicitDuration;
  }

  const dailyCapacity = Math.max(4, Number(FALLBACK_ROLE_DAY_CAPACITY[roleKey] || 8));
  return Math.max(1, Math.ceil(Math.max(estimatedHours, 1) / dailyCapacity));
}

function calculateEndDate(startDate: string, durationDays: number) {
  if (!startDate) {
    return "";
  }

  return addBusinessDays(startDate, Math.max(0, Number(durationDays || 1) - 1));
}

function deriveQuoteAnchorMap(quote: EntityRecord) {
  const createdDate = coalesceDateKey(quote.created_date, new Date());
  const decisionDate = coalesceDateKey(quote.decision_due_date, quote.valid_until, addBusinessDays(createdDate, 10));
  const sendTarget = clampNotBefore(
    minDateKey(addBusinessDays(createdDate, 5), addBusinessDays(decisionDate, -5)) || addBusinessDays(createdDate, 5),
    addBusinessDays(createdDate, 4)
  );
  const followUpTarget = clampNotBefore(
    maxDateKey(addBusinessDays(sendTarget, 2), addBusinessDays(decisionDate, -2)),
    addBusinessDays(sendTarget, 1)
  );

  return {
    quote_created_date: createdDate,
    quote_send_target: sendTarget,
    quote_follow_up_target: followUpTarget,
    quote_decision_due_date: decisionDate,
  };
}

function deriveJobAnchorMap(job: EntityRecord) {
  const createdDate = coalesceDateKey(job.created_date, new Date());
  const installDate = coalesceDateKey(job.install_date, job.due_date, addBusinessDays(createdDate, 20));
  const manufactureStart = clampNotBefore(
    coalesceDateKey(job.start_date, addBusinessDays(installDate, -10), addBusinessDays(createdDate, 5)),
    createdDate
  );

  return {
    job_created_date: createdDate,
    job_site_check_date: clampNotBefore(addBusinessDays(manufactureStart, -7), createdDate),
    job_drawings_date: clampNotBefore(addBusinessDays(manufactureStart, -6), createdDate),
    job_handoff_date: clampNotBefore(addBusinessDays(manufactureStart, -5), createdDate),
    job_procurement_review_date: clampNotBefore(addBusinessDays(manufactureStart, -4), createdDate),
    job_ordering_date: clampNotBefore(addBusinessDays(manufactureStart, -3), createdDate),
    job_manufacture_start: manufactureStart,
    job_install_start: clampNotBefore(installDate, createdDate),
    job_preinstall_date: clampNotBefore(addBusinessDays(installDate, -3), createdDate),
    job_completion_follow_up: clampNotBefore(addBusinessDays(installDate, 2), installDate),
  };
}

function resolveTemplateStartDate(scope: WorkflowRecordScope, template: EntityRecord, record: EntityRecord) {
  const anchors = scope === "quote" ? deriveQuoteAnchorMap(record) : deriveJobAnchorMap(record);
  const anchorKey = String(template.planned_anchor || "").trim();
  const baseDate = anchors[anchorKey as keyof typeof anchors] || coalesceDateKey(record.created_date, new Date());
  const offsetDays = Number(template.anchor_offset_days || 0);
  return addBusinessDays(baseDate, offsetDays);
}

function getQuoteAutoCompleteTemplateKeys(quote: EntityRecord) {
  const normalizedStatus = String(quote.status || "draft").trim().toLowerCase();
  const completedTemplateKeys = new Set<string>();
  const approvalApproved = String(quote.approval_status || "").trim().toLowerCase() === "approved";
  const signoffComplete = Boolean(
    quote.quote_scope_signed_off
    && quote.quote_drawings_signed_off
    && quote.quote_pricing_signed_off
    && quote.quote_client_brief_signed_off
  );

  if (["awaiting_mathew", "quote_complete", "awaiting_confirmation", "won", "sent", "accepted"].includes(normalizedStatus)) {
    completedTemplateKeys.add("quote_brief_review");
    completedTemplateKeys.add("quote_measure_confirmation");
    completedTemplateKeys.add("quote_missing_information");
    completedTemplateKeys.add("quote_scope_pack");
    completedTemplateKeys.add("quote_pricing_pack");
  }

  if (approvalApproved || signoffComplete || ["quote_complete", "awaiting_confirmation", "won", "sent", "accepted"].includes(normalizedStatus)) {
    completedTemplateKeys.add("quote_internal_review");
  }

  if (["awaiting_confirmation", "won", "sent", "accepted"].includes(normalizedStatus)) {
    completedTemplateKeys.add("quote_send");
  }

  if (["won", "accepted"].includes(normalizedStatus)) {
    completedTemplateKeys.add("quote_follow_up");
  }

  return completedTemplateKeys;
}

function buildTaskPayload(
  scope: WorkflowRecordScope,
  template: EntityRecord,
  context: WorkflowTaskBuildContext
) {
  const roleKey = String(template.role_key || "").trim().toLowerCase();
  const roleLane = context.laneMap.get(roleKey) || null;
  const dependencyTemplateKeys = normaliseStringArray(template.dependencies);
  const estimatedHours = calculateEstimatedHours(template, context.record);
  const durationDays = calculateDurationDays(template, estimatedHours, roleKey);
  const startDate = resolveTemplateStartDate(scope, template, context.record);
  const endDate = calculateEndDate(startDate, durationDays);
  const dependencyTaskIds = dependencyTemplateKeys
    .map((templateKey) => context.existingTasksByKey.get(templateKey)?.id || buildWorkflowTaskId(scope, context.record.id, templateKey))
    .filter(Boolean);

  const basePayload = {
    task_name: template.name || "",
    operation: template.operation_type || "other",
    workflow_phase: template.phase || "",
    workflow_role: roleKey,
    workflow_template_id: template.id,
    workflow_template_key: template.template_key || "",
    dependency_template_keys: dependencyTemplateKeys,
    dependency_task_ids: dependencyTaskIds,
    assigned_role: roleKey,
    assigned_to: "",
    lane_id: roleLane?.id || "",
    estimated_hours: estimatedHours,
    actual_hours: 0,
    notes: template.notes || "",
    is_workflow_task: true,
    is_template_enabled: true,
    is_system_generated: true,
    is_unassigned_placeholder: true,
    record_scope: scope,
    generation_stage: template.trigger_event || "",
    schedule_category: template.schedule_category || "",
    job_type: normaliseJobType(context.record.job_type || context.record.workflow_template_key),
    sort_order: Number(template.sort_order || 0),
    start_date: startDate,
    end_date: endDate || startDate,
    schedule_manual_override: false,
  };

  if (scope === "quote") {
    return {
      ...basePayload,
      quote_id: context.record.id,
      quote_number: context.record.quote_number || "",
      quote_title: context.record.title || "",
      title: context.record.title || "",
      job_id: "",
      job_number: "",
      job_title: "",
    };
  }

  return {
    ...basePayload,
    job_id: context.record.id,
    job_number: context.record.job_number || "",
    job_title: context.record.title || "",
    title: context.record.title || "",
    quote_id: context.record.quote_id || "",
    quote_number: context.record.quote_number || "",
    quote_title: context.record.quote_snapshot && typeof context.record.quote_snapshot === "object"
      ? String((context.record.quote_snapshot as Record<string, unknown>).title || "")
      : "",
  };
}

function buildWorkflowTaskId(scope: WorkflowRecordScope, recordId: string, templateKey: string) {
  const prefix = scope === "quote" ? "quotetask" : "jobtask";
  return `${prefix}-${recordId}-${templateKey}`;
}

function shouldPreserveManualStatus(task: EntityRecord) {
  const normalizedStatus = normaliseStatus(task.status);
  return ["in_progress", "on_hold", "complete"].includes(normalizedStatus);
}

function shouldSkipScheduleUpdate(task: EntityRecord) {
  return Boolean(task.schedule_manual_override);
}

function upsertWorkflowTasks(
  scope: WorkflowRecordScope,
  record: EntityRecord,
  options: MutationOptions = {}
) {
  if (!record?.id) {
    return [];
  }

  ensureJobWorkflowDefaults(options);

  const existingTasks = listWorkflowTasksForRecord(scope, record.id);
  const existingTasksByKey = new Map(
    existingTasks.map((task) => [String(task.workflow_template_key || "").trim(), task])
  );
  const workflowTemplates = listWorkflowTemplates(scope).filter((template) => matchesTemplateToRecord(template, record));
  const roleMappings = new Map(
    listRoleMappings().map((roleMapping) => [String(roleMapping.role_key || "").trim().toLowerCase(), roleMapping])
  );
  const laneMap = getRoleLaneMap();
  const createdOrUpdatedTasks: EntityRecord[] = [];
  const autoCompleteQuoteTasks = scope === "quote" ? getQuoteAutoCompleteTemplateKeys(record) : new Set<string>();

  workflowTemplates.forEach((template) => {
    const templateKey = String(template.template_key || "").trim();
    const taskId = buildWorkflowTaskId(scope, record.id, templateKey);
    const existingTask = existingTasksByKey.get(templateKey)
      || (() => {
        const legacyTask = getEntityRecord("JobOperation", taskId);
        if (!legacyTask || !legacyTask.is_workflow_task) {
          return null;
        }

        const relatedRecordId = scope === "quote"
          ? String(legacyTask.quote_id || "").trim()
          : String(legacyTask.job_id || "").trim();
        if (relatedRecordId !== String(record.id || "").trim()) {
          return null;
        }

        existingTasksByKey.set(templateKey, legacyTask);
        return legacyTask;
      })();
    const payload = buildTaskPayload(scope, template, {
      record,
      templatesByKey: new Map(workflowTemplates.map((item) => [String(item.template_key || "").trim(), item])),
      roleMappings,
      laneMap,
      existingTasksByKey,
    });
    const nextStatus = autoCompleteQuoteTasks.has(templateKey)
      ? "complete"
      : payload.dependency_task_ids.length > 0
        ? "pending"
        : "ready";

    if (!existingTask) {
      const createdTask = createEntityRecord("JobOperation", {
        id: taskId,
        ...payload,
        status: nextStatus,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-auto-create",
        skip_audit: options.skipAudit,
      });
      existingTasksByKey.set(templateKey, createdTask);
      createdOrUpdatedTasks.push(createdTask);
      return;
    }

    const updates: Record<string, unknown> = {
      task_name: payload.task_name,
      operation: payload.operation,
      workflow_phase: payload.workflow_phase,
      workflow_role: payload.workflow_role,
      workflow_template_id: payload.workflow_template_id,
      workflow_template_key: payload.workflow_template_key,
      dependency_template_keys: payload.dependency_template_keys,
      dependency_task_ids: payload.dependency_task_ids,
      assigned_role: payload.assigned_role,
      lane_id: payload.lane_id,
      notes: payload.notes,
      is_workflow_task: true,
      is_template_enabled: true,
      is_system_generated: true,
      is_unassigned_placeholder: true,
      record_scope: payload.record_scope,
      generation_stage: payload.generation_stage,
      schedule_category: payload.schedule_category,
      sort_order: payload.sort_order,
      estimated_hours: payload.estimated_hours,
      job_type: payload.job_type,
    };

    if (scope === "quote") {
      updates.quote_id = payload.quote_id;
      updates.quote_number = payload.quote_number;
      updates.quote_title = payload.quote_title;
      updates.title = payload.title;
    } else {
      updates.job_id = payload.job_id;
      updates.job_number = payload.job_number;
      updates.job_title = payload.job_title;
      updates.quote_id = payload.quote_id;
      updates.quote_number = payload.quote_number;
      updates.quote_title = payload.quote_title;
      updates.title = payload.title;
    }

    if (!shouldSkipScheduleUpdate(existingTask)) {
      updates.start_date = payload.start_date;
      updates.end_date = payload.end_date;
      updates.schedule_manual_override = false;
    }

    if (!String(existingTask.assigned_to || "").trim()) {
      updates.assigned_to = "";
    }

    if (!shouldPreserveManualStatus(existingTask)) {
      updates.status = nextStatus;
    } else if (autoCompleteQuoteTasks.has(templateKey) && normaliseStatus(existingTask.status) !== "complete") {
      updates.status = "complete";
    }

    if (!haveSameValues(existingTask, updates)) {
      const updatedTask = updateEntityRecord("JobOperation", existingTask.id, {
        ...updates,
        row_version: existingTask.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-auto-sync",
        skip_audit: options.skipAudit,
        expected_row_version: existingTask.row_version,
      });

      if (updatedTask) {
        existingTasksByKey.set(templateKey, updatedTask);
        createdOrUpdatedTasks.push(updatedTask);
      }
    }
  });

  return createdOrUpdatedTasks.length > 0
    ? [...existingTasks.filter((task) => !createdOrUpdatedTasks.find((updated) => updated.id === task.id)), ...createdOrUpdatedTasks]
    : existingTasks;
}

function reconcileWorkflowStatuses(
  scope: WorkflowRecordScope,
  recordId: string,
  options: MutationOptions = {}
) {
  if (!recordId) {
    return [];
  }

  const workflowTasks = listWorkflowTasksForRecord(scope, recordId);
  if (workflowTasks.length === 0) {
    return [];
  }

  const taskById = new Map(workflowTasks.map((task) => [task.id, task]));
  const updatedTasks: EntityRecord[] = [];

  workflowTasks.forEach((task) => {
    if (shouldPreserveManualStatus(task)) {
      return;
    }

    const dependencyTaskIds = normaliseStringArray(task.dependency_task_ids);
    const dependenciesMet = dependencyTaskIds.every((dependencyId) => {
      const dependency = taskById.get(dependencyId);
      return dependency ? normaliseStatus(dependency.status) === "complete" : false;
    });

    const currentStatus = normaliseStatus(task.status);
    const nextStatus = dependenciesMet ? "ready" : "pending";

    if (nextStatus !== currentStatus) {
      const updated = updateEntityRecord("JobOperation", task.id, {
        status: nextStatus,
        row_version: task.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-reconcile",
        skip_audit: options.skipAudit,
        expected_row_version: task.row_version,
      });

      if (updated) {
        taskById.set(updated.id, updated);
        updatedTasks.push(updated);
      }
    }
  });

  return updatedTasks;
}

export function ensureJobWorkflowDefaults(options: MutationOptions = {}) {
  const roleMappings = listEntityRecords("WorkflowRoleMapping");
  const templates = listEntityRecords("JobTaskTemplate");

  DEFAULT_ROLE_MAPPINGS.forEach((roleMapping) => {
    const existing = roleMappings.find(
      (record) => String(record.role_key || "").trim().toLowerCase() === roleMapping.role_key
    );

    if (!existing) {
      createEntityRecord("WorkflowRoleMapping", roleMapping, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-defaults",
        skip_audit: options.skipAudit,
      });
      return;
    }

    if (!haveSameValues(existing, roleMapping)) {
      updateEntityRecord("WorkflowRoleMapping", existing.id, {
        ...roleMapping,
        row_version: existing.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-defaults",
        skip_audit: true,
        expected_row_version: existing.row_version,
      });
    }
  });

  DEFAULT_TASK_TEMPLATES.forEach((template) => {
    const existing = templates.find(
      (record) => String(record.template_key || "").trim().toLowerCase() === template.template_key
    );

    if (!existing) {
      createEntityRecord("JobTaskTemplate", {
        ...template,
        dependencies: template.dependencies || [],
        is_active: template.is_active !== false,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-defaults",
        skip_audit: options.skipAudit,
      });
      return;
    }

    const nextTemplateValues = {
      ...template,
      dependencies: template.dependencies || [],
      is_active: template.is_active !== false,
    };
    if (!haveSameValues(existing, nextTemplateValues)) {
      updateEntityRecord("JobTaskTemplate", existing.id, {
        ...nextTemplateValues,
        row_version: existing.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "workflow-defaults",
        skip_audit: true,
        expected_row_version: existing.row_version,
      });
    }
  });

  ensureWorkflowRoleLanes(options);
}

export function ensureWorkflowRoleLanes(options: MutationOptions = {}) {
  const existingLanes = listEntityRecords("ScheduleLane", { sort: "sort_order" });
  const existingByRole = new Set(
    existingLanes
      .map((lane) => String(lane.workflow_role || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const roleMappings = listRoleMappings();
  let nextSortOrder = existingLanes.length;

  roleMappings.forEach((roleMapping) => {
    const roleKey = String(roleMapping.role_key || "").trim().toLowerCase();
    if (!roleKey || existingByRole.has(roleKey)) {
      return;
    }

    createEntityRecord("ScheduleLane", {
      id: `workflow-lane-${roleKey}`,
      label: roleMapping.label || roleKey,
      color: roleMapping.color || "slate",
      staff_name: "",
      workflow_role: roleKey,
      sort_order: nextSortOrder,
      is_active: true,
    }, {
      actor: options.actor,
      request_source: options.requestSource || "workflow-defaults",
      skip_audit: options.skipAudit,
    });
    existingByRole.add(roleKey);
    nextSortOrder += 1;
  });
}

export function ensureQuoteWorkflowTasks(quote: EntityRecord, options: MutationOptions = {}) {
  if (!quote?.id) {
    return [];
  }

  const tasks = upsertWorkflowTasks("quote", quote, options);
  reconcileWorkflowStatuses("quote", quote.id, options);
  return tasks;
}

export function ensureJobWorkflowTasks(job: EntityRecord, options: MutationOptions = {}) {
  if (!job?.id) {
    return [];
  }

  const tasks = upsertWorkflowTasks("job", job, options);
  reconcileWorkflowStatuses("job", job.id, options);
  return tasks;
}

export function reconcileJobWorkflowStatuses(jobId: string, options: MutationOptions = {}) {
  return reconcileWorkflowStatuses("job", jobId, options);
}

export function reconcileQuoteWorkflowStatuses(quoteId: string, options: MutationOptions = {}) {
  return reconcileWorkflowStatuses("quote", quoteId, options);
}

export function ensureWorkflowTaskCoverage(options: MutationOptions = {}) {
  listEntityRecords("Quote", { limit: 1000 })
    .filter((quote) => String(quote.status || "").trim().toLowerCase() !== "lost")
    .forEach((quote) => {
      ensureQuoteWorkflowTasks(quote, options);
    });

  listEntityRecords("Job", { limit: 1000 }).forEach((job) => {
    ensureJobWorkflowTasks(job, options);
  });
}

export function enrichJobWithWorkflowDefaults(job: Record<string, unknown>) {
  return {
    ...job,
    job_type: normaliseJobType(job.job_type || job.workflow_template_key),
    workflow_template_key: String(job.workflow_template_key || "cabinetry_standard").trim() || "cabinetry_standard",
  };
}

export function getWorkflowExampleForJob(jobId: string) {
  const tasks = listWorkflowTasksForRecord("job", jobId);

  return tasks.map((task) => ({
    id: task.id,
    name: task.task_name || task.operation || "Task",
    phase: task.workflow_phase || "",
    role: task.workflow_role || "",
    status: normaliseStatus(task.status),
    dependencies: normaliseStringArray(task.dependency_template_keys),
  }));
}

export function getWorkflowExampleForQuote(quoteId: string) {
  const tasks = listWorkflowTasksForRecord("quote", quoteId);

  return tasks.map((task) => ({
    id: task.id,
    name: task.task_name || task.operation || "Task",
    phase: task.workflow_phase || "",
    role: task.workflow_role || "",
    status: normaliseStatus(task.status),
    dependencies: normaliseStringArray(task.dependency_template_keys),
  }));
}

export function getWorkflowTemplateSummary() {
  return listWorkflowTemplates().map((template) => ({
    id: template.id,
    name: template.name || "",
    scope: normaliseRecordScope(template.record_scope),
    phase: template.phase || "",
    role: template.role_key || "",
    dependencies: normaliseStringArray(template.dependencies),
    status: "template",
  }));
}

export function getRoleMappingSummary() {
  return listRoleMappings().map((mapping) => ({
    id: mapping.id,
    role: mapping.role_key || "",
    label: mapping.label || "",
    owners: normaliseStringArray(mapping.default_staff_names),
  }));
}

export function getWorkflowTaskRecord(taskId: string) {
  const record = getEntityRecord("JobOperation", taskId);
  if (!record || !record.is_workflow_task) {
    return null;
  }
  return record;
}
