import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ClockInWidget from "./ClockInWidget";
import { crmApi } from "@/api/localApiClient";

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      ClockIn: {
        filter: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  },
}));

function renderWithQueryClient(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("ClockInWidget", () => {
  beforeEach(() => {
    crmApi.entities.ClockIn.filter.mockReset();
    crmApi.entities.ClockIn.create.mockReset();
    crmApi.entities.ClockIn.update.mockReset();
    crmApi.entities.ClockIn.delete.mockReset();
  });

  test("shows one Today activity row per staff member", async () => {
    const now = new Date();
    crmApi.entities.ClockIn.filter.mockResolvedValue([
      {
        id: "richard-1",
        staff_id: "staff-1",
        staff_name: "Richard Constance",
        clock_in_time: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
        clock_out_time: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        total_hours: 0.03,
      },
      {
        id: "richard-2",
        staff_id: "staff-1",
        staff_name: "Richard Constance",
        clock_in_time: now.toISOString(),
      },
      {
        id: "jamie-1",
        staff_id: "staff-2",
        staff_name: "Jamie McAnulty",
        clock_in_time: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
        clock_out_time: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
        total_hours: 0.02,
      },
      {
        id: "jamie-2",
        staff_id: "staff-2",
        staff_name: "Jamie McAnulty",
        clock_in_time: now.toISOString(),
      },
    ]);

    renderWithQueryClient(
      <ClockInWidget
        staff={[
          { id: "staff-1", name: "Richard Constance", status: "active" },
          { id: "staff-2", name: "Jamie McAnulty", status: "active" },
        ]}
      />
    );

    const heading = await screen.findByText("Today's Activity");
    const activitySection = heading.parentElement;

    await waitFor(() => {
      expect(within(activitySection).getAllByText("Richard Constance")).toHaveLength(1);
      expect(within(activitySection).getAllByText("Jamie McAnulty")).toHaveLength(1);
    });

    expect(within(activitySection).getAllByText(/total today:/i)).toHaveLength(2);
    expect(within(activitySection).getAllByText("Active")).toHaveLength(2);
    expect(within(activitySection).queryByLabelText(/delete/i)).not.toBeInTheDocument();
  });
});
