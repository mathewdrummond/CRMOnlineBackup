import { forecastJobWaterfall } from "./jobWaterfallForecast";

let operationCounter = 0;

function createOperation(overrides = {}) {
  return {
    id: overrides.id || `operation-${operationCounter += 1}`,
    job_id: overrides.job_id || "job-1",
    task_name: overrides.task_name || "Task",
    workflow_phase: overrides.workflow_phase || "manufacturing",
    workflow_role: overrides.workflow_role || overrides.assigned_role || "joiner",
    assigned_role: overrides.assigned_role || overrides.workflow_role || "joiner",
    operation: overrides.operation || "assembly",
    status: overrides.status || "pending",
    estimated_hours: overrides.estimated_hours ?? 8,
    actual_hours: overrides.actual_hours ?? 0,
    start_date: overrides.start_date || "",
    end_date: overrides.end_date || "",
    actual_start_date: overrides.actual_start_date || "",
    actual_completion_date: overrides.actual_completion_date || "",
    dependency_task_ids: overrides.dependency_task_ids || [],
    schedule_manual_override: overrides.schedule_manual_override || false,
    allow_friday_overtime: overrides.allow_friday_overtime || false,
    allow_saturday_overtime: overrides.allow_saturday_overtime || false,
    sort_order: overrides.sort_order ?? 0,
    assigned_to: overrides.assigned_to || "",
  };
}

describe("forecastJobWaterfall", () => {
  test("respects dependencies and projects a completion date from the task chain", () => {
    const job = { id: "job-1", due_date: "2026-04-30" };
    const operations = [
      createOperation({
        id: "design",
        workflow_phase: "design_pricing",
        workflow_role: "management",
        assigned_role: "management",
        operation: "design",
        estimated_hours: 8,
        sort_order: 1,
      }),
      createOperation({
        id: "manufacture",
        workflow_phase: "manufacturing",
        workflow_role: "joiner",
        assigned_role: "joiner",
        estimated_hours: 24,
        dependency_task_ids: ["design"],
        sort_order: 2,
      }),
    ];

    const forecast = forecastJobWaterfall({
      job,
      currentOperations: operations,
      allOperations: operations,
      today: "2026-04-06",
    });

    const design = forecast.rows.find((row) => row.id === "design");
    const manufacture = forecast.rows.find((row) => row.id === "manufacture");

    expect(design.forecastStartDate).toBe("2026-04-06");
    expect(design.forecastFinishDate).toBe("2026-04-06");
    expect(manufacture.forecastStartDate).toBe("2026-04-06");
    expect(manufacture.forecastFinishDate).toBe("2026-04-07");
    expect(forecast.projectedCompletionDate).toBe("2026-04-07");
  });

  test("pushes work out when role capacity is already booked by other jobs", () => {
    const currentTask = createOperation({
      id: "manufacture",
      workflow_phase: "manufacturing",
      workflow_role: "joiner",
      assigned_role: "joiner",
      estimated_hours: 8,
    });
    const externalTask = createOperation({
      id: "other-job-manufacture",
      job_id: "job-2",
      workflow_phase: "manufacturing",
      workflow_role: "joiner",
      assigned_role: "joiner",
      estimated_hours: 21,
      start_date: "2026-04-06",
    });

    const forecast = forecastJobWaterfall({
      job: { id: "job-1" },
      currentOperations: [currentTask],
      allOperations: [currentTask, externalTask],
      today: "2026-04-06",
    });

    expect(forecast.rows[0].forecastStartDate).toBe("2026-04-07");
    expect(forecast.rows[0].resourceDelayDays).toBeGreaterThan(0);
    expect(forecast.rows[0].reason).toMatch(/next joiner slot/i);
  });

  test("skips closed days and rolls Friday work into Monday without overtime", () => {
    const fridayTask = createOperation({
      id: "friday-task",
      workflow_phase: "design_pricing",
      workflow_role: "management",
      assigned_role: "management",
      operation: "design",
      estimated_hours: 12,
    });

    const forecast = forecastJobWaterfall({
      job: { id: "job-1" },
      currentOperations: [fridayTask],
      allOperations: [fridayTask],
      today: "2026-04-10",
    });

    expect(forecast.rows[0].forecastStartDate).toBe("2026-04-10");
    expect(forecast.rows[0].forecastFinishDate).toBe("2026-04-13");
  });

  test("uses actual dates and remaining hours for work already in progress", () => {
    const inProgressTask = createOperation({
      id: "in-progress",
      workflow_phase: "installation",
      workflow_role: "install",
      assigned_role: "install",
      operation: "install",
      status: "in_progress",
      estimated_hours: 12,
      actual_hours: 8,
      actual_start_date: "2026-04-08",
      start_date: "2026-04-08",
    });

    const forecast = forecastJobWaterfall({
      job: { id: "job-1" },
      currentOperations: [inProgressTask],
      allOperations: [inProgressTask],
      today: "2026-04-09",
    });

    expect(forecast.rows[0].forecastStartDate).toBe("2026-04-08");
    expect(forecast.rows[0].forecastFinishDate).toBe("2026-04-09");
    expect(forecast.projectedCompletionDate).toBe("2026-04-09");
  });
});
