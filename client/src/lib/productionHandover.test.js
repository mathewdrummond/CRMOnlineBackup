import { describe, expect, test } from "vitest";
import {
  buildProductionHandoverPack,
  filterProductionAttachments,
  groupQuoteItemsBySection,
  isProductionVisibleAttachment,
} from "./productionHandover";

describe("production handover helpers", () => {
  test("keeps only files linked to the selected job or quote and visible to production", () => {
    const attachments = [
      { id: "job-file", related_type: "job", related_id: "job-1", production_visibility: "production" },
      { id: "quote-file", related_type: "quote", related_id: "quote-1", production_visibility: "install" },
      { id: "hidden", related_type: "quote", related_id: "quote-1", production_visibility: "management" },
      { id: "other", related_type: "job", related_id: "job-2", production_visibility: "production" },
    ];

    expect(isProductionVisibleAttachment(attachments[0])).toBe(true);
    expect(isProductionVisibleAttachment(attachments[2])).toBe(false);
    expect(filterProductionAttachments(attachments, { jobId: "job-1", quoteId: "quote-1" }).map((file) => file.id)).toEqual(["job-file", "quote-file"]);
  });

  test("groups quote line items by workshop section order", () => {
    const sections = groupQuoteItemsBySection([
      { id: "hardware", section: "Hardware", section_key: "hardware", section_display_order: 20, description: "Blum runners" },
      { id: "cabinetry", section: "Cabinetry", section_key: "cabinetry", section_display_order: 10, description: "Base units" },
    ]);

    expect(sections.map((section) => section.label)).toEqual(["Cabinetry", "Hardware"]);
  });

  test("builds a workshop pack with warnings, notes, files, and hardware summary", () => {
    const pack = buildProductionHandoverPack({
      job: {
        id: "job-1",
        quote_id: "quote-1",
        job_number: "JOB-1001",
        title: "Smith Kitchen",
        contact_name: "Alex Smith",
        handoff_drawings_ready: false,
        handoff_materials_confirmed: true,
        handoff_install_plan_confirmed: false,
        handoff_notes: "Check island overhang before assembly.",
      },
      quoteItems: [
        { id: "item-1", quote_id: "quote-1", section: "Hardware", category: "hardware", description: "Blum hinges", quantity: 12, unit: "ea" },
      ],
      attachments: [
        { id: "file-1", related_type: "job", related_id: "job-1", name: "Drawing.pdf", production_visibility: "production" },
      ],
    });

    expect(pack.jobNumber).toBe("JOB-1001");
    expect(pack.warnings).toContain("Drawings are not confirmed ready.");
    expect(pack.installNotes).toContain("Check island overhang before assembly.");
    expect(pack.attachments).toHaveLength(1);
    expect(pack.hardwareSummary[0]).toMatchObject({ description: "Blum hinges", quantity: 12 });
  });
});
