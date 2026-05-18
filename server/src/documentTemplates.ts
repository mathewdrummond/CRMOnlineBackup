import { DEFAULT_DISCLAIMER, DEFAULT_PAYMENT_TERMS, DEFAULT_TERMS_SECTIONS, GST_RATE, MILLBROOK_GST_NUMBER, QuoteDocumentInput, roundMoney } from "./quoteDocuments";
import { getMillbrookCompanyLogoDataUri, MILLBROOK_LOGO_ALT } from "./companyBranding";
import { EntityRecord } from "./types";

export const TEMPLATE_PAGE_SIZE = {
  a4: { width: 794, height: 1123 },
};

export const SAFE_TEMPLATE_FIELDS = [
  { group: "Customer", key: "customer.name", label: "Customer name" },
  { group: "Customer", key: "customer.phone", label: "Customer phone" },
  { group: "Customer", key: "customer.email", label: "Customer email" },
  { group: "Customer", key: "customer.address", label: "Customer address" },
  { group: "Job", key: "job.name", label: "Job name" },
  { group: "Job", key: "job.number", label: "Job number" },
  { group: "Job", key: "job.address", label: "Job address" },
  { group: "Job", key: "job.notes", label: "Job notes" },
  { group: "Job", key: "job.scope", label: "Job scope" },
  { group: "Job", key: "job.specifications", label: "Job specifications" },
  { group: "Quote", key: "quote.subtotalExGst", label: "Subtotal ex GST" },
  { group: "Quote", key: "quote.gstAmount", label: "GST amount" },
  { group: "Quote", key: "quote.totalIncGst", label: "Total inc GST" },
  { group: "Quote", key: "quote.depositAmount", label: "Deposit" },
  { group: "Quote", key: "quote.balanceDue", label: "Balance due" },
  { group: "Quote", key: "quote.issueDate", label: "Issue date" },
  { group: "Quote", key: "quote.expiryDate", label: "Expiry date" },
  { group: "Quote", key: "quote.quoteNumber", label: "Quote number" },
  { group: "Quote", key: "quote.preparedBy", label: "Prepared by" },
  { group: "Quote", key: "quote.generatedAt", label: "Generated date/time" },
  { group: "Company", key: "company.name", label: "Company name" },
  { group: "Company", key: "company.gstNumber", label: "GST number" },
  { group: "Company", key: "company.phone", label: "Company phone" },
  { group: "Company", key: "company.email", label: "Company email" },
  { group: "Company", key: "company.address", label: "Company address" },
  { group: "Company", key: "company.logo", label: "Company logo" },
  { group: "Line items", key: "lineItems.description", label: "Line item description" },
  { group: "Line items", key: "lineItems.quantity", label: "Line item quantity" },
  { group: "Line items", key: "lineItems.unitPrice", label: "Line item unit price" },
  { group: "Line items", key: "lineItems.notes", label: "Line item notes" },
  { group: "Line items", key: "lineItems.gstTreatment", label: "Line item GST treatment" },
  { group: "Line items", key: "lineItems.total", label: "Line item total" },
  { group: "Page", key: "page.number", label: "Page number" },
  { group: "Page", key: "page.count", label: "Page count" },
  { group: "Terms", key: "terms.paymentTerms", label: "Payment terms" },
  { group: "Terms", key: "terms.disclaimer", label: "Disclaimer" },
  { group: "Terms", key: "terms.termsAndConditions", label: "Terms and conditions" },
];

const SAFE_FIELD_KEYS = new Set(SAFE_TEMPLATE_FIELDS.map((field) => field.key));
const INTERNAL_FIELD_PATTERN = /(margin|markup|labou?r[_\s-]*(cost|rate)|internal|buy[_\s-]*cost|gross[_\s-]*profit|notes_internal)/i;

export type DocumentTemplateType = "quote" | "contract" | "invoice" | "quote_list";
export type TemplateBlockType = "text" | "richText" | "field" | "table" | "image" | "line" | "signature" | "terms" | "spacer";

export type TemplateBlock = {
  id: string;
  templateId?: string;
  pageIndex: number;
  type: TemplateBlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  styleJson?: Record<string, unknown>;
  contentJson?: Record<string, unknown>;
  bindingKey?: string;
  repeatSource?: string;
  sortOrder?: number;
};

export type NormalizedDocumentTemplate = {
  id?: string;
  name: string;
  type: DocumentTemplateType;
  status: "draft" | "published" | "archived";
  pageSize: "a4";
  margins: { top: number; right: number; bottom: number; left: number };
  defaultFont: string;
  sourceType: "native" | "imported_mozaik" | "imported_pdf" | "duplicated";
  blocks: TemplateBlock[];
  version?: number;
};

type DocumentLineItem = QuoteDocumentInput["lineItems"][number];

type RenderedTemplateBlock = {
  block: TemplateBlock;
  tableItems?: DocumentLineItem[];
  tableContinuationHeader?: boolean;
  tableContinuationFooter?: boolean;
  termsSectionsOverride?: QuoteDocumentInput["termsSections"];
  termsContinuationHeader?: boolean;
};

type RenderedTemplatePage = {
  blocks: RenderedTemplateBlock[];
};

const CONTINUATION_NOTE_TEXT = "Cont. on next page";
const CONTINUATION_HEADER_TEXT = "Quote line items continued";

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeRichText(value: unknown) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, "");
}

