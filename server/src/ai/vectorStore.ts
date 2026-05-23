import crypto from "node:crypto";
import { logAiEvent } from "./aiLogger";

type QdrantPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

type QdrantSearchResult = {
  id: string;
  score: number;
  payload: Record<string, unknown>;
};

type VectorCollection = "entity_embeddings" | "knowledge_chunks";

const DEFAULT_QDRANT_URL = "http://localhost:6333";
const DEFAULT_ENTITY_COLLECTION = "entity_embeddings";
const DEFAULT_KNOWLEDGE_COLLECTION = "knowledge_chunks";
const DEFAULT_QUEUE_LIMIT = 5_000;
const DEFAULT_QUEUE_DELAY_MS = 500;
const DEFAULT_QUEUE_BATCH_SIZE = 80;
const DEFAULT_RETRY_BASE_MS = 1_500;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 4_000;
const DEFAULT_TEST_REQUEST_TIMEOUT_MS = 600;
const FAILURE_LOG_THROTTLE_MS = 30_000;

let collectionsEnsured = false;
let latestError = "";
let queueTimer: NodeJS.Timeout | null = null;
let queueProcessing = false;
let queueDropCount = 0;
let failureStreak = 0;
let nextRetryDate = 0;
let lastFailureLogAt = 0;

type VectorSyncTask =
  | {
      key: string;
      collection: VectorCollection;
      type: "upsert";
      points: QdrantPoint[];
      attempts: number;
      nextAttemptAt: number;
      queuedAt: number;
      lastError: string;
    }
  | {
      key: string;
      collection: VectorCollection;
      type: "delete";
      ids: string[];
      attempts: number;
      nextAttemptAt: number;
      queuedAt: number;
      lastError: string;
    };

const queue = new Map<string, VectorSyncTask>();

