import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportTab from "./ExportTab";

const mockTimeEntryFilter = vi.fn();
const mockTimeEntryUpdate = vi.fn();
const mockClockInList = vi.fn();
const mockExportHistoryList = vi.fn();
const mockExportHistoryCreate = vi.fn();
const mockContactList = vi.fn();
const mockCompanyList = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      TimeEntry: {
        filter: (...args) => mockTimeEntryFilter(...args),
        update: (...args) => mockTimeEntryUpdate(...args),
      },
      ClockIn: {
        list: (...args) => mockClockInList(...args),
      },
      ExportHistory: {
        list: (...args) => mockExportHistoryList(...args),
        create: (...args) => mockExportHistoryCreate(...args),
      },
      Contact: {
        list: (...args) => mockContactList(...args),
      },
      Company: {
        list: (...args) => mockCompanyList(...args),
      },
    },
  },
}));

vi.mock("@/lib/ModuleContext", () => ({
  useModules: () => ({
    isModuleEnabled: () => true,
  }),
}));

vi.mock("./PayPeriodPicker", () => ({
  default: function PayPeriodPickerMock({ onRangeChange }) {
    return (
      <button type="button" onClick={() => onRangeChange({ from: "2026-04-01", to: "2026-04-07" })}>
        Choose Test Period
      </button>
    );
  },
}));

