import { z } from "zod";
import { LocalUser } from "../../types";
import { embedKnowledgeText } from "./embeddingGenerator";
import { getKnowledgeSource, listKnowledgeSources } from "./chunkStorage";
import { isKnowledgeResultVisibleToUser } from "./knowledgePermissions";
import { searchKnowledgeVectors } from "./vectorStore";

export const knowledgeSearchSchema = z.object({
  query: z.string().trim().min(2).max(1500),
  source_ids: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  entity_type: z.string().trim().max(80).optional(),
  customer: z.string().trim().max(180).optional(),
  date_from: z.string().trim().max(40).optional(),
  date_to: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchSchema>;

export async function searchKnowledge(
  input: KnowledgeSearchInput,
  context: {
    user: LocalUser | null;
    enabledModules?: Set<string>;
  }
) {
  const query = input.query.trim();
  const limit = input.limit || 8;
  const sourceIds = resolveAccessibleSourceIds(input.source_ids || []);
  const embedded = await embedKnowledgeText(query, { retries: 1 });

  const results = (await searchKnowledgeVectors({
    query,
    queryVector: embedded.vector,
    sourceIds,
    limit,
    metadataFilter(metadata) {
      if (!isKnowledgeResultVisibleToUser(context.user, metadata)) {
        return false;
      }

      if (input.entity_type && !contains(metadata.entity_type, input.entity_type)) {
        return false;
      }

      if (input.customer && !contains(metadata.customer, input.customer)) {
        return false;
      }

      if (context.enabledModules && context.enabledModules.size > 0) {
        const moduleKey = String(metadata.module_key || "");
        if (moduleKey && !context.enabledModules.has(moduleKey)) {
          return false;
        }
      }

      if (!matchesDateRange(metadata, input.date_from, input.date_to)) {
        return false;
      }

      return true;
    },
  })).map((result) => ({
    ...result,
    source_label: String(getKnowledgeSource(result.source_id)?.label || result.source_id),
    file_link: buildKnowledgeFileHref(result.relative_path),
    snippet: buildSnippet(result.chunk_text, query),
    source_reference: `${result.relative_path}:${result.line_start}-${result.line_end}`,
  }));

  return {
    query,
    degraded: embedded.degraded,
    from_cache: embedded.from_cache,
    source_ids: sourceIds,
    results,
  };
}

function resolveAccessibleSourceIds(requestedIds: string[]) {
  const active = listKnowledgeSources()
    .filter((source) => source.enabled)
    .filter((source) => !source.paused);
  if (requestedIds.length === 0) {
    return active.map((source) => source.id);
  }
  const requested = new Set(requestedIds);
  return active
    .filter((source) => requested.has(source.id))
    .map((source) => source.id);
}

function contains(value: unknown, expected: string) {
  return String(value || "")
    .toLowerCase()
    .includes(String(expected || "").toLowerCase().trim());
}

function matchesDateRange(metadata: Record<string, unknown>, dateFrom = "", dateTo = "") {
  const sourceDate = Date.parse(String(metadata.date || metadata.updated_date || ""));
  if (dateFrom) {
    const fromDate = Date.parse(dateFrom);
    if (Number.isFinite(fromDate) && (!Number.isFinite(sourceDate) || sourceDate < fromDate)) {
      return false;
    }
  }
  if (dateTo) {
    const toDate = Date.parse(dateTo);
    if (Number.isFinite(toDate) && (!Number.isFinite(sourceDate) || sourceDate > toDate)) {
      return false;
    }
  }
  return true;
}

function buildSnippet(text: string, query: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) return normalized;
  const queryTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2);
  const lower = normalized.toLowerCase();
  const firstIndex = queryTokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstIndex - 80);
  return `${start > 0 ? "... " : ""}${normalized.slice(start, start + 220)}${start + 220 < normalized.length ? " ..." : ""}`;
}

function buildKnowledgeFileHref(relativePath: string) {
  return `/api/ai/knowledge/sources/file?path=${encodeURIComponent(relativePath)}`;
}
