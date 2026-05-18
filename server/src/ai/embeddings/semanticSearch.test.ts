import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { closeDatabase, createEntityRecord, initializeDatabase, resetDatabaseForTests } from "../../db";
import { setEmbeddingProviderForTests } from "./embeddingService";
import { ensureEmbeddingIndex, getEmbeddingForRecord, getIndexStats, indexEntityRecord, refreshEmbeddingIndex } from "./embeddingIndex";
import { semanticSearch } from "./semanticSearch";

const testRoot = path.join(os.tmpdir(), "joinerflow-ai-embeddings-vitest");

beforeAll(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.SQLITE_PATH = path.join(testRoot, "joinerflow.embedding.test.sqlite");
  process.env.FILESYSTEM_ROOT = path.join(testRoot, "filesystem");
  process.env.AUTH_SESSION_SECRET = "joinerflow-test-session-secret";
  setEmbeddingProviderForTests(async (text) => deterministicTestVector(text));
  await initializeDatabase();
  ensureEmbeddingIndex();
});

beforeEach(async () => {
  await resetDatabaseForTests();
  ensureEmbeddingIndex();
});

afterAll(() => {
  setEmbeddingProviderForTests(null);
  closeDatabase();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("semantic embedding index", () => {
  test("persists embeddings with entity row versions", async () => {
    const job = createEntityRecord("Job", {
      title: "Walnut kitchen install",
      job_number: "JOB-AI-001",
      site_address: "Island Bay",
      notes: "Curved walnut pantry with stone benchtop",
    });

    await indexEntityRecord("Job", job);
    const stored = getEmbeddingForRecord("Job", job.id);

    expect(stored?.entity).toBe("Job");
    expect(stored?.recordId).toBe(job.id);
    expect(stored?.rowVersion).toBe(job.row_version);
    expect(stored?.vector.length).toBeGreaterThan(0);
  });

  test("refreshes incrementally across embeddable entities", async () => {
    createEntityRecord("Quote", {
      title: "Laundry cabinetry",
      quote_number: "Q-AI-001",
      company_name: "Harbour Homes",
      notes: "Compact laundry storage and laminate tops",
    });
    createEntityRecord("PricingItem", {
      name: "Soft-close drawer runner",
      supplier_name: "Hardware Co",
      category: "Hardware",
      product_number: "RUN-450",
    });

    const summaries = await refreshEmbeddingIndex({ limitPerEntity: 50 });
    const stats = getIndexStats();

    expect(summaries.some((summary) => summary.entity === "Quote" && summary.indexed >= 1)).toBe(true);
    expect(stats.some((row) => row.entity === "PricingItem" && row.count >= 1)).toBe(true);
  });

  test("returns hybrid semantic matches with filters", async () => {
    createEntityRecord("Job", {
      title: "Oak wardrobe fitout",
      job_number: "JOB-AI-002",
      company_name: "Acme Build",
      designer: "Mia",
      notes: "Bedroom wardrobe with oak veneer sliding doors",
    });
    createEntityRecord("Job", {
      title: "Reception counter",
      job_number: "JOB-AI-003",
      company_name: "Other Client",
      designer: "Noah",
      notes: "Curved commercial counter with laminate cladding",
    });
    await refreshEmbeddingIndex({ limitPerEntity: 50 });

    const result = await semanticSearch({
      query: "oak wardrobe sliding doors",
      entity_types: ["Job"],
      customer: "Acme",
      limit: 5,
    });

    expect(result.results[0]?.title).toContain("Oak wardrobe");
    expect(result.results.every((row) => row.entity === "Job")).toBe(true);
    expect(result.results.every((row) => String(row.metadata.customer || "").includes("Acme"))).toBe(true);
  });
});

function deterministicTestVector(text: string) {
  const vector = [0, 0, 0, 0, 0, 0];
  const lower = text.toLowerCase();
  if (lower.includes("oak") || lower.includes("walnut")) vector[0] += 1;
  if (lower.includes("wardrobe") || lower.includes("pantry")) vector[1] += 1;
  if (lower.includes("quote") || lower.includes("job")) vector[2] += 0.5;
  if (lower.includes("pricing") || lower.includes("runner")) vector[3] += 1;
  if (lower.includes("counter")) vector[4] += 1;
  if (lower.includes("laundry")) vector[5] += 1;
  return vector;
}