function money(value: number) {
  return `$${roundMoney(value).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function styleToCss(style: Record<string, unknown> = {}) {
  const css: string[] = [];
  const fontSize = Number(style.fontSize || 12);
  css.push(`font-size:${Math.max(7, Math.min(fontSize, 72))}px`);
  css.push(`font-family:${escapeHtml(String(style.fontFamily || "Arial, Helvetica, sans-serif"))}`);
  css.push(`font-weight:${style.fontWeight === "bold" || style.fontWeight === 700 ? "700" : "400"}`);
  css.push(`color:${escapeHtml(String(style.color || "#1f2933"))}`);
  css.push(`text-align:${["left", "center", "right"].includes(String(style.textAlign)) ? style.textAlign : "left"}`);
  css.push(`padding:${Math.max(0, Math.min(Number(style.padding || 0), 48))}px`);
  if (style.backgroundColor) css.push(`background:${escapeHtml(String(style.backgroundColor))}`);
  if (style.borderColor) css.push(`border:1px solid ${escapeHtml(String(style.borderColor))}`);
  if (style.borderBottomColor) css.push(`border-bottom:1px solid ${escapeHtml(String(style.borderBottomColor))}`);
  if (style.lineHeight) css.push(`line-height:${Math.max(1, Math.min(Number(style.lineHeight), 3))}`);
  return css.join(";");
}

function blockCss(block: TemplateBlock) {
  return [
    "position:absolute",
    `left:${Math.max(0, Number(block.x || 0))}px`,
    `top:${Math.max(0, Number(block.y || 0))}px`,
    `width:${Math.max(1, Number(block.width || 1))}px`,
    `height:${Math.max(1, Number(block.height || 1))}px`,
    "box-sizing:border-box",
    "overflow:hidden",
    styleToCss(block.styleJson),
  ].join(";");
}

function buildTemplateContext(document: QuoteDocumentInput, renderContext: { pageNumber?: number; pageCount?: number } = {}) {
  const termsAndConditions = document.termsSections.map((section) => `${section.title}\n${section.body}`).join("\n\n");
  return {
    customer: {
      name: document.customerName,
      phone: document.customerPhone,
      email: document.customerEmail,
      address: document.jobAddress,
    },
    job: {
      name: document.jobName,
      number: document.jobId || document.quoteId,
      address: document.jobAddress,
      notes: document.jobNotes,
      scope: document.scopeNotes,
      specifications: document.specificationNotes,
    },
    quote: {
      subtotalExGst: money(document.subtotalExGst),
      gstAmount: money(document.gstAmount),
      totalIncGst: money(document.totalIncGst),
      depositAmount: money(document.depositAmount),
      balanceDue: money(document.balanceDue),
      issueDate: document.issueDate,
      expiryDate: "",
      quoteNumber: document.quoteNumber || document.quoteId,
      preparedBy: document.preparedBy || "",
      generatedAt: document.generatedAt || document.issueDate,
    },
    company: {
      name: "Millbrook Furniture Ltd",
      gstNumber: MILLBROOK_GST_NUMBER,
      phone: "",
      email: "",
      address: "",
      logo: getMillbrookCompanyLogoDataUri(),
    },
    terms: {
      paymentTerms: document.paymentTerms,
      disclaimer: document.disclaimer,
      termsAndConditions,
    },
    page: {
      number: renderContext.pageNumber || 1,
      count: renderContext.pageCount || 1,
    },
  };
}

function readPath(source: Record<string, unknown>, key: string) {
  return key.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return "";
    return (value as Record<string, unknown>)[part];
  }, source);
}

export function findUnsafeMergeFields(value: unknown) {
  const text = String(value ?? "");
  const matches = [...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((match) => match[1].trim());
  return [...new Set(matches.filter((key) => !SAFE_FIELD_KEYS.has(key) || INTERNAL_FIELD_PATTERN.test(key)))];
}

export function replaceMergeFields(value: unknown, document: QuoteDocumentInput, renderContext: { pageNumber?: number; pageCount?: number } = {}) {
  const context = buildTemplateContext(document, renderContext) as unknown as Record<string, unknown>;
  return String(value ?? "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const bindingKey = String(key || "").trim();
    if (!SAFE_FIELD_KEYS.has(bindingKey) || INTERNAL_FIELD_PATTERN.test(bindingKey)) return "";
    const resolved = readPath(context, bindingKey);
    return String(resolved ?? "");
  });
}

function blockText(block: TemplateBlock, document: QuoteDocumentInput, renderContext: { pageNumber?: number; pageCount?: number } = {}) {
  const content = block.contentJson || {};
  if (block.type === "field") {
    return replaceMergeFields(`{{${block.bindingKey || content.bindingKey || ""}}}`, document, renderContext);
  }
  return replaceMergeFields(content.text || content.html || "", document, renderContext);
}

function estimateWrappedLineCount(value: unknown, max = 42) {
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

function estimateTableRowUnits(item: DocumentLineItem, maxChars = 42) {
  return Math.max(
    estimateWrappedLineCount(item.description, maxChars),
    estimateWrappedLineCount(item.unit, 10),
  );
}

function chunkLineItemsByCapacity(items: DocumentLineItem[], capacities: number[]) {
  const rows = items.map((item) => ({ item, units: estimateTableRowUnits(item) }));
  const pages: DocumentLineItem[][] = [];
  let index = 0;
  let capacityIndex = 0;
  while (index < rows.length) {
    const capacity = Math.max(1, capacities[Math.min(capacityIndex, capacities.length - 1)] || capacities[capacities.length - 1] || 1);
    let used = 0;
    const chunk: DocumentLineItem[] = [];
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

function normalizeGstTreatmentLabel(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return normalized.replace(/_/g, " ");
}

function resolveTemplateTableItems(document: QuoteDocumentInput, block?: TemplateBlock) {
  const content = (block?.contentJson && typeof block.contentJson === "object" ? block.contentJson : {}) as Record<string, unknown>;
  const includeExcluded = content.includeExcludedItems === true;
  return document.lineItems.filter((item) => includeExcluded || item.isOptional !== true);
}

function renderLineItemsTable(items: DocumentLineItem[], options: {
  showNotes?: boolean;
  showGstTreatment?: boolean;
  showTotal?: boolean;
} = {}) {
  const showNotes = options.showNotes === true;
  const showGstTreatment = options.showGstTreatment === true;
  const showTotal = options.showTotal !== false;
  let previousSection = "";
  const columnCount = 3 + (showNotes ? 1 : 0) + (showGstTreatment ? 1 : 0) + (showTotal ? 1 : 0);
  return `<table class="jf-line-items"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th>${showNotes ? "<th>Notes</th>" : ""}${showGstTreatment ? "<th>GST</th>" : ""}${showTotal ? "<th>Total</th>" : ""}</tr></thead><tbody>${items.map((item) => {
    const section = String(item.section || "General").trim() || "General";
    const showSection = section !== previousSection;
    previousSection = section;
    return `${showSection ? `<tr class="jf-section-row"><td colspan="${columnCount}">${escapeHtml(section)}</td></tr>` : ""}<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit)}</td>${showNotes ? `<td>${escapeHtml(item.notes || "").replace(/\n/g, "<br />")}</td>` : ""}${showGstTreatment ? `<td>${escapeHtml(normalizeGstTreatmentLabel(item.gstTreatment) || "-")}</td>` : ""}${showTotal ? `<td>${money(item.total)}</td>` : ""}</tr>`;
  }).join("")}</tbody></table>`;
}

function estimateTermsSectionUnits(section: QuoteDocumentInput["termsSections"][number]) {
  return 3 + estimateWrappedLineCount(section.title, 44) + estimateWrappedLineCount(section.body, 94);
}

function chunkTemplateTermsSections(
  sections: QuoteDocumentInput["termsSections"],
  capacity: number,
  continuationCapacity: number
) {
  const pages: QuoteDocumentInput["termsSections"][] = [];
  let currentPage: QuoteDocumentInput["termsSections"] = [];
  let usedUnits = 0;
  let pageCapacity = capacity;

  sections.forEach((section) => {
    const sectionUnits = estimateTermsSectionUnits(section);
    if (currentPage.length > 0 && usedUnits + sectionUnits > pageCapacity) {
      pages.push(currentPage);
      currentPage = [];
      usedUnits = 0;
      pageCapacity = continuationCapacity;
    }
    currentPage.push(section);
    usedUnits += sectionUnits;
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [[]];
}

function renderTerms(document: QuoteDocumentInput, sections = document.termsSections, options: { continuationHeader?: boolean } = {}) {
  return `${options.continuationHeader ? `<div class="jf-terms-continuation-header">${escapeHtml("Terms and Conditions continued")}</div>` : ""}${sections.map((section) => `<h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body).replace(/\n/g, "<br />")}</p>`).join("")}`;
}

function renderSignatureBlock() {
  return `<div class="jf-signatures"><div><div class="jf-signature-line"></div><p>Client Name</p><div class="jf-signature-line"></div><p>Signature</p></div><div><div class="jf-signature-line"></div><p>Client Name</p><div class="jf-signature-line"></div><p>Signature</p><p>Date: ____________________</p></div></div>`;
}

function renderBlock(
  block: TemplateBlock,
  document: QuoteDocumentInput,
  options: {
    tableItems?: DocumentLineItem[];
    tableContinuationHeader?: boolean;
    tableContinuationFooter?: boolean;
    termsSectionsOverride?: QuoteDocumentInput["termsSections"];
    termsContinuationHeader?: boolean;
    pageNumber?: number;
    pageCount?: number;
  } = {}
) {
  const content = block.contentJson || {};
  if (block.type === "line") {
    return `<div class="jf-block jf-line" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}"></div>`;
  }
  if (block.type === "table") {
    const tableSettings = content && typeof content === "object" ? content as Record<string, unknown> : {};
    return `<div class="jf-block jf-table-block" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}">
      ${options.tableContinuationHeader ? `<div class="jf-table-continuation-header">${escapeHtml(CONTINUATION_HEADER_TEXT)}</div>` : ""}
      <div class="jf-table-inner">${renderLineItemsTable(options.tableItems || document.lineItems, {
        showNotes: tableSettings.showNotes === true,
        showGstTreatment: tableSettings.showGstTreatment === true,
        showTotal: tableSettings.showTotal !== false,
      })}</div>
      ${options.tableContinuationFooter ? `<div class="jf-table-continuation-note">${escapeHtml(CONTINUATION_NOTE_TEXT)}</div>` : ""}
    </div>`;
  }
  if (block.type === "signature") {
    return `<div class="jf-block" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}">${renderSignatureBlock()}</div>`;
  }
  if (block.type === "terms") {
    return `<div class="jf-block jf-terms" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}">${renderTerms(document, options.termsSectionsOverride || document.termsSections, { continuationHeader: options.termsContinuationHeader })}</div>`;
  }
  if (block.type === "image") {
    const src = replaceMergeFields(content.src || "", document, options);
    return `<div class="jf-block" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}">${src ? `<img alt="${escapeHtml(MILLBROOK_LOGO_ALT)}" src="${escapeHtml(src)}" />` : ""}</div>`;
  }
  if (block.type === "richText") {
    return `<div class="jf-block" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}">${sanitizeRichText(replaceMergeFields(content.html || content.text || "", document, options))}</div>`;
  }
  return `<div class="jf-block" data-block-id="${escapeHtml(block.id)}" style="${blockCss(block)}">${escapeHtml(blockText(block, document, options)).replace(/\n/g, "<br />")}</div>`;
}

