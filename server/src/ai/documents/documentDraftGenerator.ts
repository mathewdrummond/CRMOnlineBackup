import { generateInstallUpdateDraft } from "./installUpdateGenerator";
import { AiDocumentContext, AiDocumentDraft, AiDocumentDraftKind, createDraft, readText } from "./documentDraftTypes";
import { generateProcurementSummaryDraft } from "./procurementSummaryGenerator";
import { generateQuoteSummaryDraft } from "./quoteSummaryGenerator";
import { generateVariationDraft } from "./variationDraftGenerator";
import { generateWorkshopHandoverDraft } from "./workshopHandoverGenerator";

export { AiDocumentContext, AiDocumentDraft, AiDocumentDraftKind };

export function generateAiDocumentDraft(kind: AiDocumentDraftKind, context: AiDocumentContext): AiDocumentDraft {
  if (kind === "quote_summary") return generateQuoteSummaryDraft(context);
  if (kind === "variation_draft") return generateVariationDraft(context);
  if (kind === "install_update") return generateInstallUpdateDraft(context);
  if (kind === "workshop_handover") return generateWorkshopHandoverDraft(context);
  if (kind === "procurement_summary") return generateProcurementSummaryDraft(context);
  return generateClientCommunicationDraft(context);
}

function generateClientCommunicationDraft(context: AiDocumentContext): AiDocumentDraft {
  const quote = context.quote || null;
  const job = context.job || null;
  const target = job || quote;
  return createDraft(
    "client_communication",
    "AI Client Communication Draft",
    [
      {
        heading: "Client Communication",
        body: [
          `Project: ${readText(target, ["job_number", "quote_number"])} - ${readText(target, ["title"])}`,
          `Client: ${readText(target, ["contact_name", "company_name", "customer_name"])}`,
          "Please review the project update below and confirm any changes before sending.",
        ].join("\n"),
      },
      {
        heading: "Draft Message",
        body: "Thanks for your time. We have prepared the attached project information from the current JoinerFlow records. Please review and let us know if anything needs to be adjusted.",
      },
      {
        heading: "Review Requirements",
        body: "Confirm recipients, pricing references, attachments, and approval status before sending.",
      },
    ],
    target ? [] : ["quote or job context"],
    [String(quote?.id || ""), String(job?.id || "")]
  );
}

