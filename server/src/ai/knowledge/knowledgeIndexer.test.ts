import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { closeDatabase, initializeDatabase, resetDatabaseForTests, runDatabasePreparedStatement } from "../../db";
import { setEmbeddingProviderForTests } from "../embeddings/embeddingService";
import {
  createKnowledgeSource,
  ensureKnowledgeTables,
  getKnowledgeFileByPath,
  getKnowledgeStats,
  listKnowledgeQueueSummary,
} from "./chunkStorage";
import { processKnowledgeQueueBatch } from "./indexingQueue";
import { runKnowledgeSourceScan } from "./knowledgeIndexer";
import { ensureKnowledgePathAllowed, isKnowledgeResultVisibleToUser } from "./knowledgePermissions";
import { searchKnowledge } from "./retrievalEngine";

const testRoot = path.join(os.tmpdir(), "joinerflow-ai-knowledge-vitest");
const sqlitePath = path.join(testRoot, "joinerflow.knowledge.test.sqlite");
const filesystemRoot = path.join(testRoot, "filesystem");

beforeAll(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.SQLITE_PATH = sqlitePath;
  process.env.FILESYSTEM_ROOT = filesystemRoot;
  process.env.AUTH_SESSION_SECRET = "joinerflow-test-session-secret";
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = `${filesystemRoot},${testRoot}`;
  setEmbeddingProviderForTests(async (text) => deterministicVector(text));
  await initializeDatabase();
  ensureKnowledgeTables();
});

beforeEach(async () => {
  await resetDatabaseForTests();
  ensureKnowledgeTables();
  fs.rmSync(filesystemRoot, { recursive: true, force: true });
  fs.mkdirSync(filesystemRoot, { recursive: true });
});

afterAll(() => {
  setEmbeddingProviderForTests(null);
  closeDatabase();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("knowledge indexing safety and retrieval", () => {
  test("blocks path traversal outside allowlisted roots", () => {
    const outsidePath = path.join(testRoot, "outside-root");
    fs.mkdirSync(outsidePath, { recursive: true });
    process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = filesystemRoot;
    expect(() => ensureKnowledgePathAllowed(outsidePath)).toThrow("allowlist");
  });

  test("skips symlink entries during scan", async () => {
    const sourceRoot = path.join(filesystemRoot, "jobs");
    const outsideRoot = path.join(testRoot, "outside");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "do not scan");
    fs.symlinkSync(path.join(outsideRoot, "secret.txt"), path.join(sourceRoot, "secret-link.txt"));
    fs.writeFileSync(path.join(sourceRoot, "visible.txt"), "kitchen job install note");

    const source = createKnowledgeSource({
      label: "Jobs",
      root_path: sourceRoot,
      enabled: true,
    });
    expect(source).toBeTruthy();
    await runKnowledgeSourceScan(source!.id);
    await drainQueue();

    const linked = getKnowledgeFileByPath(source!.id, "secret-link.txt");
    const visible = getKnowledgeFileByPath(source!.id, "visible.txt");
    expect(linked).toBeNull();
    expect(visible).toBeTruthy();
  });

  test("indexes incrementally and cleans deleted files", async () => {
    const sourceRoot = path.join(filesystemRoot, "quotes");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "quote-a.txt"), "walnut kitchen curved island install checklist");

    const source = createKnowledgeSource({
      label: "Quotes",
      root_path: sourceRoot,
      enabled: true,
      allowed_extensions: ["txt"],
    });

    await runKnowledgeSourceScan(source!.id);
    await drainQueue();

    let stats = getKnowledgeStats();
    expect(Number(stats.totals.chunk_count || 0)).toBeGreaterThan(0);

    fs.unlinkSync(path.join(sourceRoot, "quote-a.txt"));
    await runKnowledgeSourceScan(source!.id);
    await drainQueue();

    stats = getKnowledgeStats();
    expect(Number(stats.totals.file_count || 0)).toBe(0);
    expect(Number(stats.totals.chunk_count || 0)).toBe(0);
  });

  test("falls back to deterministic embeddings when Ollama embedding fails", async () => {
    setEmbeddingProviderForTests(async () => {
      throw new Error("offline");
    });
    const sourceRoot = path.join(filesystemRoot, "notes");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "ops.md"), "Legrabox pricing and walnut pantry notes");

    const source = createKnowledgeSource({
      label: "Notes",
      root_path: sourceRoot,
      enabled: true,
    });
    await runKnowledgeSourceScan(source!.id);
    await drainQueue();

    const result = await searchKnowledge({
      query: "Legrabox pricing",
      limit: 5,
    }, {
      user: { id: "u1", full_name: "Admin", role: "admin", email: "admin@example.test" },
      enabledModules: new Set(),
    });

    expect(result.results.length).toBeGreaterThan(0);
    setEmbeddingProviderForTests(async (text) => deterministicVector(text));
  });

  test("handles malformed or corrupted vectors without throwing", async () => {
    const sourceRoot = path.join(filesystemRoot, "manuals");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "manual.txt"), "installation manual for walnut kitchen drawers");
    const source = createKnowledgeSource({
      label: "Manuals",
      root_path: sourceRoot,
      enabled: true,
    });
    await runKnowledgeSourceScan(source!.id);
    await drainQueue();

    runDatabasePreparedStatement("UPDATE ai_knowledge_chunks SET embedding_json = '{broken' WHERE source_id = ?", [source!.id]);

    const response = await searchKnowledge({
      query: "walnut kitchen",
      limit: 4,
    }, {
      user: { id: "u1", full_name: "Admin", role: "admin", email: "admin@example.test" },
      enabledModules: new Set(),
    });
    expect(Array.isArray(response.results)).toBe(true);
  });

  test("enforces visibility rules for non-admin retrieval contexts", () => {
    expect(isKnowledgeResultVisibleToUser(
      { id: "m1", full_name: "Member", role: "member", email: "member@example.test" },
      { management_only: true, production_visibility: "management" }
    )).toBe(false);
    expect(isKnowledgeResultVisibleToUser(
      { id: "m1", full_name: "Member", role: "member", email: "member@example.test" },
      { production_visibility: "production", visible_to_production: true }
    )).toBe(true);
  });

  test("skips oversized files based on source limits", async () => {
    const sourceRoot = path.join(filesystemRoot, "oversized");
    fs.mkdirSync(sourceRoot, { recursive: true });
    const largeBuffer = Buffer.alloc(1024 * 1024, "a");
    fs.writeFileSync(path.join(sourceRoot, "huge.log"), largeBuffer);
    const source = createKnowledgeSource({
      label: "Oversized",
      root_path: sourceRoot,
      enabled: true,
      max_file_size_bytes: 64 * 1024,
    });
    await runKnowledgeSourceScan(source!.id);
    await drainQueue();

    const stats = getKnowledgeStats();
    expect(Number(stats.totals.file_count || 0)).toBe(0);
  });
});

async function drainQueue() {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    await processKnowledgeQueueBatch({ maxItems: 20 });
    const queue = listKnowledgeQueueSummary();
    const remaining = queue.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
    if (remaining === 0) {
      return;
    }
  }
}

function deterministicVector(text: string) {
  const lower = text.toLowerCase();
  return [
    lower.includes("walnut") ? 1 : 0,
    lower.includes("kitchen") ? 1 : 0,
    lower.includes("install") ? 1 : 0,
    lower.includes("pricing") ? 1 : 0,
    lower.includes("supplier") ? 1 : 0,
    lower.includes("note") ? 1 : 0,
  ];
}
