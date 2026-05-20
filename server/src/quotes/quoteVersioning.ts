import { EntityRecord, LocalUser } from "../types";

export type QuoteVersionActor = LocalUser | null;

export function resolveQuoteFamilyId(quote: EntityRecord) {
  return String(quote.quote_family_id || quote.parent_quote_id || quote.id || "").trim();
}

export function getQuoteOptionLabel(quote: EntityRecord) {
  const optionName = String(quote.quote_option_name || "").trim();
  if (optionName) return optionName;
  const versionNumber = Number(quote.quote_version_number || 0);
  if (versionNumber > 1) return `Version ${versionNumber}`;
  return quote.is_primary_version ? "Primary" : "Base option";
}

export function isQuoteVersionAccepted(quote: EntityRecord) {
  const status = String(quote.status || "").toLowerCase();
  const versionStatus = String(quote.version_status || "").toLowerCase();
  return status === "accepted" || status === "won" || versionStatus === "accepted";
}

export function buildQuoteVersionAuditPayload(input: {
  quote: EntityRecord;
  sourceQuote?: EntityRecord | null;
  actionType: string;
  actor?: QuoteVersionActor;
  details?: Record<string, unknown>;
}) {
  return {
    quote_id: String(input.quote.id || ""),
    quote_family_id: resolveQuoteFamilyId(input.quote),
    source_quote_id: String(input.sourceQuote?.id || input.quote.copied_from_quote_id || ""),
    action_type: input.actionType,
    option_name: getQuoteOptionLabel(input.quote),
    version_number: Number(input.quote.quote_version_number || 1),
    actor_user_id: String(input.actor?.id || input.actor?.email || ""),
    actor_user_name: String(input.actor?.full_name || input.actor?.email || ""),
    details: input.details || {},
  };
}

export function calculateQuoteVersionSummary(quote: EntityRecord, items: EntityRecord[] = []) {
  const activeItems = items.filter((item) => String(item.review_state || "").toLowerCase() !== "deleted");
  const subtotal = roundMoney(Number(quote.subtotal || 0) || activeItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + Number(item.total || 0), 0));
  const totalCost = roundMoney(activeItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + Number(item.unit_cost || 0) * Number(item.quantity || 0), 0));
  const grossProfit = roundMoney(subtotal - totalCost);
  const grossMarginPercent = subtotal > 0 ? roundMoney((grossProfit / subtotal) * 100) : 0;
  const labourTotal = roundMoney(activeItems.filter((item) => String(item.category || "").toLowerCase() === "labour").reduce((sum, item) => sum + Number(item.total || 0), 0));
  const materialTotal = roundMoney(activeItems.filter((item) => String(item.category || "").toLowerCase().includes("material")).reduce((sum, item) => sum + Number(item.total || 0), 0));
  const sections = Array.from(new Set(activeItems.map((item) => String(item.section || "General").trim()).filter(Boolean))).sort();
  return {
    subtotal,
    gst: roundMoney(Number(quote.gst || 0)),
    total: roundMoney(Number(quote.total || 0) || subtotal * 1.15),
    total_cost: totalCost,
    gross_profit: grossProfit,
    gross_margin_percent: grossMarginPercent,
    labour_total: labourTotal,
    material_total: materialTotal,
    line_item_count: activeItems.length,
    included_section_count: sections.length,
    sections,
  };
}

export function roundMoney(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100;
}

