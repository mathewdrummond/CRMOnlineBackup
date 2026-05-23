import crypto from "node:crypto";
import { createAiRequestId, getAiConfig } from "../aiConfig";
import { estimateTokens, logAiEvent } from "../aiLogger";
import { AiServiceError } from "../aiTypes";

export const EMBEDDING_DIMENSIONS = 768;

type EmbeddingProvider = (text: string) => Promise<number[]>;

let embeddingProviderOverride: EmbeddingProvider | null = null;

export function setEmbeddingProviderForTests(provider: EmbeddingProvider | null) {
  if (String(process.env.NODE_ENV || "").toLowerCase() !== "test") {
    throw new Error("Embedding provider overrides are only available in test mode.");
  }

  embeddingProviderOverride = provider;
}

export async function embedText(text: string, options: { requestId?: string; timeoutMs?: number } = {}) {
  const normalizedText = String(text || "").trim();
  const requestId = options.requestId || createAiRequestId("embed");
  if (!normalizedText) {
    throw new AiServiceError(400, "request_failed", "Embedding text is required.", requestId);
  }

  if (embeddingProviderOverride) {
    return normalizeVector(await embeddingProviderOverride(normalizedText));
  }

  const config = getAiConfig();
  if (!config.enabled) {
    throw new AiServiceError(503, "disabled", "AI assistance is disabled.", requestId);
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.embedModel,
        prompt: normalizedText,
      }),
    }, options.timeoutMs ?? config.requestTimeoutMs);

    if (!response.ok) {
      throw new AiServiceError(503, "request_failed", `Ollama embedding request failed with status ${response.status}.`, requestId);
    }

    const body = await response.json() as { embedding?: number[] };
    if (!Array.isArray(body.embedding) || body.embedding.length === 0) {
      throw new AiServiceError(502, "request_failed", "Ollama did not return an embedding vector.", requestId);
    }

    const vector = normalizeVector(body.embedding);
    logAiEvent("ai_embedding_request", {
      request_id: requestId,
      model: config.embedModel,
      status: "success",
      duration_ms: Date.now() - startedAt,
      prompt_tokens_estimate: estimateTokens(normalizedText),
      dimensions: vector.length,
    });
    return vector;
  } catch (error) {
    const normalized = normalizeEmbeddingError(error, requestId);
    logAiEvent("ai_embedding_request", {
      request_id: requestId,
      model: config.embedModel,
      status: normalized.code,
      duration_ms: Date.now() - startedAt,
      prompt_tokens_estimate: estimateTokens(normalizedText),
      error: normalized.message,
    }, "warn");
    throw normalized;
  }
}

export function createDeterministicEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS) {
  const vector = new Array(dimensions).fill(0);
  const tokens = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2);

  tokens.forEach((token) => {
    const hash = crypto.createHash("sha256").update(token).digest();
    const index = hash.readUInt16BE(0) % dimensions;
    const sign = hash[2] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.min(token.length, 12) / 12);
  });

  return normalizeVector(vector);
}

export function normalizeVector(vector: number[]) {
  const values = vector.map((value) => Number(value) || 0);
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return values;
  return values.map((value) => value / magnitude);
}

export function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += (Number(left[index]) || 0) * (Number(right[index]) || 0);
  }
  return dot;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError(504, "timeout", "Ollama embedding request timed out.", createAiRequestId("embed_timeout"));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeEmbeddingError(error: unknown, requestId: string) {
  if (error instanceof AiServiceError) {
    return new AiServiceError(error.status, error.code, error.message, requestId, error.detail);
  }

  if (error instanceof TypeError) {
    return new AiServiceError(503, "ollama_offline", "Ollama is offline or unreachable.", requestId, error.message);
  }

  return new AiServiceError(502, "request_failed", error instanceof Error ? error.message : "Embedding request failed.", requestId);
}
