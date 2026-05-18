import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkshopBoardPage from "./WorkshopBoardPage";

const updateJob = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Job: {
        list: vi.fn(async () => [
          { id: "job-1", quote_id: "quote-1", job_number: "JOB-0001", title: "Smith Kitchen", contact_name: "Alex Smith", status: "approved", row_version: 1 },
        ]),
        update: (...args) => updateJob(...args),
      },
      Quote: {
        list: vi.fn(async () => [{ id: "quote-1", quote_number: "QTE-0001", title: "Smith Kitchen Quote" }]),
      },
      JobOperation: {
        list: vi.fn(async () => []),
      },
    },
  },
}));

describe("WorkshopBoardPage", () => {
  beforeEach(() => {
    updateJob.mockReset();
    updateJob.mockResolvedValue({
      id: "job-1",
      quote_id: "quote-1",
      job_number: "JOB-0001",
      title: "Smith Kitchen",
      contact_name: "Alex Smith",
      status: "production",
      row_version: 2,
    });
  });

  test("updates job status when a card moves stages", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkshopBoardPage />
      </MemoryRouter>
    );

    const card = await screen.findByTestId("workshop-card-job-1");
    const targetStage = await screen.findByTestId("workshop-stage-in_production");
    const data = {};
    const dataTransfer = {
      setData: (type, value) => {
        data[type] = value;
      },
      getData: (type) => data[type],
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(targetStage, { dataTransfer });

    await waitFor(() => {
      expect(updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
        status: "production",
        workshop_stage: "in_production",
      }));
    });
    expect(await screen.findByText("Smith Kitchen moved to In Production.")).toBeInTheDocument();
  });
});

