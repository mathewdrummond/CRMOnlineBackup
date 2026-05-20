import { createEntityRecord, getEntityRecord, listEntityRecords, runInTransaction, updateEntityRecord } from "../db";
import { EntityRecord } from "../types";
import { QuoteVersionActor, buildQuoteVersionAuditPayload, calculateQuoteVersionSummary, getQuoteOptionLabel, resolveQuoteFamilyId } from "./quoteVersioning";

export type DuplicateQuoteInput = {
  sourceQuoteId: string;
  optionName?: string;
  optionDescription?: string;
  quoteNumber?: string;
  actor?: QuoteVersionActor;
  requestSource?: string;
};

const QUOTE_OWNED_COPY_ENTITIES = ["QuoteItem", "QuoteAutoInclusion", "QuoteCalculation", "QuoteScenario", "QuoteOverride", "SiteMeasure", "PaymentSchedule"] as const;

export function duplicateQuote(input: DuplicateQuoteInput) {
  return runInTransaction(() => {
    const sourceQuote = getEntityRecord("Quote", input.sourceQuoteId);
    if (!sourceQuote) throw new Error("quote_not_found");
    const familyId = resolveQuoteFamilyId(sourceQuote) || String(sourceQuote.id);
    const requestSource = input.requestSource || "quote-version-duplicate";
    const familyQuotes = listEntityRecords("Quote", { limit: 10000 }).filter((quote) => resolveQuoteFamilyId(quote) === familyId || String(quote.id) === familyId);
    const nextVersionNumber = Math.max(1, ...familyQuotes.map((quote) => Number(quote.quote_version_number || 1))) + 1;
    let normalizedSourceQuote = sourceQuote;
    if (!String(sourceQuote.quote_family_id || "").trim()) {
      normalizedSourceQuote = updateEntityRecord("Quote", String(sourceQuote.id), {
        quote_family_id: familyId,
        quote_version_number: Number(sourceQuote.quote_version_number || 1),
        is_primary_version: sourceQuote.is_primary_version !== false,
        version_status: sourceQuote.version_status || "active",
        row_version: sourceQuote.row_version,
      }, { actor: input.actor, request_source: `${requestSource}:normalize-source`, expected_row_version: sourceQuote.row_version }) || sourceQuote;
    }

    const createdQuote = createEntityRecord("Quote", sanitizeCopiedQuotePayload(normalizedSourceQuote, {
      familyId,
      quoteNumber: buildDuplicateQuoteNumber(normalizedSourceQuote, input.quoteNumber, familyQuotes),
      versionNumber: nextVersionNumber,
      optionName: input.optionName,
      optionDescription: input.optionDescription,
    }), { actor: input.actor, request_source: requestSource });

    const copied_record_counts: Record<string, number> = {};
    copyQuoteOwnedRecords(normalizedSourceQuote, createdQuote, input, copied_record_counts);
    const quoteImportIdMap = copyQuoteImports(normalizedSourceQuote, createdQuote, input, copied_record_counts);
    copyPricingQuoteItems(normalizedSourceQuote, createdQuote, quoteImportIdMap, input, copied_record_counts);
    copyReferenceAttachments(normalizedSourceQuote, createdQuote, input, copied_record_counts);
    const audit = createEntityRecord("QuoteVersionAudit", buildQuoteVersionAuditPayload({
      quote: createdQuote,
      sourceQuote: normalizedSourceQuote,
      actionType: "version_created",
      actor: input.actor,
      details: { copied_record_counts, quote_import_id_map: quoteImportIdMap },
    }), { actor: input.actor, request_source: requestSource });
    return { quote: createdQuote, source_quote: normalizedSourceQuote, audit, copied_record_counts };
  });
}

export function getQuoteFamilyBundle(quoteId: string) {
  const quote = getEntityRecord("Quote", quoteId);
  if (!quote) return null;
  const familyId = resolveQuoteFamilyId(quote);
  const versions = listEntityRecords("Quote", { limit: 10000 })
    .filter((candidate) => resolveQuoteFamilyId(candidate) === familyId || String(candidate.id) === familyId)
    .sort((left, right) => Number(left.quote_version_number || 1) - Number(right.quote_version_number || 1));
  return {
    quote_family_id: familyId,
    current_quote_id: quoteId,
    versions: versions.map((version) => ({
      ...version,
      option_label: getQuoteOptionLabel(version),
      version_summary: calculateQuoteVersionSummary(version, listEntityRecords("QuoteItem", { filters: { quote_id: version.id }, limit: 10000 })),
    })),
  };
}

function sanitizeCopiedQuotePayload(sourceQuote: EntityRecord, options: { familyId: string; quoteNumber: string; versionNumber: number; optionName?: string; optionDescription?: string }) {
  const { id, created_date, updated_date, row_version, ...copy } = sourceQuote;
  void id; void created_date; void updated_date; void row_version;
  return {
    ...copy,
    quote_number: options.quoteNumber,
    parent_quote_id: String(sourceQuote.id || ""),
    quote_family_id: options.familyId,
    quote_version_number: options.versionNumber,
    quote_option_name: String(options.optionName || `Option ${String.fromCharCode(64 + Math.min(options.versionNumber, 26))}`).trim(),
    quote_option_description: String(options.optionDescription || "").trim(),
    is_primary_version: false,
    is_archived_version: false,
    version_status: "active",
    copied_from_quote_id: String(sourceQuote.id || ""),
    status: "draft",
    revision: 1,
    approval_status: "draft",
    approval_owner: "",
    approval_requested_date: "",
    approval_completed_date: "",
    approval_history: [],
    change_orders: [],
    quote_scope_signed_off: false,
    quote_drawings_signed_off: false,
    quote_pricing_signed_off: false,
    quote_client_brief_signed_off: false,
    production_handoff_status: "not_ready",
    job_id: "",
    job_number: "",
    converted_job_id: "",
    accepted_date: "",
    accepted_by: "",
    export_locked: false,
    exported_at: "",
    invoice_id: "",
    invoice_number: "",
    generated_document_id: "",
    latest_generated_document_id: "",
  };
}

