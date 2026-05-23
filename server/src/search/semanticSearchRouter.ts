import { processEmbeddingQueue } from "../ai/embeddings/embeddingQueue";
import { semanticSearch } from "../ai/embeddings/semanticSearch";
import { searchKnowledge } from "../ai/knowledge/retrievalEngine";
import type { UnifiedSearchInput, UnifiedSearchItem, UnifiedSearchContext } from "./searchContext";
import { truncateText } from "./searchContext";

const SEMANTIC_ENTITY_TYPES = ["Job", "Quote", "Contact", "Company", "Note", "Attachment", "PricingItem", "JobOperation"];

export async function runSemanticSearch(input: UnifiedSearchInput, context: UnifiedSearchContext) {
  const query = input.query.trim();
  const started = Date.now();
  const limit = Math.min(input.limit || 10, 12);
  const diagnostics = {
    semantic_ms: 0,
    knowledge_ms: 0,
    degraded: false,
    errors: [] as string[],
  };

  void processEmbeddingQueue({ maxItems: 40 }).catch(() => undefined);

  const [semanticResponse, knowledgeResponse] = await Promise.all([
    withTimeout(
      semanticSearch({ query, entity_types: SEMANTIC_ENTITY_TYPES, limit }),
      3500,
      "semantic_timeout"
    ).catch((error) => {
      diagnostics.errors.push(error instanceof Error ? error.message : "semantic_failed");
      return null;
    }),
    withTimeout(
      searchKnowledge({ query, limit: Math.min(limit, 8) }, {
        user: context.user,
        enabledModules: context.enabledModules,
      }),
      4500,
      "knowledge_timeout"
    ).catch((error) => {
      diagnostics.errors.push(error instanceof Error ? error.message : "knowledge_failed");
      return null;
    }),
  ]);

  const semanticItems: UnifiedSearchItem[] = (semanticResponse?.results || []).map((result) => ({
    id: `semantic:${result.entity}:${result.record_id}`,
    kind: result.entity === "Attachment" ? "file" : result.entity === "JobOperation" ? "workflow" : "semantic",
    type: result.entity,
    title: truncateText(result.title, 120),
    subtitle: result.metadata?.customer ? String(result.metadata.customer) : undefined,
    snippet: truncateText(result.snippet, 260),
    href: result.href,
    score: result.score,
    confidence: result.score >= 0.68 ? "high" : result.score >= 0.42 ? "medium" : "low",
    source: "semantic_entity_index",
    metadata: result.metadata,
  }));

  const knowledgeItems: UnifiedSearchItem[] = (knowledgeResponse?.results || []).map((result) => ({
    id: `knowledge:${result.source_id}:${result.chunk_id}`,
    kind: "file",
    type: "Indexed file",
    title: truncateText(result.source_reference || result.relative_path || "Indexed file", 140),
    subtitle: truncateText(result.source_label || result.relative_path, 180),
    snippet: truncateText(result.snippet || result.chunk_text, 300),
    href: result.file_link || "/admin/ai-knowledge",
    score: Math.max(0, Math.min(1, Number(result.score || 0))),
    confidence: Number(result.score || 0) >= 0.68 ? "high" : Number(result.score || 0) >= 0.42 ? "medium" : "low",
    source: "knowledge_index",
    metadata: {
      source_id: result.source_id,
      chunk_id: result.chunk_id,
      relative_path: result.relative_path,
      source_reference: result.source_reference,
      line_start: result.line_start,
      line_end: result.line_end,
      ...(result.metadata || {}),
    },
  }));

  diagnostics.degraded = Boolean(semanticResponse?.degraded || knowledgeResponse?.degraded || diagnostics.errors.length);
  diagnostics.semantic_ms = Date.now() - started;
  diagnostics.knowledge_ms = diagnostics.semantic_ms;

  return {
    items: [...semanticItems, ...knowledgeItems],
    evidence: [...semanticItems, ...knowledgeItems]
      .filter((item) => item.snippet && item.score >= 0.25)
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        title: item.title,
        snippet: item.snippet || "",
        href: item.href,
        source_type: item.kind === "file" ? "file" as const : item.kind === "workflow" ? "workflow" as const : "entity" as const,
        score: item.score,
      })),
    diagnostics,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timeout);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
