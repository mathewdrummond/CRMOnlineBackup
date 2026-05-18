import { AiDocumentContext, AiDocumentDraft, createDraft, listMissing, readMoney, readText, summarizeRows } from "./documentDraftTypes";

export function generateVariationDraft(context: AiDocumentContext): AiDocumentDraft {
  const quote = context.quote || null;
  const job = context.job || null;
  const missing = [
    ...listMissing(quote, [["quote_number", "quote number"]]),
    ...listMissing(job, [["job_number", "job number"]]),
  ];
  const sections = [
    {
      heading: "Variation Draft",
      body: [
        `Project: ${readText(job || quote, ["job_number", "quote_number"])} - ${readText(job || quote, ["title"])}`,
        `Client: ${readText(job || quote, ["contact_name", "company_name", "customer_name"])}`,
        `Reference quote total from source data: ${readMoney(quote, ["total", "quoted_value"])}`,
      ].join("\n"),
    },
    {
      heading: "Requested Change",
      body: summarizeRows(context.notes, ["content", "title"], 5),
    },
    {
      heading: "Review Requirements",
      body: [
        "Confirm scope, cost impact, programme impact, and client approval before proceeding.",
        "This draft does not approve the variation or modify financial totals.",
      ].join("\n"),
    },
  ];
  return createDraft("variation_draft", "AI Variation Draft", sections, missing, [String(quote?.id || ""), String(job?.id || "")]);
}

