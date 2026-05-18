import { AiDocumentContext, AiDocumentDraft, createDraft, listMissing, readMoney, readText, summarizeRows } from "./documentDraftTypes";

export function generateQuoteSummaryDraft(context: AiDocumentContext): AiDocumentDraft {
  const quote = context.quote || null;
  const missing = listMissing(quote, [
    ["title", "quote title"],
    ["contact_name", "client contact"],
    ["site_address", "site address"],
    ["total", "approved quote total"],
  ]);
  const sections = [
    {
      heading: "Quote Summary",
      body: [
        `Quote: ${readText(quote, ["quote_number"])} - ${readText(quote, ["title"])}`,
        `Client: ${readText(quote, ["contact_name", "company_name", "customer_name"])}`,
        `Site: ${readText(quote, ["site_address"])}`,
        `Current status: ${readText(quote, ["status"])}`,
        `Quoted total from source data: ${readMoney(quote, ["total", "quoted_value"])}`,
      ].join("\n"),
    },
    {
      heading: "Included Scope",
      body: summarizeRows(context.quoteItems, ["description", "name", "item_name", "section"], 10),
    },
    {
      heading: "Exclusions And Assumptions",
      body: [
        "This draft only reflects supplied quote data.",
        "No pricing, allowances, exclusions, or dates have been invented.",
        "Reviewer must confirm exclusions before issuing any client document.",
      ].join("\n"),
    },
  ];
  return createDraft("quote_summary", "AI Quote Summary Draft", sections, missing, [String(quote?.id || "")]);
}

