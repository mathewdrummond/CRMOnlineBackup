import { describe, expect, test } from "vitest";
import { getReportDefinition, getDefaultReportState, getPackReports } from "./reportDefinitions";

describe("reportDefinitions", () => {
  test("builds job financial rows for revenue reporting", () => {
    const report = getReportDefinition("revenue_summary");
    const rows = report.buildRows({
      jobs: [
        {
          id: "job-1",
          title: "Ponsonby penthouse fit-out",
          job_number: "JOB-0001",
          company_name: "Harbour Homes",
          status: "production",
          quoted_value: 15000,
          material_cost: 2300,
          created_date: "2026-04-10",
          due_date: "2026-04-30",
          job_type: "cabinetry_standard",
          job_source: "referral",
        },
      ],
      jobOperations: [
        {
          id: "op-1",
          job_id: "job-1",
          task_name: "Assembly",
          operation: "assembly",
          status: "in_progress",
          estimated_hours: 20,
          workflow_phase: "manufacturing",
          start_date: "2026-04-16",
        },
      ],
      timeEntries: [
        {
          id: "time-1",
          job_id: "job-1",
          job_operation_id: "op-1",
          staff_name: "Jamie Worker",
          activity: "Labour",
          date: "2026-04-17",
          hours: 8,
          total_cost: 520,
        },
      ],
      companies: [],
      contacts: [],
    }, { today: new Date("2026-04-20T00:00:00Z"), modules: {} });

    expect(rows).toHaveLength(1);
    expect(rows[0].quoted_value).toBe(15000);
    expect(rows[0].labour_cost).toBe(520);
    expect(rows[0].material_cost).toBe(2300);
    expect(rows[0].gross_profit).toBe(12180);
    expect(rows[0].source_records.length).toBeGreaterThanOrEqual(2);
  });

  test("returns report defaults with visible columns and sort state", () => {
    const state = getDefaultReportState("quote_conversion");

    expect(state.reportKey).toBe("quote_conversion");
    expect(state.filters.datePreset).toBe("last_90_days");
    expect(state.sort.column).toBeTruthy();
    expect(state.visibleColumns.length).toBeGreaterThan(0);
  });

  test("filters pack reports by enabled modules", () => {
    const financeReports = getPackReports("finance_admin", {
    });

    expect(financeReports.some((report) => report.key === "job_profitability")).toBe(true);
    expect(financeReports.some((report) => report.key === "purchase_order_status")).toBe(false);
    expect(financeReports.some((report) => report.key === "purchasing_summary")).toBe(false);
  });
});
