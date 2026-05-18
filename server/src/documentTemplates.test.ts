import { describe, expect, test } from "vitest";
import {
  buildDefaultDocumentTemplate,
  buildSampleQuoteDocument,
  findUnsafeMergeFields,
  generateDocumentTemplatePdf,
  importMozaikTemplate,
  renderDocumentTemplateHtml,
  validateDocumentTemplate,
} from "./documentTemplates";

describe("document template rendering", () => {
  test("renders safe merge fields and repeating quote line items", () => {
    const template = buildDefaultDocumentTemplate("contract");
    const document = buildSampleQuoteDocument();
    const html = renderDocumentTemplateHtml(template, document);

    expect(html).toContain("data:image/png;base64");
    expect(html).toContain("Sample Customer");
    expect(html).toContain("Kitchen Joinery");
    expect(html).toContain("Trimtek Squareline Ali Door");
    expect(html).toContain("Terms and Conditions");
    expect(html).toContain("Basis of Quote");
    expect(html).toContain("Disputes");
    expect(html).not.toContain("markup");
    expect(html).not.toContain("gross margin");
  });

  test("blocks internal merge fields from client-facing templates", () => {
    const template = buildDefaultDocumentTemplate("quote");
    template.blocks.push({
      id: "unsafe",
      pageIndex: 0,
      type: "text",
      x: 40,
      y: 40,
      width: 200,
      height: 40,
      contentJson: { text: "{{quote.margin}} {{lineItems.buy_cost}}" },
      styleJson: {},
    });

    expect(findUnsafeMergeFields("{{quote.margin}} {{customer.name}}")).toEqual(["quote.margin"]);
    expect(validateDocumentTemplate(template).errors.join(" ")).toContain("quote.margin");
  });

  test("generates PDF bytes from the saved graphical layout", () => {
    const template = buildDefaultDocumentTemplate("contract");
    const pdf = generateDocumentTemplatePdf(template, buildSampleQuoteDocument());

    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString("utf8")).toContain("Kitchen Joinery");
  });

  test("imports Mozaik/DevExpress templates as best-effort editable templates", () => {
    const imported = importMozaikTemplate({
      fileName: "Contract.prcrpt",
      content: '<Report><XRLabel Text="GST Reg. Number: 010-724-589" /><XRLabel Text="Submitted to:" /><XRLabel Text="Payment Schedule" /></Report>',
      type: "contract",
    });

    expect(imported.template.sourceType).toBe("imported_mozaik");
    expect(imported.importSource.import_status).toBe("best_effort_converted");
    expect(imported.importSource.extracted_text_blocks).toContain("Payment Schedule");
  });

  test("continues template line item tables onto new pages with repeated headers", () => {
    const template = buildDefaultDocumentTemplate("contract");
    const document = buildSampleQuoteDocument();
    document.lineItems = Array.from({ length: 36 }, (_, index) => ({
      description: `Template pagination line item ${index + 1} for a detailed cabinetry package`,
      quantity: 1,
      unit: "ea",
      total: 250 + index,
    }));

    const html = renderDocumentTemplateHtml(template, document);
    expect((html.match(/<section class="jf-page">/g) || []).length).toBeGreaterThan(2);
    expect((html.match(/<th>Description<\/th><th>Qty<\/th><th>Unit<\/th><th>Total<\/th>/g) || []).length).toBeGreaterThan(1);
    expect((html.match(/Cont\. on next page/g) || []).length).toBeGreaterThan(0);
    expect((html.match(/Quote line items continued/g) || []).length).toBeGreaterThan(0);
    expect(html).toContain("top:302px");
    expect(html).toMatch(/height:(344|773)px/);
    expect(html).toContain(".jf-page:last-child");
    expect(html).toContain("page-break-after:auto");
    expect(html).toContain("height:1123px");
    expect(html).toContain("page-break-after:auto");

    const pdf = generateDocumentTemplatePdf(template, document).toString("utf8");
    expect((pdf.match(/Description \| Qty \| Unit \| Total/g) || []).length).toBeGreaterThan(1);
    expect(pdf).toContain("Cont. on next page");
    expect(pdf).toContain("Quote line items continued");
  });

  test("quote templates include the revised Millbrook terms and paginate them when needed", () => {
    const template = buildDefaultDocumentTemplate("quote");
    const document = buildSampleQuoteDocument();
    document.documentType = "quote";

    const html = renderDocumentTemplateHtml(template, document);
    expect(html).toContain("Basis of Quote");
    expect(html).toContain("Consumer Guarantees Act and Commercial Use");
    expect(html).toContain("Disputes");

    const pdf = generateDocumentTemplatePdf(template, document).toString("utf8");
    expect(pdf).toContain("Basis of Quote");
  });

  test("quote list templates render Millbrook header, section-ordered items, notes, and continuation labels", () => {
    const template = buildDefaultDocumentTemplate("quote_list");
    const document = buildSampleQuoteDocument();
    document.documentType = "quote_list";
    document.lineItems = [
      {
        description: "Freight and packaging",
        quantity: 1,
        unit: "ea",
        total: 658,
        section: "Freight",
        sectionDisplayOrder: 50,
        notes: "Standard access allowance.",
        gstTreatment: "ex_gst",
      },
      ...Array.from({ length: 32 }, (_, index) => ({
        description: `Cabinetry item ${index + 1} with wrapped planning notes for internal use`,
        quantity: 1,
        unit: "ea",
        total: 100 + index,
        section: "Cabinetry",
        sectionDisplayOrder: 10,
        notes: `Detailed note ${index + 1} covering install assumptions and imported source detail.`,
        gstTreatment: "ex_gst",
      })),
    ].sort((left, right) => Number(left.sectionDisplayOrder || 999) - Number(right.sectionDisplayOrder || 999));

    const html = renderDocumentTemplateHtml(template, document);
    expect(html).toContain("Quote List");
    expect(html).toContain("Millbrook Furniture Solutions Ltd");
    expect(html).toContain("Internal quote list generated from JoinerFlow.");
    expect(html).toContain("<th>Notes</th>");
    expect(html).toContain("<th>GST</th>");
    expect(html).toContain("Cabinetry");
    expect(html).toContain("Freight");
    expect(html.indexOf("Cabinetry")).toBeLessThan(html.indexOf("Freight"));
    expect(html).toContain("Standard access allowance.");
    expect((html.match(/Cont\. on next page/g) || []).length).toBeGreaterThan(0);
    expect((html.match(/Quote line items continued/g) || []).length).toBeGreaterThan(0);

    const pdf = generateDocumentTemplatePdf(template, document).toString("utf8");
    expect(pdf).toContain("Quote List");
    expect(pdf).toContain("Description | Qty | Unit | Notes | GST | Total");
    expect(pdf).toContain("Detailed note 1");
    expect(pdf).toContain("covering install assumptions and imported source detail.");
  });
});
