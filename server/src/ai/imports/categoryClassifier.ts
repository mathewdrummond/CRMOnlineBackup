import { categorizePricingItem, PRICING_CATEGORIES, PricingCategory } from "../../pricingModel";

export type CategorySuggestion = {
  category: PricingCategory;
  confidence: number;
  reasons: string[];
  review_required: boolean;
};

const CATEGORY_HINTS: Array<{ category: PricingCategory; patterns: RegExp[]; reason: string }> = [
  { category: "sheet_materials", patterns: [/melamine|mdf|ply|veneer|laminate|board|panel|sheet/i], reason: "Description looks like sheet or panel material." },
  { category: "edging", patterns: [/edge|edging|band|tape|abs/i], reason: "Description looks like edging or banding." },
  { category: "doors_fronts", patterns: [/door|front|drawer front|painted front/i], reason: "Description looks like doors or fronts." },
  { category: "drawer_systems_runners", patterns: [/drawer|runner|tandem|legrabox|metabox|movento|merivobox/i], reason: "Description looks like a drawer system or runner." },
  { category: "hinges", patterns: [/hinge|clip top|blumotion|mounting plate/i], reason: "Description looks like hinge hardware." },
  { category: "handles_pulls", patterns: [/handle|pull|knob|grip/i], reason: "Description looks like handles or pulls." },
  { category: "bins_accessories", patterns: [/bin|waste|insert|tray|lazy susan|accessor/i], reason: "Description looks like bins or accessories." },
  { category: "freight_delivery", patterns: [/freight|delivery|shipping|courier/i], reason: "Description looks like freight or delivery." },
  { category: "packaging_freight", patterns: [/packaging|carton|pallet|wrap/i], reason: "Description looks like packaging." },
  { category: "labour", patterns: [/labou?r|install|measure|design time|workshop time/i], reason: "Description looks like labour." },
  { category: "subcontracted_items", patterns: [/stone|glass|powdercoat|paint|lacquer|subcontract|outsourc/i], reason: "Description looks subcontracted." },
  { category: "misc_fixings", patterns: [/screw|fixing|bracket|glue|bumper|pin|consumable/i], reason: "Description looks like fixings or consumables." },
];

export function suggestCategory(input: {
  name?: unknown;
  description?: unknown;
  material_type?: unknown;
  supplier_category?: unknown;
  current_category?: unknown;
  tags?: unknown;
}): CategorySuggestion {
  const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];
  const text = [
    input.name,
    input.description,
    input.material_type,
    input.supplier_category,
    ...tags,
  ].map((value) => String(value ?? "")).join(" ");
  const current = String(input.current_category || "").trim() as PricingCategory;
  const matched = CATEGORY_HINTS.find((hint) => hint.patterns.some((pattern) => pattern.test(text)));
  const fallback = categorizePricingItem({
    name: String(input.name || input.description || ""),
    material_type: String(input.material_type || input.supplier_category || ""),
    tags,
  });
  const category = matched?.category || (PRICING_CATEGORIES.includes(current) ? current : fallback);
  const reasons = matched ? [matched.reason] : ["Category inferred from existing pricing category rules."];
  const currentDiffers = Boolean(current) && PRICING_CATEGORIES.includes(current) && current !== category;
  if (currentDiffers) {
    reasons.push(`Current category is ${current}; suggested category is ${category}.`);
  }

  const confidence = matched ? (currentDiffers ? 0.78 : 0.9) : 0.62;
  return {
    category,
    confidence,
    reasons,
    review_required: confidence < 0.85 || currentDiffers,
  };
}