export function normalizeDocumentTemplate(record: Partial<EntityRecord> | null | undefined): NormalizedDocumentTemplate | null {
  if (!record) return null;
  const source = (record.template_json && typeof record.template_json === "object" ? record.template_json : record) as Record<string, unknown>;
  const type = String(source.type || source.document_type || "contract") as DocumentTemplateType;
  const blocks = Array.isArray(source.blocks) ? source.blocks as TemplateBlock[] : Array.isArray(record.blocks) ? record.blocks as TemplateBlock[] : [];
  return {
    id: String(record.id || source.id || ""),
    name: String(source.name || record.name || "Untitled Template"),
    type: ["quote", "contract", "invoice", "quote_list"].includes(type) ? type : "contract",
    status: String(source.status || record.status || "draft") as NormalizedDocumentTemplate["status"],
    pageSize: "a4",
    margins: {
      top: Number((source.margins as Record<string, unknown>)?.top ?? record.margin_top ?? 48),
      right: Number((source.margins as Record<string, unknown>)?.right ?? record.margin_right ?? 48),
      bottom: Number((source.margins as Record<string, unknown>)?.bottom ?? record.margin_bottom ?? 48),
      left: Number((source.margins as Record<string, unknown>)?.left ?? record.margin_left ?? 48),
    },
    defaultFont: String(source.defaultFont || record.default_font || "Arial"),
    sourceType: String(source.sourceType || record.source_type || "native") as NormalizedDocumentTemplate["sourceType"],
    blocks: blocks.map((block, index) => {
      const rawBlock = block as TemplateBlock & { page_index?: unknown; sort_order?: unknown };
      return {
        ...block,
        id: String(block.id || makeId("block")),
        pageIndex: Math.max(0, Number(block.pageIndex ?? rawBlock.page_index ?? 0)),
        x: Number(block.x || 0),
        y: Number(block.y || 0),
        width: Number(block.width || 100),
        height: Number(block.height || 40),
        sortOrder: Number(block.sortOrder ?? rawBlock.sort_order ?? index),
      };
    }),
    version: Number(source.version || record.version || 1),
  };
}

