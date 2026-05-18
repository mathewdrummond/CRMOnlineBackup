import crypto from "node:crypto";
import { EntityRecord } from "../../types";

export const EMBEDDABLE_ENTITY_TYPES = [
  "Quote",
  "Job",
  "QuoteItem",
  "Contact",
  "Company",
  "Note",
  "Attachment",
  "PricingItem",
  "QuoteImport",
  "PriceListImport",
  "SiteMeasure",
  "JobOperation",
] as const;

export type EmbeddableEntityType = typeof EMBEDDABLE_ENTITY_TYPES[number];

export type EmbeddingDocument = {
  entity: EmbeddableEntityType;
  recordId: string;
  rowVersion: number;
  title: string;
  content: string;
  keywords: string[];
  metadata: Record<string, unknown>;
  contentHash: string;
};

const EMBEDDABLE_ENTITY_SET = new Set<string>(EMBEDDABLE_ENTITY_TYPES);

export function isEmbeddableEntity(entity: string): entity is EmbeddableEntityType {
  return EMBEDDABLE_ENTITY_SET.has(entity);
}

export function mapEntityToEmbeddingDocument(entity: string, record: EntityRecord): EmbeddingDocument | null {
  if (!isEmbeddableEntity(entity)) return null;

  const title = buildTitle(entity, record);
  const parts = buildContentParts(entity, record);
  const content = normalizeWhitespace([title, ...parts].filter(Boolean).join("\n"));
  if (!content) return null;

  const metadata = buildMetadata(entity, record);
  return {
    entity,
    recordId: String(record.id || ""),
    rowVersion: Number(record.row_version || 1),
    title,
    content,
    keywords: tokenize(content),
    metadata,
    contentHash: crypto.createHash("sha256").update(content).digest("hex"),
  };
}

export function getSearchResultHref(entity: string, metadata: Record<string, unknown>, recordId: string) {
  if (entity === "Job") return `/jobs/${recordId}`;
  if (entity === "Quote") return `/quotes/${recordId}`;
  if (entity === "Contact") return `/contacts/${recordId}`;
  if (entity === "Company") return `/companies/${recordId}`;
  if (entity === "QuoteItem" && metadata.quote_id) return `/quotes/${metadata.quote_id}`;
  if (entity === "QuoteImport" && metadata.quote_id) return `/quotes/${metadata.quote_id}`;
  if (entity === "SiteMeasure" && metadata.quote_id) return `/quotes/${metadata.quote_id}`;
  if (entity === "JobOperation" && metadata.job_id) return `/jobs/${metadata.job_id}`;
  if (entity === "Attachment") {
    if (metadata.related_type === "quote" && metadata.related_id) return `/quotes/${metadata.related_id}`;
    if (metadata.related_type === "job" && metadata.related_id) return `/jobs/${metadata.related_id}`;
    if (metadata.related_type === "contact" && metadata.related_id) return `/contacts/${metadata.related_id}`;
    if (metadata.related_type === "company" && metadata.related_id) return `/companies/${metadata.related_id}`;
  }
  return "";
}

function buildTitle(entity: string, record: EntityRecord) {
  if (entity === "Quote") return compactJoin([record.quote_number, record.title || record.job_name || "Quote"]);
  if (entity === "Job") return compactJoin([record.job_number, record.title || record.job_name || "Job"]);
  if (entity === "QuoteItem") return String(record.description || record.name || "Quote item");
  if (entity === "Contact") return String(record.full_name || compactJoin([record.first_name, record.last_name]) || record.email || "Contact");
  if (entity === "Company") return String(record.name || record.company_name || "Company");
  if (entity === "Note") return String(record.title || record.type || "Note");
  if (entity === "Attachment") return String(record.name || record.file_name || "Attachment");
  if (entity === "PricingItem") return String(record.name || record.description || record.product_number || "Pricing item");
  if (entity === "QuoteImport") return String(record.file_name || record.job_name || "Supplier import");
  if (entity === "PriceListImport") return String(record.file_name || record.supplier || "Price list import");
  if (entity === "SiteMeasure") return String(record.title || record.measure_type || "Site measure");
  if (entity === "JobOperation") return String(record.title || record.label || record.operation || "Workflow task");
  return entity;
}

function buildContentParts(entity: string, record: EntityRecord) {
  const common = [
    record.contact_name,
    record.company_name,
    record.customer_name,
    record.site_address,
    record.job_address,
    record.status,
    record.assigned_to,
    record.designer,
    record.salesperson,
    record.notes,
    record.description,
    record.document_information,
  ];

  if (entity === "QuoteItem") {
    return [...common, record.category, record.section, record.supplier_name, record.sku, record.product_number];
  }
  if (entity === "PricingItem") {
    return [...common, record.category, record.supplier_name, record.product_number, record.supplier_item_code, record.unit, record.material];
  }
  if (entity === "QuoteImport" || entity === "PriceListImport") {
    return [...common, record.supplier, record.import_warnings, record.metadata, record.structured_items];
  }
  if (entity === "SiteMeasure") {
    return [...common, record.measure_notes, record.measure_date, record.measured_by, record.checklist];
  }
  if (entity === "JobOperation") {
    return [...common, record.workflow_phase, record.required_skills, record.start_date, record.end_date];
  }

  return common;
}

function buildMetadata(entity: string, record: EntityRecord): Record<string, unknown> {
  return {
    entity,
    record_id: record.id,
    title: buildTitle(entity, record),
    quote_id: stringValue(record.quote_id),
    job_id: stringValue(record.job_id),
    contact_id: stringValue(record.contact_id),
    company_id: stringValue(record.company_id),
    customer: stringValue(record.contact_name || record.company_name || record.customer_name),
    designer: stringValue(record.designer || record.assigned_to || record.salesperson),
    date: stringValue(record.date || record.created_date || record.updated_date || record.due_date || record.measure_date),
    status: stringValue(record.status),
    related_id: stringValue(record.related_id),
    related_type: stringValue(record.related_type),
  };
}

function compactJoin(values: unknown[]) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
}

function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stringValue(value: unknown) {
  return String(value || "").trim();
}

function tokenize(value: string) {
  return Array.from(new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  ));
}
