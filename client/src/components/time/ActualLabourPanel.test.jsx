import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActualLabourPanel from "./ActualLabourPanel";

const linkedEntry = {
  id: "time-1",
  staff_id: "staff-1",
  staff_name: "Bruce",
  job_id: "job-1",
  date: "2026-05-01",
  activity: "Install kitchen",
  hours: 2.5,
  hourly_rate: 80,
  status: "completed",
};

describe("ActualLabourPanel", () => {
  test("renders actual labour from timeclock entries and opens review", async () => {
    const user = userEvent.setup();
    render(
      <ActualLabourPanel
        quoteId="quote-1"
        jobIds={["job-1"]}
        jobs={[{ id: "job-1", job_number: "JOB-001", title: "Kitchen" }]}
        entries={[
          linkedEntry,
          { ...linkedEntry, id: "time-2", job_id: "", quote_id: "", activity: "Cut panels", hours: 1 },
        ]}
        operations={[{ estimated_hours: 3 }]}
        labourSellAllowance={350}
        onUpdateTimeEntry={vi.fn()}
      />
    );

    expect(screen.getByText("Actual Labour")).toBeInTheDocument();
    expect(screen.getByText("Uses timeclock")).toBeInTheDocument();
    expect(screen.getByText("1 unassigned")).toBeInTheDocument();
    expect(screen.getAllByText("2.5h").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Review Time Entries/i }));

    expect(screen.getByText("Install kitchen")).toBeInTheDocument();
    expect(screen.getByText("Cut panels")).toBeInTheDocument();
  });

  test("assigns unassigned time to the current quote/job", async () => {
    const user = userEvent.setup();
    const onUpdateTimeEntry = vi.fn().mockResolvedValue(undefined);

    render(
      <ActualLabourPanel
        quoteId="quote-1"
        jobIds={["job-1"]}
        jobs={[{ id: "job-1", job_number: "JOB-001", title: "Kitchen" }]}
        entries={[{ ...linkedEntry, id: "unassigned", job_id: "", quote_id: "", activity: "Site measure", hours: 1 }]}
        onUpdateTimeEntry={onUpdateTimeEntry}
      />
    );

    await user.click(screen.getByRole("button", { name: /Review Time Entries/i }));
    const row = screen.getByText("Site measure").closest("div");
    await user.click(within(row.parentElement).getByRole("button", { name: "Assign" }));

    await waitFor(() => {
      expect(onUpdateTimeEntry).toHaveBeenCalledWith("unassigned", expect.objectContaining({
        quote_id: "quote-1",
        job_id: "job-1",
        labour_category: "Site Measure",
      }));
    });
  });

  test("can exclude and review a time entry without deleting the timeclock record", async () => {
    const user = userEvent.setup();
    const onUpdateTimeEntry = vi.fn().mockResolvedValue(undefined);

    render(
      <ActualLabourPanel
        quoteId="quote-1"
        jobIds={["job-1"]}
        jobs={[{ id: "job-1", job_number: "JOB-001", title: "Kitchen" }]}
        entries={[linkedEntry]}
        onUpdateTimeEntry={onUpdateTimeEntry}
      />
    );

    await user.click(screen.getByRole("button", { name: /Review Time Entries/i }));
    await user.click(screen.getByRole("button", { name: "Exclude" }));
    await user.click(screen.getByRole("button", { name: "Reviewed" }));

    expect(onUpdateTimeEntry).toHaveBeenCalledWith("time-1", expect.objectContaining({
      exclude_from_costing: true,
    }));
    expect(onUpdateTimeEntry).toHaveBeenCalledWith("time-1", expect.objectContaining({
      costing_reviewed: true,
    }));
  });
});
