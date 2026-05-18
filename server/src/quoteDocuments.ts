import { EntityRecord } from "./types";
import { getMillbrookCompanyLogoDataUri, MILLBROOK_LOGO_ALT } from "./companyBranding";

export const MILLBROOK_GST_NUMBER = "010-724-589";
export const GST_RATE = 0.15;

export const DEFAULT_PAYMENT_TERMS =
  "Deposit is due at Contract signing. Balance Due must be paid on the final day of installation.";

export const DEFAULT_DISCLAIMER =
  "All work will be carried out in accordance with the agreed specifications and completed to a professional standard consistent with accepted industry practice.\n\n" +
  "Any variation or alteration to the agreed scope of work that may affect cost, materials, or timing will be undertaken only with written approval and will be treated as a variation to the contract sum.\n\n" +
  "Millbrook Furniture Ltd shall not be liable for delays or changes arising from circumstances beyond our reasonable control, including supply delays, industrial action, site access limitations, or events of nature.";

export const DEFAULT_TERMS_SECTIONS = [
  {
    title: "Basis of Quote",
    body: "All work will be carried out in accordance with the agreed specifications, drawings, selections, and assumptions recorded in this document and completed to a professional standard consistent with accepted industry practice.\n\nPricing is based on the information available at the time of quoting. Unless stated otherwise, prices are in New Zealand dollars and include GST where shown.",
  },
  {
    title: "Client Approval and Design Responsibility",
    body: "The client is responsible for checking that the final design, layout, dimensions, appliance selections, materials, finishes, and specifications meet their requirements before approval.\n\nFinal dimensions, appliance specifications, and selections are deemed accepted once approved by the client. Any changes requested after approval may result in additional cost, delay, or remake charges.",
  },
  {
    title: "Variations",
    body: "Any change to the agreed scope, drawings, materials, finishes, site conditions, access, or programme may affect the contract price and completion timing.\n\nVariations must be approved in writing before work proceeds and will be treated as a variation to the contract sum.",
  },
  {
    title: "Site Readiness and Access",
    body: "The client is responsible for ensuring the site is safe, accessible, weather-tight where required, and ready for manufacture, delivery, and installation at the agreed times.\n\nDelays or additional costs arising from restricted access, unfinished building work, inaccurate site dimensions, or delays by other trades may result in additional charges and/or extensions of time.",
  },
  {
    title: "Hidden or Unforeseen Conditions",
    body: "Any concealed or unforeseen site conditions discovered during manufacture or installation, including structural issues, moisture damage, out-of-level surfaces, inadequate fixing support, or services conflicts, may require additional work and will be treated as a variation.",
  },
  {
    title: "Delivery and Installation",
    body: "Delivery and installation dates are planned in good faith and depend on supplier lead times, site readiness, access, and completion of preceding trades.\n\nMillbrook Furniture Ltd is not liable for delays caused by circumstances beyond reasonable control, including supplier delays, industrial action, restricted site access, weather events, or other events of nature.",
  },
  {
    title: "Payment and Financial Terms",
    body: "Deposit and progress payments are due according to the payment schedule. Overdue amounts may delay manufacture, delivery, or installation.\n\nPayment claims may be issued in accordance with the Construction Contracts Act 2002 where applicable. The Act provides a process for payments and disputes under construction contracts, and payment may become due under the Act’s payment claim provisions.",
  },
  {
    title: "Suspension of Work",
    body: "Millbrook Furniture Ltd reserves the right to suspend manufacture, delivery, or installation where payments are overdue, site conditions are unsuitable, access is restricted, or health and safety requirements are not met.\n\nAny resulting delays or additional costs will be the responsibility of the client.",
  },
  {
    title: "Storage and Delayed Delivery",
    body: "Where manufacture has been completed but delivery or installation is delayed due to client-related causes, Millbrook Furniture Ltd may charge reasonable storage, handling, re-delivery, and re-scheduling costs.",
  },
  {
    title: "Risk and Insurance",
    body: "Millbrook Furniture Ltd will take reasonable care of materials and completed work under its control. The client is responsible for ensuring the site is safe, accessible, and adequately insured.\n\nRisk in supplied goods and completed work passes to the client upon delivery, installation, or practical completion, whichever occurs first.",
  },
  {
    title: "Retention of Title",
    body: "Ownership of supplied goods remains with Millbrook Furniture Ltd until all amounts owing for the work have been paid in full.",
  },
  {
    title: "Practical Completion and Handover",
    body: "Practical completion occurs when the work is substantially complete and capable of normal use, notwithstanding minor defects or incomplete items that do not materially affect use.",
  },
  {
    title: "Damage After Installation",
    body: "Millbrook Furniture Ltd is not responsible for damage occurring after installation or handover, including damage caused by other trades, occupants, moisture ingress, building movement, impact damage, misuse, or inadequate site protection.",
  },
  {
    title: "Materials, Finishes, and Tolerances",
    body: "Materials and hardware are subject to supplier warranties and normal tolerances. Natural and manufactured products may vary in colour, grain, pattern, texture, or finish.\n\nSuch variation is not a defect where it is within normal manufacturing, supplier, or natural material tolerances.",
  },
  {
    title: "Moisture and Environmental Conditions",
    body: "The client is responsible for maintaining suitable environmental and moisture conditions within the property.\n\nMillbrook Furniture Ltd shall not be liable for movement, swelling, shrinkage, delamination, or failure caused by excessive moisture, humidity fluctuations, inadequate ventilation, water ingress, building movement, or unsuitable site conditions.",
  },
  {
    title: "Product Substitution and Supply Availability",
    body: "Millbrook Furniture Ltd may substitute materials, hardware, or components with comparable products where specified items become unavailable, discontinued, or subject to unreasonable supply delays, provided the overall quality and function are not materially reduced.",
  },
  {
    title: "Client-Supplied Items",
    body: "Where appliances, sinks, handles, hardware, or other items are supplied by the client or third parties, the client is responsible for ensuring those items are correct, available on time, undamaged, and suitable for installation.\n\nAdditional costs caused by incorrect, late, missing, or unsuitable client-supplied items may be charged as a variation.",
  },
  {
    title: "Defects and Warranty",
    body: "Any defects or concerns must be notified in writing within a reasonable period after installation or discovery. Millbrook Furniture Ltd must be given reasonable opportunity to inspect and remedy any verified defect before others undertake remedial work.\n\nSupplier warranties apply to materials, hardware, appliances, and third-party products where applicable.",
  },
  {
    title: "Intellectual Property and Design Ownership",
    body: "All drawings, concepts, designs, renders, specifications, pricing documents, and related materials prepared by Millbrook Furniture Ltd remain the intellectual property of Millbrook Furniture Ltd unless otherwise agreed in writing.\n\nThese documents may not be reproduced, shared, or used for manufacture by others without written consent.",
  },
  {
    title: "Consumer Guarantees Act and Commercial Use",
    body: "Nothing in these terms limits rights that cannot legally be excluded under New Zealand law.\n\nWhere goods or services are supplied for business or commercial purposes, the parties agree that the Consumer Guarantees Act 1993 does not apply to the extent permitted by law. The CGA generally applies to consumer goods and services, while contracting out may be available in qualifying business transactions.",
  },
  {
    title: "Limitation of Liability",
    body: "To the maximum extent permitted by New Zealand law, Millbrook Furniture Ltd’s liability for any claim arising from the works is limited to the value of the relevant contract or the defective work supplied.\n\nMillbrook Furniture Ltd shall not be liable for indirect, consequential, or economic loss, including loss of profit, delay costs, accommodation costs, or loss arising from third-party works.",
  },
  {
    title: "Recovery Costs and Interest",
    body: "The client is liable for reasonable costs incurred in recovering overdue amounts, including legal fees, debt collection costs, and administrative expenses.\n\nInterest may be charged on overdue accounts at a reasonable commercial rate.",
  },
  {
    title: "Health and Safety",
    body: "The client is responsible for providing a safe working environment and complying with all applicable site health and safety requirements.\n\nMillbrook Furniture Ltd reserves the right to cease work where unsafe conditions exist.",
  },
  {
    title: "Disputes",
    body: "If a dispute arises, the parties will first attempt to resolve it in good faith. If the dispute cannot be resolved, either party may use any dispute resolution process available under the contract or New Zealand law, including adjudication where the Construction Contracts Act 2002 applies.",
  },
];