function estimateTableCapacityFromHeight(
  height: number,
  style: Record<string, unknown> = {},
  options: { showContinuationHeader?: boolean; showContinuationFooter?: boolean } = {}
) {
  const fontSize = Number(style.fontSize || 11);
  const rowHeight = Math.max(22, Math.round(fontSize * 2.1));
  const headerHeight = Math.max(26, Math.round(fontSize * 2.3));
  const continuationOverhead =
    (options.showContinuationHeader ? 22 : 0) +
    (options.showContinuationFooter ? 22 : 0) +
    (options.showContinuationHeader || options.showContinuationFooter ? 8 : 0);
  return Math.max(1, Math.floor((Math.max(0, height) - headerHeight - continuationOverhead) / rowHeight));
}

function cloneBlockWithLayout(block: TemplateBlock, layout: Partial<Pick<TemplateBlock, "x" | "y" | "width" | "height">>) {
  return {
    ...block,
    x: layout.x ?? block.x,
    y: layout.y ?? block.y,
    width: layout.width ?? block.width,
    height: layout.height ?? block.height,
  };
}

function paginateTemplateBlocks(template: NormalizedDocumentTemplate, document: QuoteDocumentInput) {
  const basePageCount = Math.max(1, ...template.blocks.map((block) => Number(block.pageIndex || 0) + 1));
  const renderedPages: RenderedTemplatePage[] = [];
  const pageSize = TEMPLATE_PAGE_SIZE[template.pageSize] || TEMPLATE_PAGE_SIZE.a4;
  const bottomMargin = Number(template.margins?.bottom || 48);

  for (let pageIndex = 0; pageIndex < basePageCount; pageIndex += 1) {
    const pageBlocks = template.blocks
      .filter((block) => Number(block.pageIndex || 0) === pageIndex)
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
    const tableBlock = pageBlocks.find((block) => block.type === "table");
    const termsBlock = pageBlocks.find((block) => block.type === "terms");

    if (!tableBlock && !termsBlock) {
      renderedPages.push({ blocks: pageBlocks.map((block) => ({ block })) });
      continue;
    }

    if (!tableBlock && termsBlock) {
      const beforeTermsBlocks = pageBlocks.filter((block) => block.id !== termsBlock.id && Number(block.y || 0) < Number(termsBlock.y || 0));
      const afterTermsBlocks = pageBlocks.filter((block) => block.id !== termsBlock.id && Number(block.y || 0) > Number(termsBlock.y || 0));
      const termsCapacity = Math.max(1, Math.floor(Number(termsBlock.height || 0) / 22));
      const continuationTermsCapacity = Math.max(1, termsCapacity - 2);
      const termChunks = chunkTemplateTermsSections(document.termsSections, termsCapacity, continuationTermsCapacity);

      termChunks.forEach((chunk, chunkIndex) => {
        const isFirstChunk = chunkIndex === 0;
        const isLastChunk = chunkIndex === termChunks.length - 1;
        renderedPages.push({
          blocks: [
            ...(isFirstChunk ? beforeTermsBlocks.map((block) => ({ block })) : []),
            {
              block: termsBlock,
              termsSectionsOverride: chunk,
              termsContinuationHeader: !isFirstChunk,
            },
            ...(isLastChunk ? afterTermsBlocks.map((block) => ({ block })) : []),
          ],
        });
      });
      continue;
    }

    if (!tableBlock) {
      renderedPages.push({ blocks: pageBlocks.map((block) => ({ block })) });
      continue;
    }

    const beforeTableBlocks = pageBlocks.filter((block) => block.id !== tableBlock.id && Number(block.y || 0) < Number(tableBlock.y || 0));
    const afterTableBlocks = pageBlocks.filter((block) => block.id !== tableBlock.id && Number(block.y || 0) > Number(tableBlock.y || 0));
    const repeatableHeaderBlocks = beforeTableBlocks.filter((block) => Number(block.y || 0) < 160);
    const repeatedHeaderBottom = repeatableHeaderBlocks.length > 0
      ? Math.max(...repeatableHeaderBlocks.map((block) => Number(block.y || 0) + Number(block.height || 0)))
      : Number(tableBlock.y || 0);
    const nextBlockTop = afterTableBlocks.length > 0 ? Math.min(...afterTableBlocks.map((block) => Number(block.y || 0))) : Number.MAX_SAFE_INTEGER;
    const tableHeight = Math.min(Number(tableBlock.height || 0), nextBlockTop - Number(tableBlock.y || 0) - 16);
    const continuationTableY = Math.max(0, repeatedHeaderBottom + 24);
    const expandedContinuationHeight = Math.max(
      Number(tableBlock.height || 0),
      pageSize.height - bottomMargin - continuationTableY
    );
    const finalContinuationHeight = Math.max(
      Number(tableBlock.height || 0),
      Math.min(expandedContinuationHeight, nextBlockTop - continuationTableY - 16)
    );
    const tableItems = resolveTemplateTableItems(document, tableBlock);
    const singlePageCapacity = estimateTableCapacityFromHeight(tableHeight, tableBlock.styleJson);
    const firstContinuationCapacity = estimateTableCapacityFromHeight(tableHeight, tableBlock.styleJson, { showContinuationFooter: true });
    const middleContinuationCapacity = estimateTableCapacityFromHeight(expandedContinuationHeight, tableBlock.styleJson, { showContinuationHeader: true, showContinuationFooter: true });
    const finalContinuationCapacity = estimateTableCapacityFromHeight(finalContinuationHeight, tableBlock.styleJson, { showContinuationHeader: true });

    if (tableItems.length === 0 || tableItems.reduce((sum, item) => sum + estimateTableRowUnits(item), 0) <= singlePageCapacity) {
      renderedPages.push({
        blocks: pageBlocks.map((block) => ({
          block,
          tableItems: block.id === tableBlock.id ? tableItems : undefined,
        })),
      });
      continue;
    }

    const finalCapacity = afterTableBlocks.length > 0 ? Math.max(1, finalContinuationCapacity) : finalContinuationCapacity;
    const chunks = chunkLineItemsByCapacity(tableItems, [firstContinuationCapacity, middleContinuationCapacity, middleContinuationCapacity, finalCapacity]);

    chunks.forEach((chunk, chunkIndex) => {
      const isFirstChunk = chunkIndex === 0;
      const isLastChunk = chunkIndex === chunks.length - 1;
      const shouldIncludeAfterBlocks = isLastChunk && afterTableBlocks.length > 0;
      const continuationBlock = cloneBlockWithLayout(tableBlock, {
        y: continuationTableY,
        height: shouldIncludeAfterBlocks ? finalContinuationHeight : expandedContinuationHeight,
      });
      renderedPages.push({
        blocks: [
          ...(isFirstChunk ? beforeTableBlocks : repeatableHeaderBlocks).map((block) => ({ block })),
          {
            block: isFirstChunk ? tableBlock : continuationBlock,
            tableItems: chunk,
            tableContinuationHeader: !isFirstChunk,
            tableContinuationFooter: !isLastChunk,
          },
          ...(shouldIncludeAfterBlocks ? afterTableBlocks.map((block) => ({ block })) : []),
        ],
      });
    });
  }

  return renderedPages;
}

