import { describe, expect, test } from "vitest";
import {
  buildClientFacingDocumentPayload,
  buildQuoteDocumentDraft,
  calculateDefaultPaymentSchedule,
  calculateDocumentTotals,
  generateQuoteDocumentPdf,
  renderQuoteDocumentHtml,
  validateQuoteDocument,
} from "./quoteDocuments";

describe("quote document generation", () => {
  test("calculates GST-exclusive subtotal and default payment schedule from inc-GST total", () => {
    const totals = calculateDocumentTotals({ totalIncGst: 1150 });
    expect(totals).toEqual({
      subtotalExGst: 1000,
      gstAmount: 150,
      totalIncGst: 1150,
    });
    expect(calculateDefaultPaymentSchedule(1150)).toEqual({
      depositAmount: 575,
      balanceDue: 575,
    });
  });

  test("maps quote list pricing into a client-facing draft without internal cost or margin fields", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-1",
        title: "Kitchen Contract",
        quote_number: "Q-100",
        contact_name: "Jamie Client",
        site_address: "12 Queen Street",
        subtotal: 2000,
        gst: 300,
        total: 2300,
      },
      quoteItems: [
        {
          description: "Cabinetry supply and installation",
          quantity: 1,
          unit: "lot",
          unit_cost: 900,
          markup_percent: 42,
          total: 2300,
          is_optional: false,
          section: "Joinery",
          sort_order: 0,
        },
      ],
      documentType: "contract",
    });

    const payload = buildClientFacingDocumentPayload(draft);
    expect(payload.document).toMatchObject({
      customerName: "Jamie Client",
      jobName: "Kitchen Contract",
      totalIncGst: 2300,
      depositAmount: 1150,
      balanceDue: 1150,
    });
    expect(payload.html).toContain("Cabinetry supply and installation");
    expect(payload.html).toContain("Basis of Quote");
    expect(payload.html).toContain("Disputes");
    expect(payload.html).not.toContain("unit_cost");
    expect(payload.html).not.toContain("markup_percent");
    expect(payload.html.toLowerCase()).not.toContain("gross margin");
    expect(payload.html.toLowerCase()).not.toContain("labour rate");
  });

  test("validates required fields and GST/payment warnings", () => {
    const result = validateQuoteDocument({
      quoteId: "quote-1",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      jobName: "",
      jobAddress: "",
      jobNotes: "",
      scopeNotes: "",
      specificationNotes: "",
      lineItems: [],
      subtotalExGst: 100,
      gstAmount: 10,
      totalIncGst: 115,
      depositAmount: 20,
      balanceDue: 20,
      issueDate: "",
      documentType: "contract",
      paymentTerms: "",
      disclaimer: "",
      termsSections: [],
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      "Customer name is required.",
      "Job name is required.",
      "Issue date is required.",
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      "GST does not equal 15% of the subtotal.",
      "Deposit plus balance does not equal the total including GST.",
      "No job notes or specification notes are present.",
    ]));
  });

  test("generates a PDF buffer for the contract structure", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-1",
        title: "Wardrobe Contract",
        quote_number: "Q-200",
        contact_name: "Alex Client",
        subtotal: 1000,
        gst: 150,
        total: 1150,
      },
      quoteItems: [{ description: "Wardrobe joinery", quantity: 1, unit: "lot", total: 1000 }],
      documentType: "contract",
    });
    const pdf = generateQuoteDocumentPdf(draft);
    const text = pdf.toString("utf8");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("CONTRACT");
    expect(text).toContain("PAYMENT SCHEDULE");
    expect(text).toContain("TERMS AND CONDITIONS");
    expect(text).toContain("BASIS OF QUOTE");
  });

  test("renders the Millbrook company logo in client-facing HTML documents", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-2",
        title: "Kitchen Quote",
        quote_number: "Q-201",
        contact_name: "Casey Client",
        subtotal: 1000,
        gst: 150,
        total: 1150,
      },
      quoteItems: [{ description: "Kitchen joinery", quantity: 1, unit: "lot", total: 1000 }],
      documentType: "quote",
    });

    const html = renderQuoteDocumentHtml(draft);
    expect(html).toContain("data:image/png;base64");
    expect(html).toContain("Millbrook Furniture Solutions Ltd");
  });

  test("keeps single-page line item tables on one page without continuation labels", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-single-page",
        title: "Small Quote",
        quote_number: "Q-111",
        contact_name: "Taylor Client",
        subtotal: 1000,
        gst: 150,
        total: 1150,
      },
      quoteItems: [
        { description: "Base cabinet", quantity: 1, unit: "ea", total: 500, is_optional: false, sort_order: 0 },
        { description: "Wall cabinet", quantity: 1, unit: "ea", total: 500, is_optional: false, sort_order: 1 },
      ],
      documentType: "quote",
    });

    const html = renderQuoteDocumentHtml(draft);
    expect((html.match(/<section class="page">/g) || []).length).toBe(1);
    expect(html).not.toContain("Cont. on next page");
    expect(html).not.toContain("Quote line items continued");
  });

  test("quote documents include the revised default terms and conditions", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-terms",
        title: "Quoted Kitchen",
        quote_number: "Q-112",
        contact_name: "Jordan Client",
        subtotal: 1000,
        gst: 150,
        total: 1150,
      },
      quoteItems: [{ description: "Kitchen", quantity: 1, unit: "ea", total: 1000, is_optional: false, sort_order: 0 }],
      documentType: "quote",
    });

    const html = renderQuoteDocumentHtml(draft);
    expect(html).toContain("Terms and Conditions");
    expect(html).toContain("Basis of Quote");
    expect(html).toContain("Consumer Guarantees Act and Commercial Use");
    expect(html).toContain("Disputes");
  });

  test("long revised terms continue cleanly across multiple pages", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-terms-pages",
        title: "Long Terms Contract",
        quote_number: "Q-113",
        contact_name: "Morgan Client",
        subtotal: 1000,
        gst: 150,
        total: 1150,
      },
      quoteItems: [{ description: "Joinery", quantity: 1, unit: "ea", total: 1000, is_optional: false, sort_order: 0 }],
      documentType: "contract",
    });

    const html = renderQuoteDocumentHtml(draft);
    expect((html.match(/Terms and Conditions continued/g) || []).length).toBeGreaterThan(0);
    expect(html).toContain("Basis of Quote");
    expect(html).toContain("Disputes");

    const basisIndex = html.indexOf("Basis of Quote");
    const basisBodyIndex = html.indexOf("All work will be carried out in accordance", basisIndex);
    expect(basisBodyIndex).toBeGreaterThan(basisIndex);
  });

  test("continues long line item tables across multiple pages and keeps totals on the final page", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-3",
        title: "Large Contract",
        quote_number: "Q-300",
        contact_name: "Morgan Client",
        subtotal: 0,
        gst: 0,
        total: 0,
      },
      quoteItems: Array.from({ length: 42 }, (_, index) => ({
        description: `Tall pantry cabinet run item ${index + 1} with detailed specification notes`,
        quantity: 1,
        unit: "ea",
        total: 100 + index,
        is_optional: false,
        sort_order: index,
      })),
      documentType: "contract",
    });

    const html = renderQuoteDocumentHtml(draft);
    expect((html.match(/<section class="page">/g) || []).length).toBeGreaterThan(2);
    expect((html.match(/<th>Description<\/th><th class="right">Qty<\/th><th>Unit<\/th><th class="right">Line Total<\/th>/g) || []).length).toBeGreaterThan(1);
    expect((html.match(/Cont\. on next page/g) || []).length).toBeGreaterThan(0);
    expect((html.match(/Quote line items continued/g) || []).length).toBeGreaterThan(0);
    expect(html.lastIndexOf("Payment Schedule")).toBeGreaterThan(html.lastIndexOf("Tall pantry cabinet run item 42"));
    expect(html.lastIndexOf("Total</td>")).toBeGreaterThan(html.lastIndexOf("Tall pantry cabinet run item 42"));
    expect(html).toContain(".page + .page");
    expect(html).toContain("break-before: page");
    expect(html).not.toContain("page-break-after:always");

    const pdf = generateQuoteDocumentPdf(draft).toString("utf8");
    expect((pdf.match(/DESCRIPTION \| QTY \| UNIT \| TOTAL/g) || []).length).toBeGreaterThan(1);
    expect(pdf).toContain("CONT. ON NEXT PAGE");
    expect(pdf).toContain("QUOTE LINE ITEMS CONTINUED");
    expect((pdf.match(/\/Type \/Page/g) || []).length).toBeGreaterThan(2);
  });

  test("groups quote document line items by section display order", () => {
    const draft = buildQuoteDocumentDraft({
      quote: {
        id: "quote-sections",
        title: "Section ordered quote",
        quote_number: "Q-400",
        contact_name: "Casey Client",
        subtotal: 0,
        gst: 0,
        total: 0,
      },
      quoteItems: [
        { description: "Fixing screws", quantity: 1, unit: "box", total: 40, is_optional: false, sort_order: 2, section: "Hardware", section_display_order: 30 },
        { description: "Panels", quantity: 1, unit: "lot", total: 500, is_optional: false, sort_order: 0, section: "Materials", section_display_order: 10 },
        { description: "Install allowance", quantity: 1, unit: "lot", total: 300, is_optional: false, sort_order: 1, section: "Installation", section_display_order: 70 },
      ],
      documentType: "quote",
    });

    const html = renderQuoteDocumentHtml(draft);
    const materialsIndex = html.indexOf(">Materials<");
    const hardwareIndex = html.indexOf(">Hardware<");
    const installationIndex = html.indexOf(">Installation<");
    expect(materialsIndex).toBeGreaterThan(-1);
    expect(hardwareIndex).toBeGreaterThan(materialsIndex);
    expect(installationIndex).toBeGreaterThan(hardwareIndex);
    expect(html).toContain("class=\"section-row\"");
  });
});
