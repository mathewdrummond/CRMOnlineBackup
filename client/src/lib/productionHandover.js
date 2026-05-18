export const PRODUCTION_FILE_VISIBILITY = {
  production: "Visible to Production",
  install: "Install Only",
  management: "Management Only",
  internal: "Internal Only",
};

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function asDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" });
}

export function isProductionVisibleAttachment(attachment = {}) {
  const visibility = lower(attachment.production_visibility || attachment.visibility || "");
  if (attachment.visible_to_production === false || attachment.management_only === true || attachment.internal_only === true) {
    return false;
  }
  if (visibility === "management" || visibility === "management_only" || visibility === "internal" || visibility === "internal_only") {
    return false;
  }
  return true;
}

export function getAttachmentProductionVisibilityLabel(attachment = {}) {
  const visibility = lower(attachment.production_visibility || attachment.visibility || "production");
  if (visibility === "install") return PRODUCTION_FILE_VISIBILITY.install;
  if (visibility === "management" || visibility === "management_only") return PRODUCTION_FILE_VISIBILITY.management;
  if (visibility === "internal" || visibility === "internal_only") return PRODUCTION_FILE_VISIBILITY.internal;
  return PRODUCTION_FILE_VISIBILITY.production;
}

export function filterProductionAttachments(attachments = [], { jobId = "", quoteId = "" } = {}) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => {
      const relatedType = lower(attachment.related_type);
      const relatedId = String(attachment.related_id || "");
      const linkedQuoteId = String(attachment.quote_id || attachment.source_quote_id || "");
      const linkedJobId = String(attachment.job_id || attachment.source_job_id || "");
      const belongsToJob = jobId && ((relatedType === "job" && relatedId === jobId) || linkedJobId === jobId);
      const belongsToQuote = quoteId && ((relatedType === "quote" && relatedId === quoteId) || linkedQuoteId === quoteId);
      return (belongsToJob || belongsToQuote) && isProductionVisibleAttachment(attachment);
    })
    .sort((left, right) => {
      const leftName = `${left.file_source || ""} ${left.name || ""}`;
      const rightName = `${right.file_source || ""} ${right.name || ""}`;
      return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" });
    });
}

export function groupQuoteItemsBySection(items = []) {
  const grouped = new Map();
  (Array.isArray(items) ? items : [])
    .filter((item) => item?.is_optional !== true && lower(item.review_state) !== "deleted")
    .forEach((item) => {
      const section = String(item.section || "General").trim() || "General";
      const key = String(item.section_key || section.toLowerCase());
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: section,
          display_order: Number(item.section_display_order || 999),
          items: [],
        });
      }
      grouped.get(key).items.push(item);
    });
  return [...grouped.values()].sort((left, right) => {
    const order = Number(left.display_order || 999) - Number(right.display_order || 999);
    if (order !== 0) return order;
    return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function buildHardwareSummary(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      const text = `${item.category || ""} ${item.description || ""}`.toLowerCase();
      return text.includes("hardware") || text.includes("hinge") || text.includes("runner") || text.includes("blum") || text.includes("handle");
    })
    .map((item) => ({
      id: item.id,
      description: item.description || "Hardware item",
      quantity: Number(item.quantity || 0),
      unit: item.unit || "ea",
      supplier: item.supplier || "",
      section: item.section || "General",
    }));
}

export function buildProductionHandoverPack({
  job = null,
  quote = null,
  quoteItems = [],
  jobOperations = [],
  siteMeasures = [],
  attachments = [],
} = {}) {
  const quoteId = String(job?.quote_id || quote?.id || "");
  const jobId = String(job?.id || "");
  const visibleAttachments = filterProductionAttachments(attachments, { jobId, quoteId });
  const relevantSiteMeasures = (Array.isArray(siteMeasures) ? siteMeasures : [])
    .filter((measure) => String(measure.job_id || "") === jobId || String(measure.quote_id || "") === quoteId)
    .filter((measure) => measure.include_in_handover_pack !== false);
  const relevantOperations = (Array.isArray(jobOperations) ? jobOperations : []).filter((operation) => String(operation.job_id || "") === jobId);
  const pendingOperations = relevantOperations.filter((operation) => !["complete", "completed"].includes(lower(operation.status)));
  const sectionGroups = groupQuoteItemsBySection(quoteItems);
  const hardwareSummary = buildHardwareSummary(quoteItems);
  const warnings = [
    job?.handoff_drawings_ready === false ? "Drawings are not confirmed ready." : "",
    job?.handoff_materials_confirmed === false ? "Materials are not fully confirmed." : "",
    job?.handoff_install_plan_confirmed === false ? "Install plan still needs confirmation." : "",
    visibleAttachments.length === 0 ? "No production-visible files are attached yet." : "",
  ].filter(Boolean);
  const clientRequests = relevantSiteMeasures.map((measure) => measure.client_requests).filter(Boolean);
  const installNotes = [
    job?.install_notes,
    job?.handoff_notes,
    ...relevantSiteMeasures.map((measure) => measure.access_notes).filter(Boolean),
  ].filter(Boolean);

  return {
    job,
    quote,
    jobId,
    quoteId,
    title: job?.title || job?.job_name || quote?.title || "Selected job",
    jobNumber: job?.job_number || quote?.quote_number || "",
    clientName: job?.contact_name || job?.company_name || quote?.contact_name || quote?.company_name || "",
    installDateLabel: [asDateLabel(job?.install_start_date || job?.install_date), asDateLabel(job?.install_end_date)].filter(Boolean).join(" - "),
    keyThings: [
      job?.internal_operational_notes,
      job?.handoff_notes,
      quote?.job_conversion_notes,
      quote?.quote_internal_notes,
      ...relevantSiteMeasures.map((measure) => measure.notes).filter(Boolean),
    ].filter(Boolean),
    warnings,
    pendingItems: pendingOperations,
    clientRequests,
    installNotes,
    outstandingDecisions: warnings,
    sectionGroups,
    hardwareSummary,
    operations: relevantOperations,
    attachments: visibleAttachments,
    siteMeasures: relevantSiteMeasures,
  };
}
