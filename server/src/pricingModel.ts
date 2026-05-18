import { EntityRecord } from "./types";
import zlib from "node:zlib";

export const PRICING_CATEGORIES = [
  "sheet_materials",
  "edging",
  "doors_fronts",
  "hardware",
  "drawer_systems_runners",
  "hinges",
  "handles_pulls",
  "bins_accessories",
  "packaging_freight",
  "freight_delivery",
  "labour",
  "subcontracted_items",
  "misc_fixings",
] as const;

export type PricingCategory = typeof PRICING_CATEGORIES[number];

export type StructuredPricingItem = {
  id?: string;
  source_row?: number;
  source_page?: number;
  source?: string;
  name: string;
  description?: string;
  material_type: string;
  category: PricingCategory;
  heading_category?: string;
  quantity: number;
  unit: string;
  buy_price: number;
  markup_percent: number;
  supplier?: string;
  original_sku?: string;
  normalized_sku?: string;
  cabinet_reference: string;
  dimensions: {
    length_mm?: number;
    width_mm?: number;
    thickness_mm?: number;
  };
  edging: string;
  tags: string[];
  extraction_confidence?: number;
  validation_warnings?: string[];
  secondary_description?: string;
  line_total?: number;
  line_total_ex_gst?: number;
  unit_cost_ex_gst?: number;
  taxable?: boolean;
  raw: Record<string, string>;
};

export type LabourAssumptions = {
  sheet_processing_hours_per_sheet: number;
  edging_hours_per_metre: number;
  assembly_hours_per_cabinet: number;
  drawer_hardware_hours_each: number;
  door_front_fitting_hours_each: number;
  installation_hours_per_cabinet: number;
  design_admin_checking_hours: number;
  risk_complexity_allowance_hours: number;
};

export type PricingAssumptions = {
  labour_sell_rate: number;
  internal_labour_cost: number;
  material_markup_percent: number;
  gst_percent: number;
  complexity: string;
  complexity_multiplier: number;
  margin_minimum_percent: number;
  margin_preferred_min_percent: number;
  margin_preferred_max_percent: number;
  labour: LabourAssumptions;
};

export type PricingRule = {
  id?: string;
  name: string;
  is_active: boolean;
  condition: {
    category?: PricingCategory;
    tag?: string;
    name_contains?: string;
    material_type_contains?: string;
  };
  triggered_items: Array<{
    name: string;
    category: PricingCategory;
    unit?: string;
    buy_price?: number;
    markup_percent?: number;
    quantity_formula: "per_item" | "per_unit_quantity" | "per_cabinet" | "fixed";
    quantity?: number;
  }>;
  reason: string;
  sort_order?: number;
};

export type AutoInclusion = {
  rule_id: string;
  rule_name: string;
  item_name: string;
  category: PricingCategory;
  quantity: number;
  unit: string;
  buy_price: number;
  markup_percent: number;
  reason: string;
  source_item_ids: string[];
  is_enabled: boolean;
};

export type PricingCalculation = {
  assumptions: PricingAssumptions;
  line_items: Array<StructuredPricingItem & { sell_price: number; total_buy_cost: number; total_sell_price: number }>;
  auto_inclusions: AutoInclusion[];
  totals: {
    direct_material_cost: number;
    hardware_cost: number;
    outsourced_subcontract_cost: number;
    total_direct_purchase_cost: number;
    marked_up_purchase_sell_price: number;
    estimated_labour_hours: number;
    labour_sell_value: number;
    labour_internal_cost: number;
    subtotal_ex_gst: number;
    gst: number;
    total_inc_gst: number;
    gross_profit: number;
    gross_margin_percent: number;
    effective_return_per_labour_hour: number;
  };
  warnings: string[];
};

export const DEFAULT_COLUMN_MAPPING = {
  name: ["item", "item name", "material", "description", "part name", "part"],
  description: ["description", "desc", "item description"],
  material_type: ["material type", "type", "material", "board", "finish"],
  quantity: ["quantity", "qty", "count", "pieces"],
  unit: ["unit", "units", "uom", "unit of measure"],
  line_total: ["total", "line total", "extended total"],
  unit_cost: ["amount", "unit cost", "unit price", "cost"],
  tax: ["tax", "taxable"],
  product_number: ["sku", "product number", "product code", "item code", "part number"],
  length_mm: ["length", "length mm", "l", "height", "height mm"],
  width_mm: ["width", "width mm", "w", "depth", "depth mm"],
  thickness_mm: ["thickness", "thick", "thickness mm"],
  cabinet_reference: ["cabinet", "cabinet ref", "cabinet reference", "unit", "room"],
  edging: ["edging", "edge", "edge tape", "banding"],
  hardware_tags: ["hardware", "hardware tags", "tags", "notes"],
} satisfies Record<string, string[]>;

export const DEFAULT_PRICE_LIST_COLUMN_MAPPING = {
  supplier: ["supplier", "vendor", "manufacturer"],
  product_number: ["product number", "product no", "sku", "item number", "part number", "product code"],
  supplier_item_code: ["supplier item code", "supplier code", "item code", "code"],
  barcode: ["barcode", "ean", "upc", "gtin"],
  description: ["description", "item description", "product description", "name", "item name"],
  category: ["category", "group", "product group", "supplier category"],
  dimensions: ["dimensions", "size", "length", "dimension"],
  unit: ["unit", "uom", "unit of measure"],
  unit_cost_ex_gst: ["unit cost excluding gst", "unit cost ex gst", "cost ex gst", "net price", "buy price", "price ex gst"],
  gst_inclusive_price: ["gst-inclusive price", "gst inclusive price", "price inc gst", "inc gst", "gross price"],
  pack_quantity: ["pack quantity", "pack qty", "pack", "carton qty"],
  minimum_order_quantity: ["minimum order quantity", "moq", "minimum qty"],
  discount_group: ["discount group", "discount code", "price group"],
  effective_date: ["effective date", "price date", "valid from"],
  notes: ["notes", "note", "comments"],
} satisfies Record<string, string[]>;

export type PriceListMappedRow = {
  supplier: string;
  product_number: string;
  original_sku: string;
  normalized_sku: string;
  supplier_item_code: string;
  barcode: string;
  description: string;
  category: string;
  dimensions: string;
  unit: string;
  unit_cost_ex_gst: number;
  gst_inclusive_price: number;
  cost_was_converted_from_gst: boolean;
  pack_quantity: number;
  minimum_order_quantity: number;
  discount_group: string;
  effective_date: string;
  notes: string;
  source_page?: number;
  extraction_confidence?: number;
};

export type StagedPriceListRow = {
  row_number: number;
  raw: Record<string, string>;
  mapped: PriceListMappedRow;
  status: "matched" | "unchanged" | "new" | "manual_review" | "invalid";
  match_type: string;
  pricing_item_id: string;
  warnings: string[];
  errors: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  price_change_percent: number;
};

export type SupplierImportProfile = {
  supplier: string;
  column_mapping: Record<string, string>;
  preferred_price_field?: "unit_cost_ex_gst" | "gst_inclusive_price";
  category_mapping_rules?: Record<string, string>;
  sku_patterns?: string[];
  gst_handling?: "ex_gst" | "inc_gst" | "auto";
  unit_normalisation_rules?: Record<string, string>;
  price_priority_logic?: string[];
};

export type QuoteImportItem = StructuredPricingItem & {
  supplier?: string;
  quote_reference?: string;
  quote_date?: string;
  section?: string;
  section_id?: string;
  section_key?: string;
  section_display_order?: number;
  source_file_name?: string;
  source_file_type?: string;
  source_item_code?: string;
  original_description?: string;
  supplier_gst_number?: string;
  source_page?: number;
  source_row?: number;
  original_imported_value?: Record<string, unknown>;
  parsed_normalized_value?: Record<string, unknown>;
  gst_treatment?: "ex_gst" | "inc_gst" | "unknown";
  line_total?: number;
  sell_price?: number;
  total_buy_price?: number;
  total_sell_price?: number;
  pricing_item_id?: string;
  match_type?: string;
  confidence_score?: number;
  warnings?: string[];
};

export type QuoteImportParseResult = {
  items: QuoteImportItem[];
  warnings: string[];
  metadata: {
    document_type?: "mozaik_material_list" | "supplier_quote" | "supplier_invoice" | "supplier_estimate" | "generic_pricing_document";
    document_number?: string;
    document_date?: string;
    due_date?: string;
    supplier_name?: string;
    supplier_gst_number?: string;
    supplier_email?: string;
    supplier_phone?: string;
    quote_reference?: string;
    quote_date?: string;
    valid_until?: string;
    account_reference?: string;
    project_reference?: string;
    salesperson?: string;
    designer_contact?: string;
    total_quoted_price?: number;
    subtotal_ex_gst?: number;
    gst_exclusive_total?: number;
    gst_amount?: number;
    total_inc_gst?: number;
    gst_inclusive_total?: number;
    gst_inclusive_total_label?: string;
    total_candidates?: Array<{ label: string; value: number }>;
    gst_was_calculated?: boolean;
    gst_exclusive_was_calculated?: boolean;
    gst_treatment?: "ex_gst" | "inc_gst" | "unknown";
    extraction_mode?: "text" | "ocr" | "table";
    summary_totals?: {
      subtotal_ex_gst?: number;
      tax?: number;
      deposit?: number;
      total_inc_gst?: number;
      balance_due?: number;
    };
    notes?: string[];
  };
};

type MozaikParseResult = {
  items: StructuredPricingItem[];
  warnings: string[];
  metadata?: Partial<QuoteImportParseResult["metadata"]>;
};

export const DEFAULT_LABOUR_PROFILE = {
  name: "Millbrook Standard",
  is_default: true,
  labour_sell_rate: 110,
  selectable_labour_rates: [100, 110, 120],
  internal_labour_cost: 36,
  material_markup_percent: 30,
  gst_percent: 15,
  assumptions: {
    sheet_processing_hours_per_sheet: 0.35,
    edging_hours_per_metre: 0.08,
    assembly_hours_per_cabinet: 1.2,
    drawer_hardware_hours_each: 0.35,
    door_front_fitting_hours_each: 0.25,
    installation_hours_per_cabinet: 0.9,
    design_admin_checking_hours: 2,
    risk_complexity_allowance_hours: 1,
  },
  complexity_multipliers: {
    simple: 0.9,
    standard: 1,
    detailed: 1.15,
    premium_bespoke: 1.3,
    high_risk_install: 1.4,
  },
  margin_targets: {
    minimum: 35,
    preferred_min: 40,
    preferred_max: 45,
    premium_min: 45,
    premium_max: 50,
  },
};

