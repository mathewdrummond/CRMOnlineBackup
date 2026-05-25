import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkshopBoard from "./WorkshopBoard";

window.HTMLElement.prototype.scrollIntoView ||= vi.fn();
window.HTMLElement.prototype.hasPointerCapture ||= vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture ||= vi.fn();

function openVisibilityFilter() {
  fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "Enter" });
}

function renderBoard(props = {}) {
  const onMoveStage = vi.fn();
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WorkshopBoard
        jobs={[
          {
            id: "job-1",
            quote_id: "quote-1",
            job_number: "JOB-0001",
            title: "Smith Kitchen",
            contact_name: "Alex Smith",
            status: "approved",
            handoff_drawings_ready: false,
          },
          {
            id: "job-2",
            quote_id: "quote-2",
            job_number: "JOB-0002",
            title: "Wardrobe Fitout",
            contact_name: "Morgan Lee",
            status: "production",
          },
          {
            id: "job-3",
            quote_id: "quote-3",
            job_number: "JOB-0003",
            title: "Dormant Vanity",
            contact_name: "Taylor Brown",
            status: "inactive",
          },
        ]}
        quotes={[
          { id: "quote-1", quote_number: "QTE-0001" },
          { id: "quote-2", quote_number: "QTE-0002" },
          { id: "quote-3", quote_number: "QTE-0003" },
        ]}
        jobOperations={[
          { id: "op-1", job_id: "job-1", status: "on_hold" },
        ]}
        onMoveStage={onMoveStage}
        {...props}
      />
    </MemoryRouter>
  );
  return { onMoveStage };
}

describe("WorkshopBoard", () => {
  test("renders jobs in workshop stages with warnings", () => {
    renderBoard();

    const readyStage = screen.getByTestId("workshop-stage-ready_for_production");
    expect(within(readyStage).getByText("Smith Kitchen")).toBeInTheDocument();
    expect(within(readyStage).getByText("Drawings not confirmed")).toBeInTheDocument();
    expect(within(readyStage).getByText("1 blocked task")).toBeInTheDocument();

    const productionStage = screen.getByTestId("workshop-stage-in_production");
    expect(within(productionStage).getByText("Wardrobe Fitout")).toBeInTheDocument();
    expect(screen.queryByText("Dormant Vanity")).not.toBeInTheDocument();
  });

  test("filters inactive jobs through the visibility filter", async () => {
    renderBoard();

    openVisibilityFilter();
    fireEvent.click(await screen.findByText("Active + inactive"));
    expect(screen.getByText("Dormant Vanity")).toBeInTheDocument();
    expect(screen.getByText("Smith Kitchen")).toBeInTheDocument();

    openVisibilityFilter();
    fireEvent.click(await screen.findByText("Inactive only"));
    expect(screen.getByText("Dormant Vanity")).toBeInTheDocument();
    expect(screen.queryByText("Smith Kitchen")).not.toBeInTheDocument();
    expect(screen.queryByText("Wardrobe Fitout")).not.toBeInTheDocument();
  });

  test("filters cards by search text", () => {
    renderBoard();

    fireEvent.change(screen.getByPlaceholderText("Search job, client, or number"), {
      target: { value: "wardrobe" },
    });

    expect(screen.queryByText("Smith Kitchen")).not.toBeInTheDocument();
    expect(screen.getByText("Wardrobe Fitout")).toBeInTheDocument();
  });

  test("moves a card by drag and drop", () => {
    const { onMoveStage } = renderBoard();
    const card = screen.getByTestId("workshop-card-job-1");
    const targetStage = screen.getByTestId("workshop-stage-in_production");
    const data = {};
    const dataTransfer = {
      setData: (type, value) => {
        data[type] = value;
      },
      getData: (type) => data[type],
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(targetStage, { dataTransfer });
    fireEvent.drop(targetStage, { dataTransfer });

    expect(onMoveStage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1", title: "Smith Kitchen" }),
      "in_production",
      "production"
    );
  });
});

