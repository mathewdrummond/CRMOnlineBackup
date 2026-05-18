export const DEFAULT_PRICING_SECTIONS: Array<[string, string, number]> = [
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

export function slugifyPricingSectionName(name: string) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function buildPricingSectionRecord(name: string, options: { description?: string; displayOrder?: number } = {}) {
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

export function normalizePricingSectionName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

export function findMatchingPricingSection(
  sections: Array<Record<string, unknown>> = [],
  heading: unknown
) {
  const normalizedHeading = normalizePricingSectionName(heading);
  if (!normalizedHeading) {
    return null;
  }

  return sections.find((section) => {
    if (section?.is_active === false) {
      return false;
    }
    return [
      normalizePricingSectionName(section?.name),
      normalizePricingSectionName(section?.label),
      normalizePricingSectionName(section?.value),
      normalizePricingSectionName(section?.key),
    ].includes(normalizedHeading);
  }) || null;
}