export const DEFAULT_PRICING_RULES: PricingRule[] = [
  {
    id: "rule-drawer-fixings",
    name: "Drawer system fixings",
    is_active: true,
    condition: { category: "drawer_systems_runners" },
    triggered_items: [
      { name: "Euro screws", category: "misc_fixings", unit: "ea", buy_price: 0.08, quantity_formula: "per_unit_quantity", quantity: 4 },
      { name: "Drawer fixing screws", category: "misc_fixings", unit: "ea", buy_price: 0.05, quantity_formula: "per_unit_quantity", quantity: 8 },
    ],
    reason: "Drawer systems require euro screws and runner fixing screws.",
    sort_order: 10,
  },
  {
    id: "rule-hinge-accessories",
    name: "Hinge plates and bumpers",
    is_active: true,
    condition: { category: "hinges" },
    triggered_items: [
      { name: "Hinge mounting plates", category: "hardware", unit: "ea", buy_price: 1.2, quantity_formula: "per_unit_quantity", quantity: 1 },
      { name: "Hinge screws", category: "misc_fixings", unit: "ea", buy_price: 0.04, quantity_formula: "per_unit_quantity", quantity: 4 },
      { name: "Door bumpers", category: "misc_fixings", unit: "ea", buy_price: 0.12, quantity_formula: "per_unit_quantity", quantity: 2 },
    ],
    reason: "Hinges require plates, fixing screws, and door bumpers.",
    sort_order: 20,
  },
  {
    id: "rule-shelf-pins",
    name: "Shelf pins",
    is_active: true,
    condition: { name_contains: "shelf" },
    triggered_items: [
      { name: "Shelf pins", category: "misc_fixings", unit: "ea", buy_price: 0.1, quantity_formula: "per_unit_quantity", quantity: 4 },
    ],
    reason: "Shelves require support pins.",
    sort_order: 30,
  },
  {
    id: "rule-panel-edge-tape",
    name: "Panel edge tape allowance",
    is_active: true,
    condition: { category: "sheet_materials" },
    triggered_items: [
      { name: "Edge tape allowance", category: "edging", unit: "m", buy_price: 0.7, quantity_formula: "per_item", quantity: 2 },
    ],
    reason: "Sheet panels commonly require visible edge tape and edging labour.",
    sort_order: 40,
  },
  {
    id: "rule-cabinet-consumables",
    name: "Cabinet assembly consumables",
    is_active: true,
    condition: { tag: "cabinet" },
    triggered_items: [
      { name: "Assembly consumables", category: "misc_fixings", unit: "set", buy_price: 3.5, quantity_formula: "per_cabinet", quantity: 1 },
    ],
    reason: "Cabinet builds require glue, brads, confirmats, and shop consumables.",
    sort_order: 50,
  },
  {
    id: "rule-install-consumables",
    name: "Install consumables",
    is_active: true,
    condition: { tag: "install" },
    triggered_items: [
      { name: "Install consumables", category: "misc_fixings", unit: "set", buy_price: 18, quantity_formula: "fixed", quantity: 1 },
    ],
    reason: "Install work requires packers, sealants, blades, and site fixings.",
    sort_order: 60,
  },
];

export function parseMozaikCsv(rawCsv: string, columnMapping: Record<string, string[]> = DEFAULT_COLUMN_MAPPING): MozaikParseResult {
  return parseMozaikRows(parseCsv(rawCsv), columnMapping);
}

export function parseMozaikFile(input: { fileName: string; fileBase64: string; fileType?: string }, columnMapping: Record<string, string[]> = DEFAULT_COLUMN_MAPPING): MozaikParseResult {
  const extension = input.fileType || input.fileName.split(".").pop()?.toLowerCase() || "csv";
  const buffer = Buffer.from(input.fileBase64, "base64");
  const rows = extension === "xlsx" ? parseXlsxRows(buffer) : parseCsv(buffer.toString("utf8"));
  return parseMozaikRows(rows, columnMapping);
}

const MOZAIK_HEADINGS = new Set([
  "materials",
  "banding",
  "doors",
  "applied panels",
  "drawer boxes",
  "inserts",
  "hinges",
  "locks",
  "pulls",
  "guides",
  "legs",
  "closet rods",
  "shelf pins",
  "drawer front fasteners",
  "spacers",
  "fasteners",
]);

function parseMozaikRows(rows: string[][], columnMapping: Record<string, string[]> = DEFAULT_COLUMN_MAPPING): MozaikParseResult {
  if (rows.length === 0) {
    return { items: [] as StructuredPricingItem[], warnings: ["CSV file is empty."] };
  }

  const headers = rows[0].map(normalizeHeader);
  if (isJobCostingCsv(headers)) {
    return parseJobCostingRows(rows, headers);
  }

  const warnings: string[] = [];
  const headingItemCounts = new Map<string, number>();
  let currentHeading = "";
  let sawHeading = false;
  const items: StructuredPricingItem[] = [];

  rows.slice(1).forEach((row, index) => {
    if (!row.some((value) => String(value || "").trim())) return;
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] || ""]));
      const read = (field: keyof typeof DEFAULT_COLUMN_MAPPING) => readMappedValue(raw, columnMapping[field] || []);
      const rowNumber = index + 2;
      const rawName = cleanText(read("name") || read("material_type"));
      const rawDescription = cleanText(read("description"));
      const rawQuantity = cleanText(read("quantity"));
      const rawUnit = cleanText(read("unit"));
      const isHeading = isMozaikHeadingRow({
        item: rawName,
        description: rawDescription,
        quantity: rawQuantity,
        unit: rawUnit,
        amount: cleanText(read("unit_cost")),
        total: cleanText(read("line_total")),
      });

      if (isHeading) {
        sawHeading = true;
        if (currentHeading && (headingItemCounts.get(currentHeading) || 0) === 0) {
          warnings.push(`Heading "${currentHeading}" has no items.`);
        }
        currentHeading = rawName;
        headingItemCounts.set(currentHeading, 0);
        return;
      }

      if (sawHeading && !currentHeading) {
        warnings.push(`Row ${rowNumber}: item appears before a Mozaik heading.`);
      }

      const name = cleanText(read("name") || read("material_type") || `CSV item ${index + 1}`);
      const materialType = cleanText(read("material_type"));
      const tags = splitTags(read("hardware_tags"));
      const category = currentHeading ? categoryFromMozaikHeading(currentHeading) : categorizePricingItem({ name, material_type: materialType, tags });
      const quantity = positiveNumber(read("quantity"), 1);
      const unitCost = nullableNumber(read("unit_cost")) ?? 0;
      const explicitLineTotal = nullableNumber(read("line_total"));
      const originalSku = cleanText(read("product_number"));

      if (!read("name")) {
        warnings.push(`Row ${rowNumber}: item name was inferred.`);
      }

      items.push({
        source_row: rowNumber,
        source: "mozaik_csv",
        name,
        description: rawDescription,
        material_type: materialType,
        heading_category: currentHeading,
        category,
        quantity,
        unit: rawUnit || (category === "edging" ? "m" : "ea"),
        buy_price: unitCost,
        unit_cost_ex_gst: unitCost,
        line_total: explicitLineTotal ?? undefined,
        line_total_ex_gst: explicitLineTotal ?? undefined,
        markup_percent: DEFAULT_LABOUR_PROFILE.material_markup_percent,
        original_sku: originalSku,
        normalized_sku: normalizeSku(originalSku),
        cabinet_reference: cleanText(read("cabinet_reference")),
        dimensions: {
          length_mm: optionalNumber(read("length_mm")),
          width_mm: optionalNumber(read("width_mm")),
          thickness_mm: optionalNumber(read("thickness_mm")),
        },
        edging: cleanText(read("edging")),
        tags,
        raw,
      });
      if (currentHeading) headingItemCounts.set(currentHeading, (headingItemCounts.get(currentHeading) || 0) + 1);
  });

  if (currentHeading && (headingItemCounts.get(currentHeading) || 0) === 0) {
    warnings.push(`Heading "${currentHeading}" has no items.`);
  }

  return { items, warnings };
}

function isJobCostingCsv(headers: string[]) {
  const required = ["tax", "item", "description", "qty", "units", "amount", "total"];
  return required.every((header) => headers.includes(header));
}

