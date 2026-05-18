import { describe, expect, test } from "vitest";
import { groupActivitySlipExportRecords, groupTimesheetDisplayEntries } from "./timeGrouping";

describe("time grouping helpers", () => {
  test("groups matching timesheet display rows and sums hours", () => {
    const grouped = groupTimesheetDisplayEntries(
      [
        {
          id: "time-1",
          staff_id: "staff-1",
          staff_name: "Drummond, Mathew",
          date: "2026-04-20",
          job_id: "job-1",
          job_number: "JOB-0001",
          job_title: "Ponsonby penthouse fit-out",
          activity: "Labour",
          description: "",
          exported: false,
          hours: 0.1,
          total_cost: 0,
        },
        {
          id: "time-2",
          staff_id: "staff-1",
          staff_name: "Drummond, Mathew",
          date: "2026-04-20",
          job_id: "job-1",
          job_number: "JOB-0001",
          job_title: "Ponsonby penthouse fit-out",
          activity: "Labour",
          description: "",
          exported: false,
          hours: 0.02,
          total_cost: 0,
        },
      ],
      {
        getActivityLabel: (entry) => entry.activity,
        getJobLabel: (entry) => entry.job_title,
      }
    );

    expect(grouped).toEqual([
      expect.objectContaining({
        id: "time-1",
        entry_count: 2,
        hours: 0.12,
        source_ids: ["time-1", "time-2"],
        activity_label: "Labour",
        job_label: "Ponsonby penthouse fit-out",
      }),
    ]);
  });

  test("keeps activity slip exports separate when notes differ", () => {
    const grouped = groupActivitySlipExportRecords([
      {
        id: "time-1",
        source_id: "time-1",
        source_type: "TimeEntry",
        staff_name: "Drummond, Mathew",
        employee_id: "EMP004",
        customer_name: "Harbour Homes",
        customer: "Harbour Homes",
        first_name: "",
        date: "2026-04-20",
        activity: "Labour",
        job_number: "JOB-0001",
        job_name: "Ponsonby penthouse fit-out",
        notes: "First note",
        units: 0.1,
      },
      {
        id: "time-2",
        source_id: "time-2",
        source_type: "TimeEntry",
        staff_name: "Drummond, Mathew",
        employee_id: "EMP004",
        customer_name: "Harbour Homes",
        customer: "Harbour Homes",
        first_name: "",
        date: "2026-04-20",
        activity: "Labour",
        job_number: "JOB-0001",
        job_name: "Ponsonby penthouse fit-out",
        notes: "Second note",
        units: 0.02,
      },
    ]);

    expect(grouped).toHaveLength(2);
  });

  test("groups matching activity slip export rows and sums units", () => {
    const grouped = groupActivitySlipExportRecords([
      {
        id: "time-1",
        source_id: "time-1",
        source_type: "TimeEntry",
        staff_name: "Drummond, Mathew",
        employee_id: "EMP004",
        customer_name: "Harbour Homes",
        customer: "Harbour Homes",
        first_name: "",
        date: "2026-04-20",
        activity: "Labour",
        job_number: "JOB-0001",
        job_name: "Ponsonby penthouse fit-out",
        notes: "",
        units: 0.1,
      },
      {
        id: "time-2",
        source_id: "time-2",
        source_type: "TimeEntry",
        staff_name: "Drummond, Mathew",
        employee_id: "EMP004",
        customer_name: "Harbour Homes",
        customer: "Harbour Homes",
        first_name: "",
        date: "2026-04-20",
        activity: "Labour",
        job_number: "JOB-0001",
        job_name: "Ponsonby penthouse fit-out",
        notes: "",
        units: 0.02,
      },
    ]);

    expect(grouped).toEqual([
      expect.objectContaining({
        source_type: "TimeEntryGroup",
        source_count: 2,
        source_ids: ["time-1", "time-2"],
        units: 0.12,
      }),
    ]);
  });
});
