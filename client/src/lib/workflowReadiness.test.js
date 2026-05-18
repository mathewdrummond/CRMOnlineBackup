import { describe, expect, test } from "vitest";
import { summarizeJobWorkflow, summarizeQuoteWorkflow } from "./workflowReadiness";

describe("workflowReadiness", () => {
  test("flags quote blockers until approvals and signoff checks are complete", () => {
    const summary = summarizeQuoteWorkflow(
      {
        status: "draft",
        approval_status: "pending_internal",
        quote_scope_signed_off: true,
        quote_drawings_signed_off: false,
        quote_pricing_signed_off: false,
        quote_client_brief_signed_off: true,
      },
      []
    );

    expect(summary.readiness.label).toBe("Needs review");
    expect(summary.blockers.some((blocker) => blocker.includes("Internal approval"))).toBe(true);
    expect(summary.signoffCompleteCount).toBe(2);
  });

  test("marks a won quote as ready for handoff once approvals are complete", () => {
    const summary = summarizeQuoteWorkflow(
      {
        status: "won",
        approval_status: "approved",
        quote_scope_signed_off: true,
        quote_drawings_signed_off: true,
        quote_pricing_signed_off: true,
        quote_client_brief_signed_off: true,
      },
      [{ id: "item-1", total: 1200 }]
    );

    expect(summary.readiness.label).toBe("Ready for handoff");
    expect(summary.blockers).toHaveLength(0);
  });

  test("identifies procurement and handoff blockers on jobs", () => {
    const summary = summarizeJobWorkflow(
      {
        approval_status: "approved",
        procurement_takeoff_complete: true,
        procurement_supplier_confirmed: false,
        procurement_pos_raised: false,
        procurement_critical_items_received: false,
        handoff_site_measure_complete: true,
        handoff_drawings_ready: false,
        handoff_materials_confirmed: false,
        handoff_production_brief_complete: false,
        handoff_install_plan_confirmed: false,
      },
      [{ id: "op-1", workflow_phase: "pre_production", status: "pending" }],
      []
    );

    expect(summary.readiness.label).toBe("Procurement focus");
    expect(summary.blockers.some((blocker) => blocker.includes("pre-production"))).toBe(true);
  });

  test("ignores procurement blockers when procurement checks are disabled", () => {
    const summary = summarizeJobWorkflow(
      {
        approval_status: "approved",
        procurement_takeoff_complete: false,
        procurement_supplier_confirmed: false,
        procurement_pos_raised: false,
        procurement_critical_items_received: false,
        handoff_site_measure_complete: true,
        handoff_drawings_ready: true,
        handoff_materials_confirmed: true,
        handoff_production_brief_complete: true,
        handoff_install_plan_confirmed: true,
      },
      [],
      [],
      { procurementEnabled: false }
    );

    expect(summary.readiness.label).toBe("Ready for workshop");
    expect(summary.blockers.some((blocker) => blocker.toLowerCase().includes("procurement"))).toBe(false);
    expect(summary.pendingSupplierTasks).toHaveLength(0);
  });
});
