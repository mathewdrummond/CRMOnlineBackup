import { describe, expect, test } from "vitest";
import { buildCoreQuoteWorkflow } from "./coreQuoteWorkflow";

describe("core quote workflow", () => {
  test("guides a quote through pricing, review, documents, scheduling, and archive", () => {
    const workflow = buildCoreQuoteWorkflow({
      quote: {
        id: "quote-1",
        title: "Kitchen",
        contact_name: "Alex Builder",
        status: "quote_complete",
      },
      items: [
        {
          id: "item-1",
          description: "Cabinet panels",
          unit_cost: 80,
          total: 120,
          review_status: "confirmed",
        },
      ],
      quoteImports: [{ id: "import-1" }],
      attachments: [{ id: "file-1", source: "generated-document" }],
      linkedJobs: [{ id: "job-1", install_date: "2026-06-01" }],
    });

    expect(workflow.steps.map((step) => step.title)).toEqual([
      "Lead",
      "Quote Details",
      "Import / Pricing",
      "Review",
      "Generate Document",
      "Send / Print",
      "Schedule Install",
      "Archive / Complete",
    ]);
    expect(workflow.pricingReady).toBe(true);
    expect(workflow.reviewClear).toBe(true);
    expect(workflow.documentReady).toBe(true);
    expect(workflow.installScheduled).toBe(true);
    expect(workflow.steps.find((step) => step.current)?.key).toBe("send");
  });

  test("keeps missing costs in review before a quote is safe to print", () => {
    const workflow = buildCoreQuoteWorkflow({
      quote: { title: "Laundry", contact_name: "Sam", status: "draft" },
      items: [{ id: "item-1", description: "Hardware", unit_cost: 0, total: 50 }],
    });

    expect(workflow.pricingReady).toBe(true);
    expect(workflow.reviewClear).toBe(false);
    expect(workflow.steps.find((step) => step.current)?.key).toBe("review");
    expect(workflow.steps.find((step) => step.key === "review")?.detail).toMatch(/missing costs/i);
  });

  test("marks archived quotes as recoverable rather than active work", () => {
    const workflow = buildCoreQuoteWorkflow({
      quote: { title: "Archive me", contact_name: "Alex", status: "archived" },
    });

    expect(workflow.archived).toBe(true);
    expect(workflow.steps.find((step) => step.key === "archive")).toMatchObject({
      done: true,
      action: "Restore quote",
    });
  });
});