function parseJobCostingRows(rows: string[][], headers: string[]): MozaikParseResult {
  const warnings: string[] = [];
  const items: StructuredPricingItem[] = [];
  const headingItemCounts = new Map<string, number>();
  const summaryTotals: QuoteImportParseResult["metadata"]["summary_totals"] = {};
  const summary = {
    subtotal_ex_gst: undefined as number | undefined,
    gst_amount: undefined as number | undefined,
    total_inc_gst: undefined as number | undefined,
    deposit: undefined as number | undefined,
    balance_due: undefined as number | undefined,
  };
  let currentHeading = "";

  const finishHeading = () => {
    if (currentHeading && (headingItemCounts.get(currentHeading) || 0) === 0) {
      warnings.push(`Heading "${currentHeading}" has no items.`);
    }
  };

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] || ""]));
    const itemValue = cleanText(raw.item);
    const descriptionValue = cleanText(raw.description);
    const quantityValue = cleanText(raw.qty);
    const unitValue = cleanText(raw.units);
    const amountValue = cleanText(raw.amount);
    const totalValue = cleanText(raw.total);

    if (![itemValue, descriptionValue, quantityValue, unitValue, amountValue, totalValue].some(Boolean)) return;

    const summaryKey = normalizeSummaryLabel(itemValue);
    if (summaryKey) {
      const total = nullableNumber(totalValue);
      const amount = nullableNumber(amountValue);
      if (summaryKey === "subtotal") {
        summary.subtotal_ex_gst = total ?? amount ?? undefined;
        summaryTotals.subtotal_ex_gst = summary.subtotal_ex_gst;
      } else if (summaryKey === "tax") {
        summary.gst_amount = total ?? amount ?? undefined;
        summaryTotals.tax = summary.gst_amount;
      } else if (summaryKey === "deposit") {
        summary.deposit = total ?? amount ?? undefined;
        summaryTotals.deposit = summary.deposit;
      } else if (summaryKey === "total") {
        summary.total_inc_gst = total ?? amount ?? undefined;
        summaryTotals.total_inc_gst = summary.total_inc_gst;
      } else if (summaryKey === "balance_due") {
        summary.balance_due = total ?? amount ?? undefined;
        summaryTotals.balance_due = summary.balance_due;
      }
      return;
    }

    if (isMozaikHeadingRow({
      item: itemValue,
      description: descriptionValue,
      quantity: quantityValue,
      unit: unitValue,
      amount: amountValue,
      total: totalValue,
    })) {
      finishHeading();
      currentHeading = itemValue;
      headingItemCounts.set(currentHeading, 0);
      return;
    }

    const lowerItem = itemValue.toLowerCase();
    const isLabour = lowerItem === "labor" || lowerItem === "labour";
    const isAddOn = lowerItem === "add-on" || lowerItem === "addon";
    const parsedQuantity = nullableNumber(quantityValue);
    const unitCost = nullableNumber(amountValue);
    const lineTotal = nullableNumber(totalValue);
    const hasCost = (unitCost ?? 0) > 0 || (lineTotal ?? 0) > 0;

    if (isAddOn && !descriptionValue && !hasCost) {
      warnings.push(`Row ${rowNumber}: Add-On row has no description.`);
      return;
    }

    if (!currentHeading && !isLabour) {
      warnings.push(`Row ${rowNumber}: item appears before any heading.`);
    }
    if (parsedQuantity == null && hasCost) {
      warnings.push(`Row ${rowNumber}: row has a cost but no quantity; quantity defaulted to 1.`);
    }
    if (lineTotal == null && unitCost != null) {
      warnings.push(`Row ${rowNumber}: row has a unit cost but no line total.`);
    }
    if (isAddOn && !descriptionValue) {
      warnings.push(`Row ${rowNumber}: Add-On row has no description.`);
    }

    const category: PricingCategory = isLabour ? "labour" : currentHeading ? categoryFromMozaikHeading(currentHeading) : isAddOn ? "misc_fixings" : categorizePricingItem({ name: itemValue, material_type: descriptionValue, tags: [] });
    const quantity = parsedQuantity ?? 1;
    const buyPrice = unitCost ?? (lineTotal != null && quantity > 0 ? roundCurrency(lineTotal / quantity) : 0);
    const effectiveLineTotal = lineTotal ?? (unitCost != null ? roundCurrency(unitCost * quantity) : 0);
    const name = isLabour ? (descriptionValue || "Labour") : isAddOn ? (descriptionValue || "Add-On") : itemValue;
    const taxable = parseBoolean(raw.tax);

    items.push({
      source_row: rowNumber,
      source: "mozaik_job_costing_csv",
      name,
      description: isLabour ? (descriptionValue || "Labour") : isAddOn ? descriptionValue : itemValue,
      secondary_description: !isAddOn && !isLabour ? descriptionValue || undefined : undefined,
      material_type: isLabour ? "Labour" : isAddOn ? "Add-On" : descriptionValue,
      heading_category: isLabour ? "Labour" : currentHeading || (isAddOn ? "Add-On" : ""),
      category,
      quantity,
      unit: unitValue || (isLabour ? "Hrs" : "ea"),
      buy_price: buyPrice,
      unit_cost_ex_gst: buyPrice,
      line_total: effectiveLineTotal,
      line_total_ex_gst: effectiveLineTotal,
      markup_percent: DEFAULT_LABOUR_PROFILE.material_markup_percent,
      cabinet_reference: "",
      dimensions: {},
      edging: "",
      tags: isLabour ? ["labour"] : isAddOn ? ["add_on"] : [],
      taxable,
      validation_warnings: [],
      raw,
    });

    if (currentHeading) headingItemCounts.set(currentHeading, (headingItemCounts.get(currentHeading) || 0) + 1);
  });

  finishHeading();
  const importedLineSubtotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.line_total_ex_gst ?? item.line_total ?? Number(item.buy_price || 0) * Number(item.quantity || 0)), 0));
  if (summary.subtotal_ex_gst != null && Math.abs(importedLineSubtotal - summary.subtotal_ex_gst) > 0.02) {
    warnings.push(`Imported line totals (${formatCurrencyForWarning(importedLineSubtotal)}) do not match subtotal (${formatCurrencyForWarning(summary.subtotal_ex_gst)}).`);
  }
  if (summary.subtotal_ex_gst != null && summary.gst_amount != null && Math.abs(roundCurrency(summary.subtotal_ex_gst * 0.15) - summary.gst_amount) > 0.02) {
    warnings.push("GST does not reconcile with the 15% subtotal.");
  }
  if (summary.subtotal_ex_gst != null && summary.gst_amount != null && summary.total_inc_gst != null && Math.abs(roundCurrency(summary.subtotal_ex_gst + summary.gst_amount) - summary.total_inc_gst) > 0.02) {
    warnings.push("Total does not match subtotal plus tax.");
  }

  return {
    items,
    warnings,
    metadata: {
      document_type: "mozaik_material_list" as const,
      gst_treatment: "ex_gst" as const,
      extraction_mode: "table" as const,
      subtotal_ex_gst: summary.subtotal_ex_gst,
      gst_exclusive_total: summary.subtotal_ex_gst,
      gst_amount: summary.gst_amount,
      total_inc_gst: summary.total_inc_gst,
      gst_inclusive_total: summary.total_inc_gst,
      total_quoted_price: summary.total_inc_gst,
      summary_totals: summaryTotals,
    },
  };
}

function isMozaikHeadingRow(input: { item: string; description?: string; quantity?: string; unit?: string; amount?: string; total?: string }) {
  const item = cleanText(input.item);
  if (!item) return false;
  if (cleanText(input.description) || cleanText(input.quantity) || cleanText(input.unit) || cleanText(input.amount) || cleanText(input.total)) {
    return false;
  }

  const normalizedItem = item.toLowerCase();
  if (normalizeSummaryLabel(item)) return false;
  if (normalizedItem === "add-on" || normalizedItem === "addon" || normalizedItem === "labor" || normalizedItem === "labour") {
    return false;
  }

  return true;
}

function normalizeSummaryLabel(value: string) {
  const label = cleanText(value).toLowerCase();
  if (label === "subtotal") return "subtotal";
  if (label === "tax") return "tax";
  if (label === "deposit") return "deposit";
  if (label === "total") return "total";
  if (label === "balance due") return "balance_due";
  return "";
}

export function parsePriceListFile(input: { fileName: string; fileBase64: string; fileType?: string; ocrText?: string }) {
  const extension = input.fileType || input.fileName.split(".").pop()?.toLowerCase() || "csv";
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (extension === "xlsx") {
    return rowsToObjects(parseXlsxRows(buffer));
  }
  if (extension === "csv") {
    return rowsToObjects(parseCsv(buffer.toString("utf8")));
  }
  if (extension === "pdf") {
    return parseSupplierPdf({ buffer, ocrText: input.ocrText });
  }
  throw new Error("Unsupported price list file type.");
}

export function parseSupplierPdf(input: { buffer?: Buffer; fileBase64?: string; ocrText?: string }) {
  const buffer = input.buffer || Buffer.from(input.fileBase64 || "", "base64");
  const extractedText = cleanExtractedPdfText(buffer.toString("latin1"));
  const isTextBased = extractedText.split(/\s+/).filter(Boolean).length >= 4;
  const text = isTextBased ? extractedText : String(input.ocrText || "").trim();
  if (!text) {
    return [] as Record<string, string>[];
  }

  const confidence = isTextBased ? 0.92 : 0.62;
  const pages = text.split(/\f|---\s*page\s*\d+\s*---/i).filter((page) => cleanText(page));
  const rows: Record<string, string>[] = [];
  pages.forEach((pageText, pageIndex) => {
    const tableRows = parseDelimitedTableText(pageText);
    tableRows.forEach((row) => {
      rows.push({
        ...row,
        "__source_page": String(pageIndex + 1),
        "__extraction_confidence": String(confidence),
        "__extraction_mode": isTextBased ? "text" : "ocr",
      });
    });
  });
  return rows;
}

export function parseQuoteImportFile(input: {
  fileName: string;
  fileBase64: string;
  fileType?: string;
  ocrText?: string;
  pricingItems?: EntityRecord[];
  defaultMarkupPercent?: number;
}): QuoteImportParseResult {
  const fileType = input.fileType || input.fileName.split(".").pop()?.toLowerCase() || "csv";
  const defaultMarkup = Number(input.defaultMarkupPercent || DEFAULT_LABOUR_PROFILE.material_markup_percent);
  if (fileType === "pdf") {
    return parseQuotePdfImport(input, defaultMarkup);
  }

  const parsed = parseMozaikFile({ fileName: input.fileName, fileBase64: input.fileBase64, fileType });
  return {
    items: parsed.items.map((item) => enrichQuoteImportItem(item, {
      fileName: input.fileName,
      fileType,
      pricingItems: input.pricingItems || [],
      defaultMarkup,
      gstTreatment: "ex_gst",
      metadata: parsed.metadata,
    })),
    warnings: parsed.warnings,
    metadata: { document_type: "mozaik_material_list", gst_treatment: "ex_gst", extraction_mode: "table", ...(parsed.metadata || {}) },
  };
}

function parseQuotePdfImport(input: { fileName: string; fileBase64: string; fileType?: string; ocrText?: string; pricingItems?: EntityRecord[] }, defaultMarkup: number): QuoteImportParseResult {
  const buffer = Buffer.from(input.fileBase64, "base64");
  const extractedText = cleanExtractedPdfText(buffer.toString("latin1"));
  const isTextBased = extractedText.split(/\s+/).filter(Boolean).length >= 4;
  const text = isTextBased ? extractedText : String(input.ocrText || "").trim();
  const confidence = isTextBased ? 0.92 : 0.62;
  const warnings: string[] = [];
  if (!text) warnings.push("PDF text could not be extracted.");
  if (!isTextBased) warnings.push("OCR-extracted PDF values require review before commit.");

  const tableRows = parseSupplierPdf({ buffer, ocrText: input.ocrText });
  const metadata = extractQuotePdfMetadata(text, isTextBased ? "text" : "ocr");
  const tableItems = tableRows
    .map((row, index) => quotePdfRowToItem(row, index, metadata, confidence, input.fileName, input.pricingItems || [], defaultMarkup))
    .filter((item): item is QuoteImportItem => Boolean(item));
  const textItems = tableItems.length > 0 ? [] : parseSupplierQuoteTextRows(text, metadata, confidence, input.fileName, input.pricingItems || [], defaultMarkup);
  const extractedItems = tableItems.length > 0 ? tableItems : textItems;

  if (extractedItems.length > 0) {
    warnings.push(...validateSupplierQuoteExtraction(extractedItems, metadata));
    return { items: extractedItems, warnings, metadata };
  }

  const fallbackTotal = quoteImportTotalForLine(metadata);
  if (fallbackTotal.exGst > 0) {
    const documentLabel = documentTypeLabel(metadata.document_type);
    const documentNumber = metadata.document_number || metadata.quote_reference || "";
    const description = [metadata.supplier_name, documentNumber ? `${documentLabel} ${documentNumber}` : "", `PDF imported ${documentLabel.toLowerCase()}`].filter(Boolean).join(" - ");
    return {
      items: [enrichQuoteImportItem({
        source: "quote_pdf",
        source_page: 1,
        name: description || "PDF imported supplier quote",
        description,
        material_type: `imported ${documentLabel.toLowerCase()}`,
        category: "subcontracted_items",
        quantity: 1,
        unit: "quote",
        buy_price: fallbackTotal.exGst,
        markup_percent: defaultMarkup,
        supplier: metadata.supplier_name || "",
        original_sku: "",
        normalized_sku: "",
        cabinet_reference: "",
        dimensions: {},
        edging: "",
        tags: ["pdf_import"],
        extraction_confidence: confidence,
        raw: {
          text,
          total_inc_gst: metadata.gst_inclusive_total ? String(metadata.gst_inclusive_total) : "",
          total_ex_gst: String(fallbackTotal.exGst),
          gst_amount: metadata.gst_amount ? String(metadata.gst_amount) : "",
        },
      }, {
        fileName: input.fileName,
        fileType: "pdf",
        pricingItems: input.pricingItems || [],
        defaultMarkup,
        gstTreatment: metadata.gst_treatment || "unknown",
        metadata,
        lineTotal: fallbackTotal.exGst,
      })],
      warnings: [...warnings, ...validateSupplierQuoteExtraction([], metadata)],
      metadata,
    };
  }

  warnings.push("No clear PDF line items or total quoted price were found.");
  return { items: [], warnings, metadata };
}