function copyQuoteOwnedRecords(sourceQuote: EntityRecord, createdQuote: EntityRecord, input: DuplicateQuoteInput, copiedRecords: Record<string, number>) {
  QUOTE_OWNED_COPY_ENTITIES.forEach((entity) => {
    const rows = listEntityRecords(entity, { filters: { quote_id: sourceQuote.id }, limit: 10000 });
    copiedRecords[entity] = rows.length;
    rows.forEach((row) => createEntityRecord(entity, sanitizeCopiedChildPayload(row, String(createdQuote.id), String(sourceQuote.id)), { actor: input.actor, request_source: `${input.requestSource || "quote-version-duplicate"}:${entity}` }));
  });
}

function copyQuoteImports(sourceQuote: EntityRecord, createdQuote: EntityRecord, input: DuplicateQuoteInput, copiedRecords: Record<string, number>) {
  const map: Record<string, string> = {};
  const rows = listEntityRecords("QuoteImport", { filters: { quote_id: sourceQuote.id }, limit: 10000 });
  copiedRecords.QuoteImport = rows.length;
  rows.forEach((row) => {
    const copied = createEntityRecord("QuoteImport", { ...sanitizeCopiedChildPayload(row, String(createdQuote.id), String(sourceQuote.id)), copied_from_import_id: row.id, import_status: row.import_status === "committed" ? "staged" : row.import_status, committed_at: "" }, { actor: input.actor, request_source: `${input.requestSource || "quote-version-duplicate"}:QuoteImport` });
    map[String(row.id)] = String(copied.id);
  });
  return map;
}

function copyPricingQuoteItems(sourceQuote: EntityRecord, createdQuote: EntityRecord, quoteImportIdMap: Record<string, string>, input: DuplicateQuoteInput, copiedRecords: Record<string, number>) {
  const rows = listEntityRecords("PricingQuoteItem", { filters: { quote_id: sourceQuote.id }, limit: 10000 });
  copiedRecords.PricingQuoteItem = rows.length;
  rows.forEach((row) => createEntityRecord("PricingQuoteItem", { ...sanitizeCopiedChildPayload(row, String(createdQuote.id), String(sourceQuote.id)), import_id: quoteImportIdMap[String(row.import_id || "")] || "", copied_from_pricing_quote_item_id: row.id }, { actor: input.actor, request_source: `${input.requestSource || "quote-version-duplicate"}:PricingQuoteItem` }));
}

function copyReferenceAttachments(sourceQuote: EntityRecord, createdQuote: EntityRecord, input: DuplicateQuoteInput, copiedRecords: Record<string, number>) {
  const rows = listEntityRecords("Attachment", { filters: { related_type: "quote", related_id: sourceQuote.id }, limit: 10000 }).filter((attachment) => !["generated-document", "quote-archive"].includes(String(attachment.source || "")));
  copiedRecords.Attachment = rows.length;
  rows.forEach((row) => createEntityRecord("Attachment", { ...sanitizeCopiedChildPayload(row, String(createdQuote.id), String(sourceQuote.id)), related_type: "quote", related_id: String(createdQuote.id), source: "quote-version-reference", original_attachment_id: row.id, generated_document_id: "", quote_document_id: "" }, { actor: input.actor, request_source: `${input.requestSource || "quote-version-duplicate"}:Attachment` }));
}

function sanitizeCopiedChildPayload(row: EntityRecord, quoteId: string, sourceQuoteId: string) {
  const { id, created_date, updated_date, row_version, ...copy } = row;
  void id; void created_date; void updated_date; void row_version;
  return { ...copy, quote_id: quoteId, copied_from_quote_id: sourceQuoteId, copied_from_record_id: row.id, confirmed_at: "", confirmed_by: "", excluded_at: "", excluded_by: "" };
}

function buildDuplicateQuoteNumber(sourceQuote: EntityRecord, requestedQuoteNumber: string | undefined, familyQuotes: EntityRecord[]) {
  const existing = new Set(listEntityRecords("Quote", { limit: 10000 }).map((quote) => String(quote.quote_number || "").trim().toLowerCase()).filter(Boolean));
  const requested = String(requestedQuoteNumber || "").trim();
  if (requested && !existing.has(requested.toLowerCase())) return requested.slice(0, 80);
  const next = Math.max(1, ...familyQuotes.map((quote) => Number(quote.quote_version_number || 1))) + 1;
  const base = String(sourceQuote.quote_number || "QTE").trim().replace(/-V\d+$/i, "").slice(0, 70);
  let candidate = `${base}-V${next}`;
  let suffix = next;
  while (existing.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${base}-V${suffix}`;
  }
  return candidate.slice(0, 80);
}

