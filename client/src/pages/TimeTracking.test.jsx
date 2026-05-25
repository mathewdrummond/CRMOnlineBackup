import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import TimeTracking from "./TimeTracking";
import { crmApi } from "@/api/localApiClient";

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Staff: { filter: vi.fn() },
      Job: { list: vi.fn() },
      JobOperation: { list: vi.fn() },
      Quote: { list: vi.fn() },
      QuoteItem: { list: vi.fn() },
      SiteMeasure: { list: vi.fn() },
      Attachment: { list: vi.fn() },
      TimeEntry: {
        filter: vi.fn(),
        list: vi.fn(),
      },
      ClockIn: { list: vi.fn() },
    },
  },
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", role: "admin" },
    navigateToLogin: vi.fn(),
  }),
}));

vi.mock("@/lib/ModuleContext", () => ({
  useModules: () => ({
    isModuleEnabled: () => true,
  }),
}));

vi.mock("../components/time/ClockInTab", () => ({
  default: function MockClockInTab({ view }) {
    return <div data-testid="clock-in-tab">{view}</div>;
  },
}));

vi.mock("../components/time/TimesheetTab", () => ({
  default: function MockTimesheetTab() {
    return <div data-testid="timesheet-tab" />;
  },
}));

vi.mock("../components/time/ExportTab", () => ({
  default: function MockExportTab() {
    return <div data-testid="export-tab" />;
  },
}));

vi.mock("../components/time/ProductionHandoverPack", () => ({
  default: function MockProductionHandoverPack() {
    return <div data-testid="handover-tab" />;
  },
}));

vi.mock("../components/time/ReviewQueueTab", () => ({
  default: function MockReviewQueueTab() {
    return <div data-testid="review-tab" />;
  },
}));

describe("TimeTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crmApi.entities.Staff.filter.mockResolvedValue([]);
    crmApi.entities.Job.list.mockResolvedValue([]);
    crmApi.entities.JobOperation.list.mockResolvedValue([]);
    crmApi.entities.Quote.list.mockResolvedValue([]);
    crmApi.entities.QuoteItem.list.mockResolvedValue([]);
    crmApi.entities.SiteMeasure.list.mockResolvedValue([]);
    crmApi.entities.Attachment.list.mockResolvedValue([]);
    crmApi.entities.TimeEntry.filter.mockResolvedValue([]);
    crmApi.entities.TimeEntry.list.mockResolvedValue([]);
    crmApi.entities.ClockIn.list.mockResolvedValue([]);
  });

  test("opens the CRM timeclock on the Today dashboard tab by default", async () => {
    render(<TimeTracking />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("data-state", "active");
    });

    expect(await screen.findByTestId("clock-in-tab")).toHaveTextContent("dashboard");
  });

  test("maps legacy clock-in routes to the Time Entries management tab", async () => {
    render(<TimeTracking initialTab="clockin" />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Time Entries" })).toHaveAttribute("data-state", "active");
    });

    expect(screen.getByTestId("clock-in-tab")).toHaveTextContent("manage");
  });
});
