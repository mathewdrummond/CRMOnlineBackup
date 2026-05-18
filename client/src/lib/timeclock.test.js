import { describe, expect, test } from "vitest";
import {
  BREAK_ACTIVITY,
  activityRequiresJob,
  buildTimeclockOverview,
  calculateHoursBetween,
  detectTimeEntryOverlap,
  formatElapsedSeconds,
  getActiveEntryForStaff,
  getLiveTrackedMinutes,
  getOpenSegment,
  getRecentSuggestions,
  getTimeEntrySegments,
  isBreakEntry,
  normalizeTimeEntryStatus,
} from "./timeclock";

describe("timeclock helpers", () => {
  test("formats elapsed seconds for kiosk timers", () => {
    expect(formatElapsedSeconds(0)).toBe("00:00:00");
    expect(formatElapsedSeconds(3661)).toBe("01:01:01");
  });

  test("calculates hours between times with break deductions", () => {
    expect(calculateHoursBetween("2026-04-06T08:00:00.000Z", "2026-04-06T12:30:00.000Z")).toBe(4.5);
    expect(calculateHoursBetween("2026-04-06T08:00:00.000Z", "2026-04-06T12:30:00.000Z", 30)).toBe(4);
  });

  test("detects overlapping entries for the same staff member", () => {
    const overlap = detectTimeEntryOverlap(
      {
        id: "candidate",
        staff_id: "staff-1",
        clock_in: "2026-04-06T09:00:00.000Z",
        clock_out: "2026-04-06T11:00:00.000Z",
      },
      [
        {
          id: "existing",
          staff_id: "staff-1",
          clock_in: "2026-04-06T10:30:00.000Z",
          clock_out: "2026-04-06T12:00:00.000Z",
        },
      ]
    );

    expect(overlap?.id).toBe("existing");
  });

  test("identifies break entries across legacy and new fields", () => {
    expect(isBreakEntry({ activity: BREAK_ACTIVITY })).toBe(true);
    expect(isBreakEntry({ is_break: true })).toBe(true);
    expect(isBreakEntry({ entry_kind: "break" })).toBe(true);
    expect(isBreakEntry({ activity: "Labour" })).toBe(false);
  });

  test("normalizes segmented time entries and exposes the open segment", () => {
    const entry = {
      status: "active",
      segments: [
        { started_at: "2026-04-06T08:00:00.000Z", ended_at: "2026-04-06T09:30:00.000Z", duration_minutes: 90 },
        { started_at: "2026-04-06T10:00:00.000Z" },
      ],
      total_minutes: 90,
    };

    expect(normalizeTimeEntryStatus("paused")).toBe("paused");
    expect(getTimeEntrySegments(entry)).toHaveLength(2);
    expect(getOpenSegment(entry)?.started_at).toBe("2026-04-06T10:00:00.000Z");
    expect(getLiveTrackedMinutes(entry, "2026-04-06T10:45:00.000Z")).toBe(135);
  });

  test("builds high-level timeclock summary cards", () => {
    const overview = buildTimeclockOverview({
      activeEntries: [
        {
          id: "active-1",
          staff_id: "staff-1",
          status: "active",
          activity: "Labour",
          date: "2026-04-06",
          segments: [{ started_at: "2026-04-06T11:00:00.000Z" }],
          total_minutes: 60,
        },
        { id: "active-2", staff_id: "staff-2", status: "active", activity: BREAK_ACTIVITY, date: "2026-04-06", segments: [{ started_at: "2026-04-06T11:30:00.000Z" }] },
      ],
      completedEntries: [
        { id: "complete-1", date: "2026-04-06", hours: 5.25 },
        { id: "complete-2", date: "2026-04-06", hours: 2.5 },
      ],
      staff: [
        { id: "staff-1", status: "active" },
        { id: "staff-2", status: "active" },
        { id: "staff-3", status: "active" },
      ],
      todayValue: "2026-04-06T12:00:00.000Z",
    });

    expect(overview.activeNow).toBe(2);
    expect(overview.onBreak).toBe(1);
    expect(overview.trackedTodayHours).toBe(9.75);
    expect(overview.availableStaff).toBe(1);
  });

  test("returns active entry and recent suggestions per staff member", () => {
    const entries = [
      {
        id: "entry-1",
        staff_id: "staff-1",
        status: "completed",
        date: "2026-04-05",
        job_id: "job-1",
        activity: "Labour",
      },
      {
        id: "entry-2",
        staff_id: "staff-1",
        status: "completed",
        date: "2026-04-04",
        job_id: "job-2",
        activity: "Quoting",
      },
      {
        id: "entry-3",
        staff_id: "staff-1",
        status: "active",
        job_id: "job-3",
        activity: "Labour",
      },
    ];

    expect(getActiveEntryForStaff(entries, "staff-1")?.id).toBe("entry-3");
    expect(getRecentSuggestions(entries, "staff-1")).toHaveLength(2);
  });

  test("uses the MYOB activity mapping for job requirements", () => {
    expect(activityRequiresJob("Labour")).toBe(true);
    expect(activityRequiresJob("Other Chargeable")).toBe(true);
    expect(activityRequiresJob("Van Mileage")).toBe(true);
    expect(activityRequiresJob("Quoting")).toBe(false);
    expect(activityRequiresJob("Warranty Rework")).toBe(false);
  });
});
