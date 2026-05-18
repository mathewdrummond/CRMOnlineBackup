import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getEntityModuleKey } from "../../appModules";
import { getEntityRecord, listEntityRecords } from "../../db";
import { logAiEvent } from "../aiLogger";
import {
  KnowledgeFileRecord,
  KnowledgeQueueItem,
  KnowledgeSourceRecord,
  deleteKnowledgeChunksForFile,
  enqueueKnowledgeTask,
  getKnowledgeFileByPath,
  getKnowledgeSource,
  listKnowledgeFilesBySource,
  listKnowledgeSources,
  markKnowledgeFileDeleted,
  replaceKnowledgeChunks,
  updateKnowledgeFileIndexStatus,
  updateKnowledgeSource,
  upsertKnowledgeFile,
} from "./chunkStorage";
import { embedKnowledgeText } from "./embeddingGenerator";
import { chunkKnowledgeText } from "./fileChunker";
import { scanKnowledgeSource } from "./filesystemScanner";
import { ensureKnowledgeChildPath } from "./knowledgePermissions";
import { isMetadataOnlyExtension, isOfficeDocumentExtension, isTextBasedExtension } from "./supportedFileTypes";

export async function runKnowledgeSourceScan(sourceId: string) {
  const source = getKnowledgeSource(sourceId);
  if (!source || !source.enabled || source.paused) {
    return {
      source_id: sourceId,
      scanned: 0,
      queued: 0,
      deleted: 0,
    };
  }

  const startedAt = Date.now();
  const scan = await scanKnowledgeSource(source, { throttleMs: 2 });
  const existing = listKnowledgeFilesBySource(source.id, { includeDeleted: true });
  const existingByRelativePath = new Map(existing.map((record) => [record.relative_path, record]));
  const scannedRelativePaths = new Set<string>();

  let queued = 0;
  for (const entry of scan.entries) {
    scannedRelativePaths.add(entry.relative_path);
    const contentHash = hashFileIdentity(entry.relative_path, entry.mtime_ms, entry.size_bytes);
    const fileRecord = upsertKnowledgeFile({
      source_id: source.id,
      relative_path: entry.relative_path,
      absolute_path: entry.absolute_path,
      extension: entry.extension,
      mime_type: entry.mime_type,
      size_bytes: entry.size_bytes,
      mtime_ms: entry.mtime_ms,
      content_hash: contentHash,
      status: "pending",
      deleted: false,
    });

    const previous = existingByRelativePath.get(entry.relative_path);
    const changed = !previous
      || previous.content_hash !== contentHash
      || previous.deleted
      || previous.status !== "indexed";
    if (fileRecord && changed) {
      enqueueKnowledgeTask({
        source_id: source.id,
        task_type: "index_file",
        file_id: fileRecord.id,
        relative_path: fileRecord.relative_path,
        priority: 25,
      });
      queued += 1;
    }
  }

  let deleted = 0;
  for (const previous of existing) {
    if (previous.deleted) continue;
    if (scannedRelativePaths.has(previous.relative_path)) continue;
    markKnowledgeFileDeleted(previous.source_id, previous.relative_path);
    enqueueKnowledgeTask({
      source_id: previous.source_id,
      task_type: "delete_file",
      file_id: previous.id,
      relative_path: previous.relative_path,
      priority: 10,
    });
    deleted += 1;
  }

  updateKnowledgeSource(source.id, {
    last_indexed_date: new Date().toISOString(),
    last_error: "",
  });

  logAiEvent("knowledge_source_scanned", {
    source_id: source.id,
    scanned: scan.entries.length,
    queued,
    deleted,
    skipped_entries: scan.skipped_entries,
    scanned_directories: scan.scanned_directories,
    duration_ms: Date.now() - startedAt,
  });

  return {
    source_id: source.id,
    scanned: scan.entries.length,
    queued,
    deleted,
  };
}

export async function processKnowledgeQueueItem(item: KnowledgeQueueItem) {
  if (item.task_type === "scan_source" || item.task_type === "reindex_source") {
    return runKnowledgeSourceScan(item.source_id);
  }

  if (item.task_type === "delete_file") {
    if (item.file_id) {
      deleteKnowledgeChunksForFile(item.file_id);
    }
    return { task: "delete_file", file_id: item.file_id };
  }

  if (item.task_type === "index_file") {
    if (!item.file_id) {
      throw new Error("Queue item missing file_id.");
    }
    return indexKnowledgeFile(item.file_id);
  }

  return { task: item.task_type };
}

export function queueKnowledgeSourceReindex(sourceId: string) {
  enqueueKnowledgeTask({
    source_id: sourceId,
    task_type: "reindex_source",
    priority: 20,
  });
}

