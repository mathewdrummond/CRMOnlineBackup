import { describe, expect, test } from "vitest";
import {
  buildWorkshopBoardCards,
  isInactiveWorkshopJob,
  getWorkshopStageForJob,
  getWorkshopStageStatus,
  groupWorkshopCardsByStage,
  moveWorkshopCard,
} from "./workshopBoard";

describe("workshop board helpers", () => {
  test("maps job statuses into workshop stages", () => {
    expect(getWorkshopStageForJob({ status: "planning" }).label).toBe("Waiting Approval");
    expect(getWorkshopStageForJob({ status: "approved" }).label).toBe("Ready for Production");
    expect(getWorkshopStageForJob({ status: "production" }).label).toBe("In Production");
    expect(getWorkshopStageForJob({ status: "ready_to_install" }).label).toBe("Ready for Install");
    expect(getWorkshopStageForJob({ status: "callback" }).label).toBe("Callback");
    expect(getWorkshopStageStatus("in_production")).toBe("production");
  });

  test("builds cards with warnings, notes, quote links, and stage groups", () => {
    const cards = buildWorkshopBoardCards({
      jobs: [
        {
          id: "job-1",
          quote_id: "quote-1",
          job_number: "JOB-0001",
          title: "Smith Kitchen",
          contact_name: "Alex Smith",
          status: "ready_to_install",
          handoff_drawings_ready: false,
          handoff_notes: "Watch the island overhang.",
        },
      ],
      quotes: [{ id: "quote-1", quote_number: "QTE-0001", title: "Smith Quote" }],
      jobOperations: [{ id: "op-1", job_id: "job-1", status: "on_hold" }],
    });

    expect(cards[0]).toMatchObject({
      id: "job-1",
      stageId: "ready_for_install",
      title: "Smith Kitchen",
      client: "Alex Smith",
      quoteId: "quote-1",
    });
    expect(cards[0].warnings).toContain("Drawings not confirmed");
    expect(cards[0].warnings).toContain("Install date missing");
    expect(cards[0].warnings).toContain("1 blocked task");
    expect(cards[0].notes).toContain("Watch the island overhang.");
    expect(groupWorkshopCardsByStage(cards).get("ready_for_install")).toHaveLength(1);
  });

  test("hides inactive jobs by default while allowing visibility modes", () => {
    const jobs = [
      { id: "job-active", title: "Active Job", status: "production" },
      { id: "job-inactive", title: "Inactive Job", status: "inactive" },
      { id: "job-completed", title: "Completed Job", status: "completed" },
    ];

    expect(isInactiveWorkshopJob(jobs[0])).toBe(false);
    expect(isInactiveWorkshopJob(jobs[1])).toBe(true);

    expect(buildWorkshopBoardCards({ jobs }).map((card) => card.id)).toEqual(["job-active"]);
    expect(buildWorkshopBoardCards({ jobs, visibility: "all" }).map((card) => card.id).sort()).toEqual([
      "job-active",
      "job-completed",
      "job-inactive",
    ]);
    expect(buildWorkshopBoardCards({ jobs, visibility: "inactive" }).map((card) => card.id).sort()).toEqual([
      "job-completed",
      "job-inactive",
    ]);
  });

  test("moves cards between stages without mutating other cards", () => {
    const cards = [
      { id: "job-1", stageId: "ready_for_production", status: "approved" },
      { id: "job-2", stageId: "installed", status: "installed" },
    ];

    const moved = moveWorkshopCard(cards, "job-1", "in_production");

    expect(moved[0]).toMatchObject({ stageId: "in_production", status: "production" });
    expect(moved[1]).toEqual(cards[1]);
    expect(cards[0]).toMatchObject({ stageId: "ready_for_production", status: "approved" });
  });
});

