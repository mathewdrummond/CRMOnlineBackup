function createId(prefix = "approval") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function isQuoteApprovalLocked(quote = {}) {
  if (quote.has_unapproved_changes === true) {
    return false;
  }
  return Boolean(quote.quote_approval_locked)
    || String(quote.approval_status || "").trim().toLowerCase() === "approved"
    || (Array.isArray(quote.approval_snapshots) && quote.approval_snapshots.length > 0);
}

export function summarizeApprovedLineItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: item.id || "",
    description: item.description || item.name || "",
    category: item.category || "",
    section: item.section || "",
    section_key: item.section_key || "",
    quantity: Number(item.quantity || 0),
    unit: item.unit || "",
    unit_cost: money(item.unit_cost),
    markup_percent: Number(item.markup_percent || 0),
    total: money(item.total),
    source: item.source || "",
    review_status: item.review_status || item.review_state || "",
  }));
}

export function buildQuoteApprovalSnapshot({
  quote = {},
  items = [],
  type = "quote",
  approvedBy = "",
  notes = "",
  documentAttachment = null,
  now = new Date(),
} = {}) {
  return {
    id: createId(`${type}-snapshot`),
    type,
    timestamp: now.toISOString(),
    approved_by: approvedBy || quote.approval_owner || "JoinerFlow",
    approval_date: now.toISOString().slice(0, 10),
    approval_notes: notes,
    approved_document_version: documentAttachment ? {
      id: documentAttachment.id || "",
      name: documentAttachment.name || "",
      version: Number(documentAttachment.current_version || documentAttachment.version || 1),
      url: documentAttachment.url || "",
    } : null,
    approved_totals: {
      subtotal: money(quote.subtotal),
      gst: money(quote.gst),
      total: money(quote.total),
    },
    approved_line_items: summarizeApprovedLineItems(items),
  };
}

export function buildQuoteApprovalPatch({
  quote = {},
  items = [],
  approvedBy = "",
  notes = "",
  documentAttachment = null,
  now = new Date(),
} = {}) {
  const existingSnapshots = Array.isArray(quote.approval_snapshots) ? quote.approval_snapshots : [];
  const snapshots = [
    ...existingSnapshots,
    buildQuoteApprovalSnapshot({ quote, items, type: "quote", approvedBy, notes, documentAttachment, now }),
    buildQuoteApprovalSnapshot({ quote, items, type: "pricing", approvedBy, notes, documentAttachment: null, now }),
    buildQuoteApprovalSnapshot({ quote, items, type: "document", approvedBy, notes, documentAttachment, now }),
  ];

  return {
    approval_status: "approved",
    approval_completed_date: now.toISOString().slice(0, 10),
    quote_approval_locked: true,
    has_unapproved_changes: false,
    approval_snapshots: snapshots,
    approved_totals: {
      subtotal: money(quote.subtotal),
      gst: money(quote.gst),
      total: money(quote.total),
    },
    approved_line_items: summarizeApprovedLineItems(items),
    approved_document_attachment_id: documentAttachment?.id || quote.approved_document_attachment_id || "",
    approved_document_version: documentAttachment ? Number(documentAttachment.current_version || documentAttachment.version || 1) : Number(quote.approved_document_version || 0),
    client_approval_date: quote.client_approval_date || "",
    client_approval_notes: quote.client_approval_notes || "",
  };
}

export function buildQuoteRevisionEntry({
  quote = {},
  items = [],
  changeType = "quote_edit",
  summary = "",
  actor = "JoinerFlow",
  now = new Date(),
} = {}) {
  return {
    id: createId("revision"),
    revision: Number(quote.revision || 1) + (quote.has_unapproved_changes ? 0 : 1),
    timestamp: now.toISOString(),
    changed_by: actor,
    change_type: changeType,
    summary,
    prior_approval_status: quote.approval_status || "",
    approved_totals_preserved: quote.approved_totals || {
      subtotal: money(quote.subtotal),
      gst: money(quote.gst),
      total: money(quote.total),
    },
    approved_line_items_preserved: Array.isArray(quote.approved_line_items)
      ? quote.approved_line_items
      : summarizeApprovedLineItems(items),
  };
}

export function buildPostApprovalRevisionPatch({
  quote = {},
  items = [],
  changeType = "quote_edit",
  summary = "Approved quote changed",
  actor = "JoinerFlow",
  now = new Date(),
} = {}) {
  if (!isQuoteApprovalLocked(quote)) {
    return {};
  }

  const existingHistory = Array.isArray(quote.revision_history) ? quote.revision_history : [];
  const entry = buildQuoteRevisionEntry({ quote, items, changeType, summary, actor, now });
  const nextRevision = quote.has_unapproved_changes ? Number(quote.revision || 1) : Number(quote.revision || 1) + 1;

  return {
    revision: nextRevision,
    quote_approval_locked: false,
    has_unapproved_changes: true,
    last_post_approval_edit_at: now.toISOString(),
    last_post_approval_edit_summary: summary,
    revision_history: [...existingHistory, entry],
  };
}
