import { logAiEvent } from "../aiLogger";
import { ChunkedDocumentSegment, chunkKnowledgeText } from "./fileChunker";

const DEFAULT_REMOTE_CHUNK_TIMEOUT_MS = 30_000;

export async function chunkKnowledgeTextForIndexing(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    sectionPath?: string;
    requestId?: string;
  } = {}
) {
  const remoteUrl = normalizeChunkerUrl(process.env.AI_CHUNKER_URL || "");
  if (!remoteUrl) {
    return chunkKnowledgeText(text, options);
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(`${remoteUrl}/chunk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        sectionPath: options.sectionPath,
      }),
    }, readChunkerTimeoutMs());

    if (!response.ok) {
      throw new Error(`Chunk worker request failed with status ${response.status}.`);
    }

    const body = await response.json() as { chunks?: ChunkedDocumentSegment[]; worker?: string };
    const chunks = validateChunks(body.chunks);
    logAiEvent("knowledge_remote_chunked", {
      request_id: options.requestId || "",
      worker: body.worker || remoteUrl,
      chunks: chunks.length,
      duration_ms: Date.now() - startedAt,
    });
    return chunks;
  } catch (error) {
    logAiEvent("knowledge_remote_chunker_fallback", {
      request_id: options.requestId || "",
      chunker_url: remoteUrl,
      reason: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startedAt,
    }, "warn");
    return chunkKnowledgeText(text, options);
  }
}

function validateChunks(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Chunk worker returned an invalid chunk list.");
  }

  return value.map((chunk, index) => {
    const typed = chunk && typeof chunk === "object" ? chunk as Partial<ChunkedDocumentSegment> : {};
    const chunkText = String(typed.chunk_text || "");
    const chunkHash = String(typed.chunk_hash || "");
    if (!chunkText || !chunkHash) {
      throw new Error(`Chunk worker returned invalid chunk at index ${index}.`);
    }
    return {
      chunk_index: Number(typed.chunk_index ?? index),
      chunk_hash: chunkHash,
      chunk_text: chunkText,
      keyword_text: String(typed.keyword_text || ""),
      start_offset: Number(typed.start_offset || 0),
      end_offset: Number(typed.end_offset || 0),
      line_start: Number(typed.line_start || 1),
      line_end: Number(typed.line_end || 1),
      section_path: String(typed.section_path || ""),
    };
  });
}

function normalizeChunkerUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function readChunkerTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.AI_CHUNKER_TIMEOUT_MS || ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_REMOTE_CHUNK_TIMEOUT_MS;
  return Math.max(1_000, Math.min(180_000, parsed));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