export function stagePriceListRows(input: {
  rows: Record<string, string>[];
  supplier: string;
  mapping?: Record<string, string>;
  pricingItems: EntityRecord[];
  movementThresholdPercent?: number;
}) {
  const supplier = cleanText(input.supplier);
  const movementThreshold = Number(input.movementThresholdPercent || 15);
  const mapping = input.mapping || inferPriceListColumnMapping(input.rows[0] || {});
  const duplicateUploadedSkus = findDuplicates(input.rows.map((row) => normalizeSku(readMappedPriceListValue(row, mapping, "product_number")).toLowerCase()).filter(Boolean));
  const duplicateDbSkus = findDuplicates(input.pricingItems
    .filter((item) => cleanText(item.supplier).toLowerCase() === supplier.toLowerCase())
    .map((item) => normalizedSkuForItem(item).toLowerCase())
    .filter(Boolean));

  return input.rows.map((row, index) => {
    const mapped = mapPriceListRow(row, mapping, supplier);
    const warnings: string[] = [];
    const errors: string[] = [];
    if (!mapped.product_number && !mapped.supplier_item_code && !mapped.barcode) warnings.push("Missing product number / SKU.");
    if (mapped.normalized_sku && duplicateUploadedSkus.has(mapped.normalized_sku.toLowerCase())) warnings.push("Duplicate SKU in uploaded file.");
    if (mapped.normalized_sku && duplicateDbSkus.has(mapped.normalized_sku.toLowerCase())) warnings.push("Duplicate SKU already exists in database.");
    if (!mapped.unit) warnings.push("Missing unit.");
    if (mapped.cost_was_converted_from_gst) warnings.push("GST-inclusive price was converted to an ex-GST cost.");
    if (!mapped.unit_cost_ex_gst && !mapped.gst_inclusive_price) errors.push("Missing cost.");
    if (mapped.extraction_confidence != null && mapped.extraction_confidence < 0.8) warnings.push("Low OCR confidence. Review before commit.");
    if (cleanText(row.__extraction_mode) === "ocr") warnings.push("OCR-extracted PDF row requires review.");
    const match = matchPriceListRow(mapped, input.pricingItems);
    if (match.item && cleanText(match.item.supplier).toLowerCase() !== supplier.toLowerCase()) warnings.push("Supplier mismatch.");
    if (match.item && match.item.is_active === false) warnings.push("Inactive item match.");

    const oldCost = Number(match.item?.buy_price || 0);
    const newCost = mapped.unit_cost_ex_gst || roundCurrency(mapped.gst_inclusive_price / 1.15);
    const priceChangePercent = oldCost > 0 ? roundCurrency((newCost - oldCost) / oldCost * 100) : 0;
    if (oldCost > 0 && Math.abs(priceChangePercent) >= movementThreshold) warnings.push(`Large price movement (${priceChangePercent}%).`);
    if (match.item && Number(match.item.pack_quantity || 0) > 0 && mapped.pack_quantity > 0 && Number(match.item.pack_quantity) !== mapped.pack_quantity) warnings.push("Pack quantity changed.");

    const newValues = {
      buy_price: newCost,
      name: mapped.description || match.item?.name || "",
      description: mapped.description,
      unit: mapped.unit,
      pack_quantity: mapped.pack_quantity,
      minimum_order_quantity: mapped.minimum_order_quantity,
      supplier,
      product_number: mapped.product_number,
      original_sku: mapped.original_sku,
      normalized_sku: mapped.normalized_sku,
      supplier_sku: mapped.product_number,
      supplier_item_code: mapped.supplier_item_code,
      barcode: mapped.barcode,
      supplier_reference: mapped.supplier_item_code || mapped.product_number,
      discount_group: mapped.discount_group,
      effective_date: mapped.effective_date,
      dimensions: mapped.dimensions,
      last_price_update_at: "",
    };
    const oldValues = match.item ? {
      buy_price: match.item.buy_price || 0,
      name: match.item.name || "",
      description: match.item.description || "",
      unit: match.item.unit || "",
      pack_quantity: match.item.pack_quantity || 0,
      minimum_order_quantity: match.item.minimum_order_quantity || 0,
      supplier: match.item.supplier || "",
      product_number: match.item.product_number || match.item.supplier_sku || "",
      original_sku: match.item.original_sku || match.item.product_number || match.item.supplier_sku || "",
      normalized_sku: match.item.normalized_sku || normalizeSku(match.item.product_number || match.item.supplier_sku || ""),
      supplier_sku: match.item.supplier_sku || "",
      supplier_item_code: match.item.supplier_item_code || "",
      barcode: match.item.barcode || "",
      supplier_reference: match.item.supplier_reference || "",
      discount_group: match.item.discount_group || "",
      effective_date: match.item.effective_date || "",
      dimensions: match.item.dimensions || "",
      last_price_update_at: match.item.last_price_update_at || "",
    } : {};

    return {
      row_number: index + 2,
      raw: row,
      mapped,
      status: errors.length > 0 ? "invalid" : match.item ? (priceChangePercent === 0 ? "unchanged" : "matched") : (mapped.product_number || mapped.supplier_item_code || mapped.barcode ? "new" : "manual_review"),
      match_type: match.matchType,
      pricing_item_id: String(match.item?.id || ""),
      warnings,
      errors,
      old_values: oldValues,
      new_values: newValues,
      price_change_percent: priceChangePercent,
    } satisfies StagedPriceListRow;
  });
}

export function inferPriceListColumnMapping(row: Record<string, string>) {
  const headers = Object.keys(row || {});
  const mapping: Record<string, string> = {};
  Object.entries(DEFAULT_PRICE_LIST_COLUMN_MAPPING).forEach(([field, aliases]) => {
    const matchedHeader = headers.find((header) => aliases.map(normalizeHeader).includes(normalizeHeader(header)));
    if (matchedHeader) mapping[field] = matchedHeader;
  });
  return mapping;
}

export function buildSupplierImportProfile(input: {
  supplier: string;
  row?: Record<string, string>;
  mapping?: Record<string, string>;
  preferredPriceField?: "unit_cost_ex_gst" | "gst_inclusive_price";
}): SupplierImportProfile {
  return {
    supplier: cleanText(input.supplier),
    column_mapping: input.mapping || inferPriceListColumnMapping(input.row || {}),
    preferred_price_field: input.preferredPriceField || "unit_cost_ex_gst",
    category_mapping_rules: {},
    sku_patterns: [],
    gst_handling: "auto",
    unit_normalisation_rules: { each: "ea", metre: "m", meter: "m" },
    price_priority_logic: ["unit_cost_ex_gst", "gst_inclusive_price"],
  };
}

export function validatePriceListSchema(mapping: Record<string, string>) {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!mapping.product_number) errors.push("SKU/product code is required.");
  if (!mapping.description) errors.push("Description is required.");
  if (!mapping.unit) errors.push("Unit or quantity type is required.");
  if (!mapping.unit_cost_ex_gst && !mapping.gst_inclusive_price) errors.push("Buy price or GST-inclusive price is required.");
  Object.entries(DEFAULT_PRICE_LIST_COLUMN_MAPPING).forEach(([field]) => {
    if (!mapping[field]) warnings.push(`${field} is not mapped.`);
  });
  return { valid: errors.length === 0, warnings, errors };
}

export function normalizeSku(value: unknown) {
  let normalized = cleanText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-_]+/g, "")
    .replace(/[^A-Z0-9]/g, "");
  normalized = normalized.replace(/MM$/, "");
  return normalized;
}

export function buildPriceListSummary(rows: StagedPriceListRow[]) {
  return {
    total_rows: rows.length,
    matched: rows.filter((row) => row.status === "matched").length,
    unchanged: rows.filter((row) => row.status === "unchanged").length,
    new_items: rows.filter((row) => row.status === "new").length,
    manual_review: rows.filter((row) => row.status === "manual_review").length,
    invalid: rows.filter((row) => row.status === "invalid").length,
    price_increases: rows.filter((row) => row.price_change_percent > 0).length,
    price_decreases: rows.filter((row) => row.price_change_percent < 0).length,
    warnings: rows.filter((row) => row.warnings.length > 0).length,
    errors: rows.filter((row) => row.errors.length > 0).length,
  };
}

