import { createDeterministicEmbedding, embedText } from "../embeddings/embeddingService";
import { logAiEvent } from "../aiLogger";
import { getCachedEmbeddingByChunkHash } from "./chunkStorage";

export async function embedKnowledgeText(
  text: string,
  options: {
    chunkHash?: string;
    requestId?: string;
    timeoutMs?: number;
    retries?: number;
  } = {}
) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      vector: [] as number[],
      degraded: false,
      from_cache: false,
    };
  }

  const chunkHash = String(options.chunkHash || "").trim();
  if (chunkHash) {
    const cached = getCachedEmbeddingByChunkHash(chunkHash);
    if (cached && Array.isArray(cached.embedding) && cached.embedding.length > 0) {
      return {
        vector: cached.embedding,
        degraded: false,
        from_cache: true,
      };
    }
  }

  const retries = Math.max(0, Math.min(4, Number(options.retries ?? 1)));
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    attempt += 1;
    try {
      const vector = await embedText(normalized, {
        requestId: options.requestId,
        timeoutMs: options.timeoutMs,
      });
      return {
        vector,
        degraded: false,
        from_cache: false,
      };
    } catch (error) {
      lastError = error;
    }
  }

  logAiEvent("knowledge_embedding_fallback", {
    chunk_hash: chunkHash,
    retries,
    reason: lastError instanceof Error ? lastError.message : String(lastError || "unknown"),
  }, "warn");

  return {
    vector: createDeterministicEmbedding(normalized),
    degraded: true,
    from_cache: false,
  };
}
