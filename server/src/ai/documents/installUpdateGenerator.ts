import { AiDocumentContext, AiDocumentDraft, createDraft, listMissing, readText, summarizeRows } from "./documentDraftTypes";

export function generateInstallUpdateDraft(context: AiDocumentContext): AiDocumentDraft {
  const job = context.job || null;
  const missing = listMissing(job, [
    ["job_number", "job number"],
    ["install_date", "install date"],
    ["site_address", "site address"],
  ]);
  const sections = [
    {
      heading: "Install Update",
      body: [
        `Job: ${readText(job, ["job_number"])} - ${readText(job, ["title"])}`,
        `Site: ${readText(job, ["site_address"])}`,
        `Install window: ${readText(job, ["install_date"])} to ${readText(job, ["install_end_date"], readText(job, ["install_date"]))}`,
        `Current status: ${readText(job, ["status"])}`,
      ].join("\n"),
    },
    {
      heading: "Open Install Tasks",
      body: summarizeRows(
        (context.jobOperations || []).filter((operation) => !["complete", "completed", "done"].includes(String(operation.status || "").toLowerCase())),
        ["task_name", "operation", "workflow_phase"],
        8
      ),
    },
    {
      heading: "Reviewer Notes",
      body: "Confirm access, delivery timing, site readiness, and outstanding approvals before sending.",
    },
  ];
  return createDraft("install_update", "AI Install Update Draft", sections, missing, [String(job?.id || "")]);
}

