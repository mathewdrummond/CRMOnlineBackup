import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Schedule from "./Schedule";

const mockNavigate = vi.fn();
const mockInstallPlannerEntries = vi.fn();
const mockInstallPlannerSave = vi.fn();
const mockInstallPlannerDelete = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    installPlanner: {
      getEntries: (...args) => mockInstallPlannerEntries(...args),
      saveEntry: (...args) => mockInstallPlannerSave(...args),
      deleteEntry: (...args) => mockInstallPlannerDelete(...args),
    },
  },
}));

vi.mock("@/components/AddressAutocompleteInput", () => ({
  default: function MockAddressAutocompleteInput({ value, onChange, inputId, placeholder }) {
    return (
      <input
        id={inputId}
        aria-label="Location"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  },
}));

function renderSchedule() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Schedule />
    </MemoryRouter>
  );
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey, deltaDays) {
  const nextDate = new Date(`${dateKey}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + deltaDays);
  return formatDateKey(nextDate);
}

function buildInstallPlannerEntries() {
  const todayKey = formatDateKey(new Date());
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const laterKey = shiftDateKey(todayKey, 2);

  return {
    staff: [
      { id: "staff-1", name: "Jamie Installer", status: "active" },
      { id: "staff-2", name: "Jordan Driver", status: "active" },
    ],
    lanes: [
      { id: "install-staff-staff-1", label: "Jamie Installer", staff_id: "staff-1", staff_name: "Jamie Installer", color: "emerald", lane_type: "install_staff" },
      { id: "install-staff-staff-2", label: "Jordan Driver", staff_id: "staff-2", staff_name: "Jordan Driver", color: "amber", lane_type: "install_staff" },
      { id: "install-unassigned", label: "Unassigned installs", staff_id: "", staff_name: "", color: "slate", lane_type: "install_queue" },
    ],
    jobs: [
      {
        id: "job-1",
        job_number: "JOB-0001",
        title: "Penthouse fit-out",
        contact_name: "Aroha Reid",
        site_address: "12 Harbour View",
        status: "production",
        install_date: todayKey,
        install_end_date: tomorrowKey,
      },
      {
        id: "job-2",
        job_number: "JOB-0002",
        title: "Studio install",
        contact_name: "Noah Kumar",
        site_address: "4 King Street",
        status: "ready_to_install",
        install_date: "",
        install_end_date: "",
      },
      {
        id: "job-3",
        job_number: "JOB-0003",
        title: "Showroom install",
        contact_name: "Priya Sharma",
        site_address: "9 K Road",
        status: "approved",
        install_date: laterKey,
        install_end_date: laterKey,
      },
    ],
    operations: [
      {
        id: "jobop-penthouse-install",
        job_id: "job-1",
        job_number: "JOB-0001",
        job_title: "Penthouse fit-out",
        operation: "install",
        workflow_phase: "installation",
        task_name: "Main install",
        status: "scheduled",
        start_date: todayKey,
        end_date: tomorrowKey,
        notes: "Crane booking confirmed",
        assigned_to: "Jamie Installer",
        assigned_staff_ids: ["staff-1"],
      },
      {
        id: "jobop-delivery-shadow",
        job_id: "job-1",
        job_number: "JOB-0001",
        job_title: "Penthouse fit-out",
        operation: "delivery",
        workflow_phase: "installation",
        task_name: "Delivery window",
        status: "scheduled",
        start_date: todayKey,
        end_date: todayKey,
        notes: "Should stay off the install planner",
        assigned_to: "Jordan Driver",
        assigned_staff_ids: ["staff-2"],
      },
    ],
  };
}

function buildPlannerResponse(payload) {
  const startDate = payload.start_date;
  const endDate = payload.end_date || payload.start_date;
  const operationId = payload.operation_id || `install-op-${payload.job_id}`;
  const jobs = {
    "job-1": {
      id: "job-1",
      job_number: "JOB-0001",
      title: "Penthouse fit-out",
      contact_name: "Aroha Reid",
      site_address: "12 Harbour View",
      status: "production",
    },
    "job-2": {
      id: "job-2",
      job_number: "JOB-0002",
      title: "Studio install",
      contact_name: "Noah Kumar",
      site_address: "4 King Street",
      status: "ready_to_install",
    },
    "job-3": {
      id: "job-3",
      job_number: "JOB-0003",
      title: "Showroom install",
      contact_name: "Priya Sharma",
      site_address: "9 K Road",
      status: "approved",
    },
  };

  return {
    jobs: [
      {
        ...jobs[payload.job_id],
        install_date: startDate,
        install_end_date: endDate,
      },
    ],
    operation: {
      id: operationId,
      job_id: payload.job_id,
      job_number: jobs[payload.job_id]?.job_number || "",
      job_title: jobs[payload.job_id]?.title || "",
      task_name: payload.install_label || "Installation",
      operation: "install",
      workflow_phase: "installation",
      status: payload.status || "scheduled",
      start_date: startDate,
      end_date: endDate,
      notes: payload.notes || "",
      schedule_manual_override: true,
    },
    operations: [
      {
        id: operationId,
        job_id: payload.job_id,
        job_number: jobs[payload.job_id]?.job_number || "",
        job_title: jobs[payload.job_id]?.title || "",
        task_name: payload.install_label || "Installation",
        operation: "install",
        workflow_phase: "installation",
        status: payload.status || "scheduled",
        start_date: startDate,
        end_date: endDate,
        notes: payload.notes || "",
        schedule_manual_override: true,
      },
    ],
    staff: [
      { id: "staff-1", name: "Jamie Installer", status: "active" },
      { id: "staff-2", name: "Jordan Driver", status: "active" },
    ],
    lanes: [
      { id: "install-staff-staff-1", label: "Jamie Installer", staff_id: "staff-1", staff_name: "Jamie Installer", color: "emerald", lane_type: "install_staff" },
      { id: "install-staff-staff-2", label: "Jordan Driver", staff_id: "staff-2", staff_name: "Jordan Driver", color: "amber", lane_type: "install_staff" },
      { id: "install-unassigned", label: "Unassigned installs", staff_id: "", staff_name: "", color: "slate", lane_type: "install_queue" },
    ],
  };
}

describe("Schedule", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstallPlannerEntries.mockResolvedValue(buildInstallPlannerEntries());
    mockInstallPlannerSave.mockImplementation((payload) => Promise.resolve(buildPlannerResponse(payload)));
    mockInstallPlannerDelete.mockImplementation((payload) =>
      Promise.resolve({
        jobs: [
          {
            id: payload.job_id,
            install_date: "",
            install_end_date: "",
          },
        ],
        operation: null,
        operations: [],
        staff: [
          { id: "staff-1", name: "Jamie Installer", status: "active" },
          { id: "staff-2", name: "Jordan Driver", status: "active" },
        ],
        lanes: [
          { id: "install-staff-staff-1", label: "Jamie Installer", staff_id: "staff-1", staff_name: "Jamie Installer", color: "emerald", lane_type: "install_staff" },
          { id: "install-staff-staff-2", label: "Jordan Driver", staff_id: "staff-2", staff_name: "Jordan Driver", color: "amber", lane_type: "install_staff" },
          { id: "install-unassigned", label: "Unassigned installs", staff_id: "", staff_name: "", color: "slate", lane_type: "install_queue" },
        ],
      })
    );
  });

  test("renders install-only timeline items without staff or workflow-lane dependencies", async () => {
    renderSchedule();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Install Planner" })).toBeInTheDocument();
    });

    expect(screen.getAllByText("Installation timeline").length).toBeGreaterThan(0);
    expect(screen.getByText("Schedule an install")).toBeInTheDocument();
    expect(screen.getByText("Pick the job")).toBeInTheDocument();
    expect(screen.getByText("Place the dates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced estimate rules" })).toBeInTheDocument();
    expect(screen.getAllByText(/JOB-0001/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ready To Plan (1)")).toBeInTheDocument();
    expect(screen.getByText("Studio install")).toBeInTheDocument();
    expect(screen.getAllByText(/Showroom install/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jamie Installer").length).toBeGreaterThan(0);
    expect(screen.queryByText("Delivery window")).not.toBeInTheDocument();
    expect(mockInstallPlannerEntries).toHaveBeenCalledTimes(1);
  });

  test("creates an install plan from a day cell through the install planner save API", async () => {
    renderSchedule();
    const todayKey = formatDateKey(new Date());

    await waitFor(() => {
      expect(screen.getByTestId(`schedule-cell-install-planner-${todayKey}`)).toBeInTheDocument();
    });

    fireEvent.doubleClick(screen.getByTestId(`schedule-cell-install-planner-${todayKey}`));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Create Install Plan" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Job" }));
    fireEvent.click(await screen.findByText("JOB-0002 · Studio install"));

    fireEvent.change(screen.getByLabelText("Install Label"), {
      target: { value: "Stage 1 install" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Install" }));

    await waitFor(() => {
      expect(mockInstallPlannerSave).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: "job-2",
          install_label: "Stage 1 install",
          install_type: "install",
          duration_hours: 10.5,
          priority: "high",
          status: "scheduled",
          start_date: todayKey,
          end_date: todayKey,
          notes: "",
        })
      );
    });
  });

  test("moves a scheduled install directly from the calendar and preserves its span", async () => {
    renderSchedule();
    const todayKey = formatDateKey(new Date());
    const tomorrowKey = shiftDateKey(todayKey, 1);
    const followingKey = shiftDateKey(todayKey, 2);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-item-move-install-op-jobop-penthouse-install")).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByTestId("schedule-item-move-install-op-jobop-penthouse-install"), { key: "ArrowRight" });

    await waitFor(() => {
      expect(mockInstallPlannerSave).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: "job-1",
          operation_id: "jobop-penthouse-install",
          start_date: tomorrowKey,
          end_date: followingKey,
          manually_locked: true,
        })
      );
    });
  });

  test("resizes a job-date-only install into a multi-day range from the calendar", async () => {
    renderSchedule();
    const todayKey = formatDateKey(new Date());
    const jobOnlyDate = shiftDateKey(todayKey, 2);
    const extendedEndDate = shiftDateKey(jobOnlyDate, 1);

    await waitFor(() => {
      expect(screen.getByTestId("schedule-item-resize-end-install-job-job-3")).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByTestId("schedule-item-resize-end-install-job-job-3"), { key: "ArrowRight" });

    await waitFor(() => {
      expect(mockInstallPlannerSave).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: "job-3",
          install_label: "Installation",
          status: "scheduled",
          start_date: jobOnlyDate,
          end_date: extendedEndDate,
          manually_locked: true,
        })
      );
    });
  });

  test("opens the linked job from an install item editor", async () => {
    renderSchedule();

    await waitFor(() => {
      expect(screen.getByTestId("schedule-item-install-op-jobop-penthouse-install")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Penthouse fit-out"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Edit Install Task" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Job" }));

    expect(mockNavigate).toHaveBeenCalledWith("/jobs/job-1");
  });
});
