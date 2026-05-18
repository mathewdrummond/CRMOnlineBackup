import {
  getJobOperationalSummary,
  getQuoteOperationalSummary,
  getUpcomingInstallJobs,
  isActiveJob,
  isOpenQuote,
} from "./crmOpsInsights";

describe("crmOpsInsights", () => {
  test("flags jobs that need scheduling when active tasks have no dates", () => {
    const summary = getJobOperationalSummary(
      { id: "job-1", status: "production", due_date: "2026-04-20" },
      [
        { id: "op-1", job_id: "job-1", status: "ready", task_name: "Manufacture", workflow_phase: "manufacturing", start_date: "" },
      ],
      new Date("2026-04-05T00:00:00.000Z")
    );

    expect(summary.health).toEqual(
      expect.objectContaining({ label: "Needs scheduling", color: "red" })
    );
  });

  test("flags install risk when install is close and manufacturing remains", () => {
    const summary = getJobOperationalSummary(
      { id: "job-2", status: "approved", install_date: "2026-04-10", install_end_date: "2026-04-12", due_date: "2026-04-12" },
      [
        { id: "op-1", job_id: "job-2", status: "in_progress", workflow_phase: "manufacturing", operation: "assembly", start_date: "2026-04-07" },
        { id: "op-2", job_id: "job-2", status: "ready", workflow_phase: "installation", operation: "install", start_date: "2026-04-10", end_date: "2026-04-12" },
      ],
      new Date("2026-04-05T00:00:00.000Z")
    );

    expect(summary.health.label).toBe("Install risk");
    expect(summary.installStartDate).toBe("2026-04-10");
    expect(summary.installEndDate).toBe("2026-04-12");
    expect(summary.installSpanDays).toBe(3);
  });

  test("marks old awaiting-confirmation quotes for follow up", () => {
    const summary = getQuoteOperationalSummary(
      {
        status: "awaiting_confirmation",
        created_date: "2026-03-01T10:00:00.000Z",
        valid_until: "2026-04-30",
        total: 12500,
      },
      new Date("2026-04-05T00:00:00.000Z")
    );

    expect(summary.health).toEqual(
      expect.objectContaining({ label: "Follow up", color: "red" })
    );
  });

  test("identifies upcoming installs within the requested horizon", () => {
    const installs = getUpcomingInstallJobs(
      [
        { id: "job-1", status: "approved", install_date: "2026-04-08" },
        { id: "job-2", status: "planning", install_date: "2026-05-20" },
      ],
      [],
      new Date("2026-04-05T00:00:00.000Z"),
      14
    );

    expect(installs).toHaveLength(1);
    expect(installs[0].job.id).toBe("job-1");
  });

  test("active job helper ignores completed jobs", () => {
    expect(isActiveJob({ status: "production" })).toBe(true);
    expect(isActiveJob({ status: "complete" })).toBe(false);
  });

  test("archived quotes are recoverable records, not active quote work", () => {
    const summary = getQuoteOperationalSummary({ status: "archived" });

    expect(summary.health).toEqual(expect.objectContaining({ label: "Archived", color: "slate" }));
    expect(isOpenQuote({ status: "archived" })).toBe(false);
  });
});
