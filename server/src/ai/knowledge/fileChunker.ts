import crypto from "node:crypto";

export type ChunkedDocumentSegment = {
  chunk_index: number;
  chunk_hash: string;
  chunk_text: string;
  keyword_text: string;
  start_offset: number;
  end_offset: number;
  line_start: number;
  line_end: number;
  section_path: string;
};

export function chunkKnowledgeText(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    sectionPath?: string;
  } = {}
) {
  const normalized = normalizeText(text);
  const chunkSize = clampInt(options.chunkSize, 1200, 300, 5000);
  const chunkOverlap = clampInt(options.chunkOverlap, 120, 0, Math.floor(chunkSize * 0.75));
  if (!normalized) return [] as ChunkedDocumentSegment[];

  const newLineOffsets = getLineOffsets(normalized);
  const segments: ChunkedDocumentSegment[] = [];
  let cursor = 0;
  let index = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + chunkSize);
    const chunkText = normalized.slice(cursor, end).trim();
    if (chunkText) {
      const lineStart = offsetToLineNumber(newLineOffsets, cursor);
      const lineEnd = offsetToLineNumber(newLineOffsets, Math.max(cursor, end - 1));
      const chunkHash = crypto.createHash("sha256").update(chunkText).digest("hex");
      segments.push({
        chunk_index: index,
        chunk_hash: chunkHash,
        chunk_text: chunkText,
        keyword_text: tokenize(chunkText).join(" "),
        start_offset: cursor,
        end_offset: end,
        line_start: lineStart,
        line_end: lineEnd,
        section_path: String(options.sectionPath || ""),
      });
      index += 1;
    }

    if (end >= normalized.length) {
      break;
    }

    cursor = Math.max(0, end - chunkOverlap);
  }

  return segments;
}

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(value: string) {
  return Array.from(new Set(
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  ));
}

function getLineOffsets(text: string) {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function offsetToLineNumber(lineOffsets: number[], offset: number) {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, high + 1);
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
