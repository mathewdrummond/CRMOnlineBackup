import { EntityRecord } from "../types";
import { calculateQuoteVersionSummary, getQuoteOptionLabel, roundMoney } from "./quoteVersioning";

function normalizeToken(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function itemComparisonKey(item: EntityRecord) {
  return [normalizeToken(item.description || item.name), normalizeToken(item.category), normalizeToken(item.section), normalizeToken(item.unit)].join("|");
}

function summarizeByCategory(items: EntityRecord[]) {
  const totals: Record<string, number> = {};
  items.filter((item) => String(item.review_state || "").toLowerCase() !== "deleted" && !item.is_optional).forEach((item) => {
    const category = String(item.category || "other").trim() || "other";
    totals[category] = roundMoney((totals[category] || 0) + Number(item.total || 0));
  });
  return totals;
}

export function compareQuoteVersions(input: {
  baseQuote: EntityRecord;
  compareQuote: EntityRecord;
  baseItems: EntityRecord[];
  compareItems: EntityRecord[];
}) {
  const baseSummary = calculateQuoteVersionSummary(input.baseQuote, input.baseItems);
  const compareSummary = calculateQuoteVersionSummary(input.compareQuote, input.compareItems);
  const compareItemsByKey = new Map(input.compareItems.map((item) => [itemComparisonKey(item), item]));
  const matchedCompareKeys = new Set<string>();
  const changedItems: Array<Record<string, unknown>> = [];

  input.baseItems.filter((item) => String(item.review_state || "").toLowerCase() !== "deleted").forEach((baseItem) => {
    const key = itemComparisonKey(baseItem);
    const compareItem = compareItemsByKey.get(key);
    if (!compareItem) {
      changedItems.push({ key, description: String(baseItem.description || baseItem.name || "Quote item"), change_type: "removed", base_total: roundMoney(baseItem.total), compare_total: 0, delta_total: roundMoney(-Number(baseItem.total || 0)) });
      return;
    }
    matchedCompareKeys.add(key);
    const baseTotal = roundMoney(baseItem.total);
    const compareTotal = roundMoney(compareItem.total);
    const baseQuantity = Number(baseItem.quantity || 0);
    const compareQuantity = Number(compareItem.quantity || 0);
    const baseCost = roundMoney(baseItem.unit_cost);
    const compareCost = roundMoney(compareItem.unit_cost);
    if (baseTotal === compareTotal && baseQuantity === compareQuantity && baseCost === compareCost) return;
    changedItems.push({ key, description: String(baseItem.description || baseItem.name || "Quote item"), change_type: "changed", base_total: baseTotal, compare_total: compareTotal, delta_total: roundMoney(compareTotal - baseTotal), base_quantity: baseQuantity, compare_quantity: compareQuantity, base_unit_cost: baseCost, compare_unit_cost: compareCost });
  });

  input.compareItems.filter((item) => String(item.review_state || "").toLowerCase() !== "deleted").forEach((compareItem) => {
    const key = itemComparisonKey(compareItem);
    if (matchedCompareKeys.has(key) || input.baseItems.some((item) => itemComparisonKey(item) === key)) return;
    changedItems.push({ key, description: String(compareItem.description || compareItem.name || "Quote item"), change_type: "added", base_total: 0, compare_total: roundMoney(compareItem.total), delta_total: roundMoney(compareItem.total) });
  });

  return {
    base_quote: buildQuoteReference(input.baseQuote, baseSummary),
    compare_quote: buildQuoteReference(input.compareQuote, compareSummary),
    deltas: {
      subtotal: roundMoney(compareSummary.subtotal - baseSummary.subtotal),
      total: roundMoney(compareSummary.total - baseSummary.total),
      gross_margin_percent: roundMoney(compareSummary.gross_margin_percent - baseSummary.gross_margin_percent),
      labour_total: roundMoney(compareSummary.labour_total - baseSummary.labour_total),
      material_total: roundMoney(compareSummary.material_total - baseSummary.material_total),
      line_item_count: compareSummary.line_item_count - baseSummary.line_item_count,
    },
    category_totals: { base: summarizeByCategory(input.baseItems), compare: summarizeByCategory(input.compareItems) },
    changed_items: changedItems.sort((left, right) => Math.abs(Number(right.delta_total || 0)) - Math.abs(Number(left.delta_total || 0))),
  };
}

function buildQuoteReference(quote: EntityRecord, summary: Record<string, unknown>) {
  return {
    id: quote.id,
    quote_number: quote.quote_number,
    title: quote.title,
    option_name: getQuoteOptionLabel(quote),
    version_number: quote.quote_version_number || 1,
    version_status: quote.version_status || "active",
    is_primary_version: Boolean(quote.is_primary_version),
    is_archived_version: Boolean(quote.is_archived_version),
    summary,
  };
}

