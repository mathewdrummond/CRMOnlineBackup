import { describe, expect, test } from "vitest";
import {
  buildInstallationTimelineState,
  buildInstallLoadModel,
  buildInstallMoveRange,
  buildInstallResizeRange,
  isInstallOperation,
  mergeInstallPlannerMutationResult,
} from "./installSchedule";

describe("installSchedule helpers", () => {
  test("builds install-only timeline items and keeps ready-to-install jobs in backlog", () => {
    const jobs = [
      {
        id: "job-1",
        job_number: "JOB-0001",
        title: "Kitchen fit-out",
        contact_name: "Amelia Hart",
        site_address: "1 Queen Street",
        status: "production",
        install_date: "2026-04-10",
      },
      {
        id: "job-2",
        job_number: "JOB-0002",
        title: "Wardrobe install",
        company_name: "North Projects",
        site_address: "22 Albert Road",
        status: "ready_to_install",
        install_date: "",
      },
    ];
    const operations = [
      {
        id: "op-install-1",
        job_id: "job-1",
        job_number: "JOB-0001",
        job_title: "Kitchen fit-out",
        operation: "install",
        workflow_phase: "installation",
        task_name: "Main install",
        status: "scheduled",
        start_date: "2026-04-10",
        end_date: "2026-04-11",
        notes: "Access after 8am",
      },
      {
        id: "op-assembly-1",
        job_id: "job-1",
        operation: "assembly",
        workflow_phase: "manufacturing",
        start_date: "2026-04-03",
      },
    ];

    const model = buildInstallationTimelineState(jobs, operations, "all");

    expect(model.scheduledItems).toHaveLength(1);
    expect(model.scheduledItems[0]).toMatchObject({
      jobId: "job-1",
      sourceType: "operation",
      installLabel: "Main install",
      clientSiteLabel: "Amelia Hart · 1 Queen Street",
      startDate: "2026-04-10",
      endDate: "2026-04-11",
    });
    expect(model.unscheduledItems).toHaveLength(1);
    expect(model.unscheduledItems[0]).toMatchObject({
      jobId: "job-2",
      sourceType: "job",
      isBacklog: true,
      clientSiteLabel: "North Projects · 22 Albert Road",
    });
  });

  test("treats only real install tasks as planner entries", () => {
    expect(
      isInstallOperation({
        operation: "install",
        workflow_phase: "installation",
      })
    ).toBe(true);

    expect(
      isInstallOperation({
        operation: "",
        workflow_phase: "installation",
      })
    ).toBe(true);

    expect(
      isInstallOperation({
        operation: "delivery",
        workflow_phase: "installation",
      })
    ).toBe(false);
  });

  test("calculates visible install load and busy days", () => {
    const loadModel = buildInstallLoadModel(
      [
        { id: "install-1", startDate: "2026-04-10", endDate: "2026-04-11", jobNumber: "JOB-0001" },
        { id: "install-2", startDate: "2026-04-11", endDate: "2026-04-11", jobNumber: "JOB-0002" },
      ],
      ["2026-04-10", "2026-04-11", "2026-04-12"]
    );

    expect(loadModel.activeDays).toBe(2);
    expect(loadModel.busyDays).toBe(1);
    expect(loadModel.peakInstallCount).toBe(2);
    expect(loadModel.byDateKey.get("2026-04-11")).toMatchObject({
      installCount: 2,
      hasOverlap: true,
    });
  });

  test("preserves duration when moving install ranges", () => {
    expect(
      buildInstallMoveRange(
        { startDate: "2026-04-10", endDate: "2026-04-12" },
        "2026-04-15"
      )
    ).toMatchObject({
      start_date: "2026-04-15",
      end_date: "2026-04-17",
      manually_locked: true,
    });
  });

  test("clamps resized install ranges instead of inverting them", () => {
    expect(
      buildInstallResizeRange(
        { startDate: "2026-04-10", endDate: "2026-04-12" },
        "start",
        "2026-04-15"
      )
    ).toMatchObject({
      start_date: "2026-04-12",
      end_date: "2026-04-12",
      manually_locked: true,
    });

    expect(
      buildInstallResizeRange(
        { startDate: "2026-04-10", endDate: "2026-04-12" },
        "end",
        "2026-04-08"
      )
    ).toMatchObject({
      start_date: "2026-04-10",
      end_date: "2026-04-10",
      manually_locked: true,
    });
  });

  test("merges planner mutation results back into job and install-operation state", () => {
    const result = mergeInstallPlannerMutationResult(
      {
        jobs: [
        { id: "job-1", install_date: "2026-04-10", install_end_date: "2026-04-10" },
        { id: "job-2", install_date: "", install_end_date: "" },
        ],
        operations: [
        { id: "op-1", job_id: "job-1", operation: "install", workflow_phase: "installation", start_date: "2026-04-10", end_date: "2026-04-10" },
        { id: "op-2", job_id: "job-2", operation: "assembly", workflow_phase: "manufacturing" },
        ],
        staff: [{ id: "staff-1", name: "Jamie" }],
        lanes: [{ id: "lane-1", label: "Jamie" }],
      },
      {
        jobs: [
          { id: "job-1", install_date: "2026-04-12", install_end_date: "2026-04-14" },
        ],
        operations: [
          { id: "op-1b", job_id: "job-1", operation: "install", workflow_phase: "installation", start_date: "2026-04-12", end_date: "2026-04-14" },
        ],
        staff: [{ id: "staff-2", name: "Alex" }],
        lanes: [{ id: "lane-2", label: "Alex" }],
      }
    );

    expect(result.jobs.find((job) => job.id === "job-1")).toMatchObject({
      install_date: "2026-04-12",
      install_end_date: "2026-04-14",
    });
    expect(result.staff).toEqual([{ id: "staff-2", name: "Alex" }]);
    expect(result.lanes).toEqual([{ id: "lane-2", label: "Alex" }]);
    expect(result.operations).toEqual([
      expect.objectContaining({ id: "op-1b", job_id: "job-1" }),
    ]);
  });
});
