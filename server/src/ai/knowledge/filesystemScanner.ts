import fs from "node:fs";
import path from "node:path";
import { logAiEvent } from "../aiLogger";
import { KnowledgeSourceRecord } from "./chunkStorage";
import { ensureKnowledgeChildPath, shouldExcludePath } from "./knowledgePermissions";
import { isSupportedExtension, normalizeExtension } from "./supportedFileTypes";

export type KnowledgeScanEntry = {
  absolute_path: string;
  relative_path: string;
  extension: string;
  size_bytes: number;
  mtime_ms: number;
  mime_type: string;
};

export type KnowledgeScanResult = {
  entries: KnowledgeScanEntry[];
  scanned_directories: number;
  skipped_entries: number;
};

const DEFAULT_SCAN_DELAY_MS = 2;

export async function scanKnowledgeSource(source: KnowledgeSourceRecord, options: {
  throttleMs?: number;
} = {}): Promise<KnowledgeScanResult> {
  const rootPath = source.root_path;
  const canonicalRoot = ensureKnowledgeChildPath(rootPath, rootPath);
  const allowedExtensions = new Set((source.allowed_extensions || []).map((value) => String(value || "").toLowerCase()));
  const excludedPatterns = source.excluded_patterns || [];
  const maxFileSize = Math.max(256 * 1024, Number(source.max_file_size_bytes || 0));

  const entries: KnowledgeScanEntry[] = [];
  let scannedDirectories = 0;
  let skippedEntries = 0;

  const queue: string[] = [canonicalRoot];
  const throttleMs = Math.max(0, Number(options.throttleMs ?? DEFAULT_SCAN_DELAY_MS));

  while (queue.length > 0) {
    const currentDir = queue.shift() as string;
    scannedDirectories += 1;
    let dir: fs.Dir | null = null;
    try {
      dir = await fs.promises.opendir(currentDir);
      for await (const entry of dir) {
        const absolutePath = path.join(currentDir, entry.name);
        const safeAbsolutePath = ensureKnowledgeChildPath(canonicalRoot, absolutePath);
        const relativePath = normalizeRelativePath(canonicalRoot, safeAbsolutePath);

        if (!relativePath || shouldExcludePath(relativePath, excludedPatterns)) {
          skippedEntries += 1;
          continue;
        }

        let stat: fs.Stats;
        try {
          stat = await fs.promises.lstat(safeAbsolutePath);
        } catch {
          skippedEntries += 1;
          continue;
        }

        if (stat.isSymbolicLink()) {
          skippedEntries += 1;
          continue;
        }

        if (stat.isDirectory()) {
          queue.push(safeAbsolutePath);
          continue;
        }

        if (!stat.isFile()) {
          skippedEntries += 1;
          continue;
        }

        const extension = normalizeExtension(entry.name);
        if (!extension || !isSupportedExtension(extension)) {
          skippedEntries += 1;
          continue;
        }

        if (allowedExtensions.size > 0 && !allowedExtensions.has(extension)) {
          skippedEntries += 1;
          continue;
        }

        if (stat.size > maxFileSize) {
          skippedEntries += 1;
          continue;
        }

        entries.push({
          absolute_path: safeAbsolutePath,
          relative_path: relativePath,
          extension,
          size_bytes: Number(stat.size || 0),
          mtime_ms: Number(stat.mtimeMs || 0),
          mime_type: guessMimeType(entry.name, extension),
        });
      }
    } catch (error) {
      logAiEvent("knowledge_scan_directory_failed", {
        source_id: source.id,
        root_path: source.root_path,
        directory: currentDir,
        message: error instanceof Error ? error.message : String(error),
      }, "warn");
    } finally {
      if (dir) {
        await dir.close().catch(() => undefined);
      }
    }

    if (throttleMs > 0) {
      await wait(throttleMs);
    }
  }

  return {
    entries,
    scanned_directories: scannedDirectories,
    skipped_entries: skippedEntries,
  };
}

function normalizeRelativePath(root: string, absolutePath: string) {
  const relative = path.relative(root, absolutePath).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..")) {
    return "";
  }
  return relative.replace(/^\/+/, "");
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

function guessMimeType(fileName: string, extension: string) {
  const normalizedExtension = String(extension || normalizeExtension(fileName)).toLowerCase();
  if (["txt", "log", "md"].includes(normalizedExtension)) return "text/plain";
  if (normalizedExtension === "csv") return "text/csv";
  if (normalizedExtension === "json") return "application/json";
  if (normalizedExtension === "xml") return "application/xml";
  if (normalizedExtension === "html") return "text/html";
  if (normalizedExtension === "pdf") return "application/pdf";
  if (normalizedExtension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (normalizedExtension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (normalizedExtension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}
