import {
  buildDashboardSummary,
  getDashboardSubtitle,
  getUnexportedTimesheetRows,
} from "./dashboardHelpers";

describe("dashboardHelpers", () => {
  test("buildDashboardSummary returns practical operational counts and attention items", () => {
    const summary = buildDashboardSummary({
      leads: [
        {
          id: "lead-1",
          title: "Kitchen enquiry",
          stage: "new_enquiry",
          assigned_to: "Bruce",
          expected_close: "2026-04-01",
          updated_date: "2026-04-03T10:00:00.000Z",
        },
      ],
      jobs: [
        {
          id: "job-1",
          job_number: "JOB-0001",
          title: "Kitchen fit-out",
          status: "production",
          due_date: "2026-04-02",
          updated_date: "2026-04-03T12:00:00.000Z",
          contact_name: "",
          site_address: "",
        },
      ],
      quotes: [
        {
          id: "quote-1",
          quote_number: "QTE-0001",
          title: "Kitchen quote",
          status: "awaiting_bruce",
          updated_date: "2026-04-03T09:00:00.000Z",
          contact_name: "",
          site_address: "",
        },
      ],
      leadTasks: [{ id: "task-1", status: "pending", assigned_to: "Bruce" }],
      jobOperations: [{ id: "op-1", job_id: "job-1", status: "scheduled", assigned_to: "Bruce" }],
      timeEntries: [
        {
          id: "time-1",
          status: "completed",
          exported: false,
          hours: 5.5,
          staff_name: "Jamie",
          date: "2026-04-02",
          job_number: "JOB-0001",
          activity: "Labour",
        },
      ],
      exportHistory: [
        {
          id: "export-1",
          export_type: "activity_slips",
          exported_at: "2026-04-03T08:00:00.000Z",
          exported_by: "admin@example.test",
        },
      ],
      notes: [
        {
          id: "note-1",
          related_type: "job",
          related_id: "job-1",
          content: "Cabinets arrived",
          created_date: "2026-04-03T13:00:00.000Z",
        },
      ],
      ownerFilter: "bruce",
      today: new Date("2026-04-04T09:00:00.000Z"),
    });

    expect(summary.openEnquiries).toHaveLength(1);
    expect(summary.activeJobs).toHaveLength(1);
    expect(summary.unexportedTimeEntries).toHaveLength(1);
    expect(summary.pendingTasksTotal).toBe(3);
    expect(summary.jobStatusSummary).toEqual([
      expect.objectContaining({ value: "production", count: 1 }),
    ]);
    expect(summary.recentActivity[0]).toEqual(
      expect.objectContaining({
        title: "JOB-0001",
        kind: "Note",
      })
    );
    expect(summary.needsAttention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ badge: "Overdue", href: "/leads/lead-1" }),
        expect.objectContaining({ badge: "Missing info", href: "/jobs/job-1" }),
      ])
    );
  });

  test("subtitle and unexported timesheet rows are derived consistently", () => {
    const subtitle = getDashboardSubtitle({
      openEnquiries: [{ id: "lead-1" }, { id: "lead-2" }],
      activeJobs: [{ id: "job-1" }],
    });
    expect(subtitle).toBe("2 open enquiries · 1 active jobs");

    expect(
      getUnexportedTimesheetRows([
        {
          id: "time-1",
          staff_name: "Jamie",
          job_number: "JOB-0001",
          activity: "Labour",
          hours: 6,
          date: "2026-04-01",
        },
      ])
    ).toEqual([
      {
        id: "time-1",
        title: "Jamie",
        subtitle: "JOB-0001 · Labour",
        date: "2026-04-01",
        hours: 6,
        href: "/time-tracking",
      },
    ]);
  });

  test("recent activity prefers notes and exports without crowding out the feed", () => {
    const summary = buildDashboardSummary({
      jobs: [
        {
          id: "job-1",
          job_number: "JOB-0001",
          title: "Kitchen fit-out",
          status: "production",
          updated_date: "2026-04-03T12:00:00.000Z",
        },
        {
          id: "job-2",
          job_number: "JOB-0002",
          title: "Wardrobe install",
          status: "planning",
          updated_date: "2026-04-03T11:00:00.000Z",
        },
        {
          id: "job-3",
          job_number: "JOB-0003",
          title: "Laundry joinery",
          status: "planning",
          updated_date: "2026-04-03T10:00:00.000Z",
        },
      ],
      exportHistory: [
        { id: "export-1", export_type: "activity_slips", exported_at: "2026-04-03T12:30:00.000Z", exported_by: "admin@example.test" },
        { id: "export-2", export_type: "timesheets", exported_at: "2026-04-03T09:30:00.000Z", exported_by: "admin@example.test" },
        { id: "export-3", export_type: "daily_hours", exported_at: "2026-04-03T08:30:00.000Z", exported_by: "admin@example.test" },
      ],
      notes: [
        { id: "note-1", related_type: "job", related_id: "job-1", content: "Cabinets arrived", created_date: "2026-04-03T13:00:00.000Z" },
        { id: "note-2", related_type: "job", related_id: "job-2", content: "Install booked with client", created_date: "2026-04-03T11:30:00.000Z" },
      ],
      today: new Date("2026-04-03T15:00:00.000Z"),
    });

    expect(summary.recentActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "note-note-1", kind: "Note", title: "JOB-0001" }),
        expect.objectContaining({ id: "export-export-1", kind: "Export" }),
      ])
    );
    expect(summary.recentActivity).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "job-job-1", kind: "Job" }),
        expect.objectContaining({ id: "job-job-2", kind: "Job" }),
      ])
    );
    expect(summary.recentActivity.filter((item) => item.kind === "Export")).toHaveLength(2);
  });

  test("activity window filters recent activity and export history", () => {
    const summary = buildDashboardSummary({
      jobs: [
        {
          id: "job-1",
          job_number: "JOB-0001",
          title: "Kitchen fit-out",
          status: "production",
          updated_date: "2026-04-04T11:00:00",
        },
        {
          id: "job-2",
          job_number: "JOB-0002",
          title: "Wardrobe install",
          status: "planning",
          updated_date: "2026-04-02T11:00:00",
        },
      ],
      exportHistory: [
        { id: "export-1", export_type: "activity_slips", exported_at: "2026-04-04T08:00:00", exported_by: "admin@example.test" },
        { id: "export-2", export_type: "timesheets", exported_at: "2026-04-02T08:00:00", exported_by: "admin@example.test" },
      ],
      notes: [
        { id: "note-1", related_type: "job", related_id: "job-1", content: "Today note", created_date: "2026-04-04T12:00:00" },
        { id: "note-2", related_type: "job", related_id: "job-2", content: "Older note", created_date: "2026-04-02T12:00:00" },
      ],
      activityWindowDays: 1,
      today: new Date("2026-04-04T15:00:00"),
    });

    expect(summary.recentActivity).toEqual([
      expect.objectContaining({ id: "note-note-1", subtitle: "Today note" }),
      expect.objectContaining({ id: "export-export-1", kind: "Export" }),
    ]);
    expect(summary.exportHistory).toEqual([
      expect.objectContaining({ id: "export-1" }),
    ]);
  });
});
