import { describe, expect, test } from "vitest";
import {
  applyReportFilters,
  groupReportRows,
  parseReportDateValue,
  resolveDateRange,
  toDateInputValue,
} from "./reportingUtils";

describe("reportingUtils", () => {
  test("resolves the requested date presets", () => {
    const range = resolveDateRange({ datePreset: "last_90_days" }, new Date("2026-04-20T10:00:00Z"));

    expect(toDateInputValue(range.start)).toBe("2026-01-21");
    expect(toDateInputValue(range.end)).toBe("2026-04-20");
  });

  test("applies combined filters consistently", () => {
    const rows = [
      {
        id: "job-1",
        filter_date: "2026-04-10",
        customer: "Harbour Homes",
        customer_key: "company-1",
        status: "production",
        source: "referral",
      },
      {
        id: "job-2",
        filter_date: "2026-04-11",
        customer: "Northshore Offices",
        customer_key: "company-2",
        status: "production",
        source: "website",
      },
      {
        id: "job-3",
        filter_date: "2026-03-01",
        customer: "Harbour Homes",
        customer_key: "company-1",
        status: "planning",
        source: "referral",
      },
    ];

    const filtered = applyReportFilters(rows, {
      datePreset: "custom",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      customer: "company-1",
      status: "production",
      source: "referral",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("job-1");
  });

  test("groups rows and recalculates weighted percentage values", () => {
    const definition = {
      columns: [
        { key: "label", aggregate: "groupLabel" },
        { key: "quoted_value", type: "currency", aggregate: "sum" },
        { key: "gross_profit", type: "currency", aggregate: "sum" },
        { key: "gross_margin_pct", type: "percent", aggregate: { type: "weightedPercent", numerator: "gross_profit", denominator: "quoted_value" } },
      ],
      groupings: [
        {
          key: "status",
          getValue: (row) => row.status,
          getLabel: (row) => row.status,
        },
      ],
    };

    const grouped = groupReportRows([
      { id: "a", label: "A", status: "production", quoted_value: 1000, gross_profit: 200, gross_margin_pct: 20, source_records: [] },
      { id: "b", label: "B", status: "production", quoted_value: 500, gross_profit: 250, gross_margin_pct: 50, source_records: [] },
    ], definition, "status");

    expect(grouped).toHaveLength(1);
    expect(grouped[0].quoted_value).toBe(1500);
    expect(grouped[0].gross_profit).toBe(450);
    expect(grouped[0].gross_margin_pct).toBe(30);
  });

  test("parses date-only values in local time without losing the day", () => {
    const parsed = parseReportDateValue("2026-04-20");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(3);
    expect(parsed?.getDate()).toBe(20);
  });
});
