import { z } from "zod";
import { createDeterministicEmbedding, cosineSimilarity, embedText } from "./embeddingService";
import { getEntityRecordForEmbedding, listStoredEmbeddings, refreshEmbeddingIndex } from "./embeddingIndex";
import { getSearchResultHref } from "./entityEmbeddingMapper";
import { searchEntityVectorsInQdrant } from "../vectorStore";

export const semanticSearchSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  entity_types: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  customer: z.string().trim().max(180).optional(),
  designer: z.string().trim().max(180).optional(),
  date_from: z.string().trim().max(40).optional(),
  date_to: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  refresh: z.boolean().optional(),
}).strict();

export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

export type SemanticSearchResult = {
  entity: string;
  record_id: string;
  title: string;
  snippet: string;
  href: string;
  score: number;
  semantic_score: number;
  keyword_score: number;
  metadata: Record<string, unknown>;
  row_version: number;
};

export async function semanticSearch(input: SemanticSearchInput): Promise<{
  query: string;
  degraded: boolean;
  results: SemanticSearchResult[];
}> {
  const limit = input.limit || 10;
  if (input.refresh) {
    await refreshEmbeddingIndex({ limitPerEntity: 500 });
  }

  const query = input.query.trim();
  let queryVector: number[];
  let degraded = false;
  try {
    queryVector = await embedText(query);
  } catch {
    queryVector = createDeterministicEmbedding(query);
    degraded = true;
  }

  const queryTokens = tokenize(query);
  try {
    const qdrantResults = await searchEntityVectorsInQdrant({
      vector: queryVector,
      limit: Math.max(10, limit * 3),
      entityTypes: input.entity_types,
    });
    if (qdrantResults.length > 0) {
      const mapped = qdrantResults
        .map((row) => mapQdrantEntityResult(row, queryTokens))
        .filter((result) => matchesFilters(result.metadata, input))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
      if (mapped.length > 0) {
        return { query, degraded, results: mapped };
      }
    }
  } catch {
    // Fallback to local deterministic vector search.
  }

  const candidates = listStoredEmbeddings({
    entityTypes: input.entity_types,
    limit: 10_000,
  }).filter((embedding) => matchesFilters(embedding.metadata, input));

  const results = candidates
    .map((embedding) => {
      const semanticScore = Math.max(0, cosineSimilarity(queryVector, embedding.vector));
      const keywordScore = scoreKeywords(queryTokens, embedding.contentText);
      const score = (semanticScore * 0.72) + (keywordScore * 0.28);
      return {
        entity: embedding.entity,
        record_id: embedding.recordId,
        title: String(embedding.metadata.title || embedding.entity),
        snippet: buildSnippet(embedding.contentText, queryTokens),
        href: getSearchResultHref(embedding.entity, embedding.metadata, embedding.recordId),
        score: roundScore(score),
        semantic_score: roundScore(semanticScore),
        keyword_score: roundScore(keywordScore),
        metadata: embedding.metadata,
        row_version: embedding.rowVersion,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return { query, degraded, results };
}

export async function findSimilarEntity(entity: "Job" | "Quote", recordId: string, limit = 8) {
  const all = listStoredEmbeddings({ entityTypes: [entity], limit: 10_000 });
  const source = all.find((embedding) => embedding.recordId === recordId);
  if (!source) {
    return { source: null, results: [] as SemanticSearchResult[] };
  }

  const sourceRecord = getEntityRecordForEmbedding(source);
  const results = all
    .filter((embedding) => embedding.recordId !== recordId)
    .map((embedding) => {
      const semanticScore = Math.max(0, cosineSimilarity(source.vector, embedding.vector));
      const keywordScore = scoreKeywords(tokenize(source.contentText), embedding.contentText);
      const score = (semanticScore * 0.78) + (keywordScore * 0.22);
      return {
        entity: embedding.entity,
        record_id: embedding.recordId,
        title: String(embedding.metadata.title || embedding.entity),
        snippet: buildSnippet(embedding.contentText, tokenize(source.contentText)),
        href: getSearchResultHref(embedding.entity, embedding.metadata, embedding.recordId),
        score: roundScore(score),
        semantic_score: roundScore(semanticScore),
        keyword_score: roundScore(keywordScore),
        metadata: embedding.metadata,
        row_version: embedding.rowVersion,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return {
    source: sourceRecord ? {
      id: sourceRecord.id,
      title: source.metadata.title || sourceRecord.title || sourceRecord.name || entity,
      row_version: sourceRecord.row_version,
    } : null,
    results,
  };
}

function matchesFilters(metadata: Record<string, unknown>, input: SemanticSearchInput) {
  if (input.customer && !contains(metadata.customer, input.customer)) return false;
  if (input.designer && !contains(metadata.designer, input.designer)) return false;

  const dateValue = Date.parse(String(metadata.date || ""));
  if (input.date_from) {
    const from = Date.parse(input.date_from);
    if (Number.isFinite(from) && (!Number.isFinite(dateValue) || dateValue < from)) return false;
  }
  if (input.date_to) {
    const to = Date.parse(input.date_to);
    if (Number.isFinite(to) && (!Number.isFinite(dateValue) || dateValue > to)) return false;
  }

  return true;
}

function contains(value: unknown, expected: string) {
  return String(value || "").toLowerCase().includes(expected.trim().toLowerCase());
}

function tokenize(value: string) {
  return Array.from(new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 2)
  ));
}

function scoreKeywords(queryTokens: string[], content: string) {
  if (queryTokens.length === 0) return 0;
  const contentTokens = new Set(tokenize(content));
  const matches = queryTokens.filter((token) => contentTokens.has(token)).length;
  return matches / queryTokens.length;
}

function buildSnippet(content: string, queryTokens: string[]) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) return normalized;
  const lower = normalized.toLowerCase();
  const firstMatch = queryTokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstMatch - 80);
  return `${start > 0 ? "... " : ""}${normalized.slice(start, start + 220)}${start + 220 < normalized.length ? " ..." : ""}`;
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function mapQdrantEntityResult(
  row: { id: string; score: number; payload: Record<string, unknown> },
  queryTokens: string[]
): SemanticSearchResult {
  const entity = String(row.payload.entity || "Unknown");
  const recordId = String(row.payload.record_id || "").trim();
  const contentText = String(row.payload.content_text || "");
  const metadata = readMetadata(row.payload.metadata);
  const keywordScore = scoreKeywords(queryTokens, contentText);
  const semanticScore = roundScore(Number(row.score || 0));
  const score = roundScore((semanticScore * 0.72) + (keywordScore * 0.28));
  return {
    entity,
    record_id: recordId,
    title: String(metadata.title || entity),
    snippet: buildSnippet(contentText, queryTokens),
    href: getSearchResultHref(entity, metadata, recordId),
    score,
    semantic_score: semanticScore,
    keyword_score: roundScore(keywordScore),
    metadata,
    row_version: Number(row.payload.row_version || 1),
  };
}

function readMetadata(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
