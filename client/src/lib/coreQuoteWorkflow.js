import { normalizeQuoteStatus } from "./helpers";
import { getQuoteItemReviewState } from "../components/ReviewStateBadge";

function hasGeneratedDocument(attachments = []) {
  return attachments.some((attachment) => String(attachment?.source || "") === "generated-document");
}

function hasInstallScheduled(linkedJobs = []) {
  return linkedJobs.some((job) => String(job?.install_date || job?.install_start_date || "").trim());
}

function hasPricing(items = [], quoteImports = []) {
  return items.length > 0 || quoteImports.length > 0;
}

function hasReviewBlockers(items = []) {
  return items.some((item) => {
    const state = getQuoteItemReviewState(item);
    return state === "missing_cost" || state === "needs_review" || state === "auto_added";
  });
}

function getFirstIncompleteStepIndex(steps) {
  const index = steps.findIndex((step) => !step.done && !step.optional);
  return index === -1 ? steps.length - 1 : index;
}

export function buildCoreQuoteWorkflow({
  quote = {},
  items = [],
  quoteImports = [],
  attachments = [],
  linkedJobs = [],
} = {}) {
  const normalizedStatus = normalizeQuoteStatus(quote?.status);
  const pricingReady = hasPricing(items, quoteImports);
  const reviewClear = pricingReady && !hasReviewBlockers(items);
  const documentReady = hasGeneratedDocument(attachments);
  const sentOrLater = ["awaiting_confirmation", "won", "archived"].includes(normalizedStatus);
  const wonOrLinked = normalizedStatus === "won" || linkedJobs.length > 0;
  const installScheduled = hasInstallScheduled(linkedJobs);
  const archived = normalizedStatus === "archived";

  const steps = [
    {
      key: "lead",
      title: "Lead",
      detail: quote?.lead_id ? "Linked to the original enquiry." : "No lead linked. This is okay for direct quotes.",
      done: Boolean(quote?.lead_id),
      optional: true,
      action: "Open leads",
      target: "leads",
    },
    {
      key: "details",
      title: "Quote Details",
      detail: quote?.title && (quote?.contact_name || quote?.company_name)
        ? "Customer and job details are in place."
        : "Add the customer, title, and site details first.",
      done: Boolean(quote?.title && (quote?.contact_name || quote?.company_name)),
      action: "Check details",
      target: "overview",
    },
    {
      key: "pricing",
      title: "Import / Pricing",
      detail: pricingReady ? `${items.length} quote line item${items.length === 1 ? "" : "s"} ready.` : "Import pricing or add the first line item.",
      done: pricingReady,
      action: "Add pricing",
      target: "pricing",
    },
    {
      key: "review",
      title: "Review",
      detail: reviewClear ? "No pricing review blockers found." : "Check missing costs, auto-additions, and warnings.",
      done: reviewClear,
      action: "Review quote list",
      target: "quote-list",
    },
    {
      key: "document",
      title: "Generate Document",
      detail: documentReady ? "A generated PDF is saved in Quote Files." : "Preview the quote or contract before sending.",
      done: documentReady,
      action: "Generate document",
      target: "document",
    },
    {
      key: "send",
      title: "Send / Print",
      detail: sentOrLater ? "Marked as issued or accepted." : "Print or send once the document is checked.",
      done: sentOrLater,
      action: "Mark sent",
      target: "send",
    },
    {
      key: "schedule",
      title: "Schedule Install",
      detail: installScheduled ? "Install date is on the planner." : wonOrLinked ? "Plan the install after the quote becomes a job." : "Win the quote first, then schedule install.",
      done: installScheduled,
      action: "Open planner",
      target: "schedule",
      disabled: !wonOrLinked,
    },
    {
      key: "archive",
      title: "Archive / Complete",
      detail: archived ? "Quote is archived and recoverable." : "Archive only when the quote is finished or no longer active.",
      done: archived,
      action: archived ? "Restore quote" : "Archive quote",
      target: archived ? "restore" : "archive",
    },
  ];

  return {
    steps: steps.map((step, index) => ({ ...step, current: index === getFirstIncompleteStepIndex(steps) })),
    pricingReady,
    reviewClear,
    documentReady,
    sentOrLater,
    installScheduled,
    archived,
  };
}
