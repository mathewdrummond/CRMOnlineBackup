import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createEntityRecord, closeDatabase, initializeDatabase, resetDatabaseForTests } from "../db";
import { ensureEmbeddingIndex, refreshEmbeddingIndex } from "./embeddings/embeddingIndex";
import { setEmbeddingProviderForTests } from "./embeddings/embeddingService";
import { getQuoteInsights, getQuoteRiskAnalysis, getSimilarHistoricalJobs } from "./historicalJobIntelligence";

const testRoot = path.join(os.tmpdir(), "joinerflow-historical-intelligence-vitest");

beforeAll(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.SQLITE_PATH = path.join(testRoot, "joinerflow.historical-intelligence.sqlite");
  process.env.FILESYSTEM_ROOT = path.join(testRoot, "filesystem");
  process.env.AUTH_SESSION_SECRET = "joinerflow-test-session-secret";
  setEmbeddingProviderForTests(async (text) => deterministicVector(text));
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

describe("historical job intelligence", () => {
  test("ranks similar historical jobs for a quote", async () => {
    const source = createEntityRecord("Quote", {
      title: "Kitchen fitout with timber pantry",
      quote_number: "Q-HI-001",
      company_name: "Millbrook Client",
      total: 24000,
    });
    createEntityRecord("QuoteItem", {
      quote_id: source.id,
      description: "Oak pantry shelves",
      category: "materials",
      quantity: 4,
      unit_cost: 300,
      total: 2200,
      supplier_name: "TimberCo",
      product_number: "OAK-PANTRY",
    });

    const similarQuote = createEntityRecord("Quote", {
      title: "Kitchen pantry renovation",
      quote_number: "Q-HI-002",
      company_name: "Client B",
      total: 25500,
      status: "won",
    });
    createEntityRecord("Job", {
      quote_id: similarQuote.id,
      title: "Kitchen pantry renovation",
      job_number: "JOB-HI-002",
      install_date: "2026-05-01",
      install_end_date: "2026-05-03",
    });
    createEntityRecord("QuoteItem", {
      quote_id: similarQuote.id,
      description: "Oak pantry shelves",
      category: "materials",
      quantity: 5,
      unit_cost: 310,
      total: 2600,
      supplier_name: "TimberCo",
      product_number: "OAK-PANTRY",
    });
    createEntityRecord("JobOperation", {
      quote_id: similarQuote.id,
      workflow_phase: "installation",
      operation: "install",
      estimated_hours: 20,
      actual_hours: 22,
    });

    const differentQuote = createEntityRecord("Quote", {
      title: "Office reception desk",
      quote_number: "Q-HI-003",
      company_name: "Client C",
      total: 14000,
      status: "won",
    });
    createEntityRecord("Job", {
      quote_id: differentQuote.id,
      title: "Office reception desk",
      job_number: "JOB-HI-003",
      install_date: "2026-05-02",
      install_end_date: "2026-05-02",
    });
    createEntityRecord("QuoteItem", {
      quote_id: differentQuote.id,
      description: "Reception laminate panels",
      category: "hardware",
      quantity: 3,
      unit_cost: 120,
      total: 620,
      supplier_name: "OfficeBuild",
      product_number: "LAM-REC",
    });

    await refreshEmbeddingIndex({ limitPerEntity: 200 });
    const response = await getSimilarHistoricalJobs(source.id, 5);

    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0].title).toContain("Kitchen pantry renovation");
    expect(response.results[0].score).toBeGreaterThan(response.results[response.results.length - 1].score);
  });

  test("produces risk analysis with underquote and margin signals", async () => {
    const source = createEntityRecord("Quote", {
      title: "Complex wardrobe and install",
      quote_number: "Q-HI-010",
      total: 9000,
    });
    createEntityRecord("QuoteItem", {
      quote_id: source.id,
      description: "Wardrobe carcass",
      category: "materials",
      quantity: 5,
      unit_cost: 700,
      total: 4400,
      supplier_name: "TimberCo",
      product_number: "WRD-BASE",
    });
    createEntityRecord("JobOperation", {
      quote_id: source.id,
      workflow_phase: "installation",
      operation: "install",
      estimated_hours: 4,
      actual_hours: 0,
    });

    for (let index = 0; index < 4; index += 1) {
      const historical = createEntityRecord("Quote", {
        title: "Wardrobe installation package",
        quote_number: `Q-HI-2${index}`,
        total: 18000 + (index * 500),
        status: "won",
      });
      const job = createEntityRecord("Job", {
        quote_id: historical.id,
        title: "Wardrobe installation package",
        job_number: `JOB-HI-2${index}`,
        install_date: "2026-05-01",
        install_end_date: "2026-05-04",
      });
      createEntityRecord("QuoteItem", {
        quote_id: historical.id,
        description: "Wardrobe carcass",
        category: "materials",
        quantity: 7,
        unit_cost: 710 + index,
        total: 7900 + (index * 120),
        supplier_name: "TimberCo",
        product_number: "WRD-BASE",
      });
      createEntityRecord("QuoteItem", {
        quote_id: historical.id,
        description: "Install labour allowance",
        category: "labour",
        quantity: 24,
        unit_cost: 40,
        total: 3000,
      });
      createEntityRecord("JobOperation", {
        quote_id: historical.id,
        job_id: job.id,
        workflow_phase: "installation",
        operation: "install",
        estimated_hours: 18,
        actual_hours: 22,
      });
      createEntityRecord("TimeEntry", {
        job_id: job.id,
        hours: 21,
        total_hours: 21,
        status: "completed",
      });
    }

    await refreshEmbeddingIndex({ limitPerEntity: 300 });
    const insights = await getQuoteInsights(source.id);
    const risk = await getQuoteRiskAnalysis(source.id);

    expect(insights.underquoted_operations.length).toBeGreaterThan(0);
    expect(insights.margin.risk_level).not.toBe("low");
    expect(risk.overall_risk).not.toBe("low");
    expect(risk.warnings.length).toBeGreaterThan(0);
  });

  test("handles malformed historical rows without throwing", async () => {
    const source = createEntityRecord("Quote", {
      title: "Utility room joinery",
      quote_number: "Q-HI-900",
      total: 12000,
    });
    createEntityRecord("QuoteItem", {
      quote_id: source.id,
      description: "Utility cabinet",
      category: "materials",
      quantity: 1,
      unit_cost: 10,
      total: 20,
    });

    const historical = createEntityRecord("Quote", {
      title: "Utility room joinery",
      quote_number: "Q-HI-901",
      total: "not-a-number",
      status: "won",
    });
    createEntityRecord("Job", {
      quote_id: historical.id,
      title: "Utility room joinery",
      job_number: "JOB-HI-901",
      install_date: "not-a-date",
      install_end_date: "not-a-date",
    });
    createEntityRecord("QuoteItem", {
      quote_id: historical.id,
      description: "Utility cabinet",
      category: "materials",
      quantity: "oops",
      unit_cost: "n/a",
      total: "n/a",
    });

    await refreshEmbeddingIndex({ limitPerEntity: 100 });

    await expect(getQuoteInsights(source.id)).resolves.toBeTruthy();
    await expect(getQuoteRiskAnalysis(source.id)).resolves.toBeTruthy();
    await expect(getSimilarHistoricalJobs(source.id, 5)).resolves.toBeTruthy();
  });
});

function deterministicVector(text: string) {
  const lower = String(text || "").toLowerCase();
  return [
    Number(lower.includes("kitchen")),
    Number(lower.includes("pantry")),
    Number(lower.includes("wardrobe")),
    Number(lower.includes("install")),
    Number(lower.includes("utility")),
    Number(lower.includes("office")),
  ];
}
