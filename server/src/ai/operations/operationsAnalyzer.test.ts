import { describe, expect, it } from "vitest";
import { analyzeOperations } from "./operationsAnalyzer";

describe("analyzeOperations", () => {
  it("returns deterministic explainable risks without mutations", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const result = analyzeOperations({
      jobs: [
        {
          id: "job-1",
          job_number: "J-001",
          title: "Kitchen",
          status: "active",
          install_date: tomorrow,
          budget_hours: 10,
          updated_date: yesterday,
        },
      ],
      quotes: [
        {
          id: "quote-1",
          quote_number: "Q-001",
          status: "sent",
          valid_until: yesterday,
        },
      ],
      jobOperations: [
        {
          id: "op-1",
          job_id: "job-1",
          task_name: "Order hardware",
          status: "blocked",
          end_date: yesterday,
          dependency_task_ids: "op-0",
        },
      ],
      timeEntries: [
        { id: "time-1", job_id: "job-1", hours: 14 },
      ],
      staff: [{ id: "staff-1", status: "active" }],
      clockIns: [],
      notes: [],
    });

    expect(result.no_hidden_mutations).toBe(true);
    expect(result.daily_briefing.jobs_at_risk).toBeGreaterThanOrEqual(1);
    expect(result.risks.some((risk) => risk.type === "workflow_blocker")).toBe(true);
    expect(result.risks.some((risk) => risk.type === "labour_overrun")).toBe(true);
    expect(result.risks.every((risk) => risk.recommendation)).toBe(true);
  });
});