export function categorizePricingItem(item: { name?: string; material_type?: string; tags?: string[] }): PricingCategory {
  const haystack = `${item.name || ""} ${item.material_type || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (/(edge|edging|banding|tape)/.test(haystack)) return "edging";
  if (/(door|front|drawer front|melamine door|painted)/.test(haystack)) return "doors_fronts";
  if (/(drawer|runner|tandem|legrabox|metabox|antaro)/.test(haystack)) return "drawer_systems_runners";
  if (/(hinge|clip top|blumotion|plate)/.test(haystack)) return "hinges";
  if (/(handle|pull|knob)/.test(haystack)) return "handles_pulls";
  if (/\b(bin|bins|waste|accessory|accessories|insert|tray|lazy susan)\b/.test(haystack)) return "bins_accessories";
  if (/(subcontract|outsourc|stone|glass|powdercoat|paint|lacquer)/.test(haystack)) return "subcontracted_items";
  if (/(screw|fixing|bracket|glue|bumper|pin|consumable)/.test(haystack)) return "misc_fixings";
  if (/(board|sheet|panel|mdf|ply|melamine|veneer|hpl|laminate)/.test(haystack)) return "sheet_materials";
  if (/(hardware|bracket|rail)/.test(haystack)) return "hardware";
  return "misc_fixings";
}

export function applyPricingRules(items: StructuredPricingItem[], rules: PricingRule[]): AutoInclusion[] {
  const activeRules = [...rules]
    .filter((rule) => rule.is_active !== false)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  const inclusions: AutoInclusion[] = [];

  activeRules.forEach((rule) => {
    const matchedItems = items.filter((item) => itemMatchesRule(item, rule));
    if (matchedItems.length === 0) {
      return;
    }

    rule.triggered_items.forEach((triggeredItem) => {
      const quantity = roundCurrency(calculateTriggeredQuantity(triggeredItem.quantity_formula, triggeredItem.quantity || 1, matchedItems));
      if (quantity <= 0) {
        return;
      }

      inclusions.push({
        rule_id: rule.id || rule.name,
        rule_name: rule.name,
        item_name: triggeredItem.name,
        category: triggeredItem.category,
        quantity,
        unit: triggeredItem.unit || "ea",
        buy_price: Number(triggeredItem.buy_price || 0),
        markup_percent: Number(triggeredItem.markup_percent ?? DEFAULT_LABOUR_PROFILE.material_markup_percent),
        reason: rule.reason,
        source_item_ids: matchedItems.map((item) => item.id || String(item.source_row || item.name)),
        is_enabled: true,
      });
    });
  });

  return inclusions;
}

export function calculatePricing(
  items: StructuredPricingItem[],
  autoInclusions: AutoInclusion[],
  assumptions: PricingAssumptions
): PricingCalculation {
  const enabledInclusions = autoInclusions.filter((item) => item.is_enabled !== false);
  const normalizedItems = items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const totalBuyCost = roundCurrency(nullableNumber(item.line_total_ex_gst ?? item.line_total) ?? (Number(item.buy_price) || 0) * quantity);
    const sellPrice = roundCurrency((Number(item.buy_price) || 0) * (1 + (Number(item.markup_percent) || 0) / 100));
    return {
      ...item,
      sell_price: sellPrice,
      total_buy_cost: totalBuyCost,
      total_sell_price: roundCurrency(totalBuyCost * (1 + (Number(item.markup_percent) || 0) / 100)),
    };
  });
  const inclusionItems = enabledInclusions.map((item) => ({
    category: item.category,
    totalBuyCost: roundCurrency((Number(item.buy_price) || 0) * (Number(item.quantity) || 0)),
    totalSellPrice: roundCurrency((Number(item.buy_price) || 0) * (1 + (Number(item.markup_percent) || 0) / 100) * (Number(item.quantity) || 0)),
  }));
  const purchaseRows = [
    ...normalizedItems.map((item) => ({ category: item.category, totalBuyCost: item.total_buy_cost, totalSellPrice: item.total_sell_price })),
    ...inclusionItems,
  ];
  const directMaterialCost = sumByCategory(purchaseRows, ["sheet_materials", "edging", "doors_fronts", "misc_fixings"]);
  const hardwareCost = sumByCategory(purchaseRows, ["hardware", "drawer_systems_runners", "hinges", "handles_pulls", "bins_accessories"]);
  const outsourcedCost = sumByCategory(purchaseRows, ["subcontracted_items"]);
  const totalDirectPurchaseCost = roundCurrency(directMaterialCost + hardwareCost + outsourcedCost);
  const markedUpPurchaseSellPrice = roundCurrency(purchaseRows.reduce((sum, item) => sum + item.totalSellPrice, 0));
  const estimatedLabourHours = roundHours(estimateLabourHours(items, assumptions.labour) * assumptions.complexity_multiplier);
  const labourSellValue = roundCurrency(estimatedLabourHours * assumptions.labour_sell_rate);
  const labourInternalCost = roundCurrency(estimatedLabourHours * assumptions.internal_labour_cost);
  const subtotalExGst = roundCurrency(markedUpPurchaseSellPrice + labourSellValue);
  const gst = roundCurrency(subtotalExGst * assumptions.gst_percent / 100);
  const totalIncGst = roundCurrency(subtotalExGst + gst);
  const grossProfit = roundCurrency(subtotalExGst - totalDirectPurchaseCost - labourInternalCost);
  const grossMarginPercent = subtotalExGst > 0 ? roundCurrency(grossProfit / subtotalExGst * 100) : 0;
  const effectiveReturnPerLabourHour = estimatedLabourHours > 0 ? roundCurrency(grossProfit / estimatedLabourHours) : 0;
  const warnings = buildPricingWarnings({
    grossMarginPercent,
    estimatedLabourHours,
    totalDirectPurchaseCost,
    assumptions,
  });

  return {
    assumptions,
    line_items: normalizedItems,
    auto_inclusions: enabledInclusions,
    totals: {
      direct_material_cost: directMaterialCost,
      hardware_cost: hardwareCost,
      outsourced_subcontract_cost: outsourcedCost,
      total_direct_purchase_cost: totalDirectPurchaseCost,
      marked_up_purchase_sell_price: markedUpPurchaseSellPrice,
      estimated_labour_hours: estimatedLabourHours,
      labour_sell_value: labourSellValue,
      labour_internal_cost: labourInternalCost,
      subtotal_ex_gst: subtotalExGst,
      gst,
      total_inc_gst: totalIncGst,
      gross_profit: grossProfit,
      gross_margin_percent: grossMarginPercent,
      effective_return_per_labour_hour: effectiveReturnPerLabourHour,
    },
    warnings,
  };
}

export function buildPricingAssumptions(profile: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): PricingAssumptions {
  const source = { ...DEFAULT_LABOUR_PROFILE, ...profile, ...overrides };
  const assumptions = {
    ...DEFAULT_LABOUR_PROFILE.assumptions,
    ...asObject(profile.assumptions),
    ...asObject(overrides.labour),
  };
  const multipliers = {
    ...DEFAULT_LABOUR_PROFILE.complexity_multipliers,
    ...asObject(profile.complexity_multipliers),
  };
  const targets = {
    ...DEFAULT_LABOUR_PROFILE.margin_targets,
    ...asObject(profile.margin_targets),
  };
  const complexity = String(overrides.complexity || "standard");
  const complexityMultiplier = numberOr(overrides.complexity_multiplier, Number(multipliers[complexity as keyof typeof multipliers] || 1));

  return {
    labour_sell_rate: numberOr(source.labour_sell_rate, 110),
    internal_labour_cost: numberOr(source.internal_labour_cost, 36),
    material_markup_percent: numberOr(source.material_markup_percent, 30),
    gst_percent: numberOr(source.gst_percent, 15),
    complexity,
    complexity_multiplier: complexityMultiplier,
    margin_minimum_percent: numberOr(targets.minimum, 35),
    margin_preferred_min_percent: numberOr(targets.preferred_min, 40),
    margin_preferred_max_percent: numberOr(targets.preferred_max, 45),
    labour: assumptions as LabourAssumptions,
  };
}

export function buildScenarios(items: StructuredPricingItem[], autoInclusions: AutoInclusion[], baseAssumptions: PricingAssumptions) {
  return [
    { name: "Minimum acceptable", labourRate: 100, markup: 25, complexityMultiplier: Math.max(0.9, baseAssumptions.complexity_multiplier) },
    { name: "Recommended", labourRate: baseAssumptions.labour_sell_rate, markup: baseAssumptions.material_markup_percent, complexityMultiplier: baseAssumptions.complexity_multiplier },
    { name: "Premium", labourRate: 120, markup: 40, complexityMultiplier: Math.max(1.15, baseAssumptions.complexity_multiplier) },
  ].map((scenario) => {
    const scenarioItems = items.map((item) => ({ ...item, markup_percent: scenario.markup }));
    const scenarioInclusions = autoInclusions.map((item) => ({ ...item, markup_percent: scenario.markup }));
    const calculation = calculatePricing(scenarioItems, scenarioInclusions, {
      ...baseAssumptions,
      labour_sell_rate: scenario.labourRate,
      material_markup_percent: scenario.markup,
      complexity_multiplier: scenario.complexityMultiplier,
    });
    return {
      name: scenario.name,
      subtotal_ex_gst: calculation.totals.subtotal_ex_gst,
      gst: calculation.totals.gst,
      total_inc_gst: calculation.totals.total_inc_gst,
      gross_margin_percent: calculation.totals.gross_margin_percent,
      labour_hours: calculation.totals.estimated_labour_hours,
      labour_rate: scenario.labourRate,
      material_markup_percent: scenario.markup,
    };
  });
}

export function compareHistoricalJobs(calculation: PricingCalculation, historicalJobs: EntityRecord[] = [], jobType = "") {
  const peers = historicalJobs.filter((job) => !jobType || String(job.job_type || "") === jobType);
  if (peers.length < 3) {
    return {
      peer_count: peers.length,
      anomalies: [],
      averages: null,
    };
  }

  const averages = {
    material_cost: average(peers.map((job) => Number(job.material_cost || 0))),
    labour_hours: average(peers.map((job) => Number(job.labour_hours || 0))),
    total_value: average(peers.map((job) => Number(job.total_value || 0))),
    margin_percent: average(peers.map((job) => Number(job.margin_percent || 0))),
    return_per_labour_hour: average(peers.map((job) => Number(job.return_per_labour_hour || 0))),
  };
  const anomalies = [];
  if (calculation.totals.gross_margin_percent < averages.margin_percent * 0.85) {
    anomalies.push("Margin is materially below similar historical jobs.");
  }
  if (calculation.totals.estimated_labour_hours < averages.labour_hours * 0.75) {
    anomalies.push("Labour hours are materially below similar historical jobs.");
  }
  if (calculation.totals.effective_return_per_labour_hour < averages.return_per_labour_hour * 0.8) {
    anomalies.push("Return per labour hour is below historical norms.");
  }

  return {
    peer_count: peers.length,
    averages,
    anomalies,
  };
}

function parseCsv(rawCsv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < rawCsv.length; index += 1) {
    const char = rawCsv[index];
    const next = rawCsv[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      value += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows: string[][]) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((header, index) => cleanText(header) || `Column ${index + 1}`);
  return rows.slice(1)
    .filter((row) => row.some((value) => cleanText(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, cleanText(row[index] || "")])));
}

function parseDelimitedTableText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean);
  if (lines.length === 0) return [];
  const headerIndex = lines.findIndex((line) => /sku|product|code|description|item/i.test(line) && /,|\t|\|/.test(line));
  const tableLines = lines.slice(Math.max(0, headerIndex));
  if (tableLines.length === 0) return [];
  const delimiter = tableLines[0].includes("\t") ? "\t" : tableLines[0].includes("|") ? "|" : ",";
  const csvText = delimiter === "," ? tableLines.join("\n") : tableLines.map((line) => line.split(delimiter).join(",")).join("\n");
  return rowsToObjects(parseCsv(csvText));
}

function cleanExtractedPdfText(value: string) {
  return value
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\(([^()]*)\)\s*Tj/g, "$1\n")
    .replace(/\[([^\]]*)\]\s*TJ/g, "$1\n")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\f]+/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[()<>]/g, " ").trim())
    .filter((line) => !/^%PDF/i.test(line) && !/^%%EOF/i.test(line))
    .filter(Boolean)
    .join("\n");
}

function parseXlsxRows(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") || "");
  const workbookRels = parseWorkbookRelationships(entries.get("xl/_rels/workbook.xml.rels") || "");
  const workbookXml = entries.get("xl/workbook.xml") || "";
  const firstSheetRelId = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbookXml)?.[1] || "rId1";
  const sheetTarget = workbookRels.get(firstSheetRelId) || "worksheets/sheet1.xml";
  const normalizedTarget = sheetTarget.startsWith("xl/") ? sheetTarget : `xl/${sheetTarget.replace(/^\//, "")}`;
  const sheetXml = entries.get(normalizedTarget) || entries.get("xl/worksheets/sheet1.xml") || "";
  if (!sheetXml) return [];

  const rows: string[][] = [];
  const rowMatches = sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g);
  for (const rowMatch of rowMatches) {
    const values: string[] = [];
    const cellMatches = rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g);
    for (const cellMatch of cellMatches) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = /r="([A-Z]+)\d+"/.exec(attributes)?.[1] || "";
      const columnIndex = reference ? columnLabelToIndex(reference) - 1 : values.length;
      values[columnIndex] = readXlsxCellValue(attributes, body, sharedStrings);
    }
    rows.push(values.map((value) => value || ""));
  }
  return rows;
}

function readZipEntries(buffer: Buffer) {
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const dataStart = fileNameStart + fileNameLength + extraLength;
    const fileName = buffer.slice(fileNameStart, fileNameStart + fileNameLength).toString("utf8");
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error("Unsupported XLSX compression method.");
    entries.set(fileName, data.toString("utf8"));
    offset = dataStart + compressedSize;
  }
  return entries;
}

function parseSharedStrings(xml: string) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => extractTextFromXml(match[1]));
}

function parseWorkbookRelationships(xml: string) {
  const relationships = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = match[1];
    const id = /Id="([^"]+)"/.exec(attrs)?.[1] || "";
    const target = /Target="([^"]+)"/.exec(attrs)?.[1] || "";
    if (id && target) relationships.set(id, target);
  }
  return relationships;
}

