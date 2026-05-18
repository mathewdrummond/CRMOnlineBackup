import React from "react";
import { render, screen } from "@testing-library/react";
import ProductionHandoverPack from "./ProductionHandoverPack";

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    filesystem: {
      productionContentUrl: (id, disposition = "inline") => `/api/timeclock/filesystem/${id}/content?disposition=${disposition}`,
    },
  },
}));

describe("ProductionHandoverPack", () => {
  const baseProps = {
    jobs: [
      {
        id: "job-1",
        quote_id: "quote-1",
        job_number: "JOB-1001",
        title: "Smith Kitchen",
        contact_name: "Alex Smith",
        handoff_notes: "Check island overhang before assembly.",
        handoff_drawings_ready: true,
        handoff_materials_confirmed: true,
        handoff_install_plan_confirmed: true,
      },
    ],
    quotes: [{ id: "quote-1", title: "Smith Kitchen Quote" }],
    quoteItems: [
      { id: "item-1", quote_id: "quote-1", section: "Cabinetry", section_display_order: 10, description: "Base cabinets", quantity: 4, unit: "units", category: "materials" },
      { id: "item-2", quote_id: "quote-1", section: "Hardware", section_display_order: 20, description: "Blum hinges", quantity: 12, unit: "ea", category: "hardware" },
    ],
    jobOperations: [
      { id: "op-1", job_id: "job-1", title: "Cut panels", status: "pending" },
    ],
    siteMeasures: [
      { id: "measure-1", quote_id: "quote-1", notes: "Ceiling is out of level.", client_requests: "Soft-close drawers.", access_notes: "Use side door.", include_in_handover_pack: true },
    ],
    attachments: [
      { id: "pdf-1", related_type: "job", related_id: "job-1", name: "Workshop Drawing.pdf", mime_type: "application/pdf", size: 2048, file_source: "Drawing", production_visibility: "production" },
      { id: "private-1", related_type: "quote", related_id: "quote-1", name: "Manager Notes.pdf", mime_type: "application/pdf", production_visibility: "management" },
    ],
    activeEntries: [{ id: "time-1", job_id: "job-1" }],
  };

  test("renders a workshop-focused handover pack and hides management-only files", () => {
    render(<ProductionHandoverPack {...baseProps} />);

    expect(screen.getAllByText(/JOB-1001/).length).toBeGreaterThan(0);
    expect(screen.getByText("Key Things to Know")).toBeInTheDocument();
    expect(screen.getAllByText("Check island overhang before assembly.").length).toBeGreaterThan(0);
    expect(screen.getByText("Soft-close drawers.")).toBeInTheDocument();
    expect(screen.getAllByText("Blum hinges").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Workshop Drawing.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("Manager Notes.pdf")).not.toBeInTheDocument();
  });

  test("previews PDFs in an embedded frame and exposes print actions", () => {
    render(<ProductionHandoverPack {...baseProps} />);

    const frame = screen.getByTitle("Preview Workshop Drawing.pdf");
    expect(frame).toHaveAttribute("src", "/api/timeclock/filesystem/pdf-1/content?disposition=inline");
    expect(screen.getByRole("button", { name: /print handover pack/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^print$/i }).length).toBeGreaterThan(0);
  });

  test("shows a large touch-friendly job selector", () => {
    render(
      <ProductionHandoverPack
        {...baseProps}
        jobs={[
          ...baseProps.jobs,
          { id: "job-2", quote_id: "quote-2", job_number: "JOB-1002", title: "Wardrobe", contact_name: "Morgan" },
        ]}
        quotes={[...baseProps.quotes, { id: "quote-2", title: "Wardrobe Quote" }]}
      />
    );

    expect(screen.getByRole("combobox")).toHaveClass("min-h-[48px]");
  });
});
