import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeEntryForm from "./TimeEntryForm";

describe("TimeEntryForm", () => {
  test("starts operational time without requiring a workflow task selection", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);

    render(
      <TimeEntryForm
        staff={[{ id: "staff-1", name: "Jamie McAnulty", status: "active" }]}
        jobs={[{ id: "job-1", job_number: "JOB-001", title: "Workshop job", status: "active" }]}
        jobOperations={[{ id: "op-1", job_id: "job-1", title: "Assembly", workflow_phase: "manufacturing" }]}
        entries={[]}
        activeTimers={[]}
        clockIns={[{ staff_id: "staff-1", clock_in_time: "2026-04-08T19:00:00.000Z", clock_out_time: "" }]}
        timersLoaded
        onStart={onStart}
        onAddManual={vi.fn()}
      />
    );

    expect(screen.queryByText(/workflow stage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/task/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /jamie mcanulty/i }));
    await userEvent.click(screen.getByRole("button", { name: /shop work nc/i }));
    await userEvent.type(screen.getByLabelText("Notes"), "Bench cleanup");
    await userEvent.click(screen.getByRole("button", { name: /start timer/i }));

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
        staff_id: "staff-1",
        activity: "Shop Work NC",
        description: "Bench cleanup",
        job_operation_id: "",
        job_operation_label: "",
        workflow_phase: "",
      }));
    });
  });
});
