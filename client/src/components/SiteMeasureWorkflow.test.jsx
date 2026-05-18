import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SiteMeasureWorkflow, { getSiteMeasureChecklistProgress } from "./SiteMeasureWorkflow";

class MockFileReader {
  readAsDataURL(file) {
    this.result = `data:${file.type || "application/octet-stream"};base64,c2l0ZS1tZWFzdXJl`;
    setTimeout(() => this.onload?.(), 0);
  }
}

describe("SiteMeasureWorkflow", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("tracks checklist completion and saves the measure against the quote", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({});

    render(
      <SiteMeasureWorkflow
        quote={{ id: "quote-1", quote_number: "QTE-0001", site_address: "10 Workshop Lane" }}
        staffRecords={[]}
        linkedJobs={[]}
        onSave={onSave}
      />
    );

    await user.click(screen.getByLabelText("Appliance confirmed"));
    await user.click(screen.getByLabelText("Services checked"));
    await user.type(screen.getByLabelText("Measure Notes"), "Wall bows near pantry.");
    await user.click(screen.getByRole("button", { name: /save site measure/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        quote_id: "quote-1",
        site_address: "10 Workshop Lane",
        notes: "Wall bows near pantry.",
        checklist: expect.objectContaining({
          appliance_confirmed: true,
          services_checked: true,
        }),
      }), null);
    });
    expect(screen.getByText(/site measure saved/i)).toBeInTheDocument();
  });

  test("uploads photos and keeps them linked to the site measure workflow", async () => {
    const onUpload = vi.fn().mockResolvedValue({});

    render(
      <SiteMeasureWorkflow
        quote={{ id: "quote-1", quote_number: "QTE-0001" }}
        measures={[{ id: "measure-1", quote_id: "quote-1" }]}
        attachments={[{ id: "file-1", name: "Existing photo.jpg", source: "site-measure", file_source: "Site Measure" }]}
        onUpload={onUpload}
      />
    );

    expect(screen.getByText("Existing photo.jpg")).toBeInTheDocument();

    const input = document.querySelector("input[type='file']");
    fireEvent.change(input, {
      target: {
        files: [new File(["photo"], "site-photo.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({
        file: expect.objectContaining({ name: "site-photo.jpg" }),
        file_base64: "c2l0ZS1tZWFzdXJl",
        measure: expect.objectContaining({ id: "measure-1" }),
      }));
    });
  });

  test("renders client requests, access notes, and handover link state", () => {
    const measure = {
      client_requests: "Keep island overhang clear.",
      access_notes: "Use side gate.",
      include_in_handover_pack: true,
      checklist: {
        appliance_confirmed: true,
        services_checked: true,
        floor_level_checked: true,
        wall_condition_checked: true,
        ceiling_checked: true,
        access_checked: true,
      },
    };

    render(
      <SiteMeasureWorkflow
        quote={{ id: "quote-1" }}
        measures={[measure]}
        linkedJobs={[{ id: "job-1", job_number: "JOB-0001", install_date: "2026-06-01" }]}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("Keep island overhang clear.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Use side gate.")).toBeInTheDocument();
    expect(screen.getByText("Handover pack")).toBeInTheDocument();
    expect(getSiteMeasureChecklistProgress(measure)).toEqual({ complete: 6, total: 6 });
  });
});
