import { EntityRecord } from "../../types";

export type AiDocumentDraftKind =
  | "quote_summary"
  | "variation_draft"
  | "install_update"
  | "workshop_handover"
  | "procurement_summary"
  | "client_communication";

export type AiDocumentDraftSection = {
  heading: string;
  body: string;
};

export type AiDocumentDraft = {
  kind: AiDocumentDraftKind;
  title: string;
  draft_text: string;
  sections: AiDocumentDraftSection[];
  missing_data: string[];
  source_record_ids: string[];
  generated_at: string;
  status: "staged_review_required";
  safety: {
    review_required: true;
    editable: true;
    auto_send: false;
    auto_finalize: false;
    mutates_pricing: false;
    mutates_workflow_state: false;
  };
};

export type AiDocumentContext = {
  quote?: EntityRecord | null;
  job?: EntityRecord | null;
  quoteItems?: EntityRecord[];
  jobOperations?: EntityRecord[];
  pricingItems?: EntityRecord[];
  siteMeasures?: EntityRecord[];
  purchaseOrders?: EntityRecord[];
  notes?: EntityRecord[];
  audience?: string;
};

export function createDraft(
  kind: AiDocumentDraftKind,
  title: string,
  sections: AiDocumentDraftSection[],
  missingData: string[],
  sourceRecordIds: string[]
): AiDocumentDraft {
  return {
    kind,
    title,
    sections,
    draft_text: sections.map((section) => `${section.heading}\n${section.body}`.trim()).join("\n\n"),
    missing_data: [...new Set(missingData.filter(Boolean))],
    source_record_ids: [...new Set(sourceRecordIds.filter(Boolean))],
    generated_at: new Date().toISOString(),
    status: "staged_review_required",
    safety: {
      review_required: true,
      editable: true,
      auto_send: false,
      auto_finalize: false,
      mutates_pricing: false,
      mutates_workflow_state: false,
    },
  };
}

export function readText(record: EntityRecord | null | undefined, keys: string[], fallback = "Not provided") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return fallback;
}

export function readMoney(record: EntityRecord | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = Number(record?.[key]);
    if (Number.isFinite(value) && value > 0) {
      return formatMoney(value);
    }
  }
  return "Not provided";
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function summarizeRows(rows: EntityRecord[] | undefined, labelKeys: string[], limit = 8) {
  const records = Array.isArray(rows) ? rows : [];
  if (records.length === 0) return "No records supplied.";
  return records
    .slice(0, limit)
    .map((record, index) => {
      const label = readText(record, labelKeys, `Item ${index + 1}`);
      const quantity = readText(record, ["quantity", "qty"], "");
      const suffix = quantity ? ` (${quantity})` : "";
      return `- ${label}${suffix}`;
    })
    .join("\n");
}

export function listMissing(record: EntityRecord | null | undefined, requirements: Array<[string, string]>) {
  return requirements
    .filter(([key]) => !record?.[key])
    .map(([, label]) => label);
}

