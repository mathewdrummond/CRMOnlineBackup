import { describe, expect, it } from "vitest";
import {
  buildActualLabourSummary,
  buildTimeEntryAssignmentPatch,
  getActualLabourDurationHours,
  isManualLabourEntry,
  mapTimeEntryToLabourCategory,
} from "./actualLabour";

const baseEntry = {
  id: "time-1",
  staff_id: "staff-1",
  staff_name: "Bruce",
  date: "2026-05-01",
  clock_in: "2026-05-01T08:00:00.000Z",
  clock_out: "2026-05-01T10:30:00.000Z",
  hourly_rate: 80,
  activity: "Install",
  status: "completed",
};

describe("actual labour helpers", () => {
  it("pulls actual labour from linked timeclock entries grouped by quote/job", () => {
    const summary = buildActualLabourSummary({
      quoteId: "quote-1",
      jobIds: ["job-1"],
      entries: [
        { ...baseEntry, id: "time-1", job_id: "job-1", activity: "Install cabinetry" },
        { ...baseEntry, id: "time-2", quote_id: "quote-1", activity: "Cut panels", hours: 1.5, clock_in: "", clock_out: "" },
        { ...baseEntry, id: "time-3", job_id: "job-other", activity: "Install" },
      ],
      operations: [{ estimated_hours: 4 }],
      quoteItems: [{ category: "labour", total: 500 }],
    });

    expect(summary.entries).toHaveLength(2);
    expect(summary.actualHours).toBe(4);
    expect(summary.estimatedHours).toBe(4);
    expect(summary.varianceHours).toBe(0);
    expect(summary.labourCost).toBe(320);
    expect(summary.labourProfitLossImpact).toBe(180);
    expect(summary.breakdown.byCategory.map((row) => row.category)).toEqual(expect.arrayContaining(["Install", "Cutting"]));
  });

  it("shows unassigned time separately for review", () => {
    const summary = buildActualLabourSummary({
      quoteId: "quote-1",
      jobIds: ["job-1"],
      entries: [
        { ...baseEntry, id: "linked", job_id: "job-1" },
        { ...baseEntry, id: "unassigned", job_id: "", quote_id: "", activity: "Assembly" },
      ],
    });

    expect(summary.entries.map((entry) => entry.id)).toEqual(["linked"]);
    expect(summary.unassignedEntries.map((entry) => entry.id)).toEqual(["unassigned"]);
  });

  it("builds a safe assignment patch without duplicating labour data", () => {
    const patch = buildTimeEntryAssignmentPatch(
      { ...baseEntry, activity: "Site measure for kitchen" },
      { quoteId: "quote-1", jobId: "job-1" }
    );

    expect(patch).toMatchObject({
      quote_id: "quote-1",
      job_id: "job-1",
      labour_category: "Site Measure",
      costing_reviewed: false,
      exclude_from_costing: false,
    });
  });

  it("maps activity text into workshop labour categories", () => {
    expect(mapTimeEntryToLabourCategory({ activity: "cut panels on CNC" })).toBe("Cutting");
    expect(mapTimeEntryToLabourCategory({ notes: "Fit Blum runners and hinges" })).toBe("Hardware");
    expect(mapTimeEntryToLabourCategory({ task_name: "delivery to site" })).toBe("Delivery");
    expect(mapTimeEntryToLabourCategory({ activity: "quiet task" })).toBe("Other");
  });

  it("ignores excluded time entries in actual hours and cost", () => {
    const summary = buildActualLabourSummary({
      quoteId: "quote-1",
      jobIds: ["job-1"],
      entries: [
        { ...baseEntry, id: "included", job_id: "job-1", hours: 2, clock_in: "", clock_out: "" },
        { ...baseEntry, id: "excluded", job_id: "job-1", hours: 3, clock_in: "", clock_out: "", exclude_from_costing: true },
      ],
    });

    expect(summary.entries.map((entry) => entry.id)).toEqual(["included"]);
    expect(summary.actualHours).toBe(2);
    expect(summary.labourCost).toBe(160);
  });

  it("calculates estimated versus actual variance and cost impact", () => {
    const summary = buildActualLabourSummary({
      quoteId: "quote-1",
      jobIds: ["job-1"],
      entries: [{ ...baseEntry, job_id: "job-1", hours: 6, clock_in: "", clock_out: "", hourly_rate: 90 }],
      operations: [{ estimated_hours: 4 }],
      labourSellAllowance: 400,
    });

    expect(summary.actualHours).toBe(6);
    expect(summary.varianceHours).toBe(2);
    expect(summary.variancePercent).toBe(50);
    expect(summary.labourCost).toBe(540);
    expect(summary.labourProfitLossImpact).toBe(-140);
  });

  it("marks manual labour separately from timeclock source", () => {
    const summary = buildActualLabourSummary({
      quoteId: "quote-1",
      entries: [{ ...baseEntry, quote_id: "quote-1", source: "manual", manual_reason: "Paper timesheet", hours: 1, clock_in: "", clock_out: "" }],
    });

    expect(isManualLabourEntry(summary.entries[0])).toBe(true);
    expect(summary.entries[0].source).toBe("manual");
  });

  it("updates quote actual labour when the timeclock duration changes", () => {
    const original = buildActualLabourSummary({
      quoteId: "quote-1",
      entries: [{ ...baseEntry, quote_id: "quote-1", hours: 2, clock_in: "", clock_out: "" }],
    });
    const changed = buildActualLabourSummary({
      quoteId: "quote-1",
      entries: [{ ...baseEntry, quote_id: "quote-1", hours: 3.25, clock_in: "", clock_out: "" }],
    });

    expect(original.actualHours).toBe(2);
    expect(changed.actualHours).toBe(3.25);
  });

  it("uses timeclock segments when present", () => {
    expect(getActualLabourDurationHours({
      segments: [
        { started_at: "2026-05-01T08:00:00.000Z", ended_at: "2026-05-01T09:15:00.000Z" },
        { started_at: "2026-05-01T09:30:00.000Z", ended_at: "2026-05-01T10:00:00.000Z" },
      ],
    })).toBe(1.75);
  });
});
