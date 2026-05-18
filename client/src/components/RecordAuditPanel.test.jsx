import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordAuditPanel from "./RecordAuditPanel";

const mockAuditList = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    audit: {
      list: (...args) => mockAuditList(...args),
    },
  },
}));

describe("RecordAuditPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditList.mockResolvedValue([
      {
        id: "audit-1",
        action: "update",
        actor_name: "Admin User",
        actor_role: "admin",
        request_source: "crm",
        created_date: "2026-04-10T10:00:00.000Z",
        summary: {
          changed_fields: ["status", "notes"],
        },
      },
    ]);
  });

  test("opens the audit history dialog with an accessible description", async () => {
    render(
      <RecordAuditPanel
        entityName="Quote"
        recordId="quote-1"
        title="Quote Change History"
      />
    );

    await screen.findByText("status, notes");
    expect(screen.getByRole("button", { name: "Refresh history" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View All" }));

    expect(screen.getByRole("dialog", { name: "Quote Change History" })).toBeInTheDocument();
    expect(screen.getByText("Review recorded changes, actors, timestamps, and changed fields for this record.")).toBeInTheDocument();
    expect(mockAuditList).toHaveBeenCalledWith("Quote", "quote-1", 50);
  });
});
