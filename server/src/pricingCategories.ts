export const DEFAULT_PRICING_CATEGORIES: Array<[string, string]> = [
  ["sheet_materials", "Sheet materials"],
  ["edging", "Edging"],
  ["doors_fronts", "Doors / fronts"],
  ["hardware", "Hardware"],
  ["drawer_systems_runners", "Drawers / runners"],
  ["hinges", "Hinges"],
  ["handles_pulls", "Handles / pulls"],
  ["bins_accessories", "Bins / accessories"],
  ["packaging_freight", "Packaging / freight"],
  ["freight_delivery", "Freight / delivery"],
  ["subcontracted_items", "Subcontract"],
  ["misc_fixings", "Misc / fixings"],
];

export function slugifyPricingCategoryName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function buildPricingCategoryRecord(name: string) {
  const trimmedName = String(name || "").trim();
  const key = slugifyPricingCategoryName(trimmedName);
  return {
    name: trimmedName,
    label: trimmedName,
    key,
    value: key,
    is_active: true,
    merged_into_category_id: "",
    merged_into_category_key: "",
    merged_into_category_name: "",
  };
}

export function normalizePricingCategoryName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}
