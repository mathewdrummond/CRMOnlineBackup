import {
  buildSectionSegments,
  calculateScheduleEndDate,
  getTimelineSections,
  layoutTimelineSegments,
  parseAssignedNames,
  snapDateToWorkingDate,
} from "./scheduleTimeline";

describe("scheduleTimeline helpers", () => {
  test("splits long items cleanly across visible week sections", () => {
    const section = getTimelineSections(new Date("2026-04-01T00:00:00"), "month")[0];
    const segments = buildSectionSegments([
      {
        id: "install-1",
        recordId: "install-1",
        laneId: "install-planner",
        title: "Kitchen fit-out",
        type: "install",
        startDate: "2026-03-31",
        endDate: "2026-04-04",
      },
    ], section.days);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startColumn: 2,
      span: 5,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  test("stacks overlapping install items without collisions", () => {
    const laidOut = layoutTimelineSegments([
      { id: "one", laneId: "install-planner", startColumn: 1, endColumn: 3, span: 3 },
      { id: "two", laneId: "install-planner", startColumn: 2, endColumn: 4, span: 3 },
      { id: "three", laneId: "install-planner", startColumn: 5, endColumn: 6, span: 2 },
    ]);

    const byId = Object.fromEntries(laidOut.map((segment) => [segment.id, segment]));
    expect(byId.one.stackIndex).toBe(0);
    expect(byId.two.stackIndex).toBe(1);
    expect(byId.three.stackIndex).toBe(0);
  });

  test("keeps assignee parsing deterministic for other workflow helpers", () => {
    expect(parseAssignedNames(" McAnulty, Jamie • Constance, Richard • McAnulty, Jamie ")).toEqual([
      "McAnulty",
      "Jamie",
      "Constance",
      "Richard",
    ]);
  });

  test("snaps closed days forward to the next working day", () => {
    expect(snapDateToWorkingDate("2026-04-05")).toBe("2026-04-06");
    expect(snapDateToWorkingDate("2026-04-11")).toBe("2026-04-13");
    expect(snapDateToWorkingDate("2026-04-11", { allowSaturdayOvertime: true })).toBe("2026-04-11");
  });

  test("calculates finish dates from estimated hours and overtime rules", () => {
    expect(calculateScheduleEndDate("2026-04-02", 15)).toBe("2026-04-03");
    expect(calculateScheduleEndDate("2026-04-03", 6)).toBe("2026-04-06");
    expect(calculateScheduleEndDate("2026-04-03", 6, { allowFridayOvertime: true })).toBe("2026-04-03");
    expect(calculateScheduleEndDate("2026-04-10", 8, { allowFridayOvertime: true, allowSaturdayOvertime: true })).toBe("2026-04-10");
  });
});
