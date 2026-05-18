import { describe, expect, test } from "vitest";
import { enrichPriceListRowsWithAiSuggestions, enrichQuoteImportWithAiSuggestions } from "./importIntelligence";
import { StagedPriceListRow } from "../../pricingModel";

describe("AI import intelligence", () => {
  test("adds staged review suggestions to price list rows without making them committable automatically", () => {
    const rows: StagedPriceListRow[] = [
      {
        row_number: 2,
        raw: { sku: " abc-1 ", description: "White board", cost: "180" },
        mapped: {
          supplier: "Acme",
          product_number: " abc-1 ",
          original_sku: " abc-1 ",
          normalized_sku: "ABC1",
          supplier_item_code: "",
          barcode: "",
          description: "White melamine board",
          category: "Board",
          dimensions: "",
          unit: "ea",
          unit_cost_ex_gst: 180,
          gst_inclusive_price: 0,
          cost_was_converted_from_gst: false,
          pack_quantity: 1,
          minimum_order_quantity: 0,
          discount_group: "",
          effective_date: "",
          notes: "",
        },
        status: "matched",
        match_type: "normalized_sku",
        pricing_item_id: "price-1",
        warnings: [],
        errors: [],
        old_values: { buy_price: 100 },
        new_values: { buy_price: 180, name: "White melamine board", normalized_sku: "ABC1" },
        price_change_percent: 80,
      },
    ];

    const enriched = enrichPriceListRowsWithAiSuggestions({
      rows,
      supplier: "Acme",
      suppliers: [{ id: "supplier-1", entity: "Supplier", name: "Acme Limited" }],
      pricingItems: [{ id: "price-1", entity: "PricingItem", normalized_sku: "ABC1", buy_price: 100 }],
      movementThresholdPercent: 25,
    });

    expect(enriched[0].ai_review_required).toBe(true);
    expect(enriched[0].ai_suggestions.auto_commit).toBe(false);
    expect(enriched[0].ai_suggestions.supplier_mapping?.supplier_id).toBe("supplier-1");
    expect(enriched[0].ai_suggestions.category_suggestion?.category).toBe("sheet_materials");
    expect(enriched[0].warnings).toContain("AI review: Price movement 80% versus current item.");
  });

  test("cleans PDF summary lines and preserves staged quote-import review suggestions", () => {
    const enriched = enrichQuoteImportWithAiSuggestions({
      parsed: {
        items: [
          {
            source_row: 1,
            source: "quote_pdf",
            name: "Subtotal",
            description: "Subtotal",
            material_type: "",
            category: "misc_fixings",
            quantity: 1,
            unit: "ea",
            buy_price: 100,
            markup_percent: 30,
            cabinet_reference: "",
            dimensions: {},
            edging: "",
            tags: [],
            raw: {},
          },
          {
            source_row: 2,
            source: "quote_pdf",
            name: "Drawer runner",
            description: "Drawer    runner",
            material_type: "hardware",
            category: "hardware",
            quantity: 1,
            unit: "ea",
            buy_price: 45,
            markup_percent: 30,
            supplier: "Acme",
            original_sku: "DR-500",
            normalized_sku: "DR500",
            cabinet_reference: "",
            dimensions: {},
            edging: "",
            tags: [],
            extraction_confidence: 0.76,
            raw: {},
          },
        ],
        warnings: [],
        metadata: {
          supplier_name: "Acme",
          extraction_mode: "text",
          document_type: "supplier_quote",
        },
      },
      suppliers: [{ id: "supplier-1", entity: "Supplier", name: "Acme" }],
      pricingItems: [],
    });

    expect(enriched.items).toHaveLength(1);
    expect(enriched.items[0].description).toBe("Drawer runner");
    expect(enriched.items[0].ai_suggestions.auto_commit).toBe(false);
    expect(enriched.ai_suggestions.review_required).toBe(true);
    expect(enriched.warnings.some((warning) => warning.includes("summary total"))).toBe(true);
  });
});
