import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ImportWizard from "./ImportWizard";

describe("ImportWizard", () => {
  test("renders the shared guided import flow with plain-language steps", () => {
    render(
      <ImportWizard
        title="Supplier price list import"
        fileInfo={{ name: "supplier-prices.csv", size: 1200, row_count: 3 }}
        status="Needs review"
        rows={[{ id: "row-1" }]}
        warnings={["Missing cost on one row"]}
      />
    );

    expect(screen.getAllByText("Supplier price list import").length).toBeGreaterThan(0);
    expect(screen.getByText("1. Upload")).toBeInTheDocument();
    expect(screen.getByText("4. Review")).toBeInTheDocument();
    expect(screen.getByText("Review Imported Items")).toBeInTheDocument();
    expect(screen.getByText(/A cost is missing/i)).toBeInTheDocument();
  });

  test("validates file type before handing files to callers", async () => {
    const onFile = vi.fn();

    const { container } = render(<ImportWizard onFile={onFile} acceptedExtensions={[".csv"]} />);

    const input = container.querySelector("input[type='file']");
    fireEvent.change(input, {
      target: {
        files: [new File(["bad"], "drawing.pdf", { type: "application/pdf" })],
      },
    });

    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Use one of these file types: \.csv/i)).toBeInTheDocument();
  });
});
