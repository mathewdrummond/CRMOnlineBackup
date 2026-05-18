import { describe, expect, test } from "vitest";
import { buildScheduleCapacityModel } from "./scheduleCapacity";

describe("scheduleCapacity", () => {
  test("calculates overload when booked hours exceed visible lane capacity", () => {
    const model = buildScheduleCapacityModel({
      lanes: [
        {
          id: "lane-1",
          label: "Assembly",
          lane_type: "crew",
          crew_size: 1,
          capacity_hours_per_day: 8,
        },
      ],
      operations: [
        {
          id: "op-1",
          lane_id: "lane-1",
          start_date: "2026-04-06",
          end_date: "2026-04-06",
          estimated_hours: 20,
        },
      ],
      days: ["2026-04-06"],
    });

    expect(model.totalOverloadHours).toBeGreaterThan(0);
    expect(model.rows[0].utilisationPercent).toBeGreaterThan(100);
  });

  test("respects zero closed-day capacity", () => {
    const model = buildScheduleCapacityModel({
      lanes: [{ id: "lane-1", label: "Install", lane_type: "crew", crew_size: 1, capacity_hours_per_day: 10.5 }],
      operations: [],
      days: ["2026-04-05"],
    });

    expect(model.rows[0].capacityHours).toBe(0);
  });
});
