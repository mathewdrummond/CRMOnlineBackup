import { describe, expect, test } from "vitest";
import {
  buildPostApprovalRevisionPatch,
  buildQuoteApprovalPatch,
  isQuoteApprovalLocked,
} from "./quoteApproval";

const quote = {
  id: "quote-1",
  quote_number: "QTE-001",
  approval_status: "pending_internal",
  subtotal: 1000,
  gst: 150,
  total: 1150,
  revision: 1,
};

const items = [
  {
    id: "item-1",
    description: "Kitchen cabinets",
    category: "materials",
    quantity: 2,
    unit: "ea",
    unit_cost: 200,
    markup_percent: 50,
    total: 600,
  },
];

describe("quote approval helpers", () => {
  test("creates quote, pricing, and document approval snapshots", () => {
    const patch = buildQuoteApprovalPatch({
      quote,
      items,
      approvedBy: "Bruce",
      notes: "Approved for client issue",
      documentAttachment: { id: "file-1", name: "Quote.pdf", current_version: 3, url: "/files/quote.pdf" },
      now: new Date("2026-05-09T01:00:00.000Z"),
    });

    expect(patch.approval_status).toBe("approved");
    expect(patch.quote_approval_locked).toBe(true);
    expect(patch.approval_snapshots.map((snapshot) => snapshot.type)).toEqual(["quote", "pricing", "document"]);
    expect(patch.approved_totals).toEqual({ subtotal: 1000, gst: 150, total: 1150 });
    expect(patch.approved_line_items[0]).toMatchObject({ id: "item-1", total: 600 });
    expect(patch.approval_snapshots[2].approved_document_version).toMatchObject({ id: "file-1", version: 3 });
  });

  test("detects approval locking from approved status or snapshots", () => {
    expect(isQuoteApprovalLocked({ approval_status: "approved" })).toBe(true);
    expect(isQuoteApprovalLocked({ approval_status: "draft", approval_snapshots: [{ id: "snap-1" }] })).toBe(true);
    expect(isQuoteApprovalLocked({ approval_status: "draft", approval_snapshots: [{ id: "snap-1" }], has_unapproved_changes: true })).toBe(false);
    expect(isQuoteApprovalLocked({ approval_status: "approved", quote_approval_locked: false, has_unapproved_changes: true })).toBe(false);
  });

  test("creates revision history and preserves approved totals after approved quote changes", () => {
    const approved = {
      ...quote,
      approval_status: "approved",
      quote_approval_locked: true,
      approved_totals: { subtotal: 1000, gst: 150, total: 1150 },
      approved_line_items: [{ id: "item-1", total: 600 }],
      revision: 1,
    };

    const patch = buildPostApprovalRevisionPatch({
      quote: approved,
      items,
      changeType: "line_item_update",
      summary: "Changed cabinet quantity",
      actor: "Mathew",
      now: new Date("2026-05-09T02:00:00.000Z"),
    });

    expect(patch.revision).toBe(2);
    expect(patch.quote_approval_locked).toBe(false);
    expect(patch.has_unapproved_changes).toBe(true);
    expect(patch.revision_history).toHaveLength(1);
    expect(patch.revision_history[0]).toMatchObject({
      revision: 2,
      change_type: "line_item_update",
      summary: "Changed cabinet quantity",
      approved_totals_preserved: { subtotal: 1000, gst: 150, total: 1150 },
    });
  });
});
