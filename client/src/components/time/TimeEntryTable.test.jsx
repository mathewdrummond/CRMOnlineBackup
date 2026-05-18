import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeEntryTable from "./TimeEntryTable";

describe("TimeEntryTable", () => {
  test("edits a completed time entry and saves the updated values", async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn();

    render(
      <TimeEntryTable
        entries={[
          {
            id: "time-1",
            staff_id: "staff-1",
            staff_name: "Jamie Worker",
            job_id: "job-1",
            job_number: "JOB-0001",
            job_name: "Kitchen install",
            activity: "Labour",
            description: "Original note",
            date: "2026-04-04",
            hours: 4,
            exported: false,
          },
        ]}
        staff={[{ id: "staff-1", name: "Jamie Worker", status: "active" }]}
        jobs={[{ id: "job-1", job_number: "JOB-0001", title: "Kitchen install", status: "planning" }]}
        onEdit={onEdit}
        onVoid={onDelete}
        isAdmin
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /edit time entry for jamie worker/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Finish Time"));
    await userEvent.type(within(dialog).getByLabelText("Finish Time"), "14:00");
    await userEvent.clear(within(dialog).getByLabelText("Notes"));
    await userEvent.type(within(dialog).getByLabelText("Notes"), "Updated install note");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith("time-1", expect.objectContaining({
        hours: 6.5,
        description: "Updated install note",
        notes: "Updated install note",
      }));
    });
  }, 10000);

  test("shows validation errors instead of saving incomplete time entries", async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);

    render(
      <TimeEntryTable
        entries={[
          {
            id: "time-2",
            staff_id: "staff-1",
            staff_name: "Richard Installer",
            job_id: "job-1",
            job_number: "JOB-0002",
            job_name: "Wardrobe",
            activity: "Labour",
            description: "Install",
            date: "2026-04-04",
            hours: 3,
            exported: false,
          },
        ]}
        staff={[{ id: "staff-1", name: "Richard Installer", status: "active" }]}
        jobs={[{ id: "job-1", job_number: "JOB-0002", title: "Wardrobe", status: "planning" }]}
        onEdit={onEdit}
        onVoid={vi.fn()}
        isAdmin
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /edit time entry for richard installer/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Start Time"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Staff member, date, start time, finish time, and activity are required.")).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });

  test("shows segment history for a paused multi-segment timer and keeps it read-only", async () => {
    render(
      <TimeEntryTable
        entries={[
          {
            id: "time-3",
            staff_id: "staff-1",
            staff_name: "Alex Maker",
            job_id: "job-1",
            job_number: "JOB-0003",
            job_name: "Reception desk",
            activity: "Labour",
            description: "Bench assembly",
            status: "paused",
            total_minutes: 135,
            exported: false,
            segments: [
              {
                started_at: "2026-04-04T08:00:00.000Z",
                ended_at: "2026-04-04T09:30:00.000Z",
                duration_minutes: 90,
              },
              {
                started_at: "2026-04-04T10:15:00.000Z",
                ended_at: "2026-04-04T11:00:00.000Z",
                duration_minutes: 45,
              },
            ],
          },
        ]}
        staff={[{ id: "staff-1", name: "Alex Maker", status: "active" }]}
        jobs={[{ id: "job-1", job_number: "JOB-0003", title: "Reception desk", status: "planning" }]}
        onEdit={vi.fn()}
        onVoid={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /edit time entry for alex maker/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /view time entry details for alex maker/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Paused")).toBeInTheDocument();
    expect(within(dialog).getByText("2 segments")).toBeInTheDocument();
    expect(within(dialog).getByText("#1")).toBeInTheDocument();
    expect(within(dialog).getByText("#2")).toBeInTheDocument();
    expect(within(dialog).getByText("90 min")).toBeInTheDocument();
    expect(within(dialog).getByText("45 min")).toBeInTheDocument();
  });
});
