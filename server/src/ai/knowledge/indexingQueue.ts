import { logAiEvent } from "../aiLogger";
import {
  listKnowledgeQueueSummary,
  markKnowledgeTaskDone,
  markKnowledgeTaskFailed,
  markKnowledgeTaskProcessing,
  nextKnowledgeQueueBatch,
  readKnowledgeState,
  writeKnowledgeState,
} from "./chunkStorage";
import { processKnowledgeQueueItem, queueAllEnabledKnowledgeSourceScans, queueKnowledgeSourceReindex } from "./knowledgeIndexer";

const KNOWLEDGE_QUEUE_PAUSED_KEY = "knowledge_queue_paused";
const DEFAULT_QUEUE_DELAY_MS = 1500;

let queueTimer: NodeJS.Timeout | null = null;
let processing = false;

export function isKnowledgeQueuePaused() {
  return readKnowledgeState<boolean>(KNOWLEDGE_QUEUE_PAUSED_KEY, false);
}

export function setKnowledgeQueuePaused(paused: boolean) {
  writeKnowledgeState(KNOWLEDGE_QUEUE_PAUSED_KEY, Boolean(paused));
}

export function scheduleKnowledgeQueue(delayMs = DEFAULT_QUEUE_DELAY_MS) {
  if (queueTimer) {
    return;
  }
  queueTimer = setTimeout(() => {
    queueTimer = null;
    void processKnowledgeQueueBatch().catch((error) => {
      logAiEvent("knowledge_queue_batch_failed", {
        message: error instanceof Error ? error.message : String(error),
      }, "warn");
    });
  }, Math.max(250, delayMs));
  if (typeof queueTimer.unref === "function") {
    queueTimer.unref();
  }
}

export async function processKnowledgeQueueBatch(options: { maxItems?: number } = {}) {
  if (processing || isKnowledgeQueuePaused()) {
    return {
      processed: 0,
      queue: listKnowledgeQueueSummary(),
      paused: isKnowledgeQueuePaused(),
    };
  }

  const startedAt = Date.now();
  processing = true;
  const maxItems = Math.max(1, Math.min(40, Number(options.maxItems || 8)));
  const batch = nextKnowledgeQueueBatch(maxItems);
  let processed = 0;
  let failed = 0;

  try {
    for (const item of batch) {
      markKnowledgeTaskProcessing(item.id);
      try {
        await processKnowledgeQueueItem(item);
        markKnowledgeTaskDone(item.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        markKnowledgeTaskFailed(item.id, error instanceof Error ? error.message : String(error), 15_000);
      }
    }
  } finally {
    processing = false;
  }

  const queue = listKnowledgeQueueSummary();
  logAiEvent("knowledge_queue_processed", {
    processed,
    failed,
    duration_ms: Date.now() - startedAt,
    queue,
  }, failed > 0 ? "warn" : "info");

  if (queue.some((entry) => Number(entry.count || 0) > 0)) {
    scheduleKnowledgeQueue(1200);
  }

  return {
    processed,
    failed,
    queue,
    paused: isKnowledgeQueuePaused(),
  };
}

export function triggerKnowledgeInitialScan() {
  queueAllEnabledKnowledgeSourceScans();
  scheduleKnowledgeQueue(250);
}

export function triggerKnowledgeReindex(sourceId: string) {
  queueKnowledgeSourceReindex(sourceId);
  scheduleKnowledgeQueue(250);
}

export function stopKnowledgeQueue() {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  processing = false;
}
