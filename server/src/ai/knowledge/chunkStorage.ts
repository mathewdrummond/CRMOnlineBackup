import crypto from "node:crypto";
import { executeDatabaseStatement, queryDatabaseRow, queryDatabaseRows, runDatabasePreparedStatement } from "../../db";
import { getAiConfig } from "../aiConfig";
import { deleteKnowledgeVectors, upsertKnowledgeVectors } from "../vectorStore";
import { DEFAULT_ALLOWED_EXTENSIONS, toNormalizedExtensions } from "./supportedFileTypes";

const DEFAULT_KNOWLEDGE_QUEUE_MAX = 15_000;

export type KnowledgeSourceRecord = {
  id: string;
  label: string;
  root_path: string;
  enabled: boolean;
  paused: boolean;
  allowed_extensions: string[];
  excluded_patterns: string[];
  max_file_size_bytes: number;
  chunk_size: number;
  chunk_overlap: number;
  scan_interval_minutes: number;
  last_indexed_date: string;
  last_error: string;
  created_date: string;
  updated_date: string;
};

export type KnowledgeFileRecord = {
  id: string;
  source_id: string;
  relative_path: string;
  absolute_path: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  mtime_ms: number;
  content_hash: string;
  status: "pending" | "indexed" | "skipped" | "error" | "deleted";
  chunk_count: number;
  embedding_count: number;
  deleted: boolean;
  last_indexed_date: string;
  last_error: string;
  created_date: string;
  updated_date: string;
};

export type KnowledgeChunkRecord = {
  id: string;
  source_id: string;
  file_id: string;
  relative_path: string;
  chunk_index: number;
  chunk_hash: string;
  chunk_text: string;
  keyword_text: string;
  start_offset: number;
  end_offset: number;
  line_start: number;
  line_end: number;
  section_path: string;
  embedding_json: string;
  embedding_model: string;
  dimensions: number;
  metadata_json: string;
  created_date: string;
  updated_date: string;
};

export type KnowledgeQueueItem = {
  id: string;
  source_id: string;
  task_type: "scan_source" | "index_file" | "delete_file" | "reindex_source";
  file_id: string;
  relative_path: string;
  status: "pending" | "processing" | "failed";
  attempt_count: number;
  next_attempt_at: string;
  priority: number;
  last_error: string;
  created_date: string;
  updated_date: string;
};

export type SourceStatsRecord = {
  source_id: string;
  file_count: number;
  chunk_count: number;
  embedding_count: number;
  total_bytes: number;
  latest_indexed_date: string | null;
};

type RawKnowledgeSourceRow = {
  id: string;
  label: string;
  root_path: string;
  enabled: number;
  paused: number;
  allowed_extensions_json: string;
  excluded_patterns_json: string;
  max_file_size_bytes: number;
  chunk_size: number;
  chunk_overlap: number;
  scan_interval_minutes: number;
  last_indexed_date: string;
  last_error: string;
  created_date: string;
  updated_date: string;
};

