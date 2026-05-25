import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClockInTab from "./ClockInTab";

const mockList = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      TimeEntry: {
        list: (...args) => mockList(...args),
        update: (...args) => mockUpdate(...args),
        create: (...args) => mockCreate(...args),
        delete: (...args) => mockDelete(...args),
      },
    },
  },
}));

vi.mock("./ClockInWidget", () => ({
  default: function MockClockInWidget() {
    return <div data-testid="clockin-widget" />;
  },
}));

vi.mock("./TimeEntryForm", () => ({
  default: function MockTimeEntryForm() {
    return <div data-testid="time-entry-form" />;
  },
}));

vi.mock("./TimeEntryTable", () => ({
  default: function MockTimeEntryTable() {
    return <div data-testid="time-entry-table" />;
  },
}));

describe("ClockInTab", () => {
  afterEach(() => {
    cleanup();
    mockList.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
    mockDelete.mockReset();
  });

  test("keeps paused timers visible and resumable after completing the active timer", async () => {
    const entries = [
      {
        id: "timer-a",
        staff_id: "staff-1",
        staff_name: "McAnulty, Jamie",
        job_id: "job-a",
        job_number: "JOB-A",
        job_name: "Kitchen A",
        activity: "Labour",
        status: "paused",
        total_minutes: 60,
        paused_at: "2026-04-08T09:00:00.000Z",
        segments: [
          {
            started_at: "2026-04-08T08:00:00.000Z",
            ended_at: "2026-04-08T09:00:00.000Z",
            duration_minutes: 60,
          },
        ],
      },
      {
        id: "timer-b",
        staff_id: "staff-1",
        staff_name: "McAnulty, Jamie",
        job_id: "job-b",
        job_number: "JOB-B",
        job_name: "Kitchen B",
        activity: "Labour",
        status: "active",
        segments: [
          {
            started_at: "2026-04-08T09:05:00.000Z",
          },
        ],
      },
    ];

    mockList.mockImplementation(() => Promise.resolve(entries.map((entry) => ({ ...entry }))));
    mockUpdate.mockImplementation(async (id, payload) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) {
        throw new Error("Missing entry");
      }

      const current = entries[index];
      const next = {
        ...current,
        ...payload,
      };

      if (payload.status === "completed") {
        next.status = "completed";
        next.clock_out = "2026-04-08T10:00:00.000Z";
        next.segments = [
          {
            started_at: "2026-04-08T09:05:00.000Z",
            ended_at: "2026-04-08T10:00:00.000Z",
            duration_minutes: 55,
          },
        ];
      }

      if (payload.status === "active" && id === "timer-a") {
        next.status = "active";
        next.paused_at = "";
        next.segments = [
          ...current.segments,
          {
            started_at: "2026-04-08T10:01:00.000Z",
          },
        ];
      }

      entries[index] = next;
      return { ...next };
    });

    render(
      <ClockInTab
        staff={[{ id: "staff-1", name: "McAnulty, Jamie", status: "active" }]}
        jobs={[
          { id: "job-a", job_number: "JOB-A", title: "Kitchen A" },
          { id: "job-b", job_number: "JOB-B", title: "Kitchen B" },
        ]}
        jobOperations={[]}
      />
    );

    await screen.findAllByText("JOB-B · Kitchen B");

    await userEvent.click(screen.getAllByRole("button", { name: "Complete" })[0]);

    await waitFor(() => {
      expect(screen.queryAllByText("JOB-B · Kitchen B")).toHaveLength(0);
    });
    expect(screen.getAllByText("JOB-A · Kitchen A").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Active shift")).toBeInTheDocument();
      expect(screen.getAllByText("JOB-A · Kitchen A").length).toBeGreaterThan(0);
    });
  });

  test("paused timers remain resumable after a reload and active completion", async () => {
    const entries = [
      {
        id: "timer-a",
        staff_id: "staff-1",
        staff_name: "McAnulty, Jamie",
        job_id: "job-a",
        job_number: "JOB-A",
        job_name: "Kitchen A",
        activity: "Labour",
        status: "paused",
        total_minutes: 60,
        paused_at: "2026-04-08T09:00:00.000Z",
        segments: [
          {
            started_at: "2026-04-08T08:00:00.000Z",
            ended_at: "2026-04-08T09:00:00.000Z",
            duration_minutes: 60,
          },
        ],
      },
      {
        id: "timer-b",
        staff_id: "staff-1",
        staff_name: "McAnulty, Jamie",
        job_id: "job-b",
        job_number: "JOB-B",
        job_name: "Kitchen B",
        activity: "Labour",
        status: "active",
        segments: [
          {
            started_at: "2026-04-08T09:05:00.000Z",
          },
        ],
      },
    ];

    mockList.mockImplementation(() => Promise.resolve(entries.map((entry) => ({ ...entry }))));
    mockUpdate.mockImplementation(async (id, payload) => {
      const index = entries.findIndex((entry) => entry.id === id);
      const current = entries[index];
      const next = {
        ...current,
        ...payload,
      };

      if (payload.status === "completed") {
        next.status = "completed";
        next.clock_out = "2026-04-08T10:00:00.000Z";
        next.segments = [
          {
            started_at: current.segments[0].started_at,
            ended_at: "2026-04-08T10:00:00.000Z",
            duration_minutes: 55,
          },
        ];
      }

      if (payload.status === "active" && id === "timer-a") {
        next.status = "active";
        next.paused_at = "";
        next.segments = [
          ...current.segments,
          {
            started_at: "2026-04-08T10:01:00.000Z",
          },
        ];
      }

      entries[index] = next;
      return { ...next };
    });

    const props = {
      staff: [{ id: "staff-1", name: "McAnulty, Jamie", status: "active" }],
      jobs: [
        { id: "job-a", job_number: "JOB-A", title: "Kitchen A" },
        { id: "job-b", job_number: "JOB-B", title: "Kitchen B" },
      ],
      jobOperations: [],
    };

    const firstRender = render(<ClockInTab {...props} />);

    await screen.findAllByText("JOB-B · Kitchen B");
    firstRender.unmount();

    render(<ClockInTab {...props} />);

    await screen.findAllByText("JOB-B · Kitchen B");
    await userEvent.click(screen.getAllByRole("button", { name: "Complete" })[0]);

    await waitFor(() => {
      expect(screen.queryAllByText("JOB-B · Kitchen B")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));

    await waitFor(() => {
      expect(screen.getByText("Active shift")).toBeInTheDocument();
      expect(screen.getAllByText("JOB-A · Kitchen A").length).toBeGreaterThan(0);
    });
  });

  test("separates the CRM dashboard from the time entry management view", async () => {
    mockList.mockResolvedValue([
      {
        id: "timer-active",
        staff_id: "staff-1",
        staff_name: "McAnulty, Jamie",
        job_id: "job-a",
        job_number: "JOB-A",
        job_name: "Kitchen A",
        activity: "Labour",
        status: "active",
        segments: [{ started_at: "2026-04-08T09:05:00.000Z" }],
      },
    ]);

    const props = {
      staff: [{ id: "staff-1", name: "McAnulty, Jamie", status: "active" }],
      jobs: [{ id: "job-a", job_number: "JOB-A", title: "Kitchen A" }],
      jobOperations: [],
      user: { role: "admin" },
    };

    const { rerender } = render(<ClockInTab {...props} view="dashboard" />);

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active Shifts" })).toBeInTheDocument();
    expect(screen.getAllByText("JOB-A · Kitchen A").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("time-entry-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("time-entry-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("clockin-widget")).not.toBeInTheDocument();

    rerender(<ClockInTab {...props} view="manage" />);

    expect(await screen.findByRole("heading", { name: "Time Entries" })).toBeInTheDocument();
    expect(screen.getByTestId("time-entry-form")).toBeInTheDocument();
    expect(screen.getByTestId("time-entry-table")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Active Shifts" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("clockin-widget")).not.toBeInTheDocument();
  });
});
