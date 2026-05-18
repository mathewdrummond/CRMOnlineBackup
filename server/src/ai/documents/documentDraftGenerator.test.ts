import { describe, expect, it } from "vitest";
import { generateAiDocumentDraft } from "./documentDraftGenerator";

describe("generateAiDocumentDraft", () => {
  it("stages quote summaries without committing or inventing unavailable data", () => {
    const draft = generateAiDocumentDraft("quote_summary", {
      quote: {
        id: "quote-1",
        quote_number: "Q-001",
        title: "Kitchen",
        contact_name: "Client",
        total: 1200,
      },
      quoteItems: [
        { id: "item-1", description: "Cabinetry", quantity: 1 },
      ],
    });

    expect(draft.status).toBe("staged_review_required");
    expect(draft.safety.auto_send).toBe(false);
    expect(draft.safety.mutates_pricing).toBe(false);
    expect(draft.draft_text).toContain("Q-001");
    expect(draft.draft_text).toContain("Cabinetry");
    expect(draft.missing_data).toContain("site address");
  });

  it("creates client communication drafts as editable review-only output", () => {
    const draft = generateAiDocumentDraft("client_communication", {
      job: {
        id: "job-1",
        job_number: "J-001",
        title: "Install",
        contact_name: "Client",
      },
    });

    expect(draft.kind).toBe("client_communication");
    expect(draft.safety.review_required).toBe(true);
    expect(draft.safety.mutates_workflow_state).toBe(false);
    expect(draft.draft_text).toContain("J-001");
  });
});