export function ensureKnowledgeTables() {
  executeDatabaseStatement(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      root_path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      paused INTEGER NOT NULL DEFAULT 0,
      allowed_extensions_json TEXT NOT NULL,
      excluded_patterns_json TEXT NOT NULL,
      max_file_size_bytes INTEGER NOT NULL DEFAULT 15728640,
      chunk_size INTEGER NOT NULL DEFAULT 1200,
      chunk_overlap INTEGER NOT NULL DEFAULT 120,
      scan_interval_minutes INTEGER NOT NULL DEFAULT 60,
      last_indexed_date TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_knowledge_files (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      extension TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mtime_ms INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      embedding_count INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      last_indexed_date TEXT NOT NULL DEFAULT '',
      last_error TEXT NOT NULL DEFAULT '',
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL,
      UNIQUE(source_id, relative_path)
    );

    CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_hash TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      keyword_text TEXT NOT NULL DEFAULT '',
      start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0,
      line_start INTEGER NOT NULL DEFAULT 1,
      line_end INTEGER NOT NULL DEFAULT 1,
      section_path TEXT NOT NULL DEFAULT '',
      embedding_json TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_knowledge_queue (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL DEFAULT '',
      task_type TEXT NOT NULL,
      file_id TEXT NOT NULL DEFAULT '',
      relative_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 50,
      last_error TEXT NOT NULL DEFAULT '',
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_knowledge_embedding_cache (
      chunk_hash TEXT PRIMARY KEY,
      embedding_json TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      updated_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_knowledge_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ai_knowledge_sources_root_idx ON ai_knowledge_sources(root_path);
    CREATE INDEX IF NOT EXISTS ai_knowledge_sources_enabled_idx ON ai_knowledge_sources(enabled, paused);
    CREATE INDEX IF NOT EXISTS ai_knowledge_files_source_idx ON ai_knowledge_files(source_id, deleted, status);
    CREATE INDEX IF NOT EXISTS ai_knowledge_files_path_idx ON ai_knowledge_files(source_id, relative_path);
    CREATE INDEX IF NOT EXISTS ai_knowledge_files_updated_idx ON ai_knowledge_files(updated_date DESC);
    CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_source_idx ON ai_knowledge_chunks(source_id);
    CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_file_idx ON ai_knowledge_chunks(file_id, chunk_index);
    CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_hash_idx ON ai_knowledge_chunks(chunk_hash);
    CREATE INDEX IF NOT EXISTS ai_knowledge_queue_status_idx ON ai_knowledge_queue(status, priority, next_attempt_at);
    CREATE INDEX IF NOT EXISTS ai_knowledge_queue_source_idx ON ai_knowledge_queue(source_id, status);
  `);
}

export function listKnowledgeSources() {
  ensureKnowledgeTables();
  const rows = queryDatabaseRows<RawKnowledgeSourceRow>(
    "SELECT * FROM ai_knowledge_sources ORDER BY created_date ASC"
  );
  return rows.map(hydrateSourceRow);
}

export function getKnowledgeSource(sourceId: string) {
  ensureKnowledgeTables();
  const row = queryDatabaseRow<RawKnowledgeSourceRow>(
    "SELECT * FROM ai_knowledge_sources WHERE id = ?",
    [sourceId]
  );
  return row ? hydrateSourceRow(row) : null;
}

export function createKnowledgeSource(input: {
  label: string;
  root_path: string;
  enabled?: boolean;
  paused?: boolean;
  allowed_extensions?: string[];
  excluded_patterns?: string[];
  max_file_size_bytes?: number;
  chunk_size?: number;
  chunk_overlap?: number;
  scan_interval_minutes?: number;
}) {
  ensureKnowledgeTables();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const allowedExtensions = toNormalizedExtensions(input.allowed_extensions);
  const excludedPatterns = normalizePatterns(input.excluded_patterns);
  runDatabasePreparedStatement(`
    INSERT INTO ai_knowledge_sources (
      id, label, root_path, enabled, paused, allowed_extensions_json, excluded_patterns_json,
      max_file_size_bytes, chunk_size, chunk_overlap, scan_interval_minutes, last_indexed_date, last_error, created_date, updated_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)
  `, [
    id,
    String(input.label || "").trim(),
    String(input.root_path || "").trim(),
    input.enabled === false ? 0 : 1,
    input.paused === true ? 1 : 0,
    JSON.stringify(allowedExtensions),
    JSON.stringify(excludedPatterns),
    normalizeInt(input.max_file_size_bytes, 10 * 1024 * 1024, 256 * 1024, 250 * 1024 * 1024),
    normalizeInt(input.chunk_size, 1200, 300, 5000),
    normalizeInt(input.chunk_overlap, 120, 0, 1000),
    normalizeInt(input.scan_interval_minutes, 60, 5, 24 * 60),
    now,
    now,
  ]);
  return getKnowledgeSource(id);
}

export function updateKnowledgeSource(
  sourceId: string,
  patch: Partial<{
    label: string;
    root_path: string;
    enabled: boolean;
    paused: boolean;
    allowed_extensions: string[];
    excluded_patterns: string[];
    max_file_size_bytes: number;
    chunk_size: number;
    chunk_overlap: number;
    scan_interval_minutes: number;
    last_indexed_date: string;
    last_error: string;
  }>
) {
  ensureKnowledgeTables();
  const existing = getKnowledgeSource(sourceId);
  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();
  const next = {
    label: String(patch.label ?? existing.label).trim(),
    root_path: String(patch.root_path ?? existing.root_path).trim(),
    enabled: patch.enabled ?? existing.enabled,
    paused: patch.paused ?? existing.paused,
    allowed_extensions: patch.allowed_extensions ? toNormalizedExtensions(patch.allowed_extensions) : existing.allowed_extensions,
    excluded_patterns: patch.excluded_patterns ? normalizePatterns(patch.excluded_patterns) : existing.excluded_patterns,
    max_file_size_bytes: normalizeInt(
      patch.max_file_size_bytes,
      existing.max_file_size_bytes,
      256 * 1024,
      250 * 1024 * 1024
    ),
    chunk_size: normalizeInt(patch.chunk_size, existing.chunk_size, 300, 5000),
    chunk_overlap: normalizeInt(patch.chunk_overlap, existing.chunk_overlap, 0, 1000),
    scan_interval_minutes: normalizeInt(
      patch.scan_interval_minutes,
      existing.scan_interval_minutes,
      5,
      24 * 60
    ),
    last_indexed_date: patch.last_indexed_date ?? existing.last_indexed_date,
    last_error: patch.last_error ?? existing.last_error,
  };

  runDatabasePreparedStatement(`
    UPDATE ai_knowledge_sources
    SET
      label = ?,
      root_path = ?,
      enabled = ?,
      paused = ?,
      allowed_extensions_json = ?,
      excluded_patterns_json = ?,
      max_file_size_bytes = ?,
      chunk_size = ?,
      chunk_overlap = ?,
      scan_interval_minutes = ?,
      last_indexed_date = ?,
      last_error = ?,
      updated_date = ?
    WHERE id = ?
  `, [
    next.label,
    next.root_path,
    next.enabled ? 1 : 0,
    next.paused ? 1 : 0,
    JSON.stringify(next.allowed_extensions),
    JSON.stringify(next.excluded_patterns),
    next.max_file_size_bytes,
    next.chunk_size,
    next.chunk_overlap,
    next.scan_interval_minutes,
    String(next.last_indexed_date || ""),
    String(next.last_error || ""),
    now,
    sourceId,
  ]);

  return getKnowledgeSource(sourceId);
}

export function deleteKnowledgeSource(sourceId: string) {
  ensureKnowledgeTables();
  const chunkIds = queryDatabaseRows<{ id: string }>(
    "SELECT id FROM ai_knowledge_chunks WHERE source_id = ?",
    [sourceId]
  ).map((row) => String(row.id || ""));
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_queue WHERE source_id = ?", [sourceId]);
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_chunks WHERE source_id = ?", [sourceId]);
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_files WHERE source_id = ?", [sourceId]);
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_sources WHERE id = ?", [sourceId]);
  void deleteKnowledgeVectors(chunkIds).catch(() => undefined);
}

export function upsertKnowledgeFile(input: {
  source_id: string;
  relative_path: string;
  absolute_path: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  mtime_ms: number;
  content_hash: string;
  status?: KnowledgeFileRecord["status"];
  last_error?: string;
  deleted?: boolean;
}) {
  ensureKnowledgeTables();
  const now = new Date().toISOString();
  const existing = getKnowledgeFileByPath(input.source_id, input.relative_path);
  const id = existing?.id || crypto.randomUUID();
  runDatabasePreparedStatement(`
    INSERT INTO ai_knowledge_files (
      id, source_id, relative_path, absolute_path, extension, mime_type, size_bytes, mtime_ms,
      content_hash, status, chunk_count, embedding_count, deleted, last_indexed_date, last_error, created_date, updated_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, relative_path) DO UPDATE SET
      absolute_path = excluded.absolute_path,
      extension = excluded.extension,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      mtime_ms = excluded.mtime_ms,
      content_hash = excluded.content_hash,
      status = excluded.status,
      deleted = excluded.deleted,
      last_error = excluded.last_error,
      updated_date = excluded.updated_date
  `, [
    id,
    input.source_id,
    input.relative_path,
    input.absolute_path,
    input.extension,
    input.mime_type || "application/octet-stream",
    Math.max(0, Number(input.size_bytes || 0)),
    Math.max(0, Number(input.mtime_ms || 0)),
    String(input.content_hash || ""),
    input.status || existing?.status || "pending",
    existing?.chunk_count || 0,
    existing?.embedding_count || 0,
    input.deleted ? 1 : 0,
    existing?.last_indexed_date || "",
    String(input.last_error || existing?.last_error || ""),
    existing?.created_date || now,
    now,
  ]);
  return getKnowledgeFileById(id);
}

export function getKnowledgeFileByPath(sourceId: string, relativePath: string) {
  ensureKnowledgeTables();
  return queryDatabaseRow<KnowledgeFileRecord>(
    "SELECT * FROM ai_knowledge_files WHERE source_id = ? AND relative_path = ?",
    [sourceId, relativePath]
  ) || null;
}

export function getKnowledgeFileById(fileId: string) {
  ensureKnowledgeTables();
  return queryDatabaseRow<KnowledgeFileRecord>(
    "SELECT * FROM ai_knowledge_files WHERE id = ?",
    [fileId]
  ) || null;
}

export function listKnowledgeFilesBySource(sourceId: string, options: { includeDeleted?: boolean } = {}) {
  ensureKnowledgeTables();
  const includeDeleted = options.includeDeleted === true;
  return queryDatabaseRows<KnowledgeFileRecord>(
    `SELECT * FROM ai_knowledge_files WHERE source_id = ? ${includeDeleted ? "" : "AND deleted = 0"} ORDER BY relative_path ASC`,
    [sourceId]
  );
}

export function markKnowledgeFileDeleted(sourceId: string, relativePath: string) {
  ensureKnowledgeTables();
  runDatabasePreparedStatement(`
    UPDATE ai_knowledge_files
    SET deleted = 1, status = 'deleted', updated_date = ?
    WHERE source_id = ? AND relative_path = ?
  `, [new Date().toISOString(), sourceId, relativePath]);
}

export function updateKnowledgeFileIndexStatus(fileId: string, patch: {
  status: KnowledgeFileRecord["status"];
  chunk_count?: number;
  embedding_count?: number;
  last_error?: string;
  last_indexed_date?: string;
}) {
  ensureKnowledgeTables();
  const existing = getKnowledgeFileById(fileId);
  if (!existing) return null;
  runDatabasePreparedStatement(`
    UPDATE ai_knowledge_files
    SET
      status = ?,
      chunk_count = ?,
      embedding_count = ?,
      last_error = ?,
      last_indexed_date = ?,
      updated_date = ?
    WHERE id = ?
  `, [
    patch.status,
    Number((patch.chunk_count ?? existing.chunk_count) || 0),
    Number((patch.embedding_count ?? existing.embedding_count) || 0),
    String((patch.last_error ?? existing.last_error) || ""),
    String((patch.last_indexed_date ?? existing.last_indexed_date) || ""),
    new Date().toISOString(),
    fileId,
  ]);
  return getKnowledgeFileById(fileId);
}

export function replaceKnowledgeChunks(file: KnowledgeFileRecord, chunks: Array<{
  chunk_index: number;
  chunk_hash: string;
  chunk_text: string;
  keyword_text: string;
  start_offset: number;
  end_offset: number;
  line_start: number;
  line_end: number;
  section_path: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}>) {
  ensureKnowledgeTables();
  const now = new Date().toISOString();
  const model = getAiConfig().embedModel;
  const previousIds = queryDatabaseRows<{ id: string }>(
    "SELECT id FROM ai_knowledge_chunks WHERE file_id = ?",
    [file.id]
  ).map((row) => String(row.id || ""));
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_chunks WHERE file_id = ?", [file.id]);
  if (previousIds.length > 0) {
    void deleteKnowledgeVectors(previousIds).catch(() => undefined);
  }

  const qdrantPoints: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];
  for (const chunk of chunks) {
    const dimensions = chunk.embedding.length;
    const id = `${file.id}:${chunk.chunk_index}:${chunk.chunk_hash.slice(0, 12)}`;
    runDatabasePreparedStatement(`
      INSERT INTO ai_knowledge_chunks (
        id, source_id, file_id, relative_path, chunk_index, chunk_hash, chunk_text, keyword_text,
        start_offset, end_offset, line_start, line_end, section_path, embedding_json,
        embedding_model, dimensions, metadata_json, created_date, updated_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      file.source_id,
      file.id,
      file.relative_path,
      chunk.chunk_index,
      chunk.chunk_hash,
      chunk.chunk_text,
      chunk.keyword_text,
      chunk.start_offset,
      chunk.end_offset,
      chunk.line_start,
      chunk.line_end,
      chunk.section_path || "",
      JSON.stringify(chunk.embedding),
      model,
      dimensions,
      JSON.stringify(chunk.metadata || {}),
      now,
      now,
    ]);

    qdrantPoints.push({
      id,
      vector: chunk.embedding,
      payload: {
        id,
        source_id: file.source_id,
        file_id: file.id,
        relative_path: file.relative_path,
        chunk_index: chunk.chunk_index,
        chunk_hash: chunk.chunk_hash,
        chunk_text: chunk.chunk_text,
        keyword_text: chunk.keyword_text,
        line_start: chunk.line_start,
        line_end: chunk.line_end,
        section_path: chunk.section_path || "",
        metadata: chunk.metadata || {},
        updated_date: now,
      },
    });

    runDatabasePreparedStatement(`
      INSERT INTO ai_knowledge_embedding_cache (chunk_hash, embedding_json, embedding_model, dimensions, updated_date)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chunk_hash) DO UPDATE SET
        embedding_json = excluded.embedding_json,
        embedding_model = excluded.embedding_model,
        dimensions = excluded.dimensions,
        updated_date = excluded.updated_date
    `, [
      chunk.chunk_hash,
      JSON.stringify(chunk.embedding),
      model,
      dimensions,
      now,
    ]);
  }

  updateKnowledgeFileIndexStatus(file.id, {
    status: "indexed",
    chunk_count: chunks.length,
    embedding_count: chunks.length,
    last_error: "",
    last_indexed_date: now,
  });
  void upsertKnowledgeVectors(qdrantPoints).catch(() => undefined);
}

export function deleteKnowledgeChunksForFile(fileId: string) {
  ensureKnowledgeTables();
  const existingIds = queryDatabaseRows<{ id: string }>(
    "SELECT id FROM ai_knowledge_chunks WHERE file_id = ?",
    [fileId]
  ).map((row) => String(row.id || ""));
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_chunks WHERE file_id = ?", [fileId]);
  if (existingIds.length > 0) {
    void deleteKnowledgeVectors(existingIds).catch(() => undefined);
  }
  const file = getKnowledgeFileById(fileId);
  if (file) {
    updateKnowledgeFileIndexStatus(fileId, {
      status: file.deleted ? "deleted" : "pending",
      chunk_count: 0,
      embedding_count: 0,
      last_error: "",
    });
  }
}

export function listKnowledgeChunksForSearch(options: { sourceIds?: string[]; limit?: number } = {}) {
  ensureKnowledgeTables();
  const limit = Math.max(1, Math.min(50_000, Number(options.limit || 15_000)));
  const sourceIds = (options.sourceIds || []).filter(Boolean);
  if (sourceIds.length === 0) {
    return queryDatabaseRows<KnowledgeChunkRecord>(
      "SELECT * FROM ai_knowledge_chunks ORDER BY updated_date DESC LIMIT ?",
      [limit]
    );
  }
  const placeholders = sourceIds.map(() => "?").join(",");
  return queryDatabaseRows<KnowledgeChunkRecord>(
    `SELECT * FROM ai_knowledge_chunks WHERE source_id IN (${placeholders}) ORDER BY updated_date DESC LIMIT ?`,
    [...sourceIds, limit]
  );
}

export function getCachedEmbeddingByChunkHash(chunkHash: string) {
  ensureKnowledgeTables();
  const row = queryDatabaseRow<{
    embedding_json: string;
    embedding_model: string;
    dimensions: number;
  }>(
    "SELECT embedding_json, embedding_model, dimensions FROM ai_knowledge_embedding_cache WHERE chunk_hash = ?",
    [chunkHash]
  );

  if (!row) {
    return null;
  }

  return {
    embedding: safeParseNumberArray(row.embedding_json),
    embedding_model: row.embedding_model,
    dimensions: Number(row.dimensions || 0),
  };
}

export function enqueueKnowledgeTask(input: {
  source_id: string;
  task_type: KnowledgeQueueItem["task_type"];
  file_id?: string;
  relative_path?: string;
  priority?: number;
  next_attempt_at?: string;
}) {
  ensureKnowledgeTables();
  const queueMax = readKnowledgeQueueMax();
  pruneKnowledgeQueueOverflow(queueMax);
  const now = new Date().toISOString();
  const dedupeId = `${input.task_type}:${input.source_id}:${String(input.file_id || "")}:${String(input.relative_path || "")}`;
  const id = crypto.createHash("sha1").update(dedupeId).digest("hex");
  runDatabasePreparedStatement(`
    INSERT INTO ai_knowledge_queue (
      id, source_id, task_type, file_id, relative_path, status, attempt_count, next_attempt_at, priority, last_error, created_date, updated_date
    )
    VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, '', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = CASE WHEN ai_knowledge_queue.status = 'processing' THEN ai_knowledge_queue.status ELSE 'pending' END,
      priority = excluded.priority,
      next_attempt_at = excluded.next_attempt_at,
      updated_date = excluded.updated_date
  `, [
    id,
    input.source_id,
    input.task_type,
    String(input.file_id || ""),
    String(input.relative_path || ""),
    input.next_attempt_at || now,
    normalizeInt(input.priority, 50, 1, 1000),
    now,
    now,
  ]);
}

export function nextKnowledgeQueueBatch(limit = 10) {
  ensureKnowledgeTables();
  const now = new Date().toISOString();
  return queryDatabaseRows<KnowledgeQueueItem>(`
    SELECT * FROM ai_knowledge_queue
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= '${now.replace(/'/g, "''")}'
    ORDER BY priority ASC, updated_date ASC
    LIMIT ${Math.max(1, Math.min(200, Number(limit || 10)))}
  `);
}

export function markKnowledgeTaskProcessing(taskId: string) {
  ensureKnowledgeTables();
  runDatabasePreparedStatement(
    "UPDATE ai_knowledge_queue SET status = 'processing', updated_date = ? WHERE id = ?",
    [new Date().toISOString(), taskId]
  );
}

export function markKnowledgeTaskDone(taskId: string) {
  ensureKnowledgeTables();
  runDatabasePreparedStatement("DELETE FROM ai_knowledge_queue WHERE id = ?", [taskId]);
}

export function markKnowledgeTaskFailed(taskId: string, error: string, retryDelayMs = 15_000) {
  ensureKnowledgeTables();
  const nextAttemptAt = new Date(Date.now() + Math.max(5_000, retryDelayMs)).toISOString();
  runDatabasePreparedStatement(`
    UPDATE ai_knowledge_queue
    SET status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = ?,
        next_attempt_at = ?,
        updated_date = ?
    WHERE id = ?
  `, [
    String(error || "Knowledge task failed."),
    nextAttemptAt,
    new Date().toISOString(),
    taskId,
  ]);
}

export function listKnowledgeQueueSummary() {
  ensureKnowledgeTables();
  return queryDatabaseRows<{ status: string; count: number }>(
    "SELECT status, COUNT(*) as count FROM ai_knowledge_queue GROUP BY status ORDER BY status ASC"
  );
}

export function getKnowledgeQueueConfig() {
  return {
    max: readKnowledgeQueueMax(),
  };
}

export function getKnowledgeStats() {
  ensureKnowledgeTables();
  const bySource = queryDatabaseRows<SourceStatsRecord>(`
    SELECT
      source_id,
      COUNT(*) as file_count,
      COALESCE(SUM(size_bytes), 0) as total_bytes,
      COALESCE(SUM(chunk_count), 0) as chunk_count,
      COALESCE(SUM(embedding_count), 0) as embedding_count,
      MAX(last_indexed_date) as latest_indexed_date
    FROM ai_knowledge_files
    WHERE deleted = 0
    GROUP BY source_id
    ORDER BY source_id ASC
  `);

  const totals = queryDatabaseRow<{
    source_count: number;
    file_count: number;
    chunk_count: number;
    embedding_count: number;
    total_bytes: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM ai_knowledge_sources) as source_count,
      COALESCE((SELECT COUNT(*) FROM ai_knowledge_files WHERE deleted = 0), 0) as file_count,
      COALESCE((SELECT SUM(chunk_count) FROM ai_knowledge_files WHERE deleted = 0), 0) as chunk_count,
      COALESCE((SELECT SUM(embedding_count) FROM ai_knowledge_files WHERE deleted = 0), 0) as embedding_count,
      COALESCE((SELECT SUM(size_bytes) FROM ai_knowledge_files WHERE deleted = 0), 0) as total_bytes
  `);

  return {
    totals: totals || {
      source_count: 0,
      file_count: 0,
      chunk_count: 0,
      embedding_count: 0,
      total_bytes: 0,
    },
    by_source: bySource,
    queue: listKnowledgeQueueSummary(),
  };
}

export function readKnowledgeState<T>(key: string, fallback: T): T {
  ensureKnowledgeTables();
  const row = queryDatabaseRow<{ value_json: string }>(
    "SELECT value_json FROM ai_knowledge_state WHERE key = ?",
    [key]
  );
  if (!row?.value_json) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function writeKnowledgeState(key: string, value: unknown) {
  ensureKnowledgeTables();
  const now = new Date().toISOString();
  runDatabasePreparedStatement(`
    INSERT INTO ai_knowledge_state (key, value_json, updated_date)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_date = excluded.updated_date
  `, [key, JSON.stringify(value), now]);
}

function hydrateSourceRow(row: RawKnowledgeSourceRow): KnowledgeSourceRecord {
  return {
    id: row.id,
    label: String(row.label || ""),
    root_path: String(row.root_path || ""),
    enabled: Number(row.enabled || 0) === 1,
    paused: Number(row.paused || 0) === 1,
    allowed_extensions: normalizeExtensionsFromDb(row.allowed_extensions_json),
    excluded_patterns: normalizePatterns(safeParseStringArray(row.excluded_patterns_json)),
    max_file_size_bytes: normalizeInt(row.max_file_size_bytes, 10 * 1024 * 1024, 256 * 1024, 250 * 1024 * 1024),
    chunk_size: normalizeInt(row.chunk_size, 1200, 300, 5000),
    chunk_overlap: normalizeInt(row.chunk_overlap, 120, 0, 1000),
    scan_interval_minutes: normalizeInt(row.scan_interval_minutes, 60, 5, 24 * 60),
    last_indexed_date: String(row.last_indexed_date || ""),
    last_error: String(row.last_error || ""),
    created_date: String(row.created_date || ""),
    updated_date: String(row.updated_date || ""),
  };
}

function normalizeExtensionsFromDb(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson);
    return toNormalizedExtensions(parsed);
  } catch {
    return [...DEFAULT_ALLOWED_EXTENSIONS];
  }
}

function normalizePatterns(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 200))];
}

function safeParseStringArray(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseNumberArray(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => Number(value) || 0);
  } catch {
    return [];
  }
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function readKnowledgeQueueMax() {
  const value = Number(process.env.AI_KNOWLEDGE_QUEUE_MAX || DEFAULT_KNOWLEDGE_QUEUE_MAX);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_KNOWLEDGE_QUEUE_MAX;
  }
  return Math.max(200, Math.min(100_000, Math.trunc(value)));
}

function pruneKnowledgeQueueOverflow(queueMax: number) {
  const row = queryDatabaseRow<{ count: number }>("SELECT COUNT(*) AS count FROM ai_knowledge_queue");
  const count = Number(row?.count || 0);
  const overflow = Math.max(0, count - queueMax);
  if (overflow <= 0) {
    return;
  }
  runDatabasePreparedStatement(
    `
      DELETE FROM ai_knowledge_queue
      WHERE id IN (
        SELECT id FROM ai_knowledge_queue
        WHERE status IN ('pending', 'failed')
        ORDER BY updated_date ASC
        LIMIT ?
      )
    `,
    [overflow]
  );
}