export function renderDocumentTemplateHtml(templateRecord: Partial<EntityRecord> | NormalizedDocumentTemplate, document: QuoteDocumentInput) {
  const template = "blocks" in templateRecord && Array.isArray(templateRecord.blocks)
    ? templateRecord as NormalizedDocumentTemplate
    : normalizeDocumentTemplate(templateRecord as Partial<EntityRecord>);
  if (!template) throw new Error("Template is required.");
  const pageSize = TEMPLATE_PAGE_SIZE.a4;
  const paginatedPages = paginateTemplateBlocks(template, document);
  const pages = paginatedPages
    .map((page, pageIndex) => `<section class="jf-page">${page.blocks.map(({ block, tableItems, tableContinuationHeader, tableContinuationFooter, termsSectionsOverride, termsContinuationHeader }) => renderBlock(block, document, {
      tableItems,
      tableContinuationHeader,
      tableContinuationFooter,
      termsSectionsOverride,
      termsContinuationHeader,
      pageNumber: pageIndex + 1,
      pageCount: paginatedPages.length,
    })).join("")}</section>`);
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(template.name)}</title><style>
body{margin:0;background:#f6f4ef;color:#1f2933;font-family:${escapeHtml(template.defaultFont)},Arial,sans-serif}
.jf-page{position:relative;width:${pageSize.width}px;height:${pageSize.height}px;margin:24px auto;background:white;box-shadow:0 10px 30px rgba(0,0,0,.08);box-sizing:border-box;overflow:hidden;page-break-after:always}
.jf-line{border-top:1px solid #6f7f61}
.jf-line-items{width:100%;border-collapse:collapse;font-size:11px}
.jf-line-items th,.jf-line-items td{border-bottom:1px solid #e5e7eb;padding:5px;text-align:left;vertical-align:top}
.jf-line-items th:last-child,.jf-line-items td:last-child{text-align:right}
.jf-line-items th{font-size:9px;text-transform:uppercase;color:#6b7280;letter-spacing:.06em}
.jf-line-items thead{display:table-header-group}
.jf-line-items tbody tr{page-break-inside:avoid}
.jf-line-items tbody tr:nth-child(even){background:#f8faf9}
.jf-line-items .jf-section-row td{background:#eef3eb;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5f6f52}
.jf-table-block{display:flex;flex-direction:column;gap:6px}
.jf-table-inner{flex:1;overflow:hidden}
.jf-table-continuation-header{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
.jf-table-continuation-note{margin-top:auto;font-size:10px;text-align:right;color:#6b7280;font-style:italic}
.jf-signatures{display:grid;grid-template-columns:1fr 1fr;gap:28px;font-size:11px}
.jf-signature-line{border-bottom:1px solid #111827;height:28px;margin-bottom:6px}
.jf-terms h3{font-size:12px;margin:0 0 5px}.jf-terms p{font-size:10px;line-height:1.35;margin:0 0 10px}
.jf-terms-continuation-header{margin:0 0 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
.jf-block img{max-width:100%;max-height:100%;object-fit:contain}
@page{size:A4;margin:12mm}
@media print{
body{margin:0;background:white}
.jf-page{
width:${pageSize.width}px;
height:${pageSize.height}px;
min-height:${pageSize.height}px;
margin:0;
box-shadow:none;
overflow:hidden;
break-after:page;
page-break-after:always
}
.jf-page:last-child{break-after:auto;page-break-after:auto}
}
</style></head><body>${pages.join("")}</body></html>`;
}

function buildPdfLinesFromTemplate(template: NormalizedDocumentTemplate, document: QuoteDocumentInput) {
  const pages = paginateTemplateBlocks(template, document);
  return pages.map((page, pageIndex) => {
    const lines: string[] = [];
    const tableStateByBlockId = new Map(
      page.blocks
        .filter((entry) => entry.block.type === "table")
        .map((entry) => [entry.block.id, entry] as const)
    );
    page.blocks
      .sort((left, right) => Number(left.block.y || 0) - Number(right.block.y || 0) || Number(left.block.x || 0) - Number(right.block.x || 0))
      .forEach(({ block, tableItems, termsSectionsOverride, termsContinuationHeader }) => {
        if (block.type === "line" || block.type === "image" || block.type === "spacer") return;
        if (block.type === "table") {
          const tableState = tableStateByBlockId.get(block.id);
          const tableSettings = block.contentJson && typeof block.contentJson === "object" ? block.contentJson as Record<string, unknown> : {};
          if (tableState?.tableContinuationHeader) {
            lines.push(CONTINUATION_HEADER_TEXT);
          }
          const showNotes = tableSettings.showNotes === true;
          const showGstTreatment = tableSettings.showGstTreatment === true;
          const showTotal = tableSettings.showTotal !== false;
          lines.push(`Description | Qty | Unit${showNotes ? " | Notes" : ""}${showGstTreatment ? " | GST" : ""}${showTotal ? " | Total" : ""}`);
          (tableItems || resolveTemplateTableItems(document, block)).forEach((item) => {
            lines.push(`${item.description} | ${item.quantity} | ${item.unit}${showNotes ? ` | ${String(item.notes || "").replace(/\s+/g, " ").trim() || "-"}` : ""}${showGstTreatment ? ` | ${normalizeGstTreatmentLabel(item.gstTreatment) || "-"}` : ""}${showTotal ? ` | ${money(item.total)}` : ""}`);
          });
          if (tableState?.tableContinuationFooter) {
            lines.push(CONTINUATION_NOTE_TEXT);
          }
          return;
        }
        if (block.type === "signature") {
          lines.push("Client Name: ________________________________   Signature: ________________________________", "Date: ____________________");
          return;
        }
        if (block.type === "terms") {
          if (termsContinuationHeader) {
            lines.push("TERMS AND CONDITIONS CONTINUED");
          }
          (termsSectionsOverride || document.termsSections).forEach((section) => lines.push(section.title, section.body));
          return;
        }
        String(blockText(block, document, { pageNumber: pageIndex + 1, pageCount: pages.length })).split(/\n+/).forEach((line) => {
          if (line.trim()) lines.push(line.trim());
        });
      });
    return lines.length ? lines : [template.name];
  });
}

function pdfEscape(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
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
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function makePdfPage(lines: string[]) {
  const content = ["BT", "/F1 10 Tf", "50 790 Td", "13 TL", ...lines.flatMap((line) => wrapText(line, 92)).slice(0, 58).map((line, index) => `${index === 0 ? "" : "T* "}${line ? `(${pdfEscape(line)}) Tj` : ""}`.trim()), "ET"].join("\n");
  return content;
}

export function generateDocumentTemplatePdf(templateRecord: Partial<EntityRecord> | NormalizedDocumentTemplate, document: QuoteDocumentInput) {
  const template = "blocks" in templateRecord && Array.isArray(templateRecord.blocks)
    ? templateRecord as NormalizedDocumentTemplate
    : normalizeDocumentTemplate(templateRecord as Partial<EntityRecord>);
  if (!template) throw new Error("Template is required.");
  const pages = buildPdfLinesFromTemplate(template, document);
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids ${pages.map((_page, index) => `${3 + index * 2} 0 R`).join(" ")} /Count ${pages.length} >>`);
  pages.forEach((lines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
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

function textBlock(pageIndex: number, x: number, y: number, width: number, height: number, text: string, styleJson: Record<string, unknown> = {}): TemplateBlock {
  return { id: makeId("block"), pageIndex, type: "text", x, y, width, height, contentJson: { text }, styleJson, sortOrder: y };
}

function imageBlock(pageIndex: number, x: number, y: number, width: number, height: number, src: string, styleJson: Record<string, unknown> = {}): TemplateBlock {
  return { id: makeId("block"), pageIndex, type: "image", x, y, width, height, contentJson: { src }, styleJson, sortOrder: y };
}

function tableBlock(pageIndex: number, x: number, y: number, width: number, height: number, contentJson: Record<string, unknown> = {}): TemplateBlock {
  return { id: makeId("block"), pageIndex, type: "table", x, y, width, height, repeatSource: "lineItems", contentJson, styleJson: { fontSize: 11 }, sortOrder: y };
}

export function buildDefaultDocumentTemplate(type: DocumentTemplateType = "contract"): NormalizedDocumentTemplate {
  if (type === "quote_list") {
    const blocks: TemplateBlock[] = [
      textBlock(0, 56, 40, 260, 38, "Quote List", { fontSize: 30, fontWeight: "bold" }),
      textBlock(0, 56, 82, 260, 22, "Internal pricing list", { fontSize: 12, color: "#6b7280" }),
      imageBlock(0, 420, 28, 318, 68, "{{company.logo}}"),
      textBlock(0, 420, 96, 318, 20, "Millbrook Furniture Solutions Ltd", { fontSize: 12, textAlign: "right", color: "#4b5563" }),
      { id: makeId("block"), pageIndex: 0, type: "line", x: 56, y: 120, width: 682, height: 1, styleJson: { borderBottomColor: "#6f7f61" }, contentJson: {}, sortOrder: 120 },
      textBlock(0, 56, 144, 320, 96, "Client: {{customer.name}}\nQuote: {{quote.quoteNumber}}\nJob: {{job.name}}\nPrepared by: {{quote.preparedBy}}", { fontSize: 12, borderColor: "#d7dece", padding: 10, lineHeight: 1.45 }),
      textBlock(0, 396, 144, 342, 96, "Document date: {{quote.issueDate}}\nGenerated: {{quote.generatedAt}}\nAddress: {{job.address}}", { fontSize: 12, borderColor: "#d7dece", padding: 10, lineHeight: 1.45 }),
      tableBlock(0, 56, 272, 682, 620, { showNotes: true, showGstTreatment: true, showTotal: true, includeExcludedItems: false }),
      textBlock(0, 430, 916, 308, 86, "Quote totals\nEx GST: {{quote.subtotalExGst}}\nGST: {{quote.gstAmount}}\nInc GST: {{quote.totalIncGst}}", { fontSize: 12, fontWeight: "bold", borderColor: "#d7dece", padding: 10, lineHeight: 1.45 }),
      textBlock(0, 56, 1036, 682, 24, "Internal quote list generated from JoinerFlow.  Page {{page.number}} of {{page.count}}", { fontSize: 10, color: "#6b7280", textAlign: "right" }),
    ];
    return {
      name: "Quote List",
      type,
      status: "draft",
      pageSize: "a4",
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      defaultFont: "Arial",
      sourceType: "native",
      blocks,
      version: 1,
    };
  }
  const isContract = type === "contract";
  const blocks: TemplateBlock[] = [
    textBlock(0, 56, 48, 260, 46, isContract ? "Contract" : "Quote", { fontSize: 34, fontWeight: "bold", letterSpacing: "0.08em" }),
    imageBlock(0, 382, 26, 356, 76, "{{company.logo}}"),
    textBlock(0, 430, 92, 308, 22, "GST Reg. Number: {{company.gstNumber}}", { fontSize: 12, textAlign: "right", color: "#4b5563" }),
    { id: makeId("block"), pageIndex: 0, type: "line", x: 56, y: 128, width: 682, height: 1, styleJson: { borderBottomColor: "#6f7f61" }, contentJson: {}, sortOrder: 128 },
    textBlock(0, 56, 156, 310, 122, "Submitted to:\nCustomer: {{customer.name}}\nPhone: {{customer.phone}}\nEmail: {{customer.email}}", { fontSize: 12, borderColor: "#d7dece", padding: 12, lineHeight: 1.45 }),
    textBlock(0, 388, 156, 350, 122, "Job Name: {{job.name}}\nAddress: {{job.address}}\nIssue Date: {{quote.issueDate}}", { fontSize: 12, borderColor: "#d7dece", padding: 12, lineHeight: 1.45 }),
    textBlock(0, 56, 302, 682, 118, "Job Notes / Specifications\n{{job.notes}}\n{{job.scope}}\n{{job.specifications}}", { fontSize: 12, padding: 8, lineHeight: 1.4 }),
    tableBlock(0, 56, 444, 682, 190),
    textBlock(0, 410, 662, 328, 122, "We propose to furnish material and labor in accordance with the above specification for the sum of:\nSub-Total: {{quote.subtotalExGst}}\nTax: {{quote.gstAmount}}\nTotal: {{quote.totalIncGst}}", { fontSize: 13, fontWeight: "bold", padding: 10, borderColor: "#d7dece", lineHeight: 1.45 }),
  ];

  if (isContract) {
    blocks.push(
      textBlock(0, 56, 814, 310, 82, "Payment Schedule\nDeposit: {{quote.depositAmount}}\nBalance Due: {{quote.balanceDue}}", { fontSize: 12, borderColor: "#d7dece", padding: 10 }),
      textBlock(0, 388, 814, 350, 82, "Payment Terms\n{{terms.paymentTerms}}", { fontSize: 11, borderColor: "#d7dece", padding: 10 }),
      { id: makeId("block"), pageIndex: 0, type: "signature", x: 56, y: 936, width: 682, height: 120, contentJson: {}, styleJson: { fontSize: 11 }, sortOrder: 936 }
    );
  }

  blocks.push(
    ...(isContract
      ? [textBlock(1, 56, 48, 682, 152, "Disclaimer\n{{terms.disclaimer}}", { fontSize: 11, padding: 10, borderColor: "#d7dece", lineHeight: 1.35 })]
      : []),
    textBlock(isContract ? 1 : 1, 56, isContract ? 232 : 48, 682, 36, "Terms and Conditions", { fontSize: 26, fontWeight: "bold" }),
    { id: makeId("block"), pageIndex: 1, type: "terms", x: 56, y: isContract ? 288 : 104, width: 682, height: isContract ? 740 : 924, contentJson: {}, styleJson: { fontSize: 10, lineHeight: 1.35 }, sortOrder: isContract ? 288 : 104 }
  );

  return {
    name: isContract ? "Millbrook Contract" : "Millbrook Quote",
    type,
    status: "draft",
    pageSize: "a4",
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    defaultFont: "Arial",
    sourceType: "native",
    blocks,
    version: 1,
  };
}

export function buildTemplateRecordPayload(template: NormalizedDocumentTemplate) {
  const normalized = normalizeDocumentTemplate(template) || template;
  return {
    name: normalized.name,
    template_key: normalized.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    type: normalized.type,
    document_type: normalized.type,
    status: normalized.status,
    pageSize: normalized.pageSize,
    page_size: normalized.pageSize,
    margins: normalized.margins,
    defaultFont: normalized.defaultFont,
    default_font: normalized.defaultFont,
    sourceType: normalized.sourceType,
    source_type: normalized.sourceType,
    blocks: normalized.blocks,
    template_json: normalized,
    version: normalized.version || 1,
    is_default: false,
  };
}

export function validateDocumentTemplate(templateRecord: Partial<EntityRecord> | NormalizedDocumentTemplate) {
  const template = "blocks" in templateRecord && Array.isArray(templateRecord.blocks)
    ? templateRecord as NormalizedDocumentTemplate
    : normalizeDocumentTemplate(templateRecord as Partial<EntityRecord>);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!template) {
    errors.push("Template is required.");
    return { errors, warnings };
  }
  if (!template.name.trim()) errors.push("Template name is required.");
  if (template.blocks.length === 0) errors.push("At least one page is required.");
  const allText = template.blocks.map((block) => `${block.bindingKey || ""} ${JSON.stringify(block.contentJson || {})}`).join("\n");
  if (!allText.includes("quote.totalIncGst")) warnings.push("No total field is present.");
  if (!allText.includes("customer.name")) warnings.push("No customer name field is present.");
  if (template.type === "contract" && !template.blocks.some((block) => block.type === "signature")) warnings.push("Contract template has no signature section.");
  if (template.type === "contract" && !template.blocks.some((block) => block.type === "terms")) warnings.push("Contract template has no terms section.");
  const unsafeFields = findUnsafeMergeFields(allText);
  if (unsafeFields.length > 0) errors.push(`Unsupported or internal merge fields: ${unsafeFields.join(", ")}.`);
  const pageSize = TEMPLATE_PAGE_SIZE.a4;
  template.blocks.forEach((block) => {
    if (block.x < 0 || block.y < 0 || block.x + block.width > pageSize.width || block.y + block.height > pageSize.height) {
      warnings.push(`Block ${block.id} sits outside the A4 page bounds.`);
    }
  });
  return { errors, warnings };
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function importMozaikTemplate(input: { fileName: string; content: string; type?: DocumentTemplateType }) {
  const raw = String(input.content || "");
  const decoded = raw.startsWith("base64:") ? Buffer.from(raw.slice(7), "base64").toString("utf8") : raw;
  const textMatches = [
    ...decoded.matchAll(/\bText\s*=\s*"([^"]{2,500})"/gi),
    ...decoded.matchAll(/<Text[^>]*>([\s\S]{2,500}?)<\/Text>/gi),
    ...decoded.matchAll(/<Value[^>]*>([\s\S]{2,500}?)<\/Value>/gi),
  ].map((match) => decodeXmlEntities(match[1]).replace(/\s+/g, " ").trim());
  const uniqueText = [...new Set(textMatches.filter((text) => text && !text.startsWith("$") && !INTERNAL_FIELD_PATTERN.test(text)))].slice(0, 18);
  const template = buildDefaultDocumentTemplate(input.type || "contract");
  template.name = `${input.fileName.replace(/\.[^.]+$/, "") || "Imported Mozaik"} Template`;
  template.sourceType = "imported_mozaik";
  if (uniqueText.length > 0) {
    template.blocks.push(textBlock(1, 56, 872, 682, 168, `Imported template reference\n${uniqueText.join("\n")}`, { fontSize: 9, color: "#4b5563", borderColor: "#d7dece", padding: 8, lineHeight: 1.3 }));
  }
  return {
    template,
    importSource: {
      file_name: input.fileName,
      source_type: "mozaik_prcrpt",
      import_status: uniqueText.length > 0 ? "best_effort_converted" : "reference_only",
      extracted_text_blocks: uniqueText,
      original_excerpt: decoded.slice(0, 5000),
    },
  };
}

export function buildSampleQuoteDocument(): QuoteDocumentInput {
  const subtotalExGst = 2878;
  const gstAmount = roundMoney(subtotalExGst * GST_RATE);
  const totalIncGst = roundMoney(subtotalExGst + gstAmount);
  return {
    quoteId: "preview",
    jobId: "JOB-001",
    quoteNumber: "QTE-0001",
    customerName: "Sample Customer",
    customerPhone: "021 000 000",
    customerEmail: "customer@example.co.nz",
    jobName: "Kitchen Joinery",
    jobAddress: "12 Example Street, Tauranga",
    jobNotes: "Kitchen cabinetry, fronts, hardware, and installation.",
    scopeNotes: "Manufacture and install joinery according to accepted drawings.",
    specificationNotes: "Doors / fronts: Trimtek aluminium doors\nHardware: drawer runners, hinges, handles",
    lineItems: [
      { description: "Trimtek Squareline Ali Door", quantity: 2, unit: "ea", total: 1240, notes: "Powdercoat finish to match approved sample.", gstTreatment: "ex_gst" },
      { description: "Drawer runners and hardware", quantity: 6, unit: "set", total: 980, notes: "Soft-close runners included.", gstTreatment: "ex_gst" },
      { description: "Freight and packaging", quantity: 1, unit: "ea", total: 658, notes: "Freight estimate based on standard access.", gstTreatment: "ex_gst" },
    ],
    subtotalExGst,
    gstAmount,
    totalIncGst,
    depositAmount: roundMoney(totalIncGst / 2),
    balanceDue: roundMoney(totalIncGst / 2),
    issueDate: new Date().toISOString().slice(0, 10),
    preparedBy: "Millbrook Estimating",
    generatedAt: new Date().toISOString(),
    documentType: "contract",
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    disclaimer: DEFAULT_DISCLAIMER,
    termsSections: DEFAULT_TERMS_SECTIONS,
    status: "draft",
  };
}
