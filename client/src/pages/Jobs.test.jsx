import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import Jobs from "./Jobs";

const mockList = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Job: { list: (...args) => mockList("Job", ...args) },
      Contact: { list: (...args) => mockList("Contact", ...args) },
    },
  },
}));

vi.mock("../components/AddressAutocompleteInput", () => ({
  default: function MockAddressAutocompleteInput({ value, onChange }) {
    return <input aria-label="Site Address" value={value} onChange={(event) => onChange(event.target.value)} />;
  },
}));

function renderJobs(initialEntry = "/jobs") {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/jobs" element={<Jobs />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockImplementation((entity) => {
      if (entity === "Job") {
        return Promise.resolve([
          { id: "job-1", job_number: "JOB-0001", title: "Kitchen fit-out", status: "production", contact_name: "Ella Bennett", company_name: "", quoted_value: 1000, due_date: "2026-04-12" },
          { id: "job-2", job_number: "JOB-0002", title: "Wardrobe install", status: "planning", contact_name: "Noah Kumar", company_name: "", quoted_value: 500, due_date: "2026-04-15" },
        ]);
      }

      if (entity === "Contact") {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });
  });

  test("applies the status query filter from the URL", async () => {
    renderJobs("/jobs?status=production");

    await waitFor(() => {
      expect(screen.getByText("Kitchen fit-out")).toBeInTheDocument();
    });

    expect(screen.queryByText("Wardrobe install")).not.toBeInTheDocument();
    expect(screen.getByText("Kitchen fit-out")).toBeInTheDocument();
  });

  test("shows a retryable error message when jobs fail to load", async () => {
    mockList.mockRejectedValueOnce(new Error("Jobs API unavailable"));

    renderJobs();

    await waitFor(() => {
      expect(screen.getByText("Jobs API unavailable")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
