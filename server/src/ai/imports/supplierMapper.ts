import { EntityRecord } from "../../types";

export type SupplierMappingSuggestion = {
  supplier_id: string;
  supplier_name: string;
  confidence: number;
  match_type: "exact" | "alias" | "fuzzy" | "none";
  reasons: string[];
  review_required: boolean;
};

export function suggestSupplierMapping(input: {
  supplier?: unknown;
  metadataSupplier?: unknown;
  rows?: Array<Record<string, unknown>>;
  suppliers: EntityRecord[];
}): SupplierMappingSuggestion {
  const candidates = [
    input.supplier,
    input.metadataSupplier,
    ...(input.rows || []).slice(0, 20).flatMap((row) => [row.supplier, row.vendor, row.manufacturer]),
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  const bestSource = mostFrequent(candidates);
  if (!bestSource) {
    return emptySuggestion("No supplier name was found in the import.");
  }

  const normalizedSource = normalizeSupplierName(bestSource);
  const suppliers = input.suppliers.map((supplier) => ({
    record: supplier,
    name: String(supplier.name || supplier.supplier_name || ""),
    aliases: Array.isArray(supplier.aliases) ? supplier.aliases.map(String) : [],
  }));
  const exact = suppliers.find((supplier) => normalizeSupplierName(supplier.name) === normalizedSource);
  if (exact) {
    return buildSuggestion(exact.record, bestSource, 0.98, "exact", "Supplier name exactly matches an existing supplier.");
  }
  const alias = suppliers.find((supplier) => supplier.aliases.some((candidate) => normalizeSupplierName(candidate) === normalizedSource));
  if (alias) {
    return buildSuggestion(alias.record, bestSource, 0.92, "alias", "Supplier name matches a saved supplier alias.");
  }

  const fuzzy = suppliers
    .map((supplier) => ({
      ...supplier,
      score: stringSimilarity(normalizedSource, normalizeSupplierName(supplier.name)),
    }))
    .sort((left, right) => right.score - left.score)[0];
  if (fuzzy && fuzzy.score >= 0.72) {
    return buildSuggestion(fuzzy.record, bestSource, Math.min(0.88, fuzzy.score), "fuzzy", "Supplier name is similar to an existing supplier.");
  }

  return emptySuggestion(`No supplier record confidently matched "${bestSource}".`);
}

function buildSuggestion(record: EntityRecord, sourceName: string, confidence: number, matchType: SupplierMappingSuggestion["match_type"], reason: string) {
  return {
    supplier_id: String(record.id || ""),
    supplier_name: String(record.name || record.supplier_name || sourceName),
    confidence,
    match_type: matchType,
    reasons: [reason],
    review_required: confidence < 0.9,
  };
}

function emptySuggestion(reason: string): SupplierMappingSuggestion {
  return {
    supplier_id: "",
    supplier_name: "",
    confidence: 0,
    match_type: "none",
    reasons: [reason],
    review_required: true,
  };
}

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function normalizeSupplierName(value: string) {
  return value.toLowerCase().replace(/\b(limited|ltd|nz|new zealand|the)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function stringSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const tokenScore = intersection / union;
  const prefixScore = left.startsWith(right) || right.startsWith(left) ? 0.75 : 0;
  return Math.max(tokenScore, prefixScore);
}

function tokenSet(value: string) {
  return new Set(value.match(/[a-z0-9]{2,}/g) || [value]);
}
