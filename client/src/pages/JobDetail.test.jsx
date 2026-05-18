import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobDetail from "./JobDetail";

const mockList = vi.fn();
const mockFilter = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Job: {
        list: (...args) => mockList("Job", ...args),
        update: (...args) => mockUpdate("Job", ...args),
      },
      JobOperation: {
        list: (...args) => mockList("JobOperation", ...args),
        update: (...args) => mockUpdate("JobOperation", ...args),
        create: (...args) => mockCreate("JobOperation", ...args),
      },
      WorkflowRoleMapping: { list: (...args) => mockList("WorkflowRoleMapping", ...args) },
      TimeEntry: { filter: (...args) => mockFilter("TimeEntry", ...args) },
      Note: { filter: (...args) => mockFilter("Note", ...args), create: (...args) => mockCreate("Note", ...args) },
      Attachment: { filter: (...args) => mockFilter("Attachment", ...args) },
    },
    filesystem: { create: (...args) => mockCreate("filesystem", ...args) },
  },
}));

vi.mock("@/lib/ModuleContext", () => ({
  useModules: () => ({
    isModuleEnabled: () => true,
  }),
}));

function renderJobDetail() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/jobs/job-1"]}>
      <Routes>
        <Route path="/jobs/:id" element={<JobDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("JobDetail waterfall forecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockList.mockImplementation((entity) => {
      switch (entity) {
        case "Job":
          return Promise.resolve([
            {
              id: "job-1",
              job_number: "JOB-0001",
              title: "Ponsonby penthouse fit-out",
              status: "production",
              contact_name: "Sophia Ngata",
              site_address: "22 Franklin Road, Auckland",
              quoted_value: 100000,
              due_date: "2026-04-25",
              install_date: "2026-04-24",
            },
          ]);
        case "WorkflowRoleMapping":
          return Promise.resolve([
            { id: "role-management", role_key: "management", label: "Management", color: "blue", default_staff_names: ["Mathew", "Bruce"] },
            { id: "role-joiner", role_key: "joiner", label: "Joiner", color: "amber", default_staff_names: ["Jamie", "Richard"] },
            { id: "role-install", role_key: "install", label: "Install", color: "emerald", default_staff_names: ["Mathew", "Jamie", "Richard"] },
          ]);
        case "JobOperation":
          return Promise.resolve([
            {
              id: "other-joiner-booking",
              job_id: "job-2",
              task_name: "Factory backlog",
              operation: "assembly",
              workflow_phase: "manufacturing",
              workflow_role: "joiner",
              assigned_role: "joiner",
              status: "ready",
              estimated_hours: 21,
              start_date: "2026-04-06",
            },
            {
              id: "job-1-design",
              job_id: "job-1",
              task_name: "Finish design pack",
              operation: "design",
              workflow_phase: "design_pricing",
              workflow_role: "management",
              assigned_role: "management",
              status: "ready",
              estimated_hours: 8,
              sort_order: 1,
            },
            {
              id: "job-1-manufacture",
              job_id: "job-1",
              task_name: "Manufacture units",
              operation: "assembly",
              workflow_phase: "manufacturing",
              workflow_role: "joiner",
              assigned_role: "joiner",
              status: "pending",
              estimated_hours: 16,
              dependency_task_ids: ["job-1-design"],
              sort_order: 2,
            },
          ]);
        default:
          return Promise.resolve([]);
      }
    });

    mockFilter.mockResolvedValue([]);
    mockUpdate.mockResolvedValue({});
    mockCreate.mockResolvedValue({});
  });

  test("renders the delivery forecast tab with a projected completion date and task rows", async () => {
    renderJobDetail();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Ponsonby penthouse fit-out" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("tab", { name: "Delivery Forecast" }));

    await waitFor(() => {
      expect(screen.getByTestId("job-waterfall-view")).toBeInTheDocument();
    });

    expect(screen.getByText("Projected Completion")).toBeInTheDocument();
    expect(screen.getAllByText("Finish design pack").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manufacture units").length).toBeGreaterThan(0);
    expect(screen.getByTestId("job-waterfall-row-job-1-manufacture")).toBeInTheDocument();
    expect(screen.getByText(/next joiner slot/i)).toBeInTheDocument();
  });
});
