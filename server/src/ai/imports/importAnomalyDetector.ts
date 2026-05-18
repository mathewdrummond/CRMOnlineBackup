import { EntityRecord } from "../../types";
import { findDuplicateSkus } from "./skuNormalizer";

export type ImportAnomaly = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  row_number?: number;
  confidence: number;
  review_required: boolean;
};

export function detectImportAnomalies(input: {
  rows: Array<Record<string, unknown>>;
  existingPricingItems?: EntityRecord[];
  movementThresholdPercent?: number;
  readSku?: (row: Record<string, unknown>) => unknown;
  readCost?: (row: Record<string, unknown>) => unknown;
  readDescription?: (row: Record<string, unknown>) => unknown;
}) {
  const anomalies: ImportAnomaly[] = [];
  const readSku = input.readSku || ((row) => row.normalized_sku || row.product_number || row.supplier_sku || row.original_sku);
  const readCost = input.readCost || ((row) => row.buy_price || row.unit_cost_ex_gst || row.gst_inclusive_price);
  const readDescription = input.readDescription || ((row) => row.description || row.name);
  const duplicateSkus = findDuplicateSkus(input.rows, readSku);
  duplicateSkus.forEach((indexes, sku) => {
    indexes.forEach((index) => anomalies.push({
      code: "duplicate_uploaded_sku",
      severity: "warning",
      message: `Duplicate uploaded SKU ${sku}.`,
      row_number: index + 1,
      confidence: 0.98,
      review_required: true,
    }));
  });

  input.rows.forEach((row, index) => {
    const rowNumber = Number(row.row_number || index + 1);
    const description = String(readDescription(row) || "").trim();
    const cost = numberValue(readCost(row));
    const quantity = numberValue(row.quantity ?? row.qty ?? 1);
    const confidence = numberValue(row.extraction_confidence ?? row.confidence_score ?? 1) ?? 1;
    const warnings = Array.isArray(row.warnings) ? row.warnings.map(String) : [];
    const errors = Array.isArray(row.errors) ? row.errors.map(String) : [];

    if (!description) {
      anomalies.push(build("missing_description", "critical", "Missing description.", rowNumber, 0.96));
    }
    if (cost == null || cost <= 0) {
      anomalies.push(build("missing_or_zero_cost", "critical", "Missing or zero cost.", rowNumber, 0.95));
    }
    if (quantity != null && quantity <= 0) {
      anomalies.push(build("invalid_quantity", "critical", "Quantity is zero or negative.", rowNumber, 0.96));
    }
    if (confidence > 0 && confidence < 0.8) {
      anomalies.push(build("low_extraction_confidence", "warning", "Low extraction confidence.", rowNumber, confidence));
    }
    warnings.forEach((warning) => anomalies.push(build("existing_warning", "warning", warning, rowNumber, 0.9)));
    errors.forEach((error) => anomalies.push(build("existing_error", "critical", error, rowNumber, 0.96)));
  });

  return anomalies;
}

export function detectPricingAnomalies(input: {
  rows: Array<Record<string, unknown>>;
  existingPricingItems: EntityRecord[];
  movementThresholdPercent?: number;
}) {
  const threshold = Math.abs(Number(input.movementThresholdPercent || 25));
  const existingBySku = new Map<string, EntityRecord>();
  input.existingPricingItems.forEach((item) => {
    const key = String(item.normalized_sku || item.product_number || item.supplier_sku || "").toLowerCase();
    if (key) existingBySku.set(key, item);
  });

  return input.rows.flatMap((row, index) => {
    const sku = String(row.normalized_sku || row.product_number || row.supplier_sku || "").toLowerCase();
    const current = sku ? existingBySku.get(sku) : null;
    const nextCost = numberValue(row.buy_price || row.unit_cost_ex_gst || row.new_cost);
    const oldCost = numberValue(current?.buy_price);
    if (!current || !nextCost || !oldCost) return [];
    const change = ((nextCost - oldCost) / oldCost) * 100;
    if (Math.abs(change) < threshold) return [];
    return [build(
      "pricing_movement",
      Math.abs(change) >= threshold * 2 ? "critical" : "warning",
      `Price movement ${round(change)}% versus current item.`,
      Number(row.row_number || index + 1),
      0.92
    )];
  });
}

function build(code: string, severity: ImportAnomaly["severity"], message: string, rowNumber: number, confidence: number): ImportAnomaly {
  return { code, severity, message, row_number: rowNumber, confidence, review_required: severity !== "info" };
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
