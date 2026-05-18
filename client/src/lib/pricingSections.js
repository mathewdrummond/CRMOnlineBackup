export const ADD_PRICING_SECTION_VALUE = "__add_new_pricing_section__";

export const DEFAULT_PRICING_SECTIONS = [
  ["materials", "Materials", 10],
  ["doors", "Doors", 20],
  ["hardware", "Hardware", 30],
  ["labour", "Labour", 40],
  ["freight", "Freight", 50],
  ["subcontract", "Subcontract", 60],
  ["installation", "Installation", 70],
  ["add_ons", "Add-Ons", 80],
  ["general", "General", 999],
];

export function slugifyPricingSectionName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function buildPricingSectionRecord(name, options = {}) {
  const trimmedName = String(name || "").trim();
  const key = slugifyPricingSectionName(trimmedName);
  return {
    name: trimmedName,
    label: trimmedName,
    key,
    value: key,
    description: String(options.description || "").trim(),
    display_order: Number.isFinite(Number(options.displayOrder)) ? Number(options.displayOrder) : 999,
    is_active: true,
    merged_into_section_id: "",
    merged_into_section_key: "",
    merged_into_section_name: "",
  };
}

export function normalisePricingSectionOptions(savedSections = [], defaultSections = DEFAULT_PRICING_SECTIONS) {
  const byValue = new Map();

  defaultSections.forEach(([value, label, displayOrder]) => {
    byValue.set(value, { value, label, display_order: displayOrder });
  });

  savedSections.forEach((section) => {
    if (!section) return;
    const label = String(section.name || section.label || "").trim();
    const value = String(section.key || section.value || slugifyPricingSectionName(label)).trim();
    if (!value) return;
    if (section.is_active === false) {
      byValue.delete(value);
      return;
    }
    if (!label) return;
    byValue.set(value, {
      value,
      label,
      display_order: Number.isFinite(Number(section.display_order)) ? Number(section.display_order) : 999,
    });
  });

  return [...byValue.values()].sort((left, right) => {
    const orderCompare = Number(left.display_order || 999) - Number(right.display_order || 999);
    if (orderCompare !== 0) return orderCompare;
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });
}

export function isDuplicatePricingSectionName(options, name) {
  const normalizedName = String(name || "").trim().toLowerCase();
  const normalizedValue = slugifyPricingSectionName(name);
  if (!normalizedName) return false;
  return options.some((option) =>
    String(option.label || "").trim().toLowerCase() === normalizedName ||
    String(option.value || "").trim().toLowerCase() === normalizedValue
  );
}

export function normalizePricingSectionName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

export function findMatchingPricingSection(sections = [], name) {
  const normalizedName = normalizePricingSectionName(name);
  if (!normalizedName) return null;
  return sections.find((section) => {
    if (section?.is_active === false) return false;
    return [
      normalizePricingSectionName(section?.name),
      normalizePricingSectionName(section?.label),
      normalizePricingSectionName(section?.key),
      normalizePricingSectionName(section?.value),
    ].includes(normalizedName);
  }) || null;
}
