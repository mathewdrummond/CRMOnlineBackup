export const ADD_PRICING_CATEGORY_VALUE = "__add_new_pricing_category__";

export const DEFAULT_PRICING_CATEGORIES = [
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

export function slugifyPricingCategoryName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function normalisePricingCategoryOptions(savedCategories = [], defaultCategories = DEFAULT_PRICING_CATEGORIES) {
  const byValue = new Map();

  defaultCategories.forEach(([value, label]) => {
    byValue.set(value, { value, label });
  });

  savedCategories
    .forEach((category) => {
      if (!category) return;
      const label = String(category.name || category.label || "").trim();
      const value = String(category.key || category.value || slugifyPricingCategoryName(label)).trim();
      if (!value) return;
      if (category.is_active === false) {
        byValue.delete(value);
        return;
      }
      if (!label) return;
      byValue.set(value, { value, label });
    });

  return [...byValue.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function isDuplicatePricingCategoryName(options, name) {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedValue = slugifyPricingCategoryName(name);
  if (!normalizedName) return false;
  return options.some((option) =>
    String(option.label || "").trim().toLowerCase() === normalizedName ||
    String(option.value || "").trim().toLowerCase() === normalizedValue
  );
}

export function buildPricingCategoryRecord(name) {
  const trimmedName = String(name || "").trim();
  const key = slugifyPricingCategoryName(trimmedName);
  return {
    name: trimmedName,
    label: trimmedName,
    key,
    value: key,
    is_active: true,
  };
}
