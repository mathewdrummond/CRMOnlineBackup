import { executeDatabaseStatement, getEntityRecord, listEntityRecords, queryDatabaseRow, queryDatabaseRows, runDatabasePreparedStatement } from "../../db";
import { EntityRecord } from "../../types";
import { getAiConfig } from "../aiConfig";
import { logAiEvent } from "../aiLogger";
import { deleteEntityVector, upsertEntityVector } from "../vectorStore";
import { createDeterministicEmbedding, embedText } from "./embeddingService";
import { EMBEDDABLE_ENTITY_TYPES, EmbeddingDocument, mapEntityToEmbeddingDocument } from "./entityEmbeddingMapper";

type EmbeddingRow = {
  id: string;
  entity: string;
  record_id: string;
  row_version: number;
  content_hash: string;
  content_text: string;
  embedding_json: string;
  embedding_model: string;
  dimensions: number;
  metadata_json: string;
  created_date: string;
  updated_date: string;
};

export type StoredEmbedding = {
  id: string;
  entity: string;
  recordId: string;
  rowVersion: number;
  contentHash: string;
  contentText: string;
  vector: number[];
  embeddingModel: string;
  dimensions: number;
  metadata: Record<string, unknown>;
  createdDate: string;
  updatedDate: string;
};

export function ensureEmbeddingIndex() {
  executeDatabaseStatement(`
    CREATE TABLE IF NOT EXISTS ai_embeddings (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      row_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      content_text TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL,
      UNIQUE(entity, record_id)
    );
    CREATE INDEX IF NOT EXISTS ai_embeddings_entity_idx ON ai_embeddings(entity);
    CREATE INDEX IF NOT EXISTS ai_embeddings_record_idx ON ai_embeddings(entity, record_id);
    CREATE INDEX IF NOT EXISTS ai_embeddings_updated_idx ON ai_embeddings(updated_date DESC);
    CREATE INDEX IF NOT EXISTS ai_embeddings_model_idx ON ai_embeddings(embedding_model);
  `);
}

export async function indexEntityRecord(entity: string, record: EntityRecord, options: { force?: boolean } = {}) {
  ensureEmbeddingIndex();
  const document = mapEntityToEmbeddingDocument(entity, record);
  if (!document) return null;

  const existing = getEmbeddingForRecord(entity, document.recordId);
  const model = getAiConfig().embedModel;
  if (
    existing
    && !options.force
    && existing.rowVersion === document.rowVersion
    && existing.contentHash === document.contentHash
    && existing.embeddingModel === model
  ) {
    return existing;
  }

  let vector: number[];
  let degraded = false;
  try {
    vector = await embedText(document.content);
  } catch {
    vector = createDeterministicEmbedding(document.content);
    degraded = true;
  }

  const stored = upsertEmbeddingDocument(document, vector, degraded ? `${model}:deterministic-fallback` : model);
  if (degraded) {
    logAiEvent("ai_embedding_fallback_indexed", {
      entity,
      record_id: document.recordId,
      row_version: document.rowVersion,
    }, "warn");
  }
  return stored;
}

export async function indexEntityType(entity: string, options: { limit?: number; force?: boolean } = {}) {
  ensureEmbeddingIndex();
  const startedAt = Date.now();
  const records = listEntityRecords(entity, { sort: "-updated_date", limit: options.limit });
  let indexed = 0;
  for (const record of records) {
    const result = await indexEntityRecord(entity, record, options);
    if (result) indexed += 1;
  }
  removeDeletedEmbeddingsForEntity(entity, records);
  logAiEvent("ai_embedding_entity_indexed", {
    entity,
    indexed,
    scanned: records.length,
    duration_ms: Date.now() - startedAt,
  });
  return { entity, indexed, scanned: records.length };
}

export async function refreshEmbeddingIndex(options: { limitPerEntity?: number; force?: boolean } = {}) {
  ensureEmbeddingIndex();
  const summaries = [];
  for (const entity of EMBEDDABLE_ENTITY_TYPES) {
    summaries.push(await indexEntityType(entity, { limit: options.limitPerEntity, force: options.force }));
  }
  return summaries;
}

