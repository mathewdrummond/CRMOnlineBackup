import { getEntityModuleKey, isModuleEnabled } from "../appModules";
import { listEntityRecords } from "../db";
import type { LocalUser } from "../types";
import { buildEntityHref, shouldHideInternalRecord, truncateText, type UnifiedSearchInput, type UnifiedSearchItem } from "./searchContext";

const ENTITY_CONFIG = [
  {
    entity: "Job",
    type: "Job",
    fields: ["job_number", "title", "contact_name", "company_name", "site_address", "status", "notes", "internal_operational_notes", "handoff_notes"],
    title: (record: Record<string, unknown>) => [record.job_number || "Job", record.title].filter(Boolean).join(" - "),
    subtitle: (record: Record<string, unknown>) => [record.contact_name, record.company_name, record.status].filter(Boolean).join(" · "),
  },
  {
    entity: "Quote",
    type: "Quote",
    fields: ["quote_number", "title", "quote_option_name", "contact_name", "company_name", "status", "quote_internal_notes", "job_conversion_notes"],
    title: (record: Record<string, unknown>) => [record.quote_number || "Quote", record.title].filter(Boolean).join(" - "),
    subtitle: (record: Record<string, unknown>) => [record.quote_option_name, record.contact_name || record.company_name, record.status].filter(Boolean).join(" · "),
  },
  {
    entity: "Contact",
    type: "Contact",
    fields: ["first_name", "last_name", "full_name", "company_name", "email", "phone", "notes"],
    title: (record: Record<string, unknown>) => String(record.full_name || `${record.first_name || ""} ${record.last_name || ""}`.trim() || record.email || "Contact"),
    subtitle: (record: Record<string, unknown>) => [record.company_name, record.email, record.phone].filter(Boolean).join(" · "),
  },
  {
    entity: "Company",
    type: "Company",
    fields: ["name", "email", "phone", "type", "notes"],
    title: (record: Record<string, unknown>) => String(record.name || "Company"),
    subtitle: (record: Record<string, unknown>) => [record.type, record.email, record.phone].filter(Boolean).join(" · "),
  },
  {
    entity: "Lead",
    type: "Enquiry",
    fields: ["title", "contact_name", "company_name", "site_address", "stage", "description"],
    title: (record: Record<string, unknown>) => String(record.title || "Enquiry"),
    subtitle: (record: Record<string, unknown>) => [record.contact_name, record.company_name, record.stage].filter(Boolean).join(" · "),
  },
  {
    entity: "PricingItem",
    type: "Pricing",
    fields: ["sku", "name", "description", "supplier_name", "category", "section"],
    title: (record: Record<string, unknown>) => String(record.name || record.sku || "Pricing item"),
    subtitle: (record: Record<string, unknown>) => [record.sku, record.supplier_name, record.category].filter(Boolean).join(" · "),
  },
  {
    entity: "Attachment",
    type: "File",
    fields: ["name", "relative_path", "document_information", "supplier_name", "document_number", "related_type", "related_id"],
    title: (record: Record<string, unknown>) => String(record.name || record.relative_path || "File"),
    subtitle: (record: Record<string, unknown>) => [record.related_type, record.supplier_name, record.document_number].filter(Boolean).join(" · "),
  },
] as const;

export function searchEntities(input: UnifiedSearchInput, context: { user: LocalUser | null; enabledModules: Set<string> }): UnifiedSearchItem[] {
  const query = input.query.trim();
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const limit = input.limit || 12;
  const results: UnifiedSearchItem[] = [];

  for (const config of ENTITY_CONFIG) {
    if (!isEntityVisible(config.entity, context.enabledModules)) continue;
    const rows = listEntityRecords(config.entity, { sort: "-updated_date", limit: config.entity === "Attachment" ? 900 : 700 });
    for (const record of rows) {
      if (shouldHideInternalRecord(record, input.context, context.user)) continue;
      const haystack = config.fields.map((field) => record[field]).join(" ");
      const score = scoreEntityMatch(query, tokens, haystack, record, config.fields);
      if (score <= 0) continue;
      results.push({
        id: `${config.entity}:${record.id}`,
        kind: config.entity === "Attachment" ? "file" : "entity",
        type: config.type,
        title: truncateText(config.title(record), 120),
        subtitle: truncateText(config.subtitle(record), 160),
        snippet: buildEntitySnippet(config.fields.map((field) => record[field]).join(" "), tokens),
        href: buildEntityHref(config.entity, record),
        preview_url: config.entity === "Attachment" ? String(record.url || "") : undefined,
        score,
        confidence: score >= 0.8 ? "high" : score >= 0.45 ? "medium" : "low",
        metadata: {
          entity: config.entity,
          record_id: record.id,
          updated_date: record.updated_date,
        },
      });
    }
  }

  return results
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(limit, 12));
}

function isEntityVisible(entity: string, enabledModules: Set<string>) {
  const moduleKey = getEntityModuleKey(entity);
  if (!moduleKey) return true;
  return enabledModules.has(moduleKey) || isModuleEnabled(moduleKey);
}

function scoreEntityMatch(query: string, tokens: string[], haystack: string, record: Record<string, unknown>, fields: readonly string[]) {
  const normalizedHaystack = haystack.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let score = 0;

  if (normalizedHaystack.includes(normalizedQuery)) score += 0.55;
  const titleText = fields.slice(0, 3).map((field) => record[field]).join(" ").toLowerCase();
  if (titleText.includes(normalizedQuery)) score += 0.25;

  let matched = 0;
  for (const token of tokens) {
    if (normalizedHaystack.includes(token)) {
      matched += 1;
      score += titleText.includes(token) ? 0.13 : 0.08;
    }
  }

  if (matched === tokens.length) score += 0.2;
  if (String(record.id || "").toLowerCase() === normalizedQuery) score += 0.3;

  return Math.min(1, Number(score.toFixed(4)));
}

function buildEntitySnippet(text: string, tokens: string[]) {
  const normalized = truncateText(text, 260);
  const lower = normalized.toLowerCase();
  const index = tokens.map((token) => lower.indexOf(token)).filter((position) => position >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 80);
  return truncateText(normalized.slice(start), 220);
}

function tokenize(query: string) {
  return query.toLowerCase().split(/[^a-z0-9]+/i).map((token) => token.trim()).filter((token) => token.length >= 2);
}
