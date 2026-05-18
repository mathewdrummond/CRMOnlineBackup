import { normalizeSku } from "../../pricingModel";

export type SkuCleanupSuggestion = {
  original_sku: string;
  normalized_sku: string;
  display_sku: string;
  confidence: number;
  reasons: string[];
  review_required: boolean;
};

export function suggestSkuCleanup(value: unknown): SkuCleanupSuggestion {
  const original = String(value ?? "").trim();
  const normalized = normalizeSku(original);
  const display = buildDisplaySku(original, normalized);
  const reasons: string[] = [];

  if (!original) {
    reasons.push("SKU is missing.");
  }
  if (original && original !== normalized) {
    reasons.push("Whitespace, punctuation, or casing can be normalised.");
  }
  if (/[oO][0-9]|[0-9][oO]/.test(original)) {
    reasons.push("SKU contains O/0 characters that may need visual review.");
  }
  if (/[iIlL][0-9]|[0-9][iIlL]/.test(original)) {
    reasons.push("SKU contains I/L/1 characters that may need visual review.");
  }
  if (original.length > 0 && normalized.length <= 2) {
    reasons.push("Normalised SKU is very short.");
  }

  const confidence = !original
    ? 0
    : normalized.length <= 2
      ? 0.45
      : reasons.some((reason) => reason.includes("visual review"))
        ? 0.72
        : original === normalized
          ? 0.98
          : 0.9;

  return {
    original_sku: original,
    normalized_sku: normalized,
    display_sku: display,
    confidence,
    reasons,
    review_required: confidence < 0.85 || reasons.length > 0,
  };
}

export function findDuplicateSkus<T>(rows: T[], readSku: (row: T) => unknown) {
  const seen = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const normalized = normalizeSku(readSku(row));
    if (!normalized) return;
    const indexes = seen.get(normalized) || [];
    indexes.push(index);
    seen.set(normalized, indexes);
  });
  return new Map([...seen.entries()].filter(([, indexes]) => indexes.length > 1));
}

function buildDisplaySku(original: string, normalized: string) {
  if (!normalized) return "";
  const compactOriginal = original.replace(/\s+/g, "").trim();
  if (compactOriginal && normalizeSku(compactOriginal) === normalized && /[-_/]/.test(compactOriginal)) {
    return compactOriginal.toUpperCase();
  }
  return normalized;
}
