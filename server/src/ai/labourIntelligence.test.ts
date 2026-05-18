import { describe, expect, test } from "vitest";
import { buildLabourIntelligence } from "./labourIntelligence";

describe("labour intelligence", () => {
  test("predicts remaining hours, estimate variance, warnings, and bottlenecks from operational data", () => {
    const insight = buildLabourIntelligence({
      jobs: [
        {
          id: "job-1",
          entity: "Job",
          job_number: "J-1",
          title: "Kitchen",
          status: "active",
          budget_hours: 10,
          quoted_value: 5000,
          job_type: "cabinetry_standard",
          install_date: "2026-05-18",
          install_end_date: "2026-05-20",
          project_manager: "Morgan",
        },
      ],
      timeEntries: [
        { id: "time-1", entity: "TimeEntry", job_id: "job-1", job_operation_id: "op-1", hours: 12, hourly_rate: 40, total_cost: 480, status: "completed" },
      ],
      jobOperations: [
        { id: "op-1", entity: "JobOperation", job_id: "job-1", workflow_phase: "manufacturing", status: "blocked", estimated_hours: 8 },
      ],
      quotes: [],
      clockIns: [],
    });

    expect(insight.labour_prediction.active_jobs).toBe(1);
    expect(insight.labour_prediction.current_actual_hours).toBe(12);
    expect(insight.estimate_accuracy.over_budget_jobs).toBe(1);
    expect(insight.install_duration_prediction.median_install_days).toBe(3);
    expect(insight.workflow_hour_prediction[0]).toMatchObject({
      workflow_phase: "manufacturing",
      actual_hours: 12,
      estimated_hours: 8,
    });
    expect(insight.warnings.some((warning) => warning.message.includes("over labour estimate"))).toBe(true);
    expect(insight.bottlenecks[0]).toMatchObject({
      workflow_phase: "manufacturing",
      blocked_or_waiting: 1,
    });
  });
});
