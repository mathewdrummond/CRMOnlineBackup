export const IMPORT_WIZARD_STEPS = [
  "Upload",
  "Detect type",
  "Parse",
  "Review",
  "Resolve issues",
  "Confirm import",
  "Summary",
];

export function detectImportType(fileName = "", fallback = "pricing") {
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".pdf")) return "PDF quote import";
  if (name.includes("mozaik")) return "Mozaik material import";
  if (name.includes("labour") || name.includes("labor")) return "Labour costing import";
  if (name.includes("price") || name.includes("supplier")) return "Supplier price list import";
  if (name.endsWith(".xlsx")) return "Excel import";
  if (name.endsWith(".csv")) return "CSV import";
  return fallback;
}

export function validateImportFile(file, {
  maxSizeMb = 25,
  acceptedExtensions = [".csv", ".xlsx", ".pdf"],
} = {}) {
  if (!file) {
    return { valid: false, message: "Choose a file to import." };
  }

  const name = String(file.name || "").toLowerCase();
  const hasAcceptedExtension = acceptedExtensions.some((extension) => name.endsWith(extension));
  if (!hasAcceptedExtension) {
    return {
      valid: false,
      message: `Use one of these file types: ${acceptedExtensions.join(", ")}.`,
    };
  }

  if (Number(file.size || 0) > maxSizeMb * 1024 * 1024) {
    return {
      valid: false,
      message: `This file is too large. Use a file smaller than ${maxSizeMb}MB.`,
    };
  }

  return { valid: true, message: "" };
}

export function getImportWizardStepIndex(status = "", hasFile = false, hasRows = false) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("complete") || normalized.includes("confirmed")) return 6;
  if (normalized.includes("fail")) return 4;
  if (normalized.includes("review") || hasRows) return 3;
  if (normalized.includes("parsing") || normalized.includes("extract")) return 2;
  if (normalized.includes("mapping") || normalized.includes("ready")) return 1;
  if (hasFile) return 1;
  return 0;
}

export function explainImportIssue(issue) {
  const text = String(issue || "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower.includes("missing") && lower.includes("cost")) {
    return "A cost is missing. Add the cost before confirming so the quote total is reliable.";
  }
  if (lower.includes("ocr") || lower.includes("confidence")) {
    return "The file was read from a PDF image. Please check the row against the supplier document before confirming.";
  }
  if (lower.includes("duplicate")) {
    return "This looks like a duplicate row. Merge or remove duplicates so the item is not counted twice.";
  }
  if (lower.includes("mapping") || lower.includes("column")) {
    return "A column could not be matched. Check Column Matching so JoinerFlow knows which column contains each value.";
  }
  return text;
}
