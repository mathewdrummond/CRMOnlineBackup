import { describe, expect, test } from "vitest";
import { autoScheduleInstallOperations, buildInstallPlannerLanes } from "./installScheduling";

function buildOperation(overrides: Record<string, unknown>) {
  return {
    id: `op-${Math.random().toString(36).slice(2, 8)}`,
    created_date: "2026-05-01T00:00:00.000Z",
    updated_date: "2026-05-01T00:00:00.000Z",
    row_version: 1,
    job_id: "job-1",
    job_number: "JOB-1",
    job_title: "Test job",
    operation: "install",
    workflow_phase: "installation",
    status: "scheduled",
    assigned_staff_ids: ["staff-1"],
    ...overrides,
  };
}

describe("installScheduling", () => {
  test("builds active install lanes from staff records plus an unassigned lane", () => {
    const lanes = buildInstallPlannerLanes(
      [
        { id: "staff-1", name: "Jamie", status: "active" } as any,
        { id: "staff-2", name: "Alex", status: "inactive" } as any,
      ],
      []
    );

    expect(lanes.map((lane) => lane.label)).toEqual(["Jamie", "Unassigned installs"]);
    expect(lanes.some((lane) => lane.id === "install-unassigned")).toBe(true);
  });

  test("schedules higher priority work before lower priority work on the same lane", () => {
    const lanes = buildInstallPlannerLanes([{ id: "staff-1", name: "Jamie", status: "active" } as any], []);
    const scheduled = autoScheduleInstallOperations(
      [
        buildOperation({ id: "op-low", priority: "low", duration_hours: 10.5, earliest_start: "2026-05-04" }),
        buildOperation({ id: "op-critical", priority: "critical", duration_hours: 10.5, earliest_start: "2026-05-04" }),
      ] as any,
      lanes
    );

    const critical = scheduled.operations.find((operation) => operation.id === "op-critical");
    const low = scheduled.operations.find((operation) => operation.id === "op-low");

    expect(critical?.start_date).toBe("2026-05-04");
    expect(low?.start_date).toBe("2026-05-05");
  });

  test("respects dependencies when placing install tasks", () => {
    const lanes = buildInstallPlannerLanes([{ id: "staff-1", name: "Jamie", status: "active" } as any], []);
    const scheduled = autoScheduleInstallOperations(
      [
        buildOperation({ id: "op-measure", install_type: "measure", duration_hours: 2, earliest_start: "2026-05-04" }),
        buildOperation({
          id: "op-install",
          install_type: "install",
          duration_hours: 10.5,
          earliest_start: "2026-05-04",
          dependencies: ["op-measure"],
        }),
      ] as any,
      lanes
    );

    const measure = scheduled.operations.find((operation) => operation.id === "op-measure");
    const install = scheduled.operations.find((operation) => operation.id === "op-install");

    expect(measure?.start_date).toBe("2026-05-04");
    expect(install?.start_date).toBe("2026-05-05");
  });

  test("keeps manually locked tasks fixed and schedules other work around them", () => {
    const lanes = buildInstallPlannerLanes([{ id: "staff-1", name: "Jamie", status: "active" } as any], []);
    const scheduled = autoScheduleInstallOperations(
      [
        buildOperation({
          id: "op-locked",
          duration_hours: 10.5,
          earliest_start: "2026-05-04",
          start_date: "2026-05-06",
          end_date: "2026-05-06",
          manually_locked: true,
        }),
        buildOperation({
          id: "op-flex",
          duration_hours: 10.5,
          earliest_start: "2026-05-04",
          priority: "high",
        }),
      ] as any,
      lanes
    );

    const locked = scheduled.operations.find((operation) => operation.id === "op-locked");
    const flex = scheduled.operations.find((operation) => operation.id === "op-flex");

    expect(locked?.start_date).toBe("2026-05-06");
    expect(flex?.start_date).toBe("2026-05-04");
    expect(flex?.end_date).toBe("2026-05-04");
  });

  test("does not double-book a staff lane and splits work across days when needed", () => {
    const lanes = buildInstallPlannerLanes([{ id: "staff-1", name: "Jamie", status: "active" } as any], []);
    const scheduled = autoScheduleInstallOperations(
      [
        buildOperation({ id: "op-long", duration_hours: 8, earliest_start: "2026-05-04", priority: "critical" }),
        buildOperation({ id: "op-split", duration_hours: 6, earliest_start: "2026-05-04", priority: "high" }),
      ] as any,
      lanes
    );

    const split = scheduled.operations.find((operation) => operation.id === "op-split");
    expect(split?.start_date).toBe("2026-05-04");
    expect(split?.end_date).toBe("2026-05-05");
    expect(Array.isArray(split?.scheduled_day_allocations)).toBe(true);
    expect(split?.scheduled_day_allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-05-04", hours: expect.any(Number) }),
        expect.objectContaining({ date: "2026-05-05", hours: expect.any(Number) }),
      ])
    );
  });

  test("builds crew lanes and keeps an unassigned lane available", () => {
    const lanes = buildInstallPlannerLanes(
      [{ id: "staff-1", name: "Jamie", status: "active" } as any],
      [],
      [{ id: "crew-1", name: "Install Team", is_active: true, assigned_staff_ids: ["staff-1"], default_daily_capacity: 10.5 } as any],
      "crew"
    );

    expect(lanes.map((lane) => lane.label)).toEqual(["Install Team", "Unassigned installs"]);
    expect(lanes[0]).toMatchObject({
      lane_type: "install_crew",
      crew_id: "crew-1",
    });
  });

  test("does not double-book a staff member across two different crews", () => {
    const crewLanes = buildInstallPlannerLanes(
      [{ id: "staff-1", name: "Jamie", status: "active" } as any],
      [],
      [
        { id: "crew-1", name: "Crew 1", is_active: true, assigned_staff_ids: ["staff-1"], default_daily_capacity: 10.5 } as any,
        { id: "crew-2", name: "Crew 2", is_active: true, assigned_staff_ids: ["staff-1"], default_daily_capacity: 10.5 } as any,
      ],
      "crew"
    );

    const scheduled = autoScheduleInstallOperations(
      [
        buildOperation({ id: "crew-one-task", assigned_crew_id: "crew-1", duration_hours: 10.5, earliest_start: "2026-05-04" }),
        buildOperation({ id: "crew-two-task", assigned_crew_id: "crew-2", duration_hours: 10.5, earliest_start: "2026-05-04" }),
      ] as any,
      crewLanes,
      {
        crews: [
          { id: "crew-1", name: "Crew 1", is_active: true, assigned_staff_ids: ["staff-1"], assigned_staff_names: ["Jamie"], default_daily_capacity: 10.5, skills: [], notes: "", color: "emerald" },
          { id: "crew-2", name: "Crew 2", is_active: true, assigned_staff_ids: ["staff-1"], assigned_staff_names: ["Jamie"], default_daily_capacity: 10.5, skills: [], notes: "", color: "blue" },
        ],
      }
    );

    const first = scheduled.operations.find((operation) => operation.id === "crew-one-task");
    const second = scheduled.operations.find((operation) => operation.id === "crew-two-task");

    expect(first?.start_date).toBe("2026-05-04");
    expect(second?.start_date).toBe("2026-05-05");
  });

  test("flags crew capacity and skills warnings on assigned crew tasks", () => {
    const crewLanes = buildInstallPlannerLanes(
      [{ id: "staff-1", name: "Jamie", status: "active" } as any],
      [],
      [{ id: "crew-1", name: "Crew 1", is_active: true, assigned_staff_ids: ["staff-1"], default_daily_capacity: 10.5, skills: ["install"] } as any],
      "crew"
    );

    const scheduled = autoScheduleInstallOperations(
      [
        buildOperation({
          id: "crew-warning-task",
          assigned_crew_id: "crew-1",
          required_crew_size: 2,
          required_skills: ["install", "stone"],
          duration_hours: 4,
          earliest_start: "2026-05-04",
        }),
      ] as any,
      crewLanes,
      {
        crews: [
          { id: "crew-1", name: "Crew 1", is_active: true, assigned_staff_ids: ["staff-1"], assigned_staff_names: ["Jamie"], default_daily_capacity: 10.5, skills: ["install"], notes: "", color: "emerald" },
        ],
      }
    );

    const task = scheduled.operations.find((operation) => operation.id === "crew-warning-task");
    expect(task?.schedule_warnings).toEqual(
      expect.arrayContaining([
        "Task requires more people than the assigned crew contains.",
        "Assigned crew does not cover all required skills.",
      ])
    );
  });
});