export function listStoredEmbeddings(options: { entityTypes?: string[]; limit?: number } = {}) {
  ensureEmbeddingIndex();
  const entityTypes = (options.entityTypes || []).filter(Boolean);
  const limit = Math.max(1, Math.min(10_000, Number(options.limit || 1000)));
  const rows = entityTypes.length > 0
    ? queryDatabaseRows<EmbeddingRow>(
        `SELECT * FROM ai_embeddings WHERE entity IN (${entityTypes.map(() => "?").join(",")}) ORDER BY updated_date DESC LIMIT ?`,
        [...entityTypes, limit]
      )
    : queryDatabaseRows<EmbeddingRow>("SELECT * FROM ai_embeddings ORDER BY updated_date DESC LIMIT ?", [limit]);

  return rows.map(hydrateEmbeddingRow);
}

export function getEmbeddingForRecord(entity: string, recordId: string) {
  ensureEmbeddingIndex();
  const row = queryDatabaseRow<EmbeddingRow>(
    "SELECT * FROM ai_embeddings WHERE entity = ? AND record_id = ?",
    [entity, recordId]
  );
  return row ? hydrateEmbeddingRow(row) : null;
}

export function getIndexStats() {
  ensureEmbeddingIndex();
  return queryDatabaseRows<{ entity: string; count: number; latest_updated_date: string | null }>(
    "SELECT entity, COUNT(*) as count, MAX(updated_date) as latest_updated_date FROM ai_embeddings GROUP BY entity ORDER BY entity"
  );
}

export function deleteEmbeddingForRecord(entity: string, recordId: string) {
  ensureEmbeddingIndex();
  runDatabasePreparedStatement("DELETE FROM ai_embeddings WHERE entity = ? AND record_id = ?", [entity, recordId]);
  void deleteEntityVector(`${entity}:${recordId}`).catch(() => undefined);
}

export function getEntityRecordForEmbedding(embedding: StoredEmbedding) {
  return getEntityRecord(embedding.entity, embedding.recordId);
}

function upsertEmbeddingDocument(document: EmbeddingDocument, vector: number[], embeddingModel: string) {
  const now = new Date().toISOString();
  const existing = getEmbeddingForRecord(document.entity, document.recordId);
  const id = existing?.id || `${document.entity}:${document.recordId}`;
  runDatabasePreparedStatement(`
    INSERT INTO ai_embeddings (
      id, entity, record_id, row_version, content_hash, content_text, embedding_json,
      embedding_model, dimensions, metadata_json, created_date, updated_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity, record_id) DO UPDATE SET
      row_version = excluded.row_version,
      content_hash = excluded.content_hash,
      content_text = excluded.content_text,
      embedding_json = excluded.embedding_json,
      embedding_model = excluded.embedding_model,
      dimensions = excluded.dimensions,
      metadata_json = excluded.metadata_json,
      updated_date = excluded.updated_date
  `, [
    id,
    document.entity,
    document.recordId,
    document.rowVersion,
    document.contentHash,
    document.content,
    JSON.stringify(vector),
    embeddingModel,
    vector.length,
    JSON.stringify(document.metadata),
    existing?.createdDate || now,
    now,
  ]);

  void upsertEntityVector({
    id,
    vector,
    payload: {
      id,
      entity: document.entity,
      record_id: document.recordId,
      row_version: document.rowVersion,
      content_hash: document.contentHash,
      content_text: document.content,
      metadata: document.metadata,
      updated_date: now,
    },
  }).catch(() => undefined);

  return getEmbeddingForRecord(document.entity, document.recordId);
}

function removeDeletedEmbeddingsForEntity(entity: string, currentRecords: EntityRecord[]) {
  const currentIds = new Set(currentRecords.map((record) => String(record.id || "")));
  listStoredEmbeddings({ entityTypes: [entity], limit: 10000 }).forEach((embedding) => {
    if (!currentIds.has(embedding.recordId)) {
      runDatabasePreparedStatement("DELETE FROM ai_embeddings WHERE entity = ? AND record_id = ?", [entity, embedding.recordId]);
      void deleteEntityVector(`${entity}:${embedding.recordId}`).catch(() => undefined);
    }
  });
}

function hydrateEmbeddingRow(row: EmbeddingRow): StoredEmbedding {
  return {
    id: row.id,
    entity: row.entity,
    recordId: row.record_id,
    rowVersion: Number(row.row_version || 1),
    contentHash: row.content_hash,
    contentText: row.content_text,
    vector: safeParseArray(row.embedding_json),
    embeddingModel: row.embedding_model,
    dimensions: Number(row.dimensions || 0),
    metadata: safeParseObject(row.metadata_json),
    createdDate: row.created_date,
    updatedDate: row.updated_date,
  };
}

function safeParseArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => Number(item) || 0) : [];
  } catch {
    return [];
  }
}

function safeParseObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