export function getVectorStoreConfig() {
  const queueMax = Number(process.env.AI_VECTOR_QUEUE_MAX || DEFAULT_QUEUE_LIMIT);
  const queueBatchSize = Number(process.env.AI_VECTOR_QUEUE_BATCH || DEFAULT_QUEUE_BATCH_SIZE);
  const queueRetryBaseMs = Number(process.env.AI_VECTOR_QUEUE_RETRY_BASE_MS || DEFAULT_RETRY_BASE_MS);
  const queueMaxAttempts = Number(process.env.AI_VECTOR_QUEUE_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const requestTimeoutMs = Number(process.env.QDRANT_REQUEST_TIMEOUT_MS || (process.env.NODE_ENV === "test" ? DEFAULT_TEST_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS));
  return {
    url: String(process.env.QDRANT_URL || DEFAULT_QDRANT_URL).trim().replace(/\/+$/, ""),
    apiKey: String(process.env.QDRANT_API_KEY || "").trim(),
    enabled: !["0", "false", "off", "disabled", "no"].includes(String(process.env.AI_ENABLED ?? "true").trim().toLowerCase()),
    entityCollection: String(process.env.QDRANT_COLLECTION_ENTITIES || DEFAULT_ENTITY_COLLECTION).trim() || DEFAULT_ENTITY_COLLECTION,
    knowledgeCollection: String(process.env.QDRANT_COLLECTION_KNOWLEDGE || DEFAULT_KNOWLEDGE_COLLECTION).trim() || DEFAULT_KNOWLEDGE_COLLECTION,
    queueMax: Number.isFinite(queueMax) && queueMax > 0 ? Math.min(queueMax, 50_000) : DEFAULT_QUEUE_LIMIT,
    queueBatchSize: Number.isFinite(queueBatchSize) && queueBatchSize > 0 ? Math.min(queueBatchSize, 1_000) : DEFAULT_QUEUE_BATCH_SIZE,
    queueRetryBaseMs: Number.isFinite(queueRetryBaseMs) && queueRetryBaseMs > 0 ? queueRetryBaseMs : DEFAULT_RETRY_BASE_MS,
    queueMaxAttempts: Number.isFinite(queueMaxAttempts) && queueMaxAttempts > 0 ? Math.min(queueMaxAttempts, 20) : DEFAULT_MAX_ATTEMPTS,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? Math.min(requestTimeoutMs, 60_000) : DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

export function getVectorStoreDiagnostics() {
  const now = Date.now();
  return {
    ...getVectorStoreConfig(),
    collectionsEnsured,
    lastError: latestError,
    queue: {
      pending: queue.size,
      scheduled: Boolean(queueTimer),
      processing: queueProcessing,
      dropped: queueDropCount,
      failure_streak: failureStreak,
      cooldown_remaining_ms: Math.max(0, nextRetryDate - now),
    },
  };
}

export async function ensureVectorCollections(dimensions = 768) {
  const config = getVectorStoreConfig();
  if (!config.enabled) {
    return;
  }
  if (collectionsEnsured) return;

  await Promise.all([
    createCollectionIfMissing(config.entityCollection, dimensions),
    createCollectionIfMissing(config.knowledgeCollection, dimensions),
  ]);
  collectionsEnsured = true;
}

export async function upsertEntityVector(point: QdrantPoint) {
  enqueueTask({
    key: `entity_upsert:${point.id}`,
    collection: "entity_embeddings",
    type: "upsert",
    points: [point],
    attempts: 0,
    nextAttemptAt: Date.now(),
    queuedAt: Date.now(),
    lastError: "",
  });
}

export async function deleteEntityVector(id: string) {
  enqueueTask({
    key: `entity_delete:${id}`,
    collection: "entity_embeddings",
    type: "delete",
    ids: [id],
    attempts: 0,
    nextAttemptAt: Date.now(),
    queuedAt: Date.now(),
    lastError: "",
  });
}

export async function upsertKnowledgeVectors(points: QdrantPoint[]) {
  if (points.length === 0) return;
  enqueueTask({
    key: `knowledge_upsert:${buildBulkKey(points.map((point) => point.id))}`,
    collection: "knowledge_chunks",
    type: "upsert",
    points,
    attempts: 0,
    nextAttemptAt: Date.now(),
    queuedAt: Date.now(),
    lastError: "",
  });
}

export async function deleteKnowledgeVectors(ids: string[]) {
  if (ids.length === 0) return;
  enqueueTask({
    key: `knowledge_delete:${buildBulkKey(ids)}`,
    collection: "knowledge_chunks",
    type: "delete",
    ids,
    attempts: 0,
    nextAttemptAt: Date.now(),
    queuedAt: Date.now(),
    lastError: "",
  });
}

export async function searchKnowledgeVectorsInQdrant(input: {
  vector: number[];
  limit: number;
  sourceIds?: string[];
}) {
  const config = getVectorStoreConfig();
  if (!config.enabled) return [] as QdrantSearchResult[];

  const filter = input.sourceIds && input.sourceIds.length > 0
    ? {
        must: [
          {
            key: "source_id",
            match: { any: input.sourceIds },
          },
        ],
      }
    : undefined;
  return searchPoints(config.knowledgeCollection, input.vector, input.limit, filter);
}

export async function searchEntityVectorsInQdrant(input: {
  vector: number[];
  limit: number;
  entityTypes?: string[];
}) {
  const config = getVectorStoreConfig();
  if (!config.enabled) return [] as QdrantSearchResult[];
  const filter = input.entityTypes && input.entityTypes.length > 0
    ? {
        must: [
          {
            key: "entity",
            match: { any: input.entityTypes },
          },
        ],
      }
    : undefined;
  return searchPoints(config.entityCollection, input.vector, input.limit, filter);
}

async function createCollectionIfMissing(collection: string, dimensions: number) {
  const payload = {
    vectors: {
      size: Math.max(1, Number(dimensions || 768)),
      distance: "Cosine",
    },
  };
  try {
    await qdrantRequest(`/collections/${encodeURIComponent(collection)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("409 Conflict") && message.includes("already exists")) {
      latestError = "";
      failureStreak = 0;
      nextRetryDate = 0;
      return;
    }
    throw error;
  }
}

async function upsertPoints(collection: string, points: QdrantPoint[]) {
  await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points?wait=false`, {
    method: "PUT",
    body: JSON.stringify({
      points: points.map((point) => ({
        id: toQdrantPointId(point.id),
        vector: point.vector,
        payload: point.payload,
      })),
    }),
  });
}

async function deletePoints(collection: string, ids: string[]) {
  await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points/delete?wait=false`, {
    method: "POST",
    body: JSON.stringify({
      points: ids.map(toQdrantPointId),
    }),
  });
}

async function searchPoints(
  collection: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>
) {
  const response = await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      with_vector: false,
      filter,
    }),
  });

  const body = await parseJson(response);
  const resultRows = Array.isArray(body?.result) ? body.result : [];
  return resultRows.map((row: unknown) => {
    const typed = (row && typeof row === "object" ? row : {}) as {
      id?: string | number;
      score?: number;
      payload?: Record<string, unknown>;
    };
    return {
      id: String(typed.id || ""),
      score: Number(typed.score || 0),
      payload: typed.payload && typeof typed.payload === "object" ? typed.payload : {},
    };
  }) as QdrantSearchResult[];
}

async function qdrantRequest(pathname: string, init: RequestInit) {
  const config = getVectorStoreConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["api-key"] = config.apiKey;
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Qdrant request timed out")), config.requestTimeoutMs);
  try {
    const response = await fetch(`${config.url}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Qdrant request failed: ${response.status} ${response.statusText} ${text}`.trim());
    }
    latestError = "";
    failureStreak = 0;
    nextRetryDate = 0;
    return response;
  } catch (error) {
    latestError = error instanceof Error ? error.message : String(error);
    failureStreak += 1;
    nextRetryDate = Date.now() + Math.min(60_000, 2_000 * failureStreak);
    const now = Date.now();
    if ((now - lastFailureLogAt) >= FAILURE_LOG_THROTTLE_MS) {
      lastFailureLogAt = now;
      logAiEvent("vector_store_request_failed", {
        url: `${config.url}${pathname}`,
        duration_ms: Date.now() - started,
        error: latestError,
        failure_streak: failureStreak,
      }, "warn");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function resolveCollectionName(collection: VectorCollection) {
  const config = getVectorStoreConfig();
  return collection === "knowledge_chunks" ? config.knowledgeCollection : config.entityCollection;
}

function enqueueTask(task: VectorSyncTask) {
  const config = getVectorStoreConfig();
  if (!config.enabled) return;

  queue.set(task.key, task);
  const overflow = queue.size - config.queueMax;
  if (overflow > 0) {
    const ordered = [...queue.values()]
      .sort((left, right) => left.queuedAt - right.queuedAt)
      .slice(0, overflow);
    ordered.forEach((item) => queue.delete(item.key));
    queueDropCount += ordered.length;
    logAiEvent("vector_sync_queue_dropped", {
      dropped: ordered.length,
      pending: queue.size,
      max: config.queueMax,
    }, "warn");
  }
  scheduleVectorQueue(DEFAULT_QUEUE_DELAY_MS);
}

function scheduleVectorQueue(delayMs = DEFAULT_QUEUE_DELAY_MS) {
  if (queueTimer) return;
  queueTimer = setTimeout(() => {
    queueTimer = null;
    void processVectorSyncQueue().catch((error) => {
      logAiEvent("vector_sync_queue_failed", {
        error: error instanceof Error ? error.message : String(error),
        pending: queue.size,
      }, "warn");
    });
  }, Math.max(150, delayMs));
  if (typeof queueTimer.unref === "function") {
    queueTimer.unref();
  }
}

export async function processVectorSyncQueue(options: { maxItems?: number } = {}) {
  if (queueProcessing) {
    return getVectorSyncQueueSummary();
  }
  const config = getVectorStoreConfig();
  if (!config.enabled) {
    return getVectorSyncQueueSummary();
  }
  if (Date.now() < nextRetryDate) {
    scheduleVectorQueue(Math.max(250, nextRetryDate - Date.now()));
    return getVectorSyncQueueSummary();
  }

  queueProcessing = true;
  const startedAt = Date.now();
  let processed = 0;
  let failed = 0;

  try {
    const maxItems = Math.max(1, Math.min(500, Number(options.maxItems || config.queueBatchSize)));
    const eligible = [...queue.values()]
      .filter((task) => task.nextAttemptAt <= Date.now())
      .sort((left, right) => left.queuedAt - right.queuedAt)
      .slice(0, maxItems);

    for (const task of eligible) {
      try {
        if (task.type === "upsert") {
          const dimensions = Math.max(1, Number(task.points[0]?.vector?.length || 768));
          await ensureVectorCollections(dimensions);
          await upsertPoints(resolveCollectionName(task.collection), task.points);
        } else {
          await deletePoints(resolveCollectionName(task.collection), task.ids);
        }
        queue.delete(task.key);
        processed += 1;
      } catch (error) {
        failed += 1;
        const attempts = task.attempts + 1;
        if (attempts >= config.queueMaxAttempts) {
          queue.delete(task.key);
          logAiEvent("vector_sync_task_dropped", {
            key: task.key,
            attempts,
            error: error instanceof Error ? error.message : String(error),
          }, "warn");
          continue;
        }
        const delayMs = Math.min(120_000, config.queueRetryBaseMs * (2 ** (attempts - 1)));
        queue.set(task.key, {
          ...task,
          attempts,
          nextAttemptAt: Date.now() + delayMs,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    queueProcessing = false;
  }

  if (queue.size > 0) {
    scheduleVectorQueue(failed > 0 ? Math.max(500, config.queueRetryBaseMs) : DEFAULT_QUEUE_DELAY_MS);
  }
  logAiEvent("vector_sync_queue_processed", {
    processed,
    failed,
    pending: queue.size,
    duration_ms: Date.now() - startedAt,
  }, failed > 0 ? "warn" : "info");

  return getVectorSyncQueueSummary();
}

export function getVectorSyncQueueSummary() {
  const now = Date.now();
  let retrying = 0;
  for (const task of queue.values()) {
    if (task.nextAttemptAt > now) retrying += 1;
  }
  return {
    pending: queue.size,
    retrying,
    scheduled: Boolean(queueTimer),
    processing: queueProcessing,
    dropped: queueDropCount,
    failure_streak: failureStreak,
    cooldown_remaining_ms: Math.max(0, nextRetryDate - now),
  };
}

export function stopVectorSyncQueue() {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  queueProcessing = false;
  queue.clear();
}

function buildBulkKey(ids: string[]) {
  const sorted = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))].sort();
  return sorted.join("|");
}

function toQdrantPointId(id: string) {
  const normalized = String(id || "").trim();
  if (/^[0-9]+$/.test(normalized)) return normalized;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return normalized;
  }
  const hex = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