export type QuoteDocumentType = "quote" | "contract" | "quote_list";

export type QuoteDocumentInput = {
  quoteId: string;
  jobId?: string;
  quoteNumber?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  jobName: string;
  jobAddress: string;
  jobNotes: string;
  scopeNotes: string;
  specificationNotes: string;
  preparedBy?: string;
  generatedAt?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    total: number;
    section?: string;
    sectionDisplayOrder?: number;
    notes?: string;
    gstTreatment?: string;
    isOptional?: boolean;
    sortOrder?: number;
  }>;
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  depositAmount: number;
  balanceDue: number;
  issueDate: string;
  documentType: QuoteDocumentType;
  paymentTerms: string;
  disclaimer: string;
  termsSections: Array<{ title: string; body: string }>;
  status?: string;
};

type QuoteDocumentLineItem = QuoteDocumentInput["lineItems"][number];
const CONTINUATION_NOTE_TEXT = "Cont. on next page";
const CONTINUATION_HEADER_TEXT = "Quote line items continued";

export function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

export function calculateDocumentTotals(input: {
  subtotalExGst?: number;
  gstAmount?: number;
  totalIncGst?: number;
}) {
  const totalIncGst = roundMoney(Number(input.totalIncGst || 0));
  const subtotalExGst = roundMoney(Number(input.subtotalExGst || 0) || (totalIncGst ? totalIncGst / (1 + GST_RATE) : 0));
  const gstAmount = roundMoney(Number(input.gstAmount || 0) || (totalIncGst ? totalIncGst - subtotalExGst : subtotalExGst * GST_RATE));
  const resolvedTotal = totalIncGst || roundMoney(subtotalExGst + gstAmount);
  return {
    subtotalExGst,
    gstAmount,
    totalIncGst: resolvedTotal,
  };
}

