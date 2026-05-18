import { EntityRecord } from "../../types";
import { PriceListMappedRow, QuoteImportItem, QuoteImportParseResult, StagedPriceListRow } from "../../pricingModel";
import { suggestCategory } from "./categoryClassifier";
import { detectImportAnomalies, detectPricingAnomalies } from "./importAnomalyDetector";
import { cleanPdfExtraction } from "./pdfExtractionCleaner";
import { suggestSkuCleanup } from "./skuNormalizer";
import { suggestSupplierMapping } from "./supplierMapper";

export type ImportAiSuggestionBundle = {
  status: "staged_review_required";
  generated_at: string;
  supplier_mapping?: ReturnType<typeof suggestSupplierMapping>;
  sku_cleanup?: ReturnType<typeof suggestSkuCleanup>;
  category_suggestion?: ReturnType<typeof suggestCategory>;
  anomalies: ReturnType<typeof detectImportAnomalies>;
  pricing_anomalies: ReturnType<typeof detectPricingAnomalies>;
  review_required: boolean;
  auto_commit: false;
};

export function enrichPriceListRowsWithAiSuggestions(input: {
  rows: StagedPriceListRow[];
  supplier: string;
  suppliers: EntityRecord[];
  pricingItems: EntityRecord[];
  movementThresholdPercent?: number;
}) {
  const mappedRows = input.rows.map((row) => ({
    row_number: row.row_number,
    ...(row.mapped as PriceListMappedRow),
    ...row.new_values,
    warnings: row.warnings,
    errors: row.errors,
  }));
  const importAnomalies = detectImportAnomalies({
    rows: mappedRows,
    readSku: (row) => row.normalized_sku || row.product_number || row.supplier_sku,
    readCost: (row) => row.buy_price || row.unit_cost_ex_gst,
    readDescription: (row) => row.description || row.name,
  });
  const pricingAnomalies = detectPricingAnomalies({
    rows: mappedRows,
    existingPricingItems: input.pricingItems,
    movementThresholdPercent: input.movementThresholdPercent,
  });
  const supplierMapping = suggestSupplierMapping({
    supplier: input.supplier,
    rows: mappedRows,
    suppliers: input.suppliers,
  });

  return input.rows.map((row) => {
    const rowAnomalies = importAnomalies.filter((anomaly) => anomaly.row_number === row.row_number);
    const rowPricingAnomalies = pricingAnomalies.filter((anomaly) => anomaly.row_number === row.row_number);
    const skuCleanup = suggestSkuCleanup(row.mapped.normalized_sku || row.mapped.product_number || row.mapped.original_sku);
    const categorySuggestion = suggestCategory({
      name: row.new_values.name,
      description: row.mapped.description,
      supplier_category: row.mapped.category,
      current_category: row.mapped.category,
    });
    const aiSuggestions: ImportAiSuggestionBundle = {
      status: "staged_review_required",
      generated_at: new Date().toISOString(),
      supplier_mapping: supplierMapping,
      sku_cleanup: skuCleanup,
      category_suggestion: categorySuggestion,
      anomalies: rowAnomalies,
      pricing_anomalies: rowPricingAnomalies,
      review_required: [supplierMapping, skuCleanup, categorySuggestion].some((suggestion) => suggestion.review_required)
        || rowAnomalies.length > 0
        || rowPricingAnomalies.length > 0,
      auto_commit: false,
    };
    const aiWarnings = [
      ...rowAnomalies,
      ...rowPricingAnomalies,
    ].map((anomaly) => `AI review: ${anomaly.message}`);
    return {
      ...row,
      ai_suggestions: aiSuggestions,
      ai_review_required: aiSuggestions.review_required,
      warnings: [...new Set([...row.warnings, ...aiWarnings])],
    };
  });
}

export function enrichQuoteImportWithAiSuggestions(input: {
  parsed: QuoteImportParseResult;
  suppliers: EntityRecord[];
  pricingItems: EntityRecord[];
}) {
  const cleaned = input.parsed.metadata?.extraction_mode === "ocr" || input.parsed.metadata?.extraction_mode === "text"
    ? cleanPdfExtraction(input.parsed)
    : { cleaned_items: input.parsed.items, warnings: input.parsed.warnings, suggestions: [] };
  const supplierMapping = suggestSupplierMapping({
    metadataSupplier: input.parsed.metadata?.supplier_name,
    rows: cleaned.cleaned_items as unknown as Array<Record<string, unknown>>,
    suppliers: input.suppliers,
  });
  const rowShapes = cleaned.cleaned_items.map((item) => ({
    row_number: item.source_row || 0,
    normalized_sku: item.normalized_sku,
    product_number: item.original_sku || item.source_item_code,
    description: item.description || item.name,
    buy_price: item.buy_price,
    quantity: item.quantity,
    extraction_confidence: item.extraction_confidence,
    warnings: item.warnings || item.validation_warnings || [],
  }));
  const anomalies = detectImportAnomalies({ rows: rowShapes });
  const pricingAnomalies = detectPricingAnomalies({ rows: rowShapes, existingPricingItems: input.pricingItems });
  const items = cleaned.cleaned_items.map((item) => {
    const rowNumber = item.source_row || 0;
    const skuCleanup = suggestSkuCleanup(item.normalized_sku || item.original_sku || item.source_item_code);
    const categorySuggestion = suggestCategory({
      name: item.name,
      description: item.description,
      material_type: item.material_type,
      current_category: item.category,
      tags: item.tags,
    });
    const itemAnomalies = anomalies.filter((anomaly) => anomaly.row_number === rowNumber);
    const itemPricingAnomalies = pricingAnomalies.filter((anomaly) => anomaly.row_number === rowNumber);
    const aiSuggestions: ImportAiSuggestionBundle = {
      status: "staged_review_required",
      generated_at: new Date().toISOString(),
      supplier_mapping: supplierMapping,
      sku_cleanup: skuCleanup,
      category_suggestion: categorySuggestion,
      anomalies: itemAnomalies,
      pricing_anomalies: itemPricingAnomalies,
      review_required: [supplierMapping, skuCleanup, categorySuggestion].some((suggestion) => suggestion.review_required)
        || itemAnomalies.length > 0
        || itemPricingAnomalies.length > 0,
      auto_commit: false,
    };
    return {
      ...item,
      ai_suggestions: aiSuggestions,
      ai_review_required: aiSuggestions.review_required,
      warnings: [
        ...new Set([
          ...(item.warnings || []),
          ...(item.validation_warnings || []),
          ...itemAnomalies.map((anomaly) => `AI review: ${anomaly.message}`),
          ...itemPricingAnomalies.map((anomaly) => `AI review: ${anomaly.message}`),
        ]),
      ],
    } as QuoteImportItem & { ai_suggestions: ImportAiSuggestionBundle; ai_review_required: boolean };
  });

  return {
    ...input.parsed,
    items,
    warnings: [...new Set([...cleaned.warnings, ...cleaned.suggestions.map((suggestion) => `AI review: ${suggestion.reason}`)])],
    ai_suggestions: {
      status: "staged_review_required",
      generated_at: new Date().toISOString(),
      supplier_mapping: supplierMapping,
      pdf_cleanup: cleaned.suggestions,
      anomalies,
      pricing_anomalies: pricingAnomalies,
      review_required: supplierMapping.review_required || cleaned.suggestions.length > 0 || anomalies.length > 0 || pricingAnomalies.length > 0,
      auto_commit: false,
    },
  };
}
