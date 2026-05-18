import { describe, expect, test } from "vitest";
import { DEFAULT_INSTALL_ESTIMATOR_SETTINGS, estimateInstallDurationForJob } from "./installEstimator";

describe("installEstimator", () => {
  test("estimates install duration from pricing and quote data with complexity applied", () => {
    const result = estimateInstallDurationForJob(
      {
        id: "job-1",
        quote_id: "quote-1",
        install_complexity: "detailed",
      } as any,
      DEFAULT_INSTALL_ESTIMATOR_SETTINGS as any,
      {
        pricingRows: [
          { cabinet_reference: "CAB-1", category: "sheet_materials", description: "Base cabinet" },
          { cabinet_reference: "CAB-2", category: "sheet_materials", description: "Wall cabinet" },
          { category: "drawer_systems_runners", description: "MERIVO drawer", quantity: 4 },
          { category: "doors_fronts", description: "Front", quantity: 6 },
          { category: "hardware", description: "Handle", quantity: 8 },
        ] as any,
        quoteItems: [],
      }
    );

    expect(result.estimated_install_hours).toBeGreaterThan(4);
    expect(result.suggested_crew_size).toBeGreaterThanOrEqual(1);
    expect(result.assumptions).toMatchObject({
      cabinet_count: 2,
      drawer_count: 4,
      front_count: 6,
      complexity: "detailed",
      complexity_multiplier: 1.15,
    });
    expect(result.confidence).toBe("high");
  });

  test("applies minimum duration and rounding rules", () => {
    const result = estimateInstallDurationForJob(
      {
        id: "job-2",
        quote_id: "quote-2",
        install_complexity: "simple",
      } as any,
      {
        ...DEFAULT_INSTALL_ESTIMATOR_SETTINGS,
        base_install_hours: 0.5,
        minimum_duration_hours: 6,
        rounding_rule: "nearest_half_day",
      } as any,
      {
        quoteItems: [],
        pricingRows: [],
      }
    );

    expect(result.estimated_install_hours).toBe(10.5);
    expect(result.estimated_install_days).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "Cabinet count was not detected, so duration may be understated.",
        "No imported pricing rows were available; estimate used committed quote items only.",
      ])
    );
    expect(result.confidence).toBe("low");
  });
});