export function calculateDefaultPaymentSchedule(totalIncGst: number) {
  const depositAmount = roundMoney(Number(totalIncGst || 0) * 0.5);
  return {
    depositAmount,
    balanceDue: roundMoney(Number(totalIncGst || 0) - depositAmount),
  };
}

export function buildQuoteDocumentDraft(input: {
  quote: EntityRecord;
  quoteItems: EntityRecord[];
  contact?: EntityRecord | null;
  job?: EntityRecord | null;
  documentType?: QuoteDocumentType;
  existing?: Partial<QuoteDocumentInput> | null;
}): QuoteDocumentInput {
  const isQuoteList = input.documentType === "quote_list";
  const visibleItems = input.quoteItems
    .filter((item) => String(item.review_state || "").trim().toLowerCase() !== "deleted")
    .filter((item) => isQuoteList || !item.is_optional)
    .sort((left, right) => {
      const sectionCompare = Number(left.section_display_order || 999) - Number(right.section_display_order || 999);
      if (sectionCompare !== 0) return sectionCompare;
      const sectionNameCompare = String(left.section || "General").localeCompare(String(right.section || "General"), undefined, { sensitivity: "base" });
      if (sectionNameCompare !== 0) return sectionNameCompare;
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    });
  const activeCostingItems = visibleItems.filter((item) => !item.is_optional);
  const subtotalFromItems = roundMoney(activeCostingItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const totals = calculateDocumentTotals({
    subtotalExGst: Number(input.quote.subtotal || 0) || subtotalFromItems,
    gstAmount: Number(input.quote.gst || 0),
    totalIncGst: Number(input.quote.total || 0) || roundMoney(subtotalFromItems * (1 + GST_RATE)),
  });
  const schedule = calculateDefaultPaymentSchedule(totals.totalIncGst);
  const customerName = String(input.quote.contact_name || input.quote.company_name || input.contact?.full_name || input.contact?.email || "").trim();
  const preparedBy = String(
    input.quote.prepared_by
    || input.quote.salesperson
    || input.quote.assigned_to
    || input.quote.approval_owner
    || input.quote.owner
    || ""
  ).trim();

  return {
    quoteId: String(input.quote.id || ""),
    jobId: String(input.job?.id || input.quote.job_id || ""),
    quoteNumber: String(input.quote.quote_number || "").trim(),
    customerName,
    customerPhone: String(input.contact?.phone || input.contact?.mobile || input.quote.phone || "").trim(),
    customerEmail: String(input.contact?.email || input.quote.email || "").trim(),
    jobName: String(input.job?.title || input.quote.title || input.quote.quote_number || "").trim(),
    jobAddress: String(input.job?.site_address || input.quote.site_address || input.contact?.address || "").trim(),
    jobNotes: String(input.quote.notes || input.quote.job_conversion_notes || "").trim(),
    scopeNotes: String(input.quote.scope_notes || input.quote.description || "").trim(),
    specificationNotes: buildSpecificationNotes(visibleItems, input.quote),
    preparedBy,
    generatedAt: new Date().toISOString(),
    lineItems: visibleItems.map((item) => ({
      description: String(item.description || "Quote item").trim(),
      quantity: Number(item.quantity || 0),
      unit: String(item.unit || "ea").trim(),
      total: roundMoney(Number(item.total || 0)),
      section: String(item.section || "General").trim(),
      sectionDisplayOrder: Number(item.section_display_order || 999),
      notes: buildQuoteDocumentLineItemNotes(item),
      gstTreatment: String(item.gst_treatment || "unknown").trim(),
      isOptional: Boolean(item.is_optional),
      sortOrder: Number(item.sort_order || 0),
    })),
    subtotalExGst: totals.subtotalExGst,
    gstAmount: totals.gstAmount,
    totalIncGst: totals.totalIncGst,
    depositAmount: schedule.depositAmount,
    balanceDue: schedule.balanceDue,
    issueDate: todayDateOnly(),
    documentType: input.documentType || "contract",
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    disclaimer: DEFAULT_DISCLAIMER,
    termsSections: DEFAULT_TERMS_SECTIONS,
    status: "draft",
    ...input.existing,
  };
}

function buildQuoteDocumentLineItemNotes(item: EntityRecord) {
  return [
    String(item.notes || "").trim(),
    String(item.original_extracted_description || "").trim(),
    String(item.parent_source_description || "").trim() ? `Auto-included from ${String(item.parent_source_description || "").trim()}` : "",
    Array.isArray(item.warnings) && item.warnings.length ? `Warnings: ${item.warnings.map(String).join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildSpecificationNotes(items: EntityRecord[], quote: EntityRecord) {
  const explicitNotes = String(quote.specification_notes || quote.material_notes || quote.hardware_notes || "").trim();
  if (explicitNotes) return explicitNotes;
  const grouped = new Map<string, string[]>();
  items.forEach((item) => {
    const section = String(item.section || item.category || "Specifications");
    grouped.set(section, [...(grouped.get(section) || []), String(item.description || "").trim()].filter(Boolean));
  });
  return [...grouped.entries()]
    .map(([section, descriptions]) => `${section}: ${descriptions.slice(0, 8).join(", ")}`)
    .join("\n");
}

export function validateQuoteDocument(document: QuoteDocumentInput) {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!String(document.customerName || "").trim()) errors.push("Customer name is required.");
  if (!String(document.jobName || "").trim()) errors.push("Job name is required.");
  if (!Number(document.totalIncGst || 0)) errors.push("Total including GST is required.");
  if (!String(document.issueDate || "").trim()) errors.push("Issue date is required.");

  const expectedGst = roundMoney(Number(document.subtotalExGst || 0) * GST_RATE);
  if (Math.abs(expectedGst - Number(document.gstAmount || 0)) > 0.05) {
    warnings.push("GST does not equal 15% of the subtotal.");
  }
  if (Math.abs(roundMoney(Number(document.depositAmount || 0) + Number(document.balanceDue || 0)) - Number(document.totalIncGst || 0)) > 0.05) {
    warnings.push("Deposit plus balance does not equal the total including GST.");
  }
  if (!String(document.jobNotes || document.scopeNotes || document.specificationNotes || "").trim()) {
    warnings.push("No job notes or specification notes are present.");
  }
  return { errors, warnings };
}

function money(value: number) {
  return `$${roundMoney(value).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function multilineHtml(value: unknown) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function estimateWrappedLineCount(value: unknown, max = 88) {
  const words = String(value ?? "").replace(/\r/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let current = "";
  let count = 0;
  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > max) {
      count += 1;
      current = word;
      return;
    }
    current = `${current} ${word}`.trim();
  });
  if (current) count += 1;
  return Math.max(1, count);
}

function estimateQuoteLineRowUnits(item: QuoteDocumentLineItem) {
  return Math.max(1, estimateWrappedLineCount(item.description, 44));
}

function chunkQuoteLineItems(items: QuoteDocumentLineItem[], capacities: number[]) {
  const rows = items.map((item) => ({ item, units: estimateQuoteLineRowUnits(item) }));
  const pages: QuoteDocumentLineItem[][] = [];
  let index = 0;
  let capacityIndex = 0;
  while (index < rows.length) {
    const capacity = Math.max(1, capacities[Math.min(capacityIndex, capacities.length - 1)] || capacities[capacities.length - 1] || 1);
    let used = 0;
    const chunk: QuoteDocumentLineItem[] = [];
    while (index < rows.length) {
      const next = rows[index];
      if (chunk.length > 0 && used + next.units > capacity) break;
      chunk.push(next.item);
      used += next.units;
      index += 1;
    }
    if (chunk.length === 0 && index < rows.length) {
      chunk.push(rows[index].item);
      index += 1;
    }
    pages.push(chunk);
    capacityIndex += 1;
  }
  return pages.length > 0 ? pages : [[]];
}

function buildQuoteLineItemPagination(document: QuoteDocumentInput) {
  const notesText = [document.jobNotes, document.scopeNotes, document.specificationNotes].filter(Boolean).join(" ");
  const notePenalty = Math.ceil(estimateWrappedLineCount(notesText, 96) / 4);
  const firstPageWithSummaryCapacity = Math.max(document.documentType === "contract" ? 7 : 10, (document.documentType === "contract" ? 12 : 16) - notePenalty);
  const firstPageOnlyCapacity = Math.max(document.documentType === "contract" ? 13 : 17, (document.documentType === "contract" ? 18 : 23) - notePenalty);
  const continuationCapacity = document.documentType === "contract" ? 23 : 27;
  const finalPageWithSummaryCapacity = document.documentType === "contract" ? 9 : 13;
  const totalUnits = document.lineItems.reduce((sum, item) => sum + estimateQuoteLineRowUnits(item), 0);

  if (totalUnits <= firstPageWithSummaryCapacity) {
    return {
      pages: [document.lineItems],
      summaryPageIndex: 0,
    };
  }

  const pages = chunkQuoteLineItems(document.lineItems, [firstPageOnlyCapacity, continuationCapacity, continuationCapacity, finalPageWithSummaryCapacity]);
  const lastPageUnits = pages[pages.length - 1].reduce((sum, item) => sum + estimateQuoteLineRowUnits(item), 0);
  if (lastPageUnits > finalPageWithSummaryCapacity) {
    pages.push([]);
  }

  return {
    pages,
    summaryPageIndex: pages.length - 1,
  };
}

function renderLineItemsTable(items: QuoteDocumentLineItem[]) {
  let previousSection = "";
  return `<table class="line-items"><thead><tr><th>Description</th><th class="right">Qty</th><th>Unit</th><th class="right">Line Total</th></tr></thead><tbody>
        ${items.map((item) => {
          const section = String(item.section || "General").trim() || "General";
          const showSection = section !== previousSection;
          previousSection = section;
          return `${showSection ? `<tr class="section-row"><td colspan="4">${escapeHtml(section)}</td></tr>` : ""}<tr><td>${escapeHtml(item.description)}</td><td class="right">${item.quantity}</td><td>${escapeHtml(item.unit)}</td><td class="right">${money(item.total)}</td></tr>`;
        }).join("")}
      </tbody></table>`;
}

function estimateTermsSectionUnits(section: QuoteDocumentInput["termsSections"][number]) {
  return 3 + estimateWrappedLineCount(section.title, 48) + estimateWrappedLineCount(section.body, 104);
}

function chunkTermsSections(sections: QuoteDocumentInput["termsSections"]) {
  const firstPageCapacity = 28;
  const continuationCapacity = 34;
  const pages: QuoteDocumentInput["termsSections"][] = [];
  let currentPage: QuoteDocumentInput["termsSections"] = [];
  let usedUnits = 0;
  let capacity = firstPageCapacity;

  sections.forEach((section) => {
    const sectionUnits = estimateTermsSectionUnits(section);
    if (currentPage.length > 0 && usedUnits + sectionUnits > capacity) {
      pages.push(currentPage);
      currentPage = [];
      usedUnits = 0;
      capacity = continuationCapacity;
    }
    currentPage.push(section);
    usedUnits += sectionUnits;
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [[]];
}

function renderTermsSectionsHtml(sections: QuoteDocumentInput["termsSections"]) {
  return sections.map((section) => `<h2>${escapeHtml(section.title)}</h2><p>${multilineHtml(section.body)}</p>`).join("");
}

export function renderQuoteDocumentHtml(document: QuoteDocumentInput) {
  const title = document.documentType === "quote" ? "Quote" : "Contract";
  const showContractSections = document.documentType === "contract";
  const showTermsSections = Array.isArray(document.termsSections) && document.termsSections.length > 0;
  const companyLogo = getMillbrookCompanyLogoDataUri();
  const pagination = buildQuoteLineItemPagination(document);
  const mainPages = pagination.pages.map((items, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    const showSummary = pageIndex === pagination.summaryPageIndex;
    const continuesAfter = pageIndex < pagination.summaryPageIndex;
    return `<section class="page">
    <div class="top">
      <div>
        <h1>${title}</h1>
        <p class="muted">Issue Date: ${escapeHtml(document.issueDate)}</p>
      </div>
      <div class="brand-wrap">
        ${companyLogo ? `<img class="brand-logo" src="${escapeHtml(companyLogo)}" alt="${escapeHtml(MILLBROOK_LOGO_ALT)}" />` : ""}
        <div class="brand">
          <strong>Millbrook Furniture Ltd</strong><br />
          GST Reg. Number: ${MILLBROOK_GST_NUMBER}
        </div>
      </div>
    </div>

    ${isFirstPage ? `
    <div class="grid">
      <div>
        <h2>Submitted To</h2>
        <div class="box">
          <p><span class="label">Customer</span><br />${escapeHtml(document.customerName)}</p>
          <p><span class="label">Phone</span><br />${escapeHtml(document.customerPhone || "-")}</p>
          <p><span class="label">Email</span><br />${escapeHtml(document.customerEmail || "-")}</p>
        </div>
      </div>
      <div>
        <h2>Job</h2>
        <div class="box">
          <p><span class="label">Job Name</span><br />${escapeHtml(document.jobName)}</p>
          <p><span class="label">Address</span><br />${escapeHtml(document.jobAddress || "-")}</p>
        </div>
      </div>
    </div>

    <h2>Job Notes / Specifications</h2>
    <p>${multilineHtml([document.jobNotes, document.scopeNotes, document.specificationNotes].filter(Boolean).join("\n\n") || "To be confirmed.")}</p>
    ` : `<p class="continued-label">${CONTINUATION_HEADER_TEXT}</p>`}

    <h2>Quote Line Summary</h2>
    ${renderLineItemsTable(items)}
    ${continuesAfter ? `<p class="continuation-note">${CONTINUATION_NOTE_TEXT}</p>` : ""}

    ${showSummary ? `
    <div class="summary-group">
      <h2>Price</h2>
      <p>We propose to furnish material and labor in accordance with the above specification for the sum of:</p>
      <table class="summary">
        <tr><td>Sub-Total</td><td class="right">${money(document.subtotalExGst)}</td></tr>
        <tr><td>Tax</td><td class="right">${money(document.gstAmount)}</td></tr>
        <tr class="total"><td>Total</td><td class="right">${money(document.totalIncGst)}</td></tr>
      </table>

      ${showContractSections ? `
        <h2>Payment Schedule</h2>
        <table class="summary">
          <tr><td>Deposit</td><td class="right">${money(document.depositAmount)}</td></tr>
          <tr><td>Balance Due</td><td class="right">${money(document.balanceDue)}</td></tr>
        </table>
        <h2>Payment Terms</h2>
        <p>${multilineHtml(document.paymentTerms)}</p>
        <h2>Disclaimer</h2>
        <p>${multilineHtml(document.disclaimer)}</p>
        <h2>Signatures</h2>
        <div class="signature-grid">
          <div><div class="signature-line"></div><p>Client Name</p><div class="signature-line"></div><p>Signature</p></div>
          <div><div class="signature-line"></div><p>Client Name</p><div class="signature-line"></div><p>Signature</p><p>Date: ____________________</p></div>
        </div>
      ` : ""}
    </div>
    ` : ""}
  </section>`;
  }).join("");
  const termsPages = showTermsSections
    ? chunkTermsSections(document.termsSections).map((sections, index) => `<section class="page terms">
        ${index === 0 ? "<h1>Terms and Conditions</h1>" : `<p class="continued-label">Terms and Conditions continued</p>`}
        ${renderTermsSectionsHtml(sections)}
      </section>`).join("")
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} - ${escapeHtml(document.jobName)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #1f2933; margin: 0; background: #f6f4ef; }
    .page { width: 794px; min-height: 1123px; margin: 24px auto; background: white; padding: 52px 58px; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    h1 { margin: 0; font-size: 34px; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 28px 0 10px; font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: #5f6f52; border-bottom: 1px solid #d7dece; padding-bottom: 6px; }
    h3 { margin: 18px 0 6px; font-size: 13px; color: #1f2933; }
    p { font-size: 12px; line-height: 1.55; margin: 0 0 8px; }
    .top { display: flex; justify-content: space-between; gap: 32px; align-items: flex-start; border-bottom: 3px solid #6f7f61; padding-bottom: 18px; }
    .brand-wrap { display:flex; flex-direction:column; align-items:flex-end; gap:10px; }
    .brand-logo { max-width: 320px; max-height: 82px; object-fit: contain; }
    .brand { font-size: 12px; line-height: 1.6; text-align: right; color: #4b5563; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .box { border: 1px solid #d7dece; padding: 14px; min-height: 90px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td, th { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.08em; }
    .right { text-align: right; }
    .summary { margin-left: auto; width: 320px; }
    .summary td { padding: 8px 0; }
    .summary .total td { border-top: 2px solid #6f7f61; font-size: 15px; font-weight: 700; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; margin-top: 22px; page-break-inside: avoid; }
    .signature-line { border-bottom: 1px solid #1f2933; height: 34px; margin-bottom: 8px; }
    .terms { page-break-before: always; break-before: page; }
    .muted { color: #6b7280; }
    .line-items thead { display: table-header-group; }
    .line-items tbody tr { page-break-inside: avoid; }
    .line-items tbody tr:nth-child(even) { background: #f8faf9; }
    .line-items .section-row td { background: #eef3eb; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5f6f52; }
    .summary-group { page-break-inside: avoid; }
    .continued-label { margin-top: 10px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
    .continuation-note { margin: 10px 0 0; font-size: 11px; text-align: right; color: #6b7280; font-style: italic; }
    @page { size: A4; margin: 12mm; }
    @media print {
      body { margin: 0; background: white; }
      .page {
        width: auto;
        min-height: 0;
        margin: 0;
        box-shadow: none;
        break-after: auto;
        page-break-after: auto;
      }
      .page + .page {
        break-before: page;
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  ${mainPages}
  ${termsPages}
</body>
</html>`;
}

function pdfEscape(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function wrapText(value: unknown, max = 92) {
  const words = String(value ?? "").replace(/\r/g, "").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (!word) return;
    if (`${current} ${word}`.trim().length > max) {
      if (current) lines.push(current);
      current = word;
      return;
    }
    current = `${current} ${word}`.trim();
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buildPdfTableLines(items: QuoteDocumentLineItem[]) {
  const lines = ["DESCRIPTION | QTY | UNIT | TOTAL"];
  items.forEach((item) => {
    const wrappedDescription = wrapText(item.description, 52);
    lines.push(`${wrappedDescription[0] || item.description} | ${item.quantity} | ${item.unit} | ${money(item.total)}`);
    wrappedDescription.slice(1).forEach((line) => lines.push(`  ${line}`));
  });
  return lines;
}

function buildPdfDocumentPages(document: QuoteDocumentInput) {
  const title = document.documentType === "quote" ? "QUOTE" : "CONTRACT";
  const pagination = buildQuoteLineItemPagination(document);
  const pages = pagination.pages.map((items, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    const showSummary = pageIndex === pagination.summaryPageIndex;
    const continuesAfter = pageIndex < pagination.summaryPageIndex;
    const lines: string[] = [
      title,
      `Millbrook Furniture Ltd    GST Reg. Number: ${MILLBROOK_GST_NUMBER}`,
      `Issue Date: ${document.issueDate}`,
      "",
    ];
    if (isFirstPage) {
      lines.push(
        "SUBMITTED TO",
        `Customer: ${document.customerName}`,
        `Phone: ${document.customerPhone || "-"}`,
        `Email: ${document.customerEmail || "-"}`,
        "",
        "JOB",
        `Job Name: ${document.jobName}`,
        `Address: ${document.jobAddress || "-"}`,
        "",
        "JOB NOTES / SPECIFICATIONS",
        ...wrapText([document.jobNotes, document.scopeNotes, document.specificationNotes].filter(Boolean).join("  "), 88),
        "",
      );
    } else {
      lines.push(CONTINUATION_HEADER_TEXT.toUpperCase(), "");
    }
    lines.push("QUOTE LINE SUMMARY", ...buildPdfTableLines(items));
    if (continuesAfter) {
      lines.push("", CONTINUATION_NOTE_TEXT.toUpperCase());
    }
    if (showSummary) {
      lines.push(
        "",
        "PRICE",
        "We propose to furnish material and labor in accordance with the above specification for the sum of:",
        `Sub-Total: ${money(document.subtotalExGst)}`,
        `Tax: ${money(document.gstAmount)}`,
        `Total: ${money(document.totalIncGst)}`,
      );
      if (document.documentType === "contract") {
        lines.push(
          "",
          "PAYMENT SCHEDULE",
          `Deposit: ${money(document.depositAmount)}`,
          `Balance Due: ${money(document.balanceDue)}`,
          "",
          "PAYMENT TERMS",
          ...wrapText(document.paymentTerms, 88),
          "",
          "DISCLAIMER",
          ...wrapText(document.disclaimer, 88),
          "",
          "SIGNATURES",
          "Client Name: ________________________________   Signature: ________________________________",
          "Client Name: ________________________________   Signature: ________________________________",
          "Date: ____________________"
        );
      }
    }
    return lines;
  });

  if (Array.isArray(document.termsSections) && document.termsSections.length > 0) {
    const termsPages = chunkTermsSections(document.termsSections).map((sections, index) => {
      const lines = [index === 0 ? "TERMS AND CONDITIONS" : "TERMS AND CONDITIONS CONTINUED"];
      sections.forEach((section) => {
        lines.push("", section.title.toUpperCase(), ...wrapText(section.body, 88));
      });
      return lines;
    });
    pages.push(...termsPages);
  }

  return pages;
}

function makePdfPage(lines: string[]) {
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...lines.map((line, index) => `${index === 0 ? "" : "T* "}${line ? `(${pdfEscape(line)}) Tj` : ""}`.trim()),
    "ET",
  ].join("\n");
  return content;
}

export function generateQuoteDocumentPdf(document: QuoteDocumentInput) {
  const logicalPages = buildPdfDocumentPages(document)
    .flatMap((page) => {
      const chunks: string[][] = [];
      for (let index = 0; index < page.length; index += 48) {
        chunks.push(page.slice(index, index + 48));
      }
      return chunks;
    });
  const pageCount = Math.max(1, logicalPages.length);
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids ${Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ")} /Count ${pageCount} >>`);
  logicalPages.forEach((lines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pageCount * 2} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    const stream = makePdfPage(lines);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function buildClientFacingDocumentPayload(document: QuoteDocumentInput) {
  const { errors, warnings } = validateQuoteDocument(document);
  return {
    document,
    html: renderQuoteDocumentHtml(document),
    errors,
    warnings,
  };
}
