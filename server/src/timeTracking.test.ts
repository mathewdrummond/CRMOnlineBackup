import { beforeEach, describe, expect, test } from "vitest";
import { createEntityRecord, getEntityRecord, resetDatabaseForTests } from "./db";
import { completeTimer, ensureTimeTrackingConstraints, pauseTimer, repairTimeTrackingData, resumeTimer, startTimer } from "./timeTracking";

function createOpenAttendanceClockIn(staffId: string, clockIn = "2026-04-08T07:00:00.000Z") {
  return createEntityRecord("ClockIn", {
    staff_id: staffId,
    date: clockIn.slice(0, 10),
    clock_in: clockIn,
    clock_out: "",
    total_hours: 0,
  });
}

describe("time tracking service", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
    repairTimeTrackingData({ skipAudit: true, requestSource: "time-tracking-test" });
    ensureTimeTrackingConstraints();
  });

  test("starting a new timer auto-pauses the currently active timer for that staff member", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-switch",
      name: "Switch Tester",
      email: "switch@example.test",
      status: "active",
      hourly_rate: 50,
    });
    createOpenAttendanceClockIn(staff.id);
    const jobA = createEntityRecord("Job", {
      id: "job-switch-a",
      title: "Kitchen A",
      job_number: "JOB-SWITCH-A",
      contact_name: "Customer A",
    });
    const jobB = createEntityRecord("Job", {
      id: "job-switch-b",
      title: "Kitchen B",
      job_number: "JOB-SWITCH-B",
      contact_name: "Customer B",
    });

    const first = startTimer({
      staff_id: staff.id,
      job_id: jobA.id,
      activity: "Labour",
      location_type: "workshop",
      description: "Initial work",
    }, {
      now: new Date("2026-04-08T08:00:00.000Z"),
      requestSource: "unit-test",
    });

    const second = startTimer({
      staff_id: staff.id,
      job_id: jobB.id,
      activity: "Assembly",
      location_type: "workshop",
      description: "Urgent interruption",
    }, {
      now: new Date("2026-04-08T09:15:00.000Z"),
      requestSource: "unit-test",
    });

    const refreshedFirst = getEntityRecord("TimeEntry", first.entry.id);
    const refreshedSecond = getEntityRecord("TimeEntry", second.entry.id);

    expect(refreshedFirst?.status).toBe("paused");
    expect(refreshedFirst?.total_minutes).toBe(75);
    expect(Array.isArray(refreshedFirst?.segments)).toBe(true);
    expect(refreshedFirst?.segments).toHaveLength(1);
    expect(refreshedFirst?.segments[0]).toMatchObject({
      started_at: "2026-04-08T08:00:00.000Z",
      ended_at: "2026-04-08T09:15:00.000Z",
      duration_minutes: 75,
    });
    expect(refreshedSecond?.status).toBe("active");
    expect(refreshedSecond?.segments).toHaveLength(1);
    expect(refreshedSecond?.segments[0]).toMatchObject({
      started_at: "2026-04-08T09:15:00.000Z",
    });
  });

  test("switching timers uses one shared transition timestamp even when the client clock is slightly behind", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-switch-skew",
      name: "Switch Skew Tester",
      email: "switch-skew@example.test",
      status: "active",
      hourly_rate: 50,
    });
    createOpenAttendanceClockIn(staff.id);
    const jobA = createEntityRecord("Job", {
      id: "job-switch-skew-a",
      title: "Bench A",
      job_number: "JOB-SKEW-A",
    });
    const jobB = createEntityRecord("Job", {
      id: "job-switch-skew-b",
      title: "Bench B",
      job_number: "JOB-SKEW-B",
    });

    const first = startTimer({
      staff_id: staff.id,
      job_id: jobA.id,
      activity: "Labour",
    }, {
      now: new Date("2026-04-08T08:00:00.000Z"),
      requestSource: "unit-test",
    });

    const second = startTimer({
      staff_id: staff.id,
      job_id: jobB.id,
      activity: "Assembly",
      clock_in: "2026-04-08T09:15:00.088Z",
    }, {
      now: new Date("2026-04-08T09:15:00.102Z"),
      requestSource: "unit-test",
    });

    const refreshedFirst = getEntityRecord("TimeEntry", first.entry.id);
    const refreshedSecond = getEntityRecord("TimeEntry", second.entry.id);

    expect(refreshedFirst?.status).toBe("paused");
    expect(refreshedFirst?.clock_out).toBe("2026-04-08T09:15:00.088Z");
    expect(refreshedFirst?.segments?.[0]).toMatchObject({
      started_at: "2026-04-08T08:00:00.000Z",
      ended_at: "2026-04-08T09:15:00.088Z",
    });
    expect(refreshedSecond?.clock_in).toBe("2026-04-08T09:15:00.088Z");

    expect(() => pauseTimer(second.entry.id, {}, {
      now: new Date("2026-04-08T10:00:00.000Z"),
      requestSource: "unit-test",
    })).not.toThrow();
  });

  test("pausing then resuming a timer preserves prior segments and opens a new one", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-resume",
      name: "Resume Tester",
      email: "resume@example.test",
      status: "active",
      hourly_rate: 50,
    });
    createOpenAttendanceClockIn(staff.id);
    const job = createEntityRecord("Job", {
      id: "job-resume",
      title: "Wardrobe",
      job_number: "JOB-RESUME-1",
      contact_name: "Resume Customer",
    });

    const started = startTimer({
      staff_id: staff.id,
      job_id: job.id,
      activity: "Assembly",
      location_type: "workshop",
    }, {
      now: new Date("2026-04-08T07:30:00.000Z"),
      requestSource: "unit-test",
    });

    const paused = pauseTimer(started.entry.id, {}, {
      now: new Date("2026-04-08T09:00:00.000Z"),
      expectedRowVersion: started.entry.row_version,
      requestSource: "unit-test",
    });

    const resumed = resumeTimer(started.entry.id, {}, {
      now: new Date("2026-04-08T10:00:00.000Z"),
      expectedRowVersion: paused?.row_version,
      requestSource: "unit-test",
    });

    const refreshed = getEntityRecord("TimeEntry", started.entry.id);

    expect(paused?.status).toBe("paused");
    expect(paused?.total_minutes).toBe(90);
    expect(resumed?.entry.status).toBe("active");
    expect(refreshed?.segments).toHaveLength(2);
    expect(refreshed?.segments[0]).toMatchObject({
      started_at: "2026-04-08T07:30:00.000Z",
      ended_at: "2026-04-08T09:00:00.000Z",
      duration_minutes: 90,
    });
    expect(refreshed?.segments[1]).toMatchObject({
      started_at: "2026-04-08T10:00:00.000Z",
    });
  });

  test("completing a paused timer keeps accumulated tracked time and closes editing state", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-complete",
      name: "Complete Tester",
      email: "complete@example.test",
      status: "active",
      hourly_rate: 45,
    });
    createOpenAttendanceClockIn(staff.id);
    const job = createEntityRecord("Job", {
      id: "job-complete",
      title: "Install",
      job_number: "JOB-COMPLETE-1",
      contact_name: "Completion Customer",
    });

    const started = startTimer({
      staff_id: staff.id,
      job_id: job.id,
      activity: "Install",
      location_type: "install",
    }, {
      now: new Date("2026-04-08T11:00:00.000Z"),
      requestSource: "unit-test",
    });

    const paused = pauseTimer(started.entry.id, {}, {
      now: new Date("2026-04-08T12:00:00.000Z"),
      expectedRowVersion: started.entry.row_version,
      requestSource: "unit-test",
    });

    const completed = completeTimer(started.entry.id, {}, {
      now: new Date("2026-04-08T12:05:00.000Z"),
      expectedRowVersion: paused?.row_version,
      requestSource: "unit-test",
    });

    expect(completed?.status).toBe("completed");
    expect(completed?.total_minutes).toBe(60);
    expect(completed?.hours).toBe(1);
    expect(completed?.clock_out).toBe("2026-04-08T12:00:00.000Z");
  });

  test("completing the active timer leaves a paused timer resumable", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-return",
      name: "Return Tester",
      email: "return@example.test",
      status: "active",
      hourly_rate: 50,
    });
    createOpenAttendanceClockIn(staff.id);
    const jobA = createEntityRecord("Job", {
      id: "job-return-a",
      title: "Kitchen A",
      job_number: "JOB-RETURN-A",
      contact_name: "Customer A",
    });
    const jobB = createEntityRecord("Job", {
      id: "job-return-b",
      title: "Kitchen B",
      job_number: "JOB-RETURN-B",
      contact_name: "Customer B",
    });

    const first = startTimer({
      staff_id: staff.id,
      job_id: jobA.id,
      activity: "Labour",
    }, {
      now: new Date("2026-04-08T08:00:00.000Z"),
      requestSource: "unit-test",
    });

    const second = startTimer({
      staff_id: staff.id,
      job_id: jobB.id,
      activity: "Labour",
    }, {
      now: new Date("2026-04-08T09:00:00.000Z"),
      requestSource: "unit-test",
    });

    const completedSecond = completeTimer(second.entry.id, {}, {
      now: new Date("2026-04-08T10:00:00.000Z"),
      requestSource: "unit-test",
    });

    const resumedFirst = resumeTimer(first.entry.id, {}, {
      now: new Date("2026-04-08T10:05:00.000Z"),
      requestSource: "unit-test",
    });

    const refreshedFirst = getEntityRecord("TimeEntry", first.entry.id);
    const refreshedSecond = getEntityRecord("TimeEntry", second.entry.id);

    expect(completedSecond?.status).toBe("completed");
    expect(refreshedSecond?.status).toBe("completed");
    expect(refreshedFirst?.status).toBe("active");
    expect(resumedFirst?.entry.status).toBe("active");
    expect(refreshedFirst?.segments).toHaveLength(2);
    expect(refreshedFirst?.segments[0]).toMatchObject({
      started_at: "2026-04-08T08:00:00.000Z",
      ended_at: "2026-04-08T09:00:00.000Z",
      duration_minutes: 60,
    });
    expect(refreshedFirst?.segments[1]).toMatchObject({
      started_at: "2026-04-08T10:05:00.000Z",
    });
  });

  test("multiple paused timers survive active completion and remain individually resumable", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-multi",
      name: "Multi Tester",
      email: "multi@example.test",
      status: "active",
      hourly_rate: 50,
    });
    createOpenAttendanceClockIn(staff.id);
    const jobA = createEntityRecord("Job", { id: "job-multi-a", title: "A", job_number: "JOB-MA" });
    const jobB = createEntityRecord("Job", { id: "job-multi-b", title: "B", job_number: "JOB-MB" });
    const jobC = createEntityRecord("Job", { id: "job-multi-c", title: "C", job_number: "JOB-MC" });

    const timerA = startTimer({ staff_id: staff.id, job_id: jobA.id, activity: "Labour" }, {
      now: new Date("2026-04-08T07:00:00.000Z"),
      requestSource: "unit-test",
    });
    const timerB = startTimer({ staff_id: staff.id, job_id: jobB.id, activity: "Labour" }, {
      now: new Date("2026-04-08T08:00:00.000Z"),
      requestSource: "unit-test",
    });
    const timerC = startTimer({ staff_id: staff.id, job_id: jobC.id, activity: "Labour" }, {
      now: new Date("2026-04-08T09:00:00.000Z"),
      requestSource: "unit-test",
    });

    completeTimer(timerC.entry.id, {}, {
      now: new Date("2026-04-08T10:00:00.000Z"),
      requestSource: "unit-test",
    });

    const pausedA = getEntityRecord("TimeEntry", timerA.entry.id);
    const pausedB = getEntityRecord("TimeEntry", timerB.entry.id);
    expect(pausedA?.status).toBe("paused");
    expect(pausedB?.status).toBe("paused");

    const resumedB = resumeTimer(timerB.entry.id, {}, {
      now: new Date("2026-04-08T10:10:00.000Z"),
      requestSource: "unit-test",
    });

    expect(resumedB?.entry.status).toBe("active");
    expect(getEntityRecord("TimeEntry", timerA.entry.id)?.status).toBe("paused");
    expect(getEntityRecord("TimeEntry", timerB.entry.id)?.status).toBe("active");
  });

  test("users can resume a second paused timer after completing the first resumed timer", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-sequence",
      name: "Sequence Tester",
      email: "sequence@example.test",
      status: "active",
      hourly_rate: 50,
    });
    createOpenAttendanceClockIn(staff.id);
    const jobA = createEntityRecord("Job", { id: "job-sequence-a", title: "A", job_number: "JOB-SA" });
    const jobB = createEntityRecord("Job", { id: "job-sequence-b", title: "B", job_number: "JOB-SB" });

    const timerA = startTimer({ staff_id: staff.id, job_id: jobA.id, activity: "Labour" }, {
      now: new Date("2026-04-08T07:00:00.000Z"),
      requestSource: "unit-test",
    });

    pauseTimer(timerA.entry.id, {}, {
      now: new Date("2026-04-08T08:00:00.000Z"),
      requestSource: "unit-test",
    });

    const timerB = startTimer({ staff_id: staff.id, job_id: jobB.id, activity: "Labour" }, {
      now: new Date("2026-04-08T08:05:00.000Z"),
      requestSource: "unit-test",
    });

    pauseTimer(timerB.entry.id, {}, {
      now: new Date("2026-04-08T09:00:00.000Z"),
      requestSource: "unit-test",
    });

    const resumedA = resumeTimer(timerA.entry.id, {}, {
      now: new Date("2026-04-08T09:10:00.000Z"),
      requestSource: "unit-test",
    });

    expect(resumedA?.entry.status).toBe("active");

    completeTimer(timerA.entry.id, {}, {
      now: new Date("2026-04-08T10:00:00.000Z"),
      requestSource: "unit-test",
    });

    const resumedB = resumeTimer(timerB.entry.id, {}, {
      now: new Date("2026-04-08T10:05:00.000Z"),
      requestSource: "unit-test",
    });

    expect(getEntityRecord("TimeEntry", timerA.entry.id)?.status).toBe("completed");
    expect(resumedB?.entry.status).toBe("active");
    expect(getEntityRecord("TimeEntry", timerB.entry.id)?.segments).toHaveLength(2);
  });

  test("repair normalizes tiny switch overlaps left behind by older client timestamps", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-repair-skew",
      name: "Repair Skew Tester",
      email: "repair-skew@example.test",
      status: "active",
      hourly_rate: 50,
    });
    const jobA = createEntityRecord("Job", { id: "job-repair-skew-a", title: "A", job_number: "JOB-RA" });
    const jobB = createEntityRecord("Job", { id: "job-repair-skew-b", title: "B", job_number: "JOB-RB" });

    const older = createEntityRecord("TimeEntry", {
      staff_id: staff.id,
      staff_name: staff.name,
      job_id: jobA.id,
      activity: "Labour",
      status: "paused",
      clock_in: "2026-04-08T01:06:42.034Z",
      clock_out: "2026-04-08T01:07:06.102Z",
      paused_at: "2026-04-08T01:07:06.102Z",
      segments: [{ started_at: "2026-04-08T01:06:42.034Z", ended_at: "2026-04-08T01:07:06.102Z" }],
    });

    const newer = createEntityRecord("TimeEntry", {
      staff_id: staff.id,
      staff_name: staff.name,
      job_id: jobB.id,
      activity: "Assembly",
      status: "active",
      clock_in: "2026-04-08T01:07:06.088Z",
      segments: [{ started_at: "2026-04-08T01:07:06.088Z" }],
    });

    repairTimeTrackingData({
      requestSource: "unit-test",
      skipAudit: true,
    });

    const repairedOlder = getEntityRecord("TimeEntry", older.id);
    expect(repairedOlder?.clock_out).toBe("2026-04-08T01:07:06.088Z");
    expect(repairedOlder?.paused_at).toBe("2026-04-08T01:07:06.088Z");
    expect(repairedOlder?.segments?.[0]).toMatchObject({
      started_at: "2026-04-08T01:06:42.034Z",
      ended_at: "2026-04-08T01:07:06.088Z",
    });

    expect(() => pauseTimer(newer.id, {}, {
      now: new Date("2026-04-08T01:20:00.000Z"),
      requestSource: "unit-test",
    })).not.toThrow();
  });

  test("repair fixes malformed resumed segments that restart before the intervening timer finished", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-repair-resume",
      name: "Repair Resume Tester",
      email: "repair-resume@example.test",
      status: "active",
      hourly_rate: 50,
    });
    const jobA = createEntityRecord("Job", { id: "job-repair-resume-a", title: "A", job_number: "JOB-RSA" });
    const jobB = createEntityRecord("Job", { id: "job-repair-resume-b", title: "B", job_number: "JOB-RSB" });

    const resumed = createEntityRecord("TimeEntry", {
      staff_id: staff.id,
      staff_name: staff.name,
      job_id: jobA.id,
      activity: "Labour",
      status: "active",
      clock_in: "2026-04-08T01:06:42.034Z",
      segments: [
        { started_at: "2026-04-08T01:06:42.034Z", ended_at: "2026-04-08T01:07:06.088Z" },
        { started_at: "2026-04-08T01:06:42.034Z" },
      ],
      updated_date: "2026-04-08T04:12:01.796Z",
    });

    createEntityRecord("TimeEntry", {
      staff_id: staff.id,
      staff_name: staff.name,
      job_id: jobB.id,
      activity: "Material handling",
      status: "completed",
      clock_in: "2026-04-08T01:07:06.088Z",
      clock_out: "2026-04-08T04:12:00.515Z",
      segments: [{ started_at: "2026-04-08T01:07:06.088Z", ended_at: "2026-04-08T04:12:00.515Z" }],
    });

    repairTimeTrackingData({
      requestSource: "unit-test",
      skipAudit: true,
      now: new Date("2026-04-08T04:20:00.000Z"),
    });

    const repaired = getEntityRecord("TimeEntry", resumed.id);
    expect(repaired?.segments).toHaveLength(2);
    expect(repaired?.segments?.[1]).toMatchObject({
      started_at: "2026-04-08T04:12:00.515Z",
    });

    expect(() => completeTimer(resumed.id, {}, {
      now: new Date("2026-04-08T04:30:00.000Z"),
      requestSource: "unit-test",
    })).not.toThrow();
  });

  test("completing a malformed resumed timer clamps the live segment to the latest valid staff boundary", () => {
    const staff = createEntityRecord("Staff", {
      id: "staff-complete-repair",
      name: "Complete Repair Tester",
      email: "complete-repair@example.test",
      status: "active",
      hourly_rate: 50,
    });
    const jobA = createEntityRecord("Job", { id: "job-complete-repair-a", title: "A", job_number: "JOB-CRA" });
    const jobB = createEntityRecord("Job", { id: "job-complete-repair-b", title: "B", job_number: "JOB-CRB" });

    const malformed = createEntityRecord("TimeEntry", {
      staff_id: staff.id,
      staff_name: staff.name,
      job_id: jobA.id,
      activity: "Labour",
      status: "active",
      clock_in: "2026-04-08T04:18:27.200Z",
      segments: [
        { started_at: "2026-04-08T04:18:27.200Z", ended_at: "2026-04-08T04:19:27.834Z" },
        { started_at: "2026-04-08T04:18:27.200Z" },
      ],
      updated_date: "2026-04-08T04:19:38.610Z",
    });

    createEntityRecord("TimeEntry", {
      staff_id: staff.id,
      staff_name: staff.name,
      job_id: jobB.id,
      activity: "Other Chargeable",
      status: "completed",
      clock_in: "2026-04-08T04:19:27.834Z",
      clock_out: "2026-04-08T04:19:36.351Z",
      segments: [{ started_at: "2026-04-08T04:19:27.834Z", ended_at: "2026-04-08T04:19:36.351Z" }],
    });

    const completed = completeTimer(malformed.id, {}, {
      now: new Date("2026-04-08T04:20:10.000Z"),
      requestSource: "unit-test",
    });

    expect(completed?.status).toBe("completed");
    expect(completed?.segments).toHaveLength(2);
    expect(completed?.segments?.[1]).toMatchObject({
      started_at: "2026-04-08T04:19:36.351Z",
      ended_at: "2026-04-08T04:20:10.000Z",
    });
  });
});
