import { AiDocumentContext, AiDocumentDraft, createDraft, readText, summarizeRows } from "./documentDraftTypes";

export function generateProcurementSummaryDraft(context: AiDocumentContext): AiDocumentDraft {
  const quote = context.quote || null;
  const job = context.job || null;
  const missing = !quote && !job ? ["quote or job context"] : [];
  const sections = [
    {
      heading: "Procurement Summary",
      body: [
        `Project: ${readText(job || quote, ["job_number", "quote_number"])} - ${readText(job || quote, ["title"])}`,
        `Client: ${readText(job || quote, ["contact_name", "company_name", "customer_name"])}`,
        `Required by: ${readText(job || quote, ["install_date", "due_date", "valid_until"])}`,
      ].join("\n"),
    },
    {
      heading: "Supplier And Pricing Lines",
      body: summarizeRows(context.pricingItems && context.pricingItems.length > 0 ? context.pricingItems : context.quoteItems, ["supplier_name", "description", "item_name", "name"], 12),
    },
    {
      heading: "Purchase Order Status",
      body: summarizeRows(context.purchaseOrders, ["po_number", "supplier_name", "status"], 8),
    },
  ];
  return createDraft("procurement_summary", "AI Procurement Summary Draft", sections, missing, [String(quote?.id || ""), String(job?.id || "")]);
}

