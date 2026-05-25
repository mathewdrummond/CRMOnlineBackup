import { getEntityRecord, listEntityRecords } from "../../db";
import { getAiConfig } from "../aiConfig";
import { logAiEvent } from "../aiLogger";
import { indexEntityRecord, refreshEmbeddingIndex } from "./embeddingIndex";
import { EMBEDDABLE_ENTITY_TYPES, isEmbeddableEntity } from "./entityEmbeddingMapper";

const DEFAULT_QUEUE_LIMIT = 5_000;
const DEFAULT_QUEUE_DELAY_MS = 500;

const pending = new Map<string, { entity: string; recordId: string }>();
let processing = false;
let timer: NodeJS.Timeout | null = null;
let dropped = 0;

export function queueEmbeddingRefresh(entity: string, recordId: string) {
  if (!getAiConfig().enabled) return;
  if (!isEmbeddableEntity(entity) || !recordId) return;
  const config = getEmbeddingQueueConfig();
  pending.set(`${entity}:${recordId}`, { entity, recordId });
  const overflow = pending.size - config.queueMax;
  if (overflow > 0) {
    const staleKeys = [...pending.keys()].slice(0, overflow);
    staleKeys.forEach((key) => pending.delete(key));
    dropped += staleKeys.length;
    logAiEvent("ai_embedding_queue_dropped", {
      dropped: staleKeys.length,
      pending: pending.size,
      max: config.queueMax,
    }, "warn");
  }
  scheduleEmbeddingQueue();
}

export function queueInitialEmbeddingBackfill() {
  if (!getAiConfig().enabled) return;
  EMBEDDABLE_ENTITY_TYPES.forEach((entity) => {
    listEntityRecords(entity, { sort: "-updated_date", limit: 500 }).forEach((record) => {
      queueEmbeddingRefresh(entity, String(record.id || ""));
    });
  });
}

export function scheduleEmbeddingQueue(delayMs = DEFAULT_QUEUE_DELAY_MS) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void processEmbeddingQueue().catch((error) => {
      logAiEvent("ai_embedding_queue_failed", {
        message: error instanceof Error ? error.message : String(error),
        pending: pending.size,
      }, "warn");
    });
  }, Math.max(100, delayMs));
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export async function processEmbeddingQueue(options: { maxItems?: number } = {}) {
  if (processing) return { processed: 0, pending: pending.size };
  processing = true;
  const startedAt = Date.now();
  const config = getEmbeddingQueueConfig();
  const maxItems = Math.max(1, Math.min(500, options.maxItems || 50));
  let processed = 0;

  try {
    const items = [...pending.values()].slice(0, maxItems);
    for (const item of items) {
      pending.delete(`${item.entity}:${item.recordId}`);
      const record = getEntityRecord(item.entity, item.recordId);
      if (record) {
        await indexEntityRecord(item.entity, record);
        processed += 1;
      }
    }
  } catch (error) {
    logAiEvent("ai_embedding_queue_failed", {
      message: error instanceof Error ? error.message : String(error),
      pending: pending.size,
    }, "warn");
  } finally {
    processing = false;
  }

  logAiEvent("ai_embedding_queue_processed", {
    processed,
    pending: pending.size,
    duration_ms: Date.now() - startedAt,
  });

  if (pending.size > 0) {
    scheduleEmbeddingQueue(Math.max(500, config.queueDelayMs));
  }

  return { processed, pending: pending.size };
}

export function stopEmbeddingQueue() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending.clear();
  dropped = 0;
  processing = false;
}

export function getEmbeddingQueueSummary() {
  const config = getEmbeddingQueueConfig();
  return {
    max: config.queueMax,
    pending: pending.size,
    dropped,
    processing,
    scheduled: Boolean(timer),
  };
}

export async function runEmbeddingBackfillNow(options: { limitPerEntity?: number; force?: boolean } = {}) {
  return refreshEmbeddingIndex(options);
}

function getEmbeddingQueueConfig() {
  const queueMax = Number(process.env.AI_EMBED_QUEUE_MAX || DEFAULT_QUEUE_LIMIT);
  const queueDelayMs = Number(process.env.AI_EMBED_QUEUE_DELAY_MS || DEFAULT_QUEUE_DELAY_MS);
  return {
    queueMax: Number.isFinite(queueMax) && queueMax > 0 ? Math.min(queueMax, 20_000) : DEFAULT_QUEUE_LIMIT,
    queueDelayMs: Number.isFinite(queueDelayMs) && queueDelayMs > 0 ? Math.min(queueDelayMs, 30_000) : DEFAULT_QUEUE_DELAY_MS,
  };
}