export function queueAllEnabledKnowledgeSourceScans() {
  listKnowledgeSources()
    .filter((source) => source.enabled)
    .filter((source) => !source.paused)
    .forEach((source) => {
      enqueueKnowledgeTask({
        source_id: source.id,
        task_type: "scan_source",
        priority: 60,
      });
    });
}

async function indexKnowledgeFile(fileId: string) {
  const source = listKnowledgeSources().find((record) => record.id === getFileSourceId(fileId));
  void source;
  const file = resolveFileRecord(fileId);
  if (!file || file.deleted) {
    return { task: "index_file", status: "missing", file_id: fileId };
  }

  const startedAt = Date.now();
  updateKnowledgeFileIndexStatus(file.id, { status: "pending", last_error: "" });
  try {
    const extracted = await extractKnowledgeFileContent(file);
    const chunks = chunkKnowledgeText(extracted.text, {
      chunkSize: getSourceChunkSize(file.source_id),
      chunkOverlap: getSourceChunkOverlap(file.source_id),
      sectionPath: extracted.section_path,
    });

    const embeddedChunks: Array<{
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
    }> = [];

    for (const chunk of chunks) {
      const embedded = await embedKnowledgeText(chunk.chunk_text, {
        chunkHash: chunk.chunk_hash,
        requestId: `knowledge_${file.id}`,
        retries: 1,
      });
      embeddedChunks.push({
        ...chunk,
        embedding: embedded.vector,
        metadata: {
          source_id: file.source_id,
          file_id: file.id,
          relative_path: file.relative_path,
          extension: file.extension,
          mime_type: file.mime_type,
          entity_type: extracted.entity_type,
          entity_id: extracted.entity_id,
          module_key: extracted.module_key,
          customer: extracted.customer,
          date: extracted.date,
          visibility: extracted.visibility,
          production_visibility: extracted.visibility,
          visible_to_production: extracted.visible_to_production,
          management_only: extracted.management_only,
          internal_only: extracted.internal_only,
          updated_date: new Date().toISOString(),
        },
      });
    }

    replaceKnowledgeChunks(file, embeddedChunks);
    logAiEvent("knowledge_file_indexed", {
      file_id: file.id,
      source_id: file.source_id,
      relative_path: file.relative_path,
      chunks: embeddedChunks.length,
      duration_ms: Date.now() - startedAt,
    });
    return {
      task: "index_file",
      file_id: file.id,
      chunks: embeddedChunks.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateKnowledgeFileIndexStatus(file.id, {
      status: "error",
      last_error: message,
    });
    throw error;
  }
}

function resolveFileRecord(fileId: string) {
  const allSources = listKnowledgeSources().map((source) => source.id);
  for (const sourceId of allSources) {
    const record = listKnowledgeFilesBySource(sourceId, { includeDeleted: true }).find((file) => file.id === fileId);
    if (record) return record;
  }
  return null;
}

function getFileSourceId(fileId: string) {
  const record = resolveFileRecord(fileId);
  return record?.source_id || "";
}

function getSourceChunkSize(sourceId: string) {
  return listKnowledgeSources().find((source) => source.id === sourceId)?.chunk_size || 1200;
}

function getSourceChunkOverlap(sourceId: string) {
  return listKnowledgeSources().find((source) => source.id === sourceId)?.chunk_overlap || 120;
}

async function extractKnowledgeFileContent(file: KnowledgeFileRecord) {
  const source = getKnowledgeSource(file.source_id);
  if (!source) {
    throw new Error("Knowledge source not found for file.");
  }

  const absolutePath = ensureKnowledgeChildPath(source.root_path, file.absolute_path);
  const extension = String(file.extension || "").toLowerCase();
  if (isMetadataOnlyExtension(extension)) {
    return {
      text: buildMetadataOnlyText(file, "metadata-only drawing/export"),
      section_path: "metadata",
      ...resolveEntityAssociations(file.relative_path),
    };
  }

  if (isOfficeDocumentExtension(extension)) {
    const text = await extractOfficeLikeText(absolutePath, extension, file.relative_path);
    return {
      text,
      section_path: "document",
      ...resolveEntityAssociations(file.relative_path),
    };
  }

  if (!isTextBasedExtension(extension)) {
    return {
      text: buildMetadataOnlyText(file, "unsupported format"),
      section_path: "metadata",
      ...resolveEntityAssociations(file.relative_path),
    };
  }

  const rawBuffer = await fs.promises.readFile(absolutePath);
  if (isBinaryBuffer(rawBuffer)) {
    return {
      text: buildMetadataOnlyText(file, "binary content"),
      section_path: "metadata",
      ...resolveEntityAssociations(file.relative_path),
    };
  }

  const text = rawBuffer.toString("utf8");
  return {
    text: normalizeExtractedText(text, file.relative_path),
    section_path: "content",
    ...resolveEntityAssociations(file.relative_path),
  };
}

async function extractOfficeLikeText(absolutePath: string, extension: string, relativePath: string) {
  if (extension === "pdf") {
    const buffer = await fs.promises.readFile(absolutePath);
    const extracted = extractPrintableAscii(buffer, 60000);
    if (extracted) {
      return normalizeExtractedText([
        `File: ${relativePath}`,
        extracted,
      ].join("\n"), relativePath);
    }
  }

  const stats = await fs.promises.stat(absolutePath);
  return normalizeExtractedText([
    `File: ${relativePath}`,
    `Type: ${extension}`,
    `Size bytes: ${Math.max(0, Number(stats.size || 0))}`,
    "Content extraction for this format is currently metadata-first.",
  ].join("\n"), relativePath);
}

function buildMetadataOnlyText(file: KnowledgeFileRecord, reason: string) {
  const parts = [
    `File: ${file.relative_path}`,
    `Extension: ${file.extension}`,
    `Mime type: ${file.mime_type}`,
    `Size bytes: ${Math.max(0, Number(file.size_bytes || 0))}`,
    `Indexing mode: ${reason}`,
  ];
  return normalizeExtractedText(parts.join("\n"), file.relative_path);
}

function normalizeExtractedText(text: string, relativePath: string) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
  return `Source: ${relativePath}\n\n${normalized}`;
}

