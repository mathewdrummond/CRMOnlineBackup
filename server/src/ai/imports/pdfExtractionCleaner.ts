import { QuoteImportItem, QuoteImportParseResult } from "../../pricingModel";

export type PdfExtractionCleanup = {
  cleaned_items: QuoteImportItem[];
  warnings: string[];
  suggestions: Array<{
    row_number?: number;
    field: string;
    suggested_value: unknown;
    confidence: number;
    reason: string;
    review_required: true;
  }>;
};

const SUMMARY_LINE_PATTERN = /^(sub\s*total|subtotal|tax|gst|total|balance due|amount due|deposit)$/i;

export function cleanPdfExtraction(parsed: QuoteImportParseResult): PdfExtractionCleanup {
  const warnings = [...parsed.warnings];
  const suggestions: PdfExtractionCleanup["suggestions"] = [];
  const cleaned = parsed.items
    .filter((item) => {
      const label = String(item.name || item.description || "").trim();
      if (SUMMARY_LINE_PATTERN.test(label)) {
        suggestions.push({
          row_number: item.source_row,
          field: "review_state",
          suggested_value: "excluded",
          confidence: 0.92,
          reason: "Line appears to be a PDF summary total rather than a billable item.",
          review_required: true,
        });
        return false;
      }
      return true;
    })
    .map((item) => {
      const next = { ...item };
      const description = collapseWhitespace(next.description || next.name || "");
      if (description !== (next.description || next.name || "")) {
        suggestions.push({
          row_number: next.source_row,
          field: "description",
          suggested_value: description,
          confidence: 0.9,
          reason: "PDF text spacing can be safely collapsed for review.",
          review_required: true,
        });
      }
      next.description = description;
      next.name = collapseWhitespace(next.name || description);
      if (next.extraction_confidence != null && Number(next.extraction_confidence) < 0.8) {
        warnings.push(`Row ${next.source_row || "unknown"} has low PDF extraction confidence.`);
      }
      return next;
    });

  return {
    cleaned_items: cleaned,
    warnings: [...new Set(warnings)],
    suggestions,
  };
}

function collapseWhitespace(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