describe("ExportTab integration", () => {
  if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      value: () => false,
      writable: true,
      configurable: true,
    });
  }

  if (!HTMLElement.prototype.setPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }

  if (!HTMLElement.prototype.releasePointerCapture) {
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }

  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }

  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      value: () => "blob:test",
      writable: true,
      configurable: true,
    });
  }

  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }

  const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockClockInList.mockResolvedValue([]);
    mockExportHistoryList.mockResolvedValue([]);
    mockContactList.mockResolvedValue([]);
    mockCompanyList.mockResolvedValue([]);
    mockTimeEntryUpdate.mockResolvedValue({});
    mockExportHistoryCreate.mockResolvedValue({});
  });

  afterAll(() => {
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    anchorClickSpy.mockRestore();
  });

  test("exports a fully populated MYOB activity slip file and records export history", async () => {
    mockTimeEntryFilter.mockResolvedValue([
      {
        id: "time-1",
        staff_id: "staff-1",
        job_id: "job-1",
        date: "2026-04-03",
        hours: 5.57,
        operation: "Labour",
        notes: "ggddf",
        exported: false,
      },
      {
        id: "time-2",
        staff_id: "staff-1",
        job_id: "job-1",
        date: "2026-04-02",
        hours: 6,
        activity: "Labour",
        notes: "Pre-install site prep and check measure",
        exported: false,
      },
    ]);

    render(
      <ExportTab
        user={{ email: "admin@example.test" }}
        staff={[{ id: "staff-1", name: "Sophia Ngata", employee_id: "EMP002" }]}
        jobs={[{ id: "job-1", job_number: "JOB-0002", company_name: "Sophia Ngata" }]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose Test Period" }));
    await screen.findByText("Pending Activity Slip Rows");

    await userEvent.click(screen.getByRole("button", { name: /Download 2 Activity Slip Rows/i }));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    expect(createObjectUrlSpy.mock.calls[0][0]).toBeInstanceOf(Blob);

    expect(mockTimeEntryUpdate).toHaveBeenCalledTimes(2);
    expect(mockExportHistoryCreate).toHaveBeenCalledTimes(2);
    expect(anchorClickSpy).toHaveBeenCalled();
  });

  test("blocks export and shows a clear validation error when required MYOB fields are missing", async () => {
    mockTimeEntryFilter.mockResolvedValue([
      {
        id: "time-bad",
        staff_id: "staff-missing",
        job_id: "job-missing",
        date: "2026-04-03",
        hours: 4,
        notes: "Missing fields",
        exported: false,
      },
    ]);

    render(
      <ExportTab
        user={{ email: "admin@example.test" }}
        staff={[]}
        jobs={[]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose Test Period" }));
    await screen.findByText("Pending Activity Slip Rows");

    await userEvent.click(screen.getByRole("button", { name: /Download 1 Activity Slip Row/i }));

    expect(await screen.findByText("Export Validation Failed")).toBeInTheDocument();
    expect(screen.getByText(/Activity slip export stopped/i)).toBeInTheDocument();
    expect(createObjectUrlSpy).not.toHaveBeenCalled();
    expect(mockTimeEntryUpdate).not.toHaveBeenCalled();
    expect(mockExportHistoryCreate).not.toHaveBeenCalled();
  });

  test("groups matching activity slip rows for export but still updates every underlying time entry", async () => {
    mockTimeEntryFilter.mockResolvedValue([
      {
        id: "time-1",
        staff_id: "staff-1",
        job_id: "job-1",
        date: "2026-04-03",
        hours: 0.1,
        activity: "Labour",
        notes: "",
        exported: false,
      },
      {
        id: "time-2",
        staff_id: "staff-1",
        job_id: "job-1",
        date: "2026-04-03",
        hours: 0.02,
        activity: "Labour",
        notes: "",
        exported: false,
      },
    ]);

    render(
      <ExportTab
        user={{ email: "admin@example.test" }}
        staff={[{ id: "staff-1", name: "Drummond, Mathew", employee_id: "EMP004" }]}
        jobs={[{ id: "job-1", job_number: "JOB-0001", company_name: "Harbour Homes", title: "Ponsonby penthouse fit-out" }]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose Test Period" }));
    await screen.findByText("Pending Activity Slip Rows");
    await screen.findByText("2 merged");

    await userEvent.click(screen.getByRole("button", { name: /Download 1 Activity Slip Row/i }));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    expect(mockTimeEntryUpdate).toHaveBeenCalledTimes(2);
    expect(mockExportHistoryCreate).toHaveBeenCalledTimes(1);
  });

  test("jumps to the latest pending activity slip week when the chosen period is empty", async () => {
    mockTimeEntryFilter.mockResolvedValue([
      {
        id: "time-outside-range",
        staff_id: "staff-1",
        job_id: "job-1",
        date: "2026-03-30",
        hours: 4,
        activity: "Labour",
        notes: "Recent pending work",
        exported: false,
      },
    ]);

    render(
      <ExportTab
        user={{ email: "admin@example.test" }}
        staff={[{ id: "staff-1", name: "Sophia Ngata", employee_id: "EMP002" }]}
        jobs={[{ id: "job-1", job_number: "JOB-0002", company_name: "Sophia Ngata" }]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose Test Period" }));

    expect(await screen.findByText("Showing Latest Pending Activity Slips")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download 1 Activity Slip Row/i })).toBeInTheDocument();
  });

  test("exports valid MYOB timesheet rows from clock-in attendance data", async () => {
    mockTimeEntryFilter.mockResolvedValue([
      {
        id: "time-1",
        staff_id: "staff-1",
        staff_name: "John Brown",
        employee_id: "EMP001",
        employee_record_id: "ER-1",
        date: "2026-04-02",
        hours: 3,
        activity: "Labour",
        description: "Prep and assemble",
        job_id: "job-1",
        job_number: "JOB-001",
      },
    ]);
    mockClockInList.mockResolvedValue([
      {
        id: "clock-1",
        staff_id: "staff-1",
        date: "2026-04-02",
        total_hours: 7,
        clock_in_time: "2026-04-02T07:30:00.000Z",
        clock_out_time: "2026-04-02T15:30:00.000Z",
      },
    ]);
    mockCompanyList.mockResolvedValue([
      { id: "company-1", name: "Acme Joinery", myob_card_id: "CARD-1", myob_record_id: "COMP-1" },
    ]);

    render(
      <ExportTab
        user={{ email: "admin@example.test" }}
        staff={[{ id: "staff-1", name: "John Brown", employee_id: "EMP001", employee_record_id: "ER-1" }]}
        jobs={[{ id: "job-1", job_number: "JOB-001", company_id: "company-1", company_name: "Acme Joinery" }]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose Test Period" }));

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByText("Timesheets (.txt)"));

    await screen.findByText("Timesheet Rows");
    await screen.findByText("All visible timesheet rows currently meet the required MYOB fields.");

    await userEvent.click(screen.getByRole("button", { name: /Download 1 Timesheet Row/i }));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    expect(createObjectUrlSpy.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(mockTimeEntryUpdate).not.toHaveBeenCalled();
    expect(mockExportHistoryCreate).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalled();
  });
});
