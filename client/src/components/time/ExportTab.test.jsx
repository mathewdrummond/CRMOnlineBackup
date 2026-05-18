import {
  aggregateDailyRecords,
  buildActivitySlipTsv,
  buildDailyHoursWorkbook,
  buildTimesheetTsv,
  formatMyobDate,
  getActivitySlipMissingFields,
  mapActivitySlipRecords,
  getTimesheetMissingFields,
  validateActivitySlipRecords,
  validateTimesheetRecords,
} from "./ExportTab";

describe("ExportTab helpers", () => {
  test("formats MYOB dates as DD/MM/YYYY", () => {
    expect(formatMyobDate("2026-04-03")).toBe("03/04/2026");
    expect(formatMyobDate("")).toBe("");
    expect(formatMyobDate("not-a-date")).toBe("");
  });

  test("buildActivitySlipTsv writes every repeated field on every row", () => {
    const output = buildActivitySlipTsv([
      {
        customer_name: "Sophia Ngata",
        first_name: "",
        employee_id: "EMP002",
        date: "2026-04-03",
        activity: "Labour",
        job_number: "JOB-0002",
        notes: "ggddf",
        units: 5.57,
      },
      {
        customer_name: "Sophia Ngata",
        first_name: "",
        employee_id: "EMP002",
        date: "2026-04-02",
        activity: "Labour",
        job_number: "JOB-0002",
        notes: "Pre-install site prep and check measure",
        units: 6,
      },
    ]);

    expect(output).toContain("Co./Last Name\tFirst Name\tCard ID\tDate\tActivity\tJob\tNotes\tUnits");
    expect(output).toContain("Sophia Ngata\t\tEMP002\t03/04/2026\tLabour\tJOB-0002\tggddf\t5.57");
    expect(output).toContain("Sophia Ngata\t\tEMP002\t02/04/2026\tLabour\tJOB-0002\tPre-install site prep and check measure\t6");
  });

  test("activity slip validation catches missing MYOB-required fields", () => {
    const record = {
      customer_name: "",
      employee_id: "",
      date: "",
      activity: "",
      job_number: "",
      units: "",
    };

    expect(getActivitySlipMissingFields(record)).toEqual([
      "Co./Last Name",
      "Card ID",
      "Date",
      "Activity",
      "Job",
      "Units",
    ]);
    expect(validateActivitySlipRecords([{ id: "1", ...record }]).valid).toBe(false);
  });

  test("mapActivitySlipRecords fills required fields from related staff and jobs", () => {
    const mapped = mapActivitySlipRecords(
      [
        {
          id: "time-1",
          staff_id: "staff-1",
          job_id: "job-1",
          date: "2026-04-03",
          hours: 5.57,
          operation: "Labour",
          notes: "ggddf",
        },
      ],
      [{ id: "staff-1", name: "Sophia Ngata", employee_id: "EMP002" }],
      [{ id: "job-1", job_number: "JOB-0002", company_name: "Sophia Ngata" }],
      [],
      []
    );

    expect(mapped).toEqual([
      expect.objectContaining({
        customer_name: "Sophia Ngata",
        employee_id: "EMP002",
        activity: "Labour",
        job_number: "JOB-0002",
        units: 5.57,
      }),
    ]);
    expect(validateActivitySlipRecords(mapped).valid).toBe(true);
  });

  test("timesheet validation catches required fields and preserves IDs", () => {
    const output = buildTimesheetTsv([
      {
        employee_last_name: "Brown",
        employee_first_name: "John",
        payroll_category: "Ordinary hours",
        job_number: "JOB-0001",
        customer_last_name: "",
        customer_first_name: "",
        notes: "Assembled wardrobe carcasses",
        date: "2026-04-01",
        units: 8,
        employee_id: "EMP001",
        employee_record_id: "REC-123",
        start_stop_time: "07:30-16:00",
        customer_card_id: "CUST-001",
        customer_record_id: "CR-01",
      },
    ]);

    expect(output).toContain("{}");
    expect(output).toContain("Brown\tJohn\tOrdinary hours\tJOB-0001");
    expect(output).toContain("\tEMP001\tREC-123\t07:30-16:00\tCUST-001\tCR-01");

    expect(getTimesheetMissingFields({
      employee_last_name: "",
      payroll_category: "",
      date: "",
      units: "",
      employee_id: "",
    })).toEqual([
      "Employee Co./Last Name",
      "Payroll Category",
      "Date",
      "Units",
      "Employee Card ID",
    ]);
    expect(validateTimesheetRecords([{ id: "x" }]).valid).toBe(false);
  });

  test("buildTimesheetTsv writes fully populated trimmed MYOB rows in the project column order", () => {
    const output = buildTimesheetTsv([
      {
        employee_last_name: "  Brown ",
        employee_first_name: " John  ",
        payroll_category: " Ordinary hours ",
        job_number: " JOB-0001 ",
        customer_last_name: "  Smith Construction ",
        customer_first_name: "  ",
        notes: "  Site install and cleanup  ",
        date: "2026-04-01",
        units: "7.50",
        employee_id: " EMP001 ",
        employee_record_id: " REC-123 ",
        start_stop_time: " 07:30-16:00 ",
        customer_card_id: " CUST-001 ",
        customer_record_id: " CR-01 ",
      },
      {
        employee_last_name: "Brown",
        employee_first_name: "John",
        payroll_category: "Ordinary hours",
        job_number: "JOB-0001",
        customer_last_name: "Smith Construction",
        customer_first_name: "",
        notes: "Second row repeats all MYOB-required values",
        date: "2026-04-02",
        units: 6,
        employee_id: "EMP001",
        employee_record_id: "REC-123",
        start_stop_time: "07:45-14:15",
        customer_card_id: "CUST-001",
        customer_record_id: "CR-01",
      },
    ]);

    const lines = output.split("\r\n");
    expect(lines[0]).toBe("{}");
    expect(lines[1]).toBe(
      "Employee Co./Last Name\tEmployee First Name\tPayroll Category\tJob\tCustomer Co./Last Name\tCustomer First Name\tNotes\tDate\tUnits\tEmployee Card ID\tEmployee Record ID\tStart/Stop Time\tCustomer Card ID\tCustomer Record ID"
    );
    expect(lines[2]).toBe(
      "Brown\tJohn\tOrdinary hours\tJOB-0001\tSmith Construction\t\tSite install and cleanup\t01/04/2026\t7.5\tEMP001\tREC-123\t07:30-16:00\tCUST-001\tCR-01"
    );
    expect(lines[3]).toBe(
      "Brown\tJohn\tOrdinary hours\tJOB-0001\tSmith Construction\t\tSecond row repeats all MYOB-required values\t02/04/2026\t6\tEMP001\tREC-123\t07:45-14:15\tCUST-001\tCR-01"
    );
  });

  test("timesheet validation rejects non-numeric units and invalid dates", () => {
    expect(getTimesheetMissingFields({
      employee_last_name: "Brown",
      payroll_category: "Ordinary hours",
      date: "not-a-date",
      units: "abc",
      employee_id: "EMP001",
    })).toEqual(["Date", "Units"]);

    expect(validateTimesheetRecords([
      {
        id: "bad-1",
        employee_last_name: "Brown",
        payroll_category: "Ordinary hours",
        date: "not-a-date",
        units: "abc",
        employee_id: "EMP001",
      },
    ])).toEqual({
      valid: false,
      errors: [
        expect.objectContaining({
          id: "bad-1",
          missingFields: ["Date", "Units"],
        }),
      ],
    });
  });

  test("aggregateDailyRecords uses completed clock-in time as the source of truth and applies lunch deduction", () => {
    const records = aggregateDailyRecords(
      [
        {
          staff_id: "staff-1",
          date: "2026-04-02",
          total_hours: 7,
          clock_in_time: "2026-04-02T07:30:00.000Z",
          clock_out_time: "2026-04-02T15:30:00.000Z",
        },
      ],
      [
        {
          id: "time-1",
          staff_id: "staff-1",
          staff_name: "John Brown",
          employee_id: "EMP001",
          employee_record_id: "ER-1",
          date: "2026-04-02",
          hours: 3,
          activity: "Labour",
          description: "Prep",
          job_id: "job-1",
          job_number: "JOB-001",
        },
      ],
      [{ id: "staff-1", name: "John Brown", employee_id: "EMP001", employee_record_id: "ER-1" }],
      [{ id: "job-1", job_number: "JOB-001", company_name: "Acme Joinery" }],
      [],
      [{ id: "company-1", name: "Acme Joinery", myob_card_id: "CARD-1", myob_record_id: "COMP-1" }]
    );

    expect(records).toHaveLength(1);
    expect(records[0].raw_units).toBe(7);
    expect(records[0].units).toBe(6.5);
    expect(records[0].employee_id).toBe("EMP001");
    expect(records[0].start_stop_time).toBeTruthy();
  });

  test("aggregateDailyRecords leaves job blank when a clocked day spans multiple jobs", () => {
    const records = aggregateDailyRecords(
      [
        {
          staff_id: "staff-1",
          date: "2026-04-03",
          total_hours: 8,
          clock_in_time: "2026-04-03T07:30:00.000Z",
          clock_out_time: "2026-04-03T16:00:00.000Z",
        },
      ],
      [
        {
          id: "time-1",
          staff_id: "staff-1",
          staff_name: "John Brown",
          date: "2026-04-03",
          hours: 4,
          job_number: "JOB-001",
        },
        {
          id: "time-2",
          staff_id: "staff-1",
          staff_name: "John Brown",
          date: "2026-04-03",
          hours: 4,
          job_number: "JOB-002",
        },
      ],
      [{ id: "staff-1", name: "John Brown", employee_id: "EMP001", employee_record_id: "ER-1" }],
      [],
      [],
      []
    );

    expect(records).toHaveLength(1);
    expect(records[0].job_number).toBe("");
  });

  test("aggregateDailyRecords still deducts lunch on Friday shifts longer than 5.5 hours", () => {
    const records = aggregateDailyRecords(
      [
        {
          staff_id: "staff-1",
          date: "2026-04-03",
          total_hours: 6,
          clock_in_time: "2026-04-03T07:30:00.000Z",
          clock_out_time: "2026-04-03T14:00:00.000Z",
        },
      ],
      [
        {
          id: "time-1",
          staff_id: "staff-1",
          staff_name: "John Brown",
          employee_id: "EMP001",
          employee_record_id: "ER-1",
          date: "2026-04-03",
          hours: 6,
          activity: "Labour",
          description: "Friday install prep",
          job_id: "job-1",
          job_number: "JOB-001",
        },
      ],
      [{ id: "staff-1", name: "John Brown", employee_id: "EMP001", employee_record_id: "ER-1" }],
      [{ id: "job-1", job_number: "JOB-001", company_name: "Acme Joinery" }],
      [],
      [{ id: "company-1", name: "Acme Joinery", myob_card_id: "CARD-1", myob_record_id: "COMP-1" }]
    );

    expect(records).toHaveLength(1);
    expect(records[0].raw_units).toBe(6);
    expect(records[0].units).toBe(5.5);
  });

  test("buildDailyHoursWorkbook generates totals by date and staff", async () => {
    const workbook = await buildDailyHoursWorkbook([
      { date: "2026-04-01", staff_name: "John Brown", units: 7 },
      { date: "2026-04-01", staff_name: "Jane Smith", units: 8 },
      { date: "2026-04-02", staff_name: "John Brown", units: 7.5 },
    ]);

    expect(workbook.sheetName).toBe("Daily Hours");
    expect(workbook.rows[0]).toEqual(["Date", "Jane Smith", "John Brown", "Daily Total"]);
    expect(workbook.rows[1]).toEqual(["01/04/2026", 8, 7, 15]);
    expect(workbook.rows[3]).toEqual(["TOTAL", 8, 14.5, 22.5]);
    expect(workbook.rowStyles[1]).toBe("header");
    expect(workbook.rowStyles[4]).toBe("summary");
  });
});
