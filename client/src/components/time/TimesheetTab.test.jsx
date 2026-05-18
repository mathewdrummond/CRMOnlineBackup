import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimesheetTab from "./TimesheetTab";

const mockTimeEntryFilter = vi.fn();
const mockTimeEntryDelete = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      TimeEntry: {
        filter: (...args) => mockTimeEntryFilter(...args),
        delete: (...args) => mockTimeEntryDelete(...args),
      },
    },
  },
}));

vi.mock("./PayPeriodPicker", () => ({
  default: function PayPeriodPickerMock({ onRangeChange }) {
    return (
      <button type="button" onClick={() => onRangeChange({ from: "2026-04-20", to: "2026-04-26" })}>
        Choose Test Period
      </button>
    );
  },
}));

describe("TimesheetTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("groups matching entries into a single visible row with combined hours", async () => {
    mockTimeEntryFilter.mockResolvedValue([
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
    ]);

    render(<TimesheetTab staff={[{ id: "staff-1", name: "Drummond, Mathew" }]} />);

    await userEvent.click(screen.getByRole("button", { name: "Choose Test Period" }));

    await waitFor(() => {
      expect(screen.getByText("0.12h")).toBeInTheDocument();
    });

    expect(screen.getByText("2 merged")).toBeInTheDocument();
    expect(screen.getAllByText("Ponsonby penthouse fit-out")).toHaveLength(1);
  });
});
