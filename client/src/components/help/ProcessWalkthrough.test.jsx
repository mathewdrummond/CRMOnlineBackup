import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProcessWalkthrough from "./ProcessWalkthrough";
import { getHelpRecording } from "@/lib/helpRecordings";

describe("ProcessWalkthrough", () => {
  test("renders app screenshots, captions, pause points, and controls", async () => {
    const user = userEvent.setup();
    render(<ProcessWalkthrough recording={getHelpRecording("import-mozaik-csv")} />);

    expect(screen.getByText("Import Mozaik CSV")).toBeInTheDocument();
    expect(screen.getByText(/Subtitles/)).toBeInTheDocument();
    expect(screen.getByAltText(/Import Mozaik CSV application walkthrough screenshot/i)).toBeInTheDocument();
    expect(screen.getByText(/walkthrough frame 1/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Import Mozaik CSV walkthrough frame 1/i)).toBeInTheDocument();
    expect(screen.getByText("Why this matters")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Next pause point/i }));

    expect(screen.getAllByText("2. Review imported items").length).toBeGreaterThan(0);
  });

  test("launches linked written guide and guided tour actions", async () => {
    const user = userEvent.setup();
    const onOpenArticle = vi.fn();
    const onStartTour = vi.fn();

    render(
      <ProcessWalkthrough
        recording={getHelpRecording("import-mozaik-csv")}
        onOpenArticle={onOpenArticle}
        onStartTour={onStartTour}
      />
    );

    await user.click(screen.getByRole("button", { name: /Open written guide/i }));
    await user.click(screen.getByRole("button", { name: /Start guided tour/i }));

    expect(onOpenArticle).toHaveBeenCalledWith("import-guide");
    expect(onStartTour).toHaveBeenCalledWith("import-mozaik-csv");
  });
});
