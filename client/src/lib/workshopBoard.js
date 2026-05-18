export const WORKSHOP_BOARD_STAGES = [
  {
    id: "waiting_approval",
    label: "Waiting Approval",
    status: "planning",
    description: "Not released to the workshop yet.",
  },
  {
    id: "ready_for_production",
    label: "Ready for Production",
    status: "approved",
    description: "Approved and ready to start.",
  },
  {
    id: "in_production",
    label: "In Production",
    status: "production",
    description: "Being built in the workshop.",
  },
  {
    id: "ready_for_install",
    label: "Ready for Install",
    status: "ready_to_install",
    description: "Built and waiting for install.",
  },
  {
    id: "installed",
    label: "Installed",
    status: "installed",
    description: "Installed on site.",
  },
  {
    id: "callback",
    label: "Callback",
    status: "callback",
    description: "Needs return visit or follow-up.",
  },
];

const STAGE_BY_ID = new Map(WORKSHOP_BOARD_STAGES.map((stage) => [stage.id, stage]));
const STAGE_BY_STATUS = new Map(WORKSHOP_BOARD_STAGES.map((stage) => [stage.status, stage]));

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parseDate(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getWorkshopStageForJob(job = {}) {
  const status = normalize(job.status || "planning");
  if (status === "on_hold") return STAGE_BY_ID.get("waiting_approval");
  return STAGE_BY_STATUS.get(status) || STAGE_BY_ID.get("waiting_approval");
}

export function getWorkshopStageStatus(stageId) {
  return STAGE_BY_ID.get(stageId)?.status || "planning";
}

export function getWorkshopStageLabel(stageId) {
  return STAGE_BY_ID.get(stageId)?.label || "Waiting Approval";
}

export function buildWorkshopWarnings(job = {}, operations = []) {
  const warnings = [];
  if (job.handoff_drawings_ready === false) warnings.push("Drawings not confirmed");
  if (job.handoff_materials_confirmed === false) warnings.push("Materials not confirmed");
  if (job.handoff_install_plan_confirmed === false) warnings.push("Install plan not confirmed");
  if (!job.install_date && !job.install_start_date && ["ready_to_install", "installed"].includes(normalize(job.status))) {
    warnings.push("Install date missing");
  }

  const blockedTasks = operations.filter((operation) => ["blocked", "on_hold"].includes(normalize(operation.status)));
  if (blockedTasks.length) {
    warnings.push(`${blockedTasks.length} blocked task${blockedTasks.length === 1 ? "" : "s"}`);
  }

  return warnings;
}

export function buildWorkshopBoardCards({ jobs = [], quotes = [], jobOperations = [] } = {}) {
  const quoteById = new Map((Array.isArray(quotes) ? quotes : []).map((quote) => [String(quote.id || ""), quote]));
  const operationsByJobId = (Array.isArray(jobOperations) ? jobOperations : []).reduce((map, operation) => {
    const jobId = String(operation.job_id || "");
    if (!jobId) return map;
    if (!map.has(jobId)) map.set(jobId, []);
    map.get(jobId).push(operation);
    return map;
  }, new Map());

  return (Array.isArray(jobs) ? jobs : [])
    .filter((job) => !["complete", "completed", "cancelled", "inactive"].includes(normalize(job.status)))
    .map((job) => {
      const quote = quoteById.get(String(job.quote_id || "")) || null;
      const operations = operationsByJobId.get(String(job.id || "")) || [];
      const stage = getWorkshopStageForJob(job);
      const warnings = buildWorkshopWarnings(job, operations);
      return {
        id: String(job.id || ""),
        stageId: stage.id,
        stageStatus: stage.status,
        title: job.title || job.job_name || quote?.title || "Untitled job",
        jobNumber: job.job_number || quote?.quote_number || "",
        client: job.contact_name || job.company_name || quote?.contact_name || quote?.company_name || "",
        installDate: job.install_start_date || job.install_date || job.due_date || "",
        status: normalize(job.status || stage.status),
        warnings,
        notes: [
          job.handoff_notes,
          job.install_notes,
          job.internal_operational_notes,
          quote?.job_conversion_notes,
        ].filter(Boolean),
        quoteId: job.quote_id || quote?.id || "",
        job,
        quote,
      };
    })
    .sort((left, right) => {
      const stageCompare = WORKSHOP_BOARD_STAGES.findIndex((stage) => stage.id === left.stageId)
        - WORKSHOP_BOARD_STAGES.findIndex((stage) => stage.id === right.stageId);
      if (stageCompare !== 0) return stageCompare;
      return parseDate(left.installDate) - parseDate(right.installDate)
        || left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true });
    });
}

export function groupWorkshopCardsByStage(cards = []) {
  const groups = new Map(WORKSHOP_BOARD_STAGES.map((stage) => [stage.id, []]));
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    const stageId = STAGE_BY_ID.has(card.stageId) ? card.stageId : "waiting_approval";
    groups.get(stageId).push(card);
  });
  return groups;
}

export function moveWorkshopCard(cards = [], cardId, targetStageId) {
  const target = STAGE_BY_ID.get(targetStageId);
  if (!target) return cards;
  return (Array.isArray(cards) ? cards : []).map((card) =>
    String(card.id) === String(cardId)
      ? { ...card, stageId: target.id, stageStatus: target.status, status: target.status }
      : card
  );
}

