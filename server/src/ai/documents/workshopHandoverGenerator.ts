import { AiDocumentContext, AiDocumentDraft, createDraft, listMissing, readText, summarizeRows } from "./documentDraftTypes";

export function generateWorkshopHandoverDraft(context: AiDocumentContext): AiDocumentDraft {
  const job = context.job || null;
  const missing = listMissing(job, [
    ["job_number", "job number"],
    ["title", "job title"],
    ["site_address", "site address"],
  ]);
  const sections = [
    {
      heading: "Workshop Handover",
      body: [
        `Job: ${readText(job, ["job_number"])} - ${readText(job, ["title"])}`,
        `Client: ${readText(job, ["contact_name", "company_name", "customer_name"])}`,
        `Site: ${readText(job, ["site_address"])}`,
        `Install target: ${readText(job, ["install_date"])}`,
      ].join("\n"),
    },
    {
      heading: "Workshop Scope",
      body: summarizeRows(context.jobOperations, ["task_name", "operation", "workflow_phase"], 12),
    },
    {
      heading: "Known Constraints",
      body: summarizeRows(context.notes, ["content", "title"], 6),
    },
  ];
  return createDraft("workshop_handover", "AI Workshop Handover Draft", sections, missing, [String(job?.id || "")]);
}

