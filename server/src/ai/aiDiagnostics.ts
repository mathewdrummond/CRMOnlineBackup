import os from "node:os";
import { getAiConfig, validateAiStartupConfiguration } from "./aiConfig";
import { getEmbeddingQueueSummary } from "./embeddings/embeddingQueue";
import { ensureEmbeddingIndex, getIndexStats } from "./embeddings/embeddingIndex";
import { getKnowledgeQueueConfig, getKnowledgeStats, listKnowledgeQueueSummary } from "./knowledge/chunkStorage";
import { getVectorStoreDiagnostics, getVectorSyncQueueSummary } from "./vectorStore";
import { queryDatabaseRows } from "../db";

type EmbeddingIntegrityRow = {
  id: string;
  dimensions: number;
  embedding_json: string;
};

export function buildAiDiagnostics() {
  const config = getAiConfig();
  const startup = validateAiStartupConfiguration(config);
  const memory = process.memoryUsage();
  const embeddingIntegrity = inspectEmbeddingIntegrity();
  return {
    generated_at: new Date().toISOString(),
    startup,
    configuration: {
      enabled: config.enabled,
      base_url: config.baseUrl,
      primary_model: config.primaryModel,
      fast_model: config.fastModel,
      embed_model: config.embedModel,
      request_timeout_ms: config.requestTimeoutMs,
      request_retries: config.requestRetries,
      rate_limit_max: config.rateLimitMax,
      rate_limit_window_ms: config.rateLimitWindowMs,
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      uptime_seconds: Math.round(process.uptime()),
      memory_rss_mb: roundMb(memory.rss),
      memory_heap_used_mb: roundMb(memory.heapUsed),
      memory_heap_total_mb: roundMb(memory.heapTotal),
      system_free_mb: roundMb(os.freemem()),
      system_total_mb: roundMb(os.totalmem()),
    },
    queues: {
      embeddings: getEmbeddingQueueSummary(),
      knowledge: summarizeKnowledgeQueue(),
      vector: getVectorSyncQueueSummary(),
    },
    vector_index: {
      backend: getVectorStoreDiagnostics(),
      entities: getIndexStats(),
      integrity: embeddingIntegrity,
      rebuild_available: true,
    },
    knowledge: getKnowledgeStats(),
    safety: {
      offline_handling: "ollama failures are isolated per request and return degraded/offline responses",
      malformed_output_handling: "structured AI output is schema validated before use",
      request_cancellation: "AI HTTP calls use AbortController timeouts",
      auto_commit: false,
    },
  };
}

function summarizeKnowledgeQueue() {
  const config = getKnowledgeQueueConfig();
  const rows = listKnowledgeQueueSummary();
  const totals = rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.status] = Number(row.count || 0);
    return summary;
  }, { pending: 0, processing: 0, failed: 0 });
  const total = Number(totals.pending || 0) + Number(totals.processing || 0) + Number(totals.failed || 0);
  return {
    ...totals,
    total,
    max: config.max,
  };
}

function inspectEmbeddingIntegrity() {
  ensureEmbeddingIndex();
  const rows = queryDatabaseRows<EmbeddingIntegrityRow>(
    "SELECT id, dimensions, embedding_json FROM ai_embeddings ORDER BY updated_date DESC LIMIT 10000"
  );
  let corrupt = 0;
  let dimensionMismatch = 0;
  rows.forEach((row) => {
    try {
      const vector = JSON.parse(row.embedding_json);
      if (!Array.isArray(vector)) {
        corrupt += 1;
        return;
      }
      if (Number(row.dimensions || 0) !== vector.length) {
        dimensionMismatch += 1;
      }
    } catch {
      corrupt += 1;
    }
  });
  return {
    checked: rows.length,
    corrupt,
    dimension_mismatch: dimensionMismatch,
    healthy: corrupt === 0 && dimensionMismatch === 0,
  };
}

function roundMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
