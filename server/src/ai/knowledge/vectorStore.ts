import { cosineSimilarity } from "../embeddings/embeddingService";
import { searchKnowledgeVectorsInQdrant } from "../vectorStore";
import { KnowledgeChunkRecord, listKnowledgeChunksForSearch } from "./chunkStorage";

export type KnowledgeSearchCandidate = {
  source_id: string;
  file_id: string;
  relative_path: string;
  chunk_id: string;
  chunk_text: string;
  score: number;
  semantic_score: number;
  keyword_score: number;
  metadata: Record<string, unknown>;
  line_start: number;
  line_end: number;
  section_path: string;
};

export async function searchKnowledgeVectors(input: {
  query: string;
  queryVector: number[];
  sourceIds?: string[];
  limit?: number;
  metadataFilter?: (metadata: Record<string, unknown>) => boolean;
}) {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 10)));
  const queryTokens = tokenize(input.query);

  try {
    const qdrantResults = await searchKnowledgeVectorsInQdrant({
      vector: input.queryVector,
      limit,
      sourceIds: input.sourceIds,
    });

    if (qdrantResults.length > 0) {
      const mapped = qdrantResults.map((row) => {
        const metadata = readMetadata(row.payload);
        const candidate: KnowledgeSearchCandidate = {
          source_id: String(row.payload.source_id || ""),
          file_id: String(row.payload.file_id || ""),
          relative_path: String(row.payload.relative_path || ""),
          chunk_id: String(row.id || ""),
          chunk_text: String(row.payload.chunk_text || ""),
          score: round(Number(row.score || 0)),
          semantic_score: round(Number(row.score || 0)),
          keyword_score: round(scoreKeywords(queryTokens, String(row.payload.keyword_text || row.payload.chunk_text || ""))),
          metadata,
          line_start: Number(row.payload.line_start || 1),
          line_end: Number(row.payload.line_end || 1),
          section_path: String(row.payload.section_path || ""),
        };
        return candidate;
      }).filter((candidate) => {
        if (!input.metadataFilter) return true;
        return input.metadataFilter(candidate.metadata);
      });

      if (mapped.length > 0) {
        return mapped
          .sort((left, right) => right.score - left.score)
          .slice(0, limit);
      }
    }
  } catch {
    // Fallback to deterministic local vector ranking below.
  }

  const rows = listKnowledgeChunksForSearch({
    sourceIds: input.sourceIds,
    limit: 30_000,
  });

  const ranked = rows
    .map((chunk) => rankChunk(chunk, input.queryVector, queryTokens))
    .filter((candidate) => {
      if (!input.metadataFilter) return true;
      return input.metadataFilter(candidate.metadata);
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return ranked;
}

function rankChunk(chunk: KnowledgeChunkRecord, queryVector: number[], queryTokens: string[]): KnowledgeSearchCandidate {
  const embedding = parseEmbedding(chunk.embedding_json);
  const semanticScore = Math.max(0, cosineSimilarity(queryVector, embedding));
  const keywordScore = scoreKeywords(queryTokens, chunk.keyword_text || chunk.chunk_text);
  const score = round((semanticScore * 0.78) + (keywordScore * 0.22));
  return {
    source_id: chunk.source_id,
    file_id: chunk.file_id,
    relative_path: chunk.relative_path,
    chunk_id: chunk.id,
    chunk_text: chunk.chunk_text,
    score,
    semantic_score: round(semanticScore),
    keyword_score: round(keywordScore),
    metadata: parseMetadata(chunk.metadata_json),
    line_start: Number(chunk.line_start || 1),
    line_end: Number(chunk.line_end || 1),
    section_path: String(chunk.section_path || ""),
  };
}

function parseEmbedding(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => Number(item) || 0) : [];
  } catch {
    return [];
  }
}

function parseMetadata(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readMetadata(payload: Record<string, unknown>) {
  const candidate = payload.metadata;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return {};
}

function scoreKeywords(queryTokens: string[], candidateText: string) {
  if (queryTokens.length === 0) return 0;
  const tokens = new Set(tokenize(candidateText));
  if (tokens.size === 0) return 0;
  let matched = 0;
  for (const token of queryTokens) {
    if (tokens.has(token)) matched += 1;
  }
  return matched / queryTokens.length;
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

function round(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
