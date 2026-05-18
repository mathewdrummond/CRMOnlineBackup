import { describe, expect, test } from "vitest";
import {
  DEFAULT_LABOUR_PROFILE,
  DEFAULT_PRICING_RULES,
  applyPricingRules,
  buildPricingAssumptions,
  buildScenarios,
  calculatePricing,
  compareHistoricalJobs,
  parseMozaikCsv,
  parsePriceListFile,
  parseQuoteImportFile,
  stagePriceListRows,
  normalizeSku,
  validatePriceListSchema,
} from "./pricingModel";

function makeStoredZip(entries: Array<{ name: string; data: string }>) {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  entries.forEach((entry) => {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    parts.push(local, data);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);
    central.push(header);
    offset += local.length + data.length;
  });
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralDirectory, end]);
}

function makePriceListXlsxBase64() {
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>SKU</t></is></c><c r="B1" t="inlineStr"><is><t>Description</t></is></c><c r="C1" t="inlineStr"><is><t>Net Price</t></is></c><c r="D1" t="inlineStr"><is><t>UOM</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>ABC-1</t></is></c><c r="B2" t="inlineStr"><is><t>Board A</t></is></c><c r="C2"><v>12.5</v></c><c r="D2" t="inlineStr"><is><t>ea</t></is></c></row>
  </sheetData>
</worksheet>`;
  const zip = makeStoredZip([
    { name: "xl/workbook.xml", data: '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
  return zip.toString("base64");
}

const JOB_COSTING_CSV = `Tax,Item,Description,QTY,Units,Amount,Total
"True","Materials","","","","",""
"True","     16mm White TE Natural","     ","17","#","54.72","1,209.31"
"True","Add-On","","13.49","SqM","0.00","0.00"
"True","Banding","","","","",""
"True","Add-On","Materials - Freight","","","22.00","22.00"
"True","Labor","Labour","2","Hrs","50.00","100.00"
"False","Subtotal","","","","","1,331.31"
"False","","","","","",""
"False","Tax","","","%","15%","199.70"
"False","Deposit","","","%","50%","765.51"
"False","Total","","","","","1,531.01"
"False","Balance Due","","","","","765.50"`;

describe("Millbrook pricing model", () => {
  test("parses Mozaik CSV exports into structured pricing items", () => {
    const parsed = parseMozaikCsv(`Cabinet,Item Name,Material Type,Quantity,Length,Width,Thickness,Edging,Tags
Kitchen,"Base, panel",18mm Melamine board,2,720,580,18,1mm ABS,cabinet
Kitchen,Tandem runner,Blum drawer runner,3,,,,,drawer`);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      name: "Base, panel",
      category: "sheet_materials",
      quantity: 2,
      cabinet_reference: "Kitchen",
      dimensions: { length_mm: 720, width_mm: 580, thickness_mm: 18 },
    });
    expect(parsed.items[1].category).toBe("drawer_systems_runners");
  });

  test("keeps CSV/XLSX-style material imports on the column mapping path", () => {
    const parsed = parseMozaikCsv(`Product,Details,Qty,UOM,Code
Board A,White board,2,ea,ABC-1`, {
      name: ["product"],
      description: ["details"],
      material_type: ["details"],
      quantity: ["qty"],
      unit: ["uom"],
      product_number: ["code"],
      length_mm: [],
      width_mm: [],
      thickness_mm: [],
      cabinet_reference: [],
      edging: [],
      hardware_tags: [],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      name: "Board A",
      description: "White board",
      quantity: 2,
      unit: "ea",
      original_sku: "ABC-1",
      normalized_sku: "ABC1",
    });
  });

  test("adds deterministic rule-based inclusions with reason logging", () => {
    const parsed = parseMozaikCsv(`Cabinet,Item Name,Material Type,Quantity,Tags
Kitchen,Tandem runner,Blum drawer runner,2,drawer
Kitchen,Clip top hinge,Blum hinge,4,hardware`);

    const inclusions = applyPricingRules(parsed.items, DEFAULT_PRICING_RULES);

    expect(inclusions.map((item) => item.item_name)).toContain("Euro screws");
    expect(inclusions.map((item) => item.item_name)).toContain("Hinge mounting plates");
    expect(inclusions.every((item) => item.reason.length > 0)).toBe(true);
    expect(inclusions.find((item) => item.item_name === "Euro screws")?.quantity).toBe(8);
  });

  test("calculates materials, labour, GST, margin, and return per labour hour", () => {
    const parsed = parseMozaikCsv(`Cabinet,Item Name,Material Type,Quantity,Tags
Kitchen,Base panel,18mm Melamine board,4,cabinet
Kitchen,Tandem runner,Blum drawer runner,2,drawer`);
    const items = parsed.items.map((item) => ({
      ...item,
      buy_price: item.category === "sheet_materials" ? 80 : 45,
      markup_percent: 30,
    }));
    const assumptions = buildPricingAssumptions(DEFAULT_LABOUR_PROFILE);
    const inclusions = applyPricingRules(items, DEFAULT_PRICING_RULES);
    const calculation = calculatePricing(items, inclusions, assumptions);

    expect(calculation.totals.total_direct_purchase_cost).toBeGreaterThan(400);
    expect(calculation.totals.marked_up_purchase_sell_price).toBeGreaterThan(calculation.totals.total_direct_purchase_cost);
    expect(calculation.totals.estimated_labour_hours).toBeGreaterThan(0);
    expect(calculation.totals.gst).toBeCloseTo(calculation.totals.subtotal_ex_gst * 0.15, 2);
    expect(calculation.totals.gross_margin_percent).toBeGreaterThan(0);
    expect(calculation.totals.effective_return_per_labour_hour).toBeGreaterThan(0);
  });

  test("warns when margin is below Millbrook minimum", () => {
    const parsed = parseMozaikCsv(`Item Name,Material Type,Quantity
Stone top,subcontract stone,1`);
    const items = parsed.items.map((item) => ({ ...item, buy_price: 1000, markup_percent: 0 }));
    const assumptions = buildPricingAssumptions(DEFAULT_LABOUR_PROFILE, {
      labour_sell_rate: 36,
      labour: {
        design_admin_checking_hours: 0,
        risk_complexity_allowance_hours: 0,
        sheet_processing_hours_per_sheet: 0,
        edging_hours_per_metre: 0,
        assembly_hours_per_cabinet: 0,
        drawer_hardware_hours_each: 0,
        door_front_fitting_hours_each: 0,
        installation_hours_per_cabinet: 0,
      },
    });

    const calculation = calculatePricing(items, [], assumptions);
    expect(calculation.warnings).toContain("This quote is below Millbrook's minimum target margin.");
  });

  test("generates minimum, recommended, and premium scenarios", () => {
    const parsed = parseMozaikCsv(`Item Name,Material Type,Quantity
Base panel,18mm Melamine board,4`);
    const items = parsed.items.map((item) => ({ ...item, buy_price: 100, markup_percent: 30 }));
    const assumptions = buildPricingAssumptions(DEFAULT_LABOUR_PROFILE);
    const scenarios = buildScenarios(items, applyPricingRules(items, DEFAULT_PRICING_RULES), assumptions);

    expect(scenarios.map((scenario) => scenario.name)).toEqual(["Minimum acceptable", "Recommended", "Premium"]);
    expect(scenarios[2].total_inc_gst).toBeGreaterThan(scenarios[0].total_inc_gst);
  });

  test("flags historical anomalies when enough peer jobs exist", () => {
    const parsed = parseMozaikCsv(`Item Name,Material Type,Quantity
Base panel,18mm Melamine board,1`);
    const calculation = calculatePricing(
      parsed.items.map((item) => ({ ...item, buy_price: 1000, markup_percent: 0 })),
      [],
      buildPricingAssumptions(DEFAULT_LABOUR_PROFILE, { labour_sell_rate: 50 })
    );
    const comparison = compareHistoricalJobs(calculation, [
      { id: "1", job_type: "kitchen", material_cost: 1000, labour_hours: 20, total_value: 4000, margin_percent: 45, return_per_labour_hour: 100, created_date: "", updated_date: "", row_version: 1 },
      { id: "2", job_type: "kitchen", material_cost: 1200, labour_hours: 22, total_value: 4300, margin_percent: 44, return_per_labour_hour: 105, created_date: "", updated_date: "", row_version: 1 },
      { id: "3", job_type: "kitchen", material_cost: 900, labour_hours: 18, total_value: 3800, margin_percent: 46, return_per_labour_hour: 98, created_date: "", updated_date: "", row_version: 1 },
    ], "kitchen");

    expect(comparison.peer_count).toBe(3);
    expect(comparison.anomalies.length).toBeGreaterThan(0);
  });

  test("parses supplier price list CSV and applies mapped columns", () => {
    const rows = parsePriceListFile({
      fileName: "supplier.csv",
      fileBase64: Buffer.from("SKU,Description,Net Price,UOM\nABC-1,Board A,12.50,ea").toString("base64"),
      fileType: "csv",
    });

    const staged = stagePriceListRows({
      rows,
      supplier: "Acme",
      mapping: { product_number: "SKU", description: "Description", unit_cost_ex_gst: "Net Price", unit: "UOM" },
      pricingItems: [],
    });

    expect(staged[0]).toMatchObject({
      status: "new",
      mapped: { product_number: "ABC-1", description: "Board A", unit_cost_ex_gst: 12.5, unit: "ea" },
    });
  });

  test("parses supplier price list XLSX files", () => {
    const rows = parsePriceListFile({
      fileName: "supplier.xlsx",
      fileBase64: makePriceListXlsxBase64(),
      fileType: "xlsx",
    });

    expect(rows).toEqual([{ SKU: "ABC-1", Description: "Board A", "Net Price": "12.5", UOM: "ea" }]);
  });

  test("normalizes SKUs before supplier matching", () => {
    expect(normalizeSku("770 C 600")).toBe("770C600");
    expect(normalizeSku("LEGRABOX-500MM")).toBe("LEGRABOX500");

    const staged = stagePriceListRows({
      rows: [{ SKU: "770 C 600", Description: "Drawer runner", "Net Price": "45", UOM: "set" }],
      supplier: "Blum",
      mapping: { product_number: "SKU", description: "Description", unit_cost_ex_gst: "Net Price", unit: "UOM" },
      pricingItems: [{
        id: "item-770",
        supplier: "Blum",
        normalized_sku: "770C600",
        name: "770C600 Drawer runner",
        buy_price: 40,
        unit: "set",
        created_date: "",
        updated_date: "",
        row_version: 1,
      }],
    });

    expect(staged[0].pricing_item_id).toBe("item-770");
    expect(staged[0].match_type).toBe("supplier_normalized_sku");
    expect(staged[0].mapped.normalized_sku).toBe("770C600");
  });

  test("excludes Mozaik heading rows and assigns heading categories", () => {
    const parsed = parseMozaikCsv(`Item,Description,Quantity,Unit
Materials,,,
Board A,White board,2,ea
Hinges,,,
Clip hinge,110 degree hinge,4,ea
Pulls,,,`);

    expect(parsed.items.map((item) => item.name)).toEqual(["Board A", "Clip hinge"]);
    expect(parsed.items[0]).toMatchObject({ heading_category: "Materials", category: "sheet_materials" });
    expect(parsed.items[1]).toMatchObject({ heading_category: "Hinges", category: "hinges" });
    expect(parsed.warnings).toContain('Heading "Pulls" has no items.');
  });

  test("parses Mozaik job costing CSV rows into quote-ready line items", () => {
    const parsed = parseMozaikCsv(JOB_COSTING_CSV);

    expect(parsed.items.map((item) => item.name)).toEqual([
      "16mm White TE Natural",
      "Materials - Freight",
      "Labour",
    ]);
    expect(parsed.items[0]).toMatchObject({
      source_row: 3,
      heading_category: "Materials",
      category: "sheet_materials",
      quantity: 17,
      unit: "#",
      buy_price: 54.72,
      unit_cost_ex_gst: 54.72,
      line_total_ex_gst: 1209.31,
      taxable: true,
    });
    expect(parsed.items[1]).toMatchObject({
      heading_category: "Banding",
      category: "edging",
      quantity: 1,
      unit: "ea",
      buy_price: 22,
      line_total_ex_gst: 22,
    });
    expect(parsed.items[2]).toMatchObject({
      heading_category: "Labour",
      category: "labour",
      quantity: 2,
      unit: "Hrs",
      buy_price: 50,
      line_total_ex_gst: 100,
    });
    expect(parsed.warnings).toContain("Row 4: Add-On row has no description.");
    expect(parsed.warnings).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/Subtotal|Tax|Deposit|Total|Balance Due/),
    ]));
    expect(parsed.metadata?.summary_totals).toMatchObject({
      subtotal_ex_gst: 1331.31,
      tax: 199.7,
      deposit: 765.51,
      total_inc_gst: 1531.01,
      balance_due: 765.5,
    });
    expect(parsed.metadata).toMatchObject({
      subtotal_ex_gst: 1331.31,
      gst_amount: 199.7,
      total_inc_gst: 1531.01,
      gst_inclusive_total: 1531.01,
    });
  });

  test("creates quote-level import items from job costing CSV without summary rows", () => {
    const parsed = parseQuoteImportFile({
      fileName: "Job Costing (May 04, 26).csv",
      fileType: "csv",
      fileBase64: Buffer.from(JOB_COSTING_CSV).toString("base64"),
      pricingItems: [],
      defaultMarkupPercent: 30,
    });

    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.map((item) => item.description)).not.toEqual(expect.arrayContaining(["Subtotal", "Tax", "Deposit", "Total", "Balance Due"]));
    expect(parsed.items[0]).toMatchObject({
      description: "16mm White TE Natural",
      category: "sheet_materials",
      total_buy_price: 1209.31,
      total_sell_price: 1572.1,
      source_file_name: "Job Costing (May 04, 26).csv",
      source_file_type: "csv",
      gst_treatment: "ex_gst",
    });
    expect(parsed.items[1]).toMatchObject({
      description: "Materials - Freight",
      quantity: 1,
      total_buy_price: 22,
      total_sell_price: 28.6,
    });
    expect(parsed.metadata).toMatchObject({
      document_type: "mozaik_material_list",
      subtotal_ex_gst: 1331.31,
      gst_amount: 199.7,
      total_inc_gst: 1531.01,
    });
    expect(parsed.warnings).not.toContain("GST does not reconcile with the 15% subtotal.");
    expect(parsed.warnings).not.toContain("Total does not match subtotal plus tax.");
  });

  test("parses text and OCR PDF price list rows with source confidence", () => {
    const textRows = parsePriceListFile({
      fileName: "supplier.pdf",
      fileType: "pdf",
      fileBase64: Buffer.from("%PDF-1.4\nSKU,Description,Net Price,UOM\nABC-1,Board A,12.50,ea\n%%EOF").toString("base64"),
    });
    expect(textRows[0]).toMatchObject({ SKU: "ABC-1", "__source_page": "1", "__extraction_mode": "text" });

    const ocrRows = parsePriceListFile({
      fileName: "scan.pdf",
      fileType: "pdf",
      fileBase64: Buffer.from("%PDF-1.4\n/image only/%%EOF").toString("base64"),
      ocrText: "SKU,Description,Net Price,UOM\nOCR-1,Screw,1.15,ea",
    });
    expect(ocrRows[0]).toMatchObject({ SKU: "OCR-1", "__extraction_mode": "ocr" });

    const staged = stagePriceListRows({
      rows: ocrRows,
      supplier: "Acme",
      mapping: { product_number: "SKU", description: "Description", unit_cost_ex_gst: "Net Price", unit: "UOM" },
      pricingItems: [],
    });
    expect(staged[0].warnings).toContain("OCR-extracted PDF row requires review.");
    expect(staged[0].warnings).toContain("Low OCR confidence. Review before commit.");
  });

  test("validates required supplier price list mappings", () => {
    expect(validatePriceListSchema({ product_number: "SKU", description: "Description", unit: "UOM", gst_inclusive_price: "Inc GST" }).valid).toBe(true);
    expect(validatePriceListSchema({ description: "Description" }).errors).toContain("SKU/product code is required.");
  });

  test("matches supplier SKU before description and flags duplicate and price warnings", () => {
    const rows = [
      { SKU: "ABC-1", Description: "Board A renamed", "Net Price": "130", UOM: "ea" },
      { SKU: "ABC-1", Description: "Duplicate row", "Net Price": "131", UOM: "ea" },
    ];
    const staged = stagePriceListRows({
      rows,
      supplier: "Acme",
      mapping: { product_number: "SKU", description: "Description", unit_cost_ex_gst: "Net Price", unit: "UOM" },
      pricingItems: [{
        id: "item-1",
        supplier: "Acme",
        product_number: "ABC-1",
        name: "Board A",
        buy_price: 100,
        unit: "ea",
        created_date: "",
        updated_date: "",
        row_version: 1,
      }],
      movementThresholdPercent: 15,
    });

    expect(staged[0].pricing_item_id).toBe("item-1");
    expect(staged[0].match_type).toBe("supplier_normalized_sku");
    expect(staged[0].warnings).toContain("Duplicate SKU in uploaded file.");
    expect(staged[0].warnings.some((warning) => warning.includes("Large price movement"))).toBe(true);
  });
});