function readXlsxCellValue(attributes: string, body: string, sharedStrings: string[]) {
  const type = /t="([^"]+)"/.exec(attributes)?.[1] || "";
  if (type === "inlineStr") return extractTextFromXml(body);
  const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || "";
  if (type === "s") return sharedStrings[Number(rawValue)] || "";
  return decodeXml(rawValue);
}

function extractTextFromXml(xml: string) {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
}

function decodeXml(value: string) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function columnLabelToIndex(label: string) {
  return label.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function readMappedPriceListValue(row: Record<string, string>, mapping: Record<string, string>, field: string) {
  const mappedHeader = mapping[field];
  if (mappedHeader && row[mappedHeader] != null) return row[mappedHeader];
  const aliases = DEFAULT_PRICE_LIST_COLUMN_MAPPING[field as keyof typeof DEFAULT_PRICE_LIST_COLUMN_MAPPING] || [];
  return readMappedValue(Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])), aliases);
}

function mapPriceListRow(row: Record<string, string>, mapping: Record<string, string>, fallbackSupplier: string): PriceListMappedRow {
  const read = (field: string) => cleanText(readMappedPriceListValue(row, mapping, field));
  const incGst = optionalNumber(read("gst_inclusive_price")) || 0;
  const explicitExGst = optionalNumber(read("unit_cost_ex_gst")) || 0;
  const exGst = explicitExGst || (incGst ? roundCurrency(incGst / 1.15) : 0);
  const originalSku = read("product_number");
  return {
    supplier: read("supplier") || fallbackSupplier,
    product_number: originalSku,
    original_sku: originalSku,
    normalized_sku: normalizeSku(originalSku),
    supplier_item_code: read("supplier_item_code"),
    barcode: read("barcode"),
    description: read("description"),
    category: read("category"),
    dimensions: read("dimensions"),
    unit: read("unit"),
    unit_cost_ex_gst: exGst,
    gst_inclusive_price: incGst,
    cost_was_converted_from_gst: !explicitExGst && incGst > 0,
    pack_quantity: optionalNumber(read("pack_quantity")) || 1,
    minimum_order_quantity: optionalNumber(read("minimum_order_quantity")) || 0,
    discount_group: read("discount_group"),
    effective_date: read("effective_date"),
    notes: read("notes"),
    source_page: optionalNumber(cleanText(row.__source_page)) || undefined,
    extraction_confidence: optionalNumber(cleanText(row.__extraction_confidence)) || undefined,
  };
}

function matchPriceListRow(row: PriceListMappedRow, pricingItems: EntityRecord[]) {
  const supplier = row.supplier.toLowerCase();
  const sameSupplier = pricingItems.filter((item) => cleanText(item.supplier).toLowerCase() === supplier);
  const byNormalizedSku = sameSupplier.find((item) => row.normalized_sku && normalizedSkuForItem(item).toLowerCase() === row.normalized_sku.toLowerCase());
  if (byNormalizedSku) return { item: byNormalizedSku, matchType: "supplier_normalized_sku" };
  const bySku = sameSupplier.find((item) => row.product_number && cleanText(item.product_number || item.supplier_sku).toLowerCase() === row.product_number.toLowerCase());
  if (bySku) return { item: bySku, matchType: "supplier_product_number" };
  const bySupplierCode = sameSupplier.find((item) => row.supplier_item_code && cleanText(item.supplier_item_code).toLowerCase() === row.supplier_item_code.toLowerCase());
  if (bySupplierCode) return { item: bySupplierCode, matchType: "supplier_item_code" };
  const byBarcode = pricingItems.find((item) => row.barcode && cleanText(item.barcode).toLowerCase() === row.barcode.toLowerCase());
  if (byBarcode) return { item: byBarcode, matchType: "barcode" };
  const byDescriptionDimensions = sameSupplier.find((item) => row.description
    && cleanText(item.name || item.description).toLowerCase() === row.description.toLowerCase()
    && (!row.dimensions || cleanText(item.dimensions).toLowerCase() === row.dimensions.toLowerCase()));
  if (byDescriptionDimensions) return { item: byDescriptionDimensions, matchType: row.dimensions ? "supplier_exact_description_dimensions" : "supplier_exact_description" };
  return { item: null, matchType: "" };
}

function quotePdfRowToItem(
  row: Record<string, string>,
  index: number,
  metadata: QuoteImportParseResult["metadata"],
  confidence: number,
  fileName: string,
  pricingItems: EntityRecord[],
  defaultMarkup: number
) {
  const read = (...headers: string[]) => readLooseHeader(row, headers);
  const description = read("description", "item description", "product description", "name", "item");
  const sku = read("sku", "product code", "product number", "code", "item code");
  if (!description && /^total|^gst/i.test(sku)) return null;
  const quantity = positiveNumber(read("qty", "quantity", "count"), 1);
  const unit = read("unit", "uom") || "ea";
  const lineTotal = optionalNumber(read("line total", "total", "amount", "extended price")) || 0;
  const unitPrice = optionalNumber(read("unit price", "unit cost", "price", "net price")) || (lineTotal ? roundCurrency(lineTotal / quantity) : 0);
  if (!description && !sku && !unitPrice && !lineTotal) return null;
  const exGstUnitPrice = moneyToExGst(unitPrice, metadata);
  const exGstLineTotal = lineTotal ? moneyToExGst(lineTotal, metadata) : 0;
  const category = categorizeSupplierQuoteLine(sku, description || sku || `PDF item ${index + 1}`);
  const sourcePage = optionalNumber(cleanText(row.__source_page)) || 1;
  return enrichQuoteImportItem({
    source: "quote_pdf",
    source_page: sourcePage,
    source_row: index + 2,
    name: description || sku || `PDF item ${index + 1}`,
    description,
    material_type: description,
    category,
    quantity,
    unit,
    buy_price: exGstUnitPrice,
    markup_percent: defaultMarkup,
    supplier: metadata.supplier_name || "",
    original_sku: sku,
    normalized_sku: normalizeSku(sku),
    cabinet_reference: "",
    dimensions: {},
    edging: "",
    tags: ["pdf_import"],
    extraction_confidence: optionalNumber(cleanText(row.__extraction_confidence)) || confidence,
    raw: row,
  }, {
    fileName,
    fileType: "pdf",
    pricingItems,
    defaultMarkup,
    gstTreatment: metadata.gst_treatment || "unknown",
    metadata,
    lineTotal: exGstLineTotal,
  });
}

function parseSupplierQuoteTextRows(
  text: string,
  metadata: QuoteImportParseResult["metadata"],
  confidence: number,
  fileName: string,
  pricingItems: EntityRecord[],
  defaultMarkup: number
) {
  const lines = text.split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean);
  const items: QuoteImportItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    let parsed = parseSupplierQuoteLine(line);
    if (!parsed && /^[A-Z0-9][A-Z0-9/_-]{1,24}\s+/.test(line) && lines[index + 1]) {
      const combined = `${line} ${lines[index + 1]}`;
      parsed = parseSupplierQuoteLine(combined);
      if (parsed) {
        line = combined;
        index += 1;
      }
    }
    if (!parsed) continue;
    const exGstUnitRate = moneyToExGst(parsed.unit_rate, metadata);
    const exGstLineTotal = moneyToExGst(parsed.line_total, metadata);
    items.push(enrichQuoteImportItem({
      source: "quote_pdf",
      source_page: 1,
      source_row: index + 1,
      name: parsed.description,
      description: parsed.description,
      material_type: parsed.description,
      category: categorizeSupplierQuoteLine(parsed.item_code, parsed.description),
      quantity: parsed.quantity,
      unit: "ea",
      buy_price: exGstUnitRate,
      markup_percent: defaultMarkup,
      supplier: metadata.supplier_name || "",
      original_sku: parsed.item_code,
      normalized_sku: normalizeSku(parsed.item_code),
      cabinet_reference: "",
      dimensions: {},
      edging: "",
      tags: ["pdf_import", "supplier_quote"],
      extraction_confidence: confidence,
      raw: {
        item_code: parsed.item_code,
        description: parsed.description,
        quantity: String(parsed.quantity),
        unit_rate: String(parsed.unit_rate),
        discount: parsed.discount != null ? String(parsed.discount) : "",
        line_total: String(parsed.line_total),
        source_line: line,
      },
    }, {
      fileName,
      fileType: "pdf",
      pricingItems,
      defaultMarkup,
      gstTreatment: metadata.gst_treatment || "unknown",
      metadata,
      lineTotal: exGstLineTotal,
    }));
  }
  return items;
}

function parseSupplierQuoteLine(line: string) {
  const trimmed = cleanText(line);
  if (!trimmed || /^(quote|date|valid|account|project|sales|designer|gst|total|subtotal|freight notes?|delivery|these prices|item code|code description)/i.test(trimmed)) {
    return null;
  }
  const codeMatch = /^([A-Z0-9][A-Z0-9/_-]{1,24})\s+(.+)$/.exec(trimmed);
  if (!codeMatch) return null;
  const itemCode = codeMatch[1];
  const rest = codeMatch[2];
  const amount = "\\$?\\s*(-?\\d[\\d,]*(?:\\.\\d{1,2})?)";
  const withDiscount = new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+${amount}\\s+${amount}\\s+${amount}$`).exec(rest);
  const standard = new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s+${amount}\\s+${amount}$`).exec(rest);
  const match = withDiscount || standard;
  if (!match) return null;
  const description = cleanText(match[1]);
  const quantity = optionalNumber(match[2]) || 0;
  const unitRate = optionalNumber(match[3]?.replace(/,/g, "")) || 0;
  const discount = withDiscount ? optionalNumber(match[4]?.replace(/,/g, "")) : undefined;
  const lineTotal = optionalNumber(match[withDiscount ? 5 : 4]?.replace(/,/g, "")) || 0;
  if (!description || !quantity || (!unitRate && !lineTotal)) return null;
  return {
    item_code: itemCode,
    description,
    quantity,
    unit_rate: unitRate || roundCurrency(lineTotal / quantity),
    discount,
    line_total: lineTotal,
  };
}