function extractPrintableAscii(buffer: Buffer, maxLength: number) {
  const text = buffer.toString("latin1");
  const matches = text.match(/[A-Za-z0-9 ,.;:()/_\-]{5,}/g) || [];
  if (matches.length === 0) return "";
  return matches.join(" ").slice(0, Math.max(1000, maxLength));
}

function isBinaryBuffer(buffer: Buffer) {
  const sampleLength = Math.min(buffer.length, 4096);
  let suspicious = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const value = buffer[index];
    if (value === 0) return true;
    if (value < 7 || (value > 14 && value < 32)) {
      suspicious += 1;
    }
  }
  return sampleLength > 0 && (suspicious / sampleLength) > 0.3;
}

function hashFileIdentity(relativePath: string, mtimeMs: number, sizeBytes: number) {
  return crypto
    .createHash("sha256")
    .update(`${relativePath}:${mtimeMs}:${sizeBytes}`)
    .digest("hex");
}

function resolveEntityAssociations(relativePath: string) {
  const tokens = relativePath.split("/").filter(Boolean);
  const maybeEntityId = tokens.length > 1 ? tokens[1] : "";
  const maybeEntityType = tokens[0] || "";
  const normalizedEntityType = maybeEntityType.toLowerCase();
  const entityName = normalizedEntityType === "jobs"
    ? "Job"
    : normalizedEntityType === "quotes"
      ? "Quote"
      : normalizedEntityType === "contacts"
        ? "Contact"
        : normalizedEntityType === "companies"
          ? "Company"
          : "";
  const linkedRecord = entityName && maybeEntityId ? getEntityRecord(entityName, maybeEntityId) : null;

  let visibility = "production";
  let visibleToProduction = true;
  let managementOnly = false;
  let internalOnly = false;
  let customer = "";
  let date = "";
  if (linkedRecord) {
    customer = String(
      linkedRecord.contact_name
      || linkedRecord.customer_name
      || linkedRecord.company_name
      || linkedRecord.title
      || ""
    );
    date = String(linkedRecord.date || linkedRecord.updated_date || linkedRecord.created_date || "");
  }

  if (entityName === "Quote" && linkedRecord) {
    const attachments = listEntityRecords("Attachment", { filters: { related_id: maybeEntityId }, limit: 1000 });
    const matchingAttachment = attachments.find((attachment) => String(attachment.relative_path || "").endsWith(relativePath));
    if (matchingAttachment) {
      visibility = String(matchingAttachment.production_visibility || "production");
      visibleToProduction = matchingAttachment.visible_to_production !== false;
      managementOnly = matchingAttachment.management_only === true;
      internalOnly = matchingAttachment.internal_only === true;
    }
  }

  return {
    entity_type: entityName || "",
    entity_id: linkedRecord ? String(linkedRecord.id || "") : "",
    module_key: entityName ? (getEntityModuleKey(entityName) || "") : "",
    customer,
    date,
    visibility,
    visible_to_production: visibleToProduction,
    management_only: managementOnly,
    internal_only: internalOnly,
  };
}
