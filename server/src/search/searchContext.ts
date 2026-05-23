import { z } from "zod";
import type { LocalUser } from "../types";

export const unifiedSearchSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  context: z.object({
    pathname: z.string().trim().max(300).optional(),
    entity_type: z.string().trim().max(80).optional(),
    entity_id: z.string().trim().max(128).optional(),
    client_mode: z.boolean().optional(),
  }).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
  include_ai: z.boolean().optional(),
}).strict();

export type UnifiedSearchInput = z.infer<typeof unifiedSearchSchema>;

export type UnifiedSearchContext = {
  user: LocalUser | null;
  enabledModules: Set<string>;
  requestId: string;
};

export type UnifiedSearchItem = {
  id: string;
  kind: "entity" | "file" | "semantic" | "workflow" | "action";
  type: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  href?: string;
  preview_url?: string;
  score: number;
  confidence?: "high" | "medium" | "low";
  source?: string;
  metadata?: Record<string, unknown>;
};

export type SearchEvidence = {
  id: string;
  title: string;
  snippet: string;
  href?: string;
  source_type: "entity" | "file" | "workflow";
  score: number;
};

export function getEnabledModuleSet() {
  try {
    const { getModuleConfig } = require("../appModules") as typeof import("../appModules");
    const config = getModuleConfig();
    return new Set(
      Object.entries(config.enabled || {})
        .filter(([, enabled]) => enabled)
        .map(([moduleKey]) => moduleKey)
    );
  } catch {
    return new Set<string>();
  }
}

export function isManagementUser(user: LocalUser | null) {
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || role === "owner" || role === "manager";
}

export function shouldHideInternalRecord(record: Record<string, unknown>, context?: UnifiedSearchInput["context"], user?: LocalUser | null) {
  if (isManagementUser(user || null)) return false;
  if (record.management_only === true) return true;
  if (context?.client_mode && (record.internal_only === true || record.visible_to_production === false)) return true;
  return false;
}

export function buildEntityHref(entity: string, record: Record<string, unknown>) {
  const id = encodeURIComponent(String(record.id || ""));
  if (!id) return "";
  switch (entity) {
    case "Job": return `/jobs/${id}`;
    case "Quote": return `/quotes/${id}`;
    case "Contact": return `/contacts/${id}`;
    case "Company": return `/companies/${id}`;
    case "Lead": return `/leads/${id}`;
    case "Supplier": return `/suppliers/${id}`;
    case "PricingItem": return "/pricing";
    case "Attachment":
      if (record.url) return String(record.url);
      return "";
    default: return "";
  }
}

export function truncateText(value: unknown, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}