function enrichQuoteImportItem(item: StructuredPricingItem, context: {
  fileName: string;
  fileType: string;
  pricingItems: EntityRecord[];
  defaultMarkup: number;
  gstTreatment: "ex_gst" | "inc_gst" | "unknown";
  metadata?: QuoteImportParseResult["metadata"];
  lineTotal?: number;
}): QuoteImportItem {
  const match = matchQuotePricingItem(item, context.pricingItems);
  const matchedBuyPrice = Number(match.item?.buy_price || 0);
  const markup = Number(item.markup_percent || context.defaultMarkup);
  const quantity = Number(item.quantity || 1);
  const explicitLineTotal = nullableNumber(context.lineTotal ?? item.line_total_ex_gst ?? item.line_total);
  const buyPrice = Number(item.buy_price || 0)
    || matchedBuyPrice
    || (explicitLineTotal != null && quantity > 0 ? roundCurrency(explicitLineTotal / quantity) : 0);
  const totalBuy = roundCurrency(explicitLineTotal ?? buyPrice * quantity);
  const unitBuy = buyPrice || (quantity > 0 ? roundCurrency(totalBuy / quantity) : totalBuy);
  const sellPrice = roundCurrency(unitBuy * (1 + markup / 100));
  const totalSell = roundCurrency(totalBuy * (1 + markup / 100));
  const matchedSection = String(match.item?.section || "").trim();
  const warnings = [...(item.validation_warnings || [])];
  if (!unitBuy) warnings.push("Missing buy price.");
  if (!quantity) warnings.push("Missing quantity.");
  if (!item.original_sku && context.fileType === "pdf") warnings.push("Item code is missing.");
  if (!match.item && (item.normalized_sku || item.name)) warnings.push("No master pricing match; review buy price.");
  if ((item.extraction_confidence ?? 1) < 0.8) warnings.push("Low extraction confidence; review before commit.");

  return {
    ...item,
    buy_price: unitBuy,
    unit_cost_ex_gst: unitBuy,
    markup_percent: markup,
    source_file_name: context.fileName,
    source_file_type: context.fileType,
    quote_reference: context.metadata?.quote_reference || "",
    supplier_gst_number: context.metadata?.supplier_gst_number || "",
    section: matchedSection || undefined,
    section_id: String(match.item?.section_id || "").trim() || undefined,
    section_key: String(match.item?.section_key || "").trim() || undefined,
    section_display_order: Number.isFinite(Number(match.item?.section_display_order))
      ? Number(match.item?.section_display_order)
      : undefined,
    source_item_code: item.original_sku || "",
    original_description: item.description || item.name || "",
    original_imported_value: item.raw,
    parsed_normalized_value: {
      name: item.name,
      description: item.description || "",
      sku: item.original_sku || "",
      normalized_sku: item.normalized_sku || "",
      quantity,
      unit: item.unit,
      buy_price: unitBuy,
      line_total_ex_gst: totalBuy,
      markup_percent: markup,
      supplier: item.supplier || context.metadata?.supplier_name || "",
      taxable: item.taxable,
      quote_reference: context.metadata?.quote_reference || "",
      supplier_gst_number: context.metadata?.supplier_gst_number || "",
      source_item_code: item.original_sku || "",
      original_description: item.description || item.name || "",
    },
    gst_treatment: context.gstTreatment,
    line_total: totalBuy,
    line_total_ex_gst: totalBuy,
    sell_price: sellPrice,
    total_buy_price: totalBuy,
    total_sell_price: totalSell,
    pricing_item_id: String(match.item?.id || ""),
    match_type: match.matchType,
    confidence_score: item.extraction_confidence,
    warnings,
  };
}

function matchQuotePricingItem(item: StructuredPricingItem, pricingItems: EntityRecord[]) {
  const normalizedSku = cleanText(item.normalized_sku) || normalizeSku(item.original_sku || "");
  const bySku = pricingItems.find((candidate) => normalizedSku && normalizedSkuForItem(candidate).toLowerCase() === normalizedSku.toLowerCase());
  if (bySku) return { item: bySku, matchType: "normalized_sku" };
  const name = cleanText(item.name || item.description).toLowerCase();
  const byName = pricingItems.find((candidate) => name && cleanText(candidate.name || candidate.description).toLowerCase() === name);
  if (byName) return { item: byName, matchType: "exact_description" };
  return { item: null, matchType: "" };
}

function extractQuotePdfMetadata(text: string, extractionMode: "text" | "ocr"): QuoteImportParseResult["metadata"] {
  const lines = text.split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean);
  const documentType = detectPricingDocumentType(text);
  const supplierName = extractSupplierName(lines);
  const documentNumber = extractDocumentNumber(lines, documentType);
  const quoteReference = documentNumber;
  const quoteDate = extractDateNearLabel(text, "quote date") || extractDateNearLabel(text, "invoice date") || extractDateNearLabel(text, "estimate date") || extractDateNearLabel(text, "date");
  const validUntil = extractDateNearLabel(text, "valid until") || extractDateNearLabel(text, "valid to") || extractDateNearLabel(text, "expiry");
  const dueDate = extractDateNearLabel(text, "due date") || extractDateNearLabel(text, "payment due");
  const gstAmount = extractGstAmount(text);
  const totalCandidates = extractDocumentTotalCandidates(text);
  const preferredIncTotal = selectPreferredInclusiveTotal(totalCandidates);
  const incTotalFromLabel = preferredIncTotal?.value || 0;
  const exTotal = extractMoneyNearLabel(text, "gst exclusive total") || extractMoneyNearLabel(text, "gst exclusive") || extractMoneyNearLabel(text, "total ex gst") || extractMoneyNearLabel(text, "ex gst total") || extractMoneyNearLabel(text, "subtotal ex gst") || extractMoneyNearLabel(text, "subtotal");
  const saysExGst = /these prices are all excluding gst|prices are all excluding gst|excluding gst|ex\s*gst/i.test(text);
  const saysIncGst = /including gst|prices include gst|inc\s*gst|gst inclusive/i.test(text) && !saysExGst;
  const genericTotalOnly = preferredIncTotal?.label === "total" && !saysIncGst;
  const gstTreatment: "ex_gst" | "inc_gst" | "unknown" = saysExGst || exTotal ? "ex_gst" : genericTotalOnly ? "unknown" : incTotalFromLabel || saysIncGst ? "inc_gst" : "unknown";
  const calculatedIncTotal = !incTotalFromLabel && exTotal ? roundCurrency(exTotal + (gstAmount || roundCurrency(exTotal * 0.15))) : 0;
  const incTotal = incTotalFromLabel || calculatedIncTotal;
  const calculatedExTotal = !exTotal && incTotal ? roundCurrency(incTotal / 1.15) : 0;
  return {
    document_type: documentType,
    document_number: documentNumber,
    document_date: quoteDate,
    due_date: dueDate,
    supplier_name: supplierName,
    supplier_gst_number: /(?:gst(?:\s*(?:no|number))?)\s*[:#-]?\s*([0-9 -]{8,})/i.exec(text)?.[1]?.trim() || "",
    supplier_email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] || "",
    supplier_phone: /(?:phone|tel|mobile|ph)\s*[:#-]?\s*([+()0-9 -]{7,})/i.exec(text)?.[1]?.trim() || "",
    quote_reference: quoteReference,
    quote_date: quoteDate,
    valid_until: validUntil,
    account_reference: extractLabelValue(text, "account reference") || extractLabelValue(text, "customer reference") || extractLabelValue(text, "customer ref") || extractLabelValue(text, "account"),
    project_reference: extractLabelValue(text, "project") || extractLabelValue(text, "reference"),
    salesperson: extractLabelValue(text, "salesperson") || extractLabelValue(text, "sales rep") || extractLabelValue(text, "rep"),
    designer_contact: extractLabelValue(text, "designer") || extractLabelValue(text, "contact"),
    total_quoted_price: incTotal || exTotal,
    subtotal_ex_gst: exTotal || calculatedExTotal,
    gst_exclusive_total: exTotal || calculatedExTotal,
    gst_amount: gstAmount || (incTotal && (exTotal || calculatedExTotal) ? roundCurrency(incTotal - (exTotal || calculatedExTotal)) : 0),
    total_inc_gst: incTotal,
    gst_inclusive_total: incTotal,
    gst_inclusive_total_label: preferredIncTotal?.label || "",
    total_candidates: totalCandidates,
    gst_was_calculated: !gstAmount && Boolean(exTotal && calculatedIncTotal),
    gst_exclusive_was_calculated: !exTotal && Boolean(calculatedExTotal),
    gst_treatment: gstTreatment,
    extraction_mode: extractionMode,
    notes: extractSupplierQuoteNotes(lines),
  };
}

function validateSupplierQuoteExtraction(items: QuoteImportItem[], metadata: QuoteImportParseResult["metadata"]) {
  const warnings: string[] = [];
  if (!metadata.supplier_name) warnings.push("Supplier could not be identified.");
  if (!metadata.gst_inclusive_total) warnings.push("No total inc GST could be found.");
  if (metadata.gst_was_calculated) warnings.push("GST-inclusive total was calculated from the ex-GST subtotal; review before commit.");
  if (metadata.gst_exclusive_was_calculated) warnings.push("Ex-GST subtotal was calculated from the GST-inclusive total; review before commit.");
  if (metadata.gst_treatment === "unknown") warnings.push("GST treatment is unclear; review whether amounts include or exclude GST.");
  if (metadata.gst_inclusive_total_label === "total") warnings.push("Total label is ambiguous; review the selected inc-GST total.");
  if ((metadata.total_candidates || []).length > 1) warnings.push("Multiple possible document totals were detected; review the selected total.");
  const lineSubtotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.total_buy_price || 0), 0));
  if (items.length > 0 && metadata.gst_exclusive_total && Math.abs(lineSubtotal - metadata.gst_exclusive_total) > 0.05) {
    warnings.push("Extracted line totals do not add to the GST exclusive subtotal.");
  }
  if (metadata.gst_exclusive_total && metadata.gst_amount && metadata.gst_inclusive_total) {
    const reconciled = roundCurrency(metadata.gst_exclusive_total + metadata.gst_amount);
    if (Math.abs(reconciled - metadata.gst_inclusive_total) > 0.05) warnings.push("GST does not reconcile with the extracted totals.");
  }
  if (metadata.valid_until && isDateBeforeToday(metadata.valid_until)) warnings.push("Supplier quote appears to be expired.");
  const duplicateKeys = findDuplicates(items.map((item) => `${item.original_sku || ""}:${item.description || item.name}`.toLowerCase()).filter(Boolean));
  if (duplicateKeys.size > 0) warnings.push("Duplicate line items were detected.");
  return warnings;
}

function detectPricingDocumentType(text: string): QuoteImportParseResult["metadata"]["document_type"] {
  if (/mozaik|materials|banding|drawer boxes|shelf pins/i.test(text) && /cabinet|quantity|item/i.test(text)) return "mozaik_material_list";
  if (/\binvoice\b|amount due|balance due|invoice total/i.test(text)) return "supplier_invoice";
  if (/\bestimate\b|estimated total/i.test(text)) return "supplier_estimate";
  if (/\bquote\b|\bquotation\b|quote total|valid until/i.test(text)) return "supplier_quote";
  return "generic_pricing_document";
}

function documentTypeLabel(documentType: QuoteImportParseResult["metadata"]["document_type"]) {
  if (documentType === "supplier_invoice") return "Invoice";
  if (documentType === "supplier_estimate") return "Estimate";
  if (documentType === "mozaik_material_list") return "Mozaik material list";
  if (documentType === "supplier_quote") return "Quote";
  return "Pricing document";
}

function extractDocumentNumber(lines: string[], documentType: QuoteImportParseResult["metadata"]["document_type"]) {
  const labels = documentType === "supplier_invoice"
    ? ["invoice number", "invoice no", "invoice", "document number", "reference", "ref"]
    : documentType === "supplier_estimate"
      ? ["estimate number", "estimate no", "estimate", "document number", "reference", "ref"]
      : ["quote number", "quote no", "quote", "quotation", "document number", "reference", "ref"];
  for (const line of lines) {
    if (/@/.test(line)) continue;
    for (const label of labels) {
      const pattern = new RegExp(`${label.replace(/\s+/g, "\\s*")}\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9._/-]*\\d[A-Z0-9._/-]*|[A-Z]{0,4}-?\\d{2,})`, "i");
      const value = pattern.exec(line)?.[1];
      if (value) return value;
    }
  }
  return "";
}

