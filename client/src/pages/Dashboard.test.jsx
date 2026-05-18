import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Dashboard from "./Dashboard";

const mockGetOverview = vi.fn();

function pad(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateTime(daysOffset = 0, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour, 0, 0, 0);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00:00`;
}

function getLocalDate(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    dashboard: {
      getOverview: (...args) => mockGetOverview(...args),
    },
  },
}));

vi.mock("@/lib/ModuleContext", () => ({
  useModules: () => ({
    isModuleEnabled: () => true,
  }),
}));

function renderDashboard() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Dashboard />
    </MemoryRouter>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverview.mockResolvedValue({
      leads: [
        { id: "lead-1", title: "Kitchen enquiry", stage: "new_enquiry", assigned_to: "Bruce", expected_close: getLocalDate(-3) },
      ],
      jobs: [
        { id: "job-1", job_number: "JOB-0001", title: "Kitchen fit-out", status: "ready_to_install", updated_date: getLocalDateTime(0, 12), due_date: getLocalDate(-2), install_date: getLocalDate(5), site_address: "12 Queen Street", contact_name: "Jamie Client" },
      ],
      quotes: [
        { id: "quote-1", quote_number: "QTE-0001", title: "Kitchen quote", status: "awaiting_bruce", updated_date: getLocalDateTime(-1, 9), contact_name: "", site_address: "" },
      ],
      leadTasks: [{ id: "task-1", status: "pending", assigned_to: "Bruce" }],
      jobOperations: [{ id: "op-1", status: "pending", operation: "install", workflow_phase: "installation", task_name: "Main install", job_id: "job-1" }],
      staff: [{ id: "staff-1", name: "Jamie", status: "active", employee_id: "EMP-1" }],
      timeEntries: [
        { id: "time-1", status: "completed", exported: false, staff_name: "Jamie", date: getLocalDate(-2), job_number: "JOB-0001", activity: "Labour", hours: 6 },
      ],
      exportHistory: [{ id: "export-1", export_type: "activity_slips", exported_at: getLocalDateTime(-1, 8), exported_by: "admin@example.test" }],
      notes: [{ id: "note-1", related_type: "job", related_id: "job-1", content: "Cabinets arrived today", created_date: getLocalDateTime(0, 13) }],
    });
  });

  test("renders the operational dashboard summary sections", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    });

    expect(screen.getByText("Open Enquiries")).toBeInTheDocument();
    expect(screen.getAllByText("Active Jobs").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs Planning")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs Attention" })).toBeInTheDocument();
    expect(screen.getByText("Jobs by Status")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("MYOB Export History")).toBeInTheDocument();
    expect(screen.getByText("Unexported Timesheets")).toBeInTheDocument();
    expect(screen.getByText("Timeclock Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Total Hours This Week")).toBeInTheDocument();
    expect(screen.getByText("Hours by Job")).toBeInTheDocument();
    expect(screen.getByText("Recent Time Entries")).toBeInTheDocument();
    expect(screen.queryByText("Stock Snapshot")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("JOB-0001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jamie").length).toBeGreaterThan(0);
    expect(screen.getByText("Cabinets arrived today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open enquiries" })).toHaveAttribute("href", "/leads");
    expect(screen.getAllByRole("link", { name: "Open jobs" }).some((link) => link.getAttribute("href") === "/jobs")).toBe(true);
    expect(screen.getByRole("link", { name: "Open Ready to Install jobs" })).toHaveAttribute("href", "/jobs?status=ready_to_install");
  });

  test("filters recent activity and exports by the selected dashboard activity window", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Cabinets arrived today")).toBeInTheDocument();
    });

    expect(screen.getAllByText("admin@example.test").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Cabinets arrived today")).toBeInTheDocument();
    expect(screen.queryAllByText("admin@example.test")).toHaveLength(0);
  });
});