function extractDocumentTotalCandidates(text: string) {
  const labels = [
    "gst inclusive total",
    "total including gst",
    "total inc gst",
    "inc gst total",
    "gst inclusive",
    "gst incl",
    "amount due",
    "balance due",
    "invoice total",
    "quote total",
    "total price",
    "total nzd",
    "grand total",
    "total",
  ];
  const candidates: Array<{ label: string; value: number }> = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line) => {
    const clean = cleanText(line);
    if (!clean || /gst exclusive|ex\s*gst|subtotal|sub total/i.test(clean) || /^gst\s*(amount)?\s*[:$0-9]/i.test(clean)) return;
    for (const label of labels) {
      const pattern = new RegExp(`\\b${label.replace(/\s+/g, "\\s*")}\\b[^0-9$-]*\\$?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`, "i");
      const match = pattern.exec(clean);
      const value = match ? optionalNumber(match[1].replace(/,/g, "")) || 0 : 0;
      if (!value) continue;
      const key = `${label}:${value}`;
      if (!seen.has(key)) {
        candidates.push({ label, value });
        seen.add(key);
      }
      break;
    }
  });
  return candidates;
}

function selectPreferredInclusiveTotal(candidates: Array<{ label: string; value: number }>) {
  if (candidates.length === 0) return null;
  const priority = ["amount due", "balance due", "gst inclusive total", "total including gst", "total inc gst", "inc gst total", "grand total", "invoice total", "quote total", "total price", "total nzd", "gst inclusive", "gst incl", "total"];
  return [...candidates].sort((a, b) => {
    const priorityDiff = priority.indexOf(a.label) - priority.indexOf(b.label);
    if (priorityDiff !== 0) return priorityDiff;
    return b.value - a.value;
  })[0];
}

function moneyToExGst(value: number, metadata: QuoteImportParseResult["metadata"]) {
  if (!value) return 0;
  return metadata.gst_treatment === "inc_gst" ? roundCurrency(value / 1.15) : value;
}

function quoteImportTotalForLine(metadata: QuoteImportParseResult["metadata"]) {
  if (metadata.gst_inclusive_total) return { exGst: roundCurrency(metadata.gst_inclusive_total / 1.15), incGst: metadata.gst_inclusive_total };
  if (metadata.gst_exclusive_total) return { exGst: metadata.gst_exclusive_total, incGst: roundCurrency(metadata.gst_exclusive_total * 1.15) };
  const total = Number(metadata.total_quoted_price || 0);
  if (!total) return { exGst: 0, incGst: 0 };
  return metadata.gst_treatment === "inc_gst"
    ? { exGst: roundCurrency(total / 1.15), incGst: total }
    : { exGst: total, incGst: roundCurrency(total * 1.15) };
}

function readLooseHeader(row: Record<string, string>, headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const entry = Object.entries(row).find(([key]) => normalizedHeaders.includes(normalizeHeader(key)));
  return cleanText(entry?.[1] || "");
}

function extractMoneyNearLabel(text: string, label: string) {
  const pattern = new RegExp(`${label.replace(/\s+/g, "\\s*")}[^0-9$-]*\\$?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`, "i");
  const match = pattern.exec(text);
  return match ? optionalNumber(match[1].replace(/,/g, "")) || 0 : 0;
}

function extractGstAmount(text: string) {
  const line = text.split(/\r?\n/).find((candidate) => /^\s*gst\s*[:$0-9 ]/i.test(candidate) && !/number|inclusive|exclusive/i.test(candidate));
  if (line) {
    const value = /\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/.exec(line)?.[1] || "";
    return optionalNumber(value.replace(/,/g, "")) || 0;
  }
  return extractMoneyNearLabel(text, "gst amount");
}

function extractDateNearLabel(text: string, label: string) {
  const pattern = new RegExp(`${label.replace(/\s+/g, "\\s*")}\\s*[:#-]?\\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})`, "i");
  return pattern.exec(text)?.[1] || "";
}

function extractLabelValue(text: string, label: string) {
  const pattern = new RegExp(`${label.replace(/\s+/g, "\\s*")}\\s*[:#-]?\\s*([^\\n\\r]+)`, "i");
  return cleanText(pattern.exec(text)?.[1] || "");
}

function extractSupplierName(lines: string[]) {
  const woodsmiths = lines.find((line) => /woodsmiths/i.test(line));
  if (woodsmiths) return cleanText(woodsmiths.replace(/^supplier\s*[:#-]?\s*/i, ""));
  return lines.find((line) => !/^%PDF/i.test(line) && !/quote|invoice|date|total|gst|sku|description|account|project|sales|phone|email/i.test(line)) || "";
}

function extractQuoteReference(lines: string[]) {
  for (const line of lines) {
    if (!/\bquote|quotation|ref(?:erence)?\b/i.test(line) || /@/.test(line)) continue;
    const value = /(?:quote(?:\s*(?:no|number))?|quotation|ref(?:erence)?)\s*[:#-]?\s*([A-Z]{0,4}-?\d{2,}|[A-Z0-9._/-]+)/i.exec(line)?.[1];
    if (value) return value;
  }
  return "";
}

function extractSupplierQuoteNotes(lines: string[]) {
  return lines.filter((line) => /(freight|delivery|valid|surcharge|exclusion|excluding|installation|templating|template|lead time)/i.test(line));
}

function isDateBeforeToday(value: string) {
  const parsed = parseLooseDate(value);
  if (!parsed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed.getTime() < today.getTime();
}

function parseLooseDate(value: string) {
  const clean = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return new Date(`${clean}T00:00:00`);
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(clean);
  if (!match) return null;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  return new Date(year, Number(match[2]) - 1, Number(match[1]));
}

function categorizeSupplierQuoteLine(itemCode: string, description: string): PricingCategory {
  const haystack = `${itemCode} ${description}`.toLowerCase();
  if (/trimtek|ali door|aluminium door|aluminum door|door/.test(haystack)) return "doors_fronts";
  if (/freight|delivery|courier|surcharge/.test(haystack)) return "freight_delivery";
  if (/packaging|protection packaging|\bipp\b|pack\b/.test(haystack)) return "packaging_freight";
  return categorizePricingItem({ name: description, material_type: description, tags: [] });
}

function normalizedSkuForItem(item: EntityRecord) {
  return cleanText(item.normalized_sku) || normalizeSku(item.product_number || item.supplier_sku || item.original_sku || "");
}

function categoryFromMozaikHeading(heading: string): PricingCategory {
  const value = heading.toLowerCase();
  if (value.includes("material")) return "sheet_materials";
  if (value.includes("applied panel")) return "doors_fronts";
  if (value.includes("banding")) return "edging";
  if (value.includes("door") || value.includes("front")) return "doors_fronts";
  if (value.includes("guide") || value.includes("drawer box")) return "drawer_systems_runners";
  if (value.includes("leg")) return "hardware";
  if (value.includes("hinge")) return "hinges";
  if (value.includes("pull") || value.includes("handle")) return "handles_pulls";
  if (value.includes("insert") || value.includes("closet")) return "bins_accessories";
  if (value.includes("labor") || value.includes("labour")) return "labour";
  return "misc_fixings";
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return duplicates;
}

function readMappedValue(raw: Record<string, string>, aliases: string[]) {
  for (const alias of aliases.map(normalizeHeader)) {
    if (raw[alias] != null && String(raw[alias]).trim() !== "") {
      return raw[alias];
    }
  }
  return "";
}

function itemMatchesRule(item: StructuredPricingItem, rule: PricingRule) {
  const condition = rule.condition || {};
  const name = item.name.toLowerCase();
  const materialType = item.material_type.toLowerCase();
  const tags = item.tags.map((tag) => tag.toLowerCase());
  return (!condition.category || item.category === condition.category)
    && (!condition.tag || tags.includes(condition.tag.toLowerCase()))
    && (!condition.name_contains || name.includes(condition.name_contains.toLowerCase()))
    && (!condition.material_type_contains || materialType.includes(condition.material_type_contains.toLowerCase()));
}

function calculateTriggeredQuantity(formula: string, multiplier: number, matchedItems: StructuredPricingItem[]) {
  if (formula === "fixed") {
    return multiplier;
  }
  if (formula === "per_unit_quantity") {
    return matchedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0) * multiplier;
  }
  if (formula === "per_cabinet") {
    const cabinets = new Set(matchedItems.map((item) => item.cabinet_reference).filter(Boolean));
    return Math.max(cabinets.size, matchedItems.length) * multiplier;
  }
  return matchedItems.length * multiplier;
}

function estimateLabourHours(items: StructuredPricingItem[], labour: LabourAssumptions) {
  const cabinetRefs = new Set(items.map((item) => item.cabinet_reference).filter(Boolean));
  const sheetCount = items
    .filter((item) => item.category === "sheet_materials")
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const edgingMetres = items
    .filter((item) => item.category === "edging")
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const drawerHardware = items
    .filter((item) => item.category === "drawer_systems_runners" || item.category === "hinges" || item.category === "handles_pulls")
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const fronts = items
    .filter((item) => item.category === "doors_fronts")
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const cabinets = Math.max(cabinetRefs.size, Math.ceil(sheetCount / 4));

  return roundHours(
    sheetCount * labour.sheet_processing_hours_per_sheet
    + edgingMetres * labour.edging_hours_per_metre
    + cabinets * labour.assembly_hours_per_cabinet
    + drawerHardware * labour.drawer_hardware_hours_each
    + fronts * labour.door_front_fitting_hours_each
    + cabinets * labour.installation_hours_per_cabinet
    + labour.design_admin_checking_hours
    + labour.risk_complexity_allowance_hours
  );
}

function buildPricingWarnings(input: {
  grossMarginPercent: number;
  estimatedLabourHours: number;
  totalDirectPurchaseCost: number;
  assumptions: PricingAssumptions;
}) {
  const warnings: string[] = [];
  if (input.grossMarginPercent < input.assumptions.margin_minimum_percent) {
    warnings.push("This quote is below Millbrook's minimum target margin.");
  }
  if (input.totalDirectPurchaseCost > 0 && input.estimatedLabourHours < input.totalDirectPurchaseCost / 1000) {
    warnings.push("Labour allowance may be understated for this material volume.");
  }
  return warnings;
}

function sumByCategory(rows: Array<{ category: PricingCategory; totalBuyCost: number }>, categories: PricingCategory[]) {
  return roundCurrency(rows
    .filter((row) => categories.includes(row.category))
    .reduce((sum, row) => sum + row.totalBuyCost, 0));
}

function normalizeHeader(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanText(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function splitTags(value: unknown) {
  return String(value || "")
    .split(/[|;,]/)
    .map((tag) => cleanText(tag).toLowerCase())
    .filter(Boolean);
}

function optionalNumber(value: unknown) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function nullableNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function numberOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function average(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? roundCurrency(usable.reduce((sum, value) => sum + value, 0) / usable.length) : 0;
}

function roundCurrency(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseBoolean(value: unknown) {
  const normalized = cleanText(value).toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return false;
}

function formatCurrencyForWarning(value: number) {
  return `$${roundCurrency(value).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function roundHours(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
