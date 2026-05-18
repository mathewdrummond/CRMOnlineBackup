import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

const testRoot = path.join(os.tmpdir(), "joinerflow-price-list-vitest");
const sqlitePath = path.join(testRoot, "joinerflow.test.sqlite");
const filesystemRoot = path.join(testRoot, "filesystem");

let app;
let closeDatabase;

async function createAuthenticatedAgent() {
  const agent = request.agent(app);
  await agent.post("/api/test/session").send({ email: "admin@example.test", role: "admin" }).expect(201);
  return agent;
}

async function updateEntity(agent, entity: string, id: string, payload: Record<string, unknown>) {
  const current = await agent.get(`/api/entities/${entity}/${id}`).expect(200);
  return agent.put(`/api/entities/${entity}/${id}`).send({
    ...payload,
    row_version: current.body.row_version,
  }).expect(200);
}

async function deleteEntity(agent, entity: string, id: string) {
  const current = await agent.get(`/api/entities/${entity}/${id}`).expect(200);
  return agent.delete(`/api/entities/${entity}/${id}`).query({
    row_version: current.body.row_version,
  }).expect(204);
}

function makeStoredZip(entries) {
  const parts = [];
  const central = [];
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

function makeQuoteImportXlsxBase64() {
  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Description</t></is></c><c r="C1" t="inlineStr"><is><t>Quantity</t></is></c><c r="D1" t="inlineStr"><is><t>Unit</t></is></c><c r="E1" t="inlineStr"><is><t>SKU</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Materials</t></is></c><c r="B2" t="inlineStr"><is><t></t></is></c><c r="C2" t="inlineStr"><is><t></t></is></c><c r="D2" t="inlineStr"><is><t></t></is></c><c r="E2" t="inlineStr"><is><t></t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Board A</t></is></c><c r="B3" t="inlineStr"><is><t>White board</t></is></c><c r="C3"><v>2</v></c><c r="D3" t="inlineStr"><is><t>ea</t></is></c><c r="E3" t="inlineStr"><is><t>ABC-1</t></is></c></row>
  </sheetData>
</worksheet>`;
  const zip = makeStoredZip([
    { name: "xl/workbook.xml", data: '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
  return zip.toString("base64");
}

beforeAll(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.ENABLE_TEST_AUTH = "true";
  process.env.AUTH_SESSION_SECRET = "joinerflow-test-session-secret";
  process.env.SQLITE_PATH = sqlitePath;
  process.env.FILESYSTEM_ROOT = filesystemRoot;
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "";
  process.env.PUBLIC_API_ORIGIN = "";

  const dbModule = await import("./db");
  closeDatabase = dbModule.closeDatabase;
  const serverModule = await import("./index");
  app = await serverModule.createApp();
});

beforeEach(async () => {
  await request(app).post("/api/test/reset").expect(204);
});

afterAll(() => {
  closeDatabase?.();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("price list import API", () => {
  test("records quote-saved pricing defaults in the master pricing item list", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent.post("/api/pricing/items/save-defaults").send({
      source_quote_id: "quote-123",
      source_import_id: "import-123",
      items: [{
        match_name: "MERIVO E Runner Set",
        fields: {
          description: "MERIVO E Runner Set",
          category: "guides",
          buy_price: 48.75,
          markup_percent: 30,
          unit: "set",
          supplier: "Blum",
          product_number: "MERIVO-E-500",
          supplier_sku: "MERIVO-E-500",
          original_sku: "MERIVO-E-500",
        },
      }],
    }).expect(200);

    expect(response.body.created).toBe(1);
    expect(response.body.records[0]).toMatchObject({
      name: "MERIVO E Runner Set",
      description: "MERIVO E Runner Set",
      supplier: "Blum",
      product_number: "MERIVO-E-500",
      supplier_sku: "MERIVO-E-500",
      original_sku: "MERIVO-E-500",
      category: "guides",
      unit: "set",
      buy_price: 48.75,
      markup_percent: 30,
      default_markup: 30,
      is_user_created: true,
      is_active: true,
    });

    const pricingItems = await agent.get("/api/entities/PricingItem").expect(200);
    expect(pricingItems.body.some((item) =>
      item.name === "MERIVO E Runner Set"
      && item.supplier === "Blum"
      && item.product_number === "MERIVO-E-500"
      && item.is_user_created === true
    )).toBe(true);
  });

  test("applies and confirms every-job global auto-inclusions for quotes", async () => {
    const agent = await createAuthenticatedAgent();
    const freightRule = await agent.post("/api/entities/GlobalAutoInclusion").send({
      description: "Freight",
      category: "freight_delivery",
      quantity: 1,
      unit: "allowance",
      cost: 120,
      markup: 25,
      gst_treatment: "ex_gst",
      active: true,
      review_required: true,
      notes: "Standard delivery allowance",
    }).expect(201);
    await agent.post("/api/entities/GlobalAutoInclusion").send({
      description: "Inactive packaging",
      category: "packaging_freight",
      quantity: 1,
      unit: "ea",
      cost: 50,
      markup: 30,
      active: false,
    }).expect(201);

    const quote = await agent.post("/api/entities/Quote").send({
      title: "Kitchen quote",
      quote_number: "Q-GLOBAL-1",
    }).expect(201);

    expect(quote.body.subtotal).toBe(150);
    expect(quote.body.gst).toBe(22.5);
    expect(quote.body.total).toBe(172.5);

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const globalItems = quoteItems.body.filter((item) => item.quote_id === quote.body.id && item.source === "global_auto_inclusion");
    expect(globalItems).toHaveLength(1);
    expect(globalItems[0]).toMatchObject({
      description: "Freight",
      source_rule_id: freightRule.body.id,
      auto_added: true,
      review_status: "auto_added_needs_review",
      total: 150,
    });

    const reapplied = await agent.post(`/api/quotes/${quote.body.id}/global-inclusions/apply`).send({}).expect(200);
    expect(reapplied.body.added).toHaveLength(0);
    expect(reapplied.body.skipped).toBe(1);

    const confirmed = await agent.post(`/api/quotes/${quote.body.id}/items/${globalItems[0].id}/confirm-global-inclusion`).send({
      section: "Freight",
      section_id: "section-freight",
      section_key: "freight",
      section_display_order: 50,
    }).expect(200);
    expect(confirmed.body.quote_item.review_status).toBe("confirmed");
    expect(confirmed.body.quote_item.confirmed_at).toBeTruthy();
    expect(confirmed.body.quote_item.section).toBe("Freight");
    expect(confirmed.body.quote_item.section_key).toBe("freight");

    await updateEntity(agent, "QuoteItem", globalItems[0].id, {
      quantity: 2,
      unit_cost: 130,
      markup_percent: 20,
      total: 312,
    });

    const updatedQuote = await agent.get(`/api/entities/Quote/${quote.body.id}`).expect(200);
    expect(updatedQuote.body.total).toBe(172.5);

    const audits = await agent.get("/api/entities/GlobalAutoInclusionAudit").expect(200);
    expect(audits.body.some((entry) => entry.action_type === "added_to_quote" && entry.rule_id === freightRule.body.id)).toBe(true);
    expect(audits.body.some((entry) => entry.action_type === "confirmed" && entry.quote_item_id === globalItems[0].id && entry.edited_quote_values?.section === "Freight")).toBe(true);
    expect(audits.body.some((entry) => entry.action_type === "edited_quote_item" && entry.quote_item_id === globalItems[0].id)).toBe(true);

    await deleteEntity(agent, "QuoteItem", globalItems[0].id);
    const afterDeleteApply = await agent.post(`/api/quotes/${quote.body.id}/global-inclusions/apply`).send({}).expect(200);
    expect(afterDeleteApply.body.added).toHaveLength(0);
  });

  test("stages, commits, records history, and rolls back supplier price updates", async () => {
    const agent = await createAuthenticatedAgent();
    const item = await agent.post("/api/entities/PricingItem").send({
      name: "Board A",
      supplier: "Acme",
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      supplier_sku: "ABC-1",
      unit: "ea",
      buy_price: 100,
      markup_percent: 30,
      is_active: true,
    }).expect(201);

    const stage = await agent.post("/api/pricing/price-list-imports/stage").send({
      supplier: "Acme",
      file_name: "acme.csv",
      file_type: "csv",
      file_base64: Buffer.from("SKU,Description,Net Price,UOM\nABC-1,Board A updated,112,ea").toString("base64"),
      column_mapping: {
        product_number: "SKU",
        description: "Description",
        unit_cost_ex_gst: "Net Price",
        unit: "UOM",
      },
    }).expect(201);

    expect(stage.body.summary.matched).toBe(1);
    expect(stage.body.rows[0].pricing_item_id).toBe(item.body.id);
    expect(stage.body.import.import_status).toBe("staged");

    await agent.post(`/api/pricing/price-list-imports/${stage.body.import.id}/commit`).send({
      create_new_items: false,
    }).expect(200);

    const updated = await agent.get(`/api/entities/PricingItem/${item.body.id}`).expect(200);
    expect(updated.body.buy_price).toBe(112);
    expect(updated.body.name).toBe("Board A updated");
    expect(updated.body.normalized_sku).toBe("ABC1");
    expect(updated.body.price_list_import_id).toBe(stage.body.import.id);

    const history = await agent.get("/api/entities/PricingItemPriceHistory").expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({
      pricing_item_id: item.body.id,
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      old_cost: 100,
      new_cost: 112,
      import_id: stage.body.import.id,
    });

    await agent.post(`/api/pricing/price-list-imports/${stage.body.import.id}/rollback`).send({}).expect(200);
    const rolledBack = await agent.get(`/api/entities/PricingItem/${item.body.id}`).expect(200);
    expect(rolledBack.body.buy_price).toBe(100);
    expect(rolledBack.body.name).toBe("Board A");

    const importRecord = await agent.get(`/api/entities/PriceListImport/${stage.body.import.id}`).expect(200);
    expect(importRecord.body.import_status).toBe("rolled_back");
  });

  test("stages PDF supplier lists and saves reusable supplier import profiles", async () => {
    const agent = await createAuthenticatedAgent();
    const stage = await agent.post("/api/pricing/price-list-imports/stage").send({
      supplier: "Acme",
      file_name: "acme.pdf",
      file_type: "pdf",
      file_base64: Buffer.from("%PDF-1.4\nSKU,Description,Net Price,UOM\nPDF-1,PDF Board,14.25,ea\n%%EOF").toString("base64"),
      column_mapping: {
        product_number: "SKU",
        description: "Description",
        unit_cost_ex_gst: "Net Price",
        unit: "UOM",
      },
    }).expect(201);

    expect(stage.body.summary.new_items).toBe(1);
    expect(stage.body.rows[0].mapped.normalized_sku).toBe("PDF1");
    expect(stage.body.rows[0].mapped.source_page).toBe(1);

    const profiles = await agent.get("/api/entities/SupplierImportProfile").expect(200);
    expect(profiles.body[0]).toMatchObject({
      supplier: "Acme",
      column_mapping: {
        product_number: "SKU",
        description: "Description",
        unit_cost_ex_gst: "Net Price",
        unit: "UOM",
      },
    });
  });

  test("saves learned defaults with audit records and soft-deletes user-created master items", async () => {
    const agent = await createAuthenticatedAgent();
    const saved = await agent.post("/api/pricing/items/save-defaults").send({
      source_import_id: "import-123",
      items: [{
        match_name: "Learned handle",
        fields: {
          category: "handles_pulls",
          buy_price: 8.5,
          markup_percent: 30,
          unit: "ea",
          supplier: "Acme",
          product_number: "H-1",
        },
      }],
    }).expect(200);

    expect(saved.body.created).toBe(1);
    const itemId = saved.body.records[0].id;
    const audit = await agent.get("/api/entities/PricingItemLearningAudit").expect(200);
    expect(audit.body[0]).toMatchObject({
      pricing_item_id: itemId,
      action_type: "new_default_created",
      source_import_id: "import-123",
    });

    await agent.post(`/api/pricing/items/${itemId}/deactivate`).send({
      source_import_id: "import-123",
      reason: "Duplicate test item",
    }).expect(200);

    const deactivated = await agent.get(`/api/entities/PricingItem/${itemId}`).expect(200);
    expect(deactivated.body.is_active).toBe(false);
    const actionAudit = await agent.get("/api/entities/PricingItemActionAudit").expect(200);
    expect(actionAudit.body[0]).toMatchObject({
      pricing_item_id: itemId,
      action_type: "master_soft_delete",
    });
  });

  test("uses saved default cost, category, and section on future matched quote imports", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Saved default quote", quote_number: "Q-SAVED-DEFAULT", status: "draft" }).expect(201);
    const section = await agent.post("/api/entities/PricingSection").send({
      name: "Cabinet Materials",
      label: "Cabinet Materials",
      key: "cabinet_materials",
      value: "cabinet_materials",
      display_order: 15,
      is_active: true,
    }).expect(201);

    const saved = await agent.post("/api/pricing/items/save-defaults").send({
      source_quote_id: quote.body.id,
      items: [{
        match_name: "Board A",
        fields: {
          category: "sheet_materials",
          buy_price: 18.5,
          markup_percent: 30,
          default_markup: 30,
          unit: "ea",
          supplier: "Acme",
          product_number: "ABC-1",
          section: "Cabinet Materials",
          section_id: section.body.id,
          section_key: "cabinet_materials",
          section_display_order: 15,
        },
      }],
    }).expect(200);

    expect(saved.body.created).toBe(1);

    const csv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,2,ea,ABC-1";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "saved-default.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);

    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      pricing_item_id: saved.body.records[0].id,
      buy_price: 18.5,
      category: "sheet_materials",
      section: "Cabinet Materials",
      section_id: section.body.id,
      section_key: "cabinet_materials",
      section_display_order: 15,
    });
  });

  test("saves persistent auto-inclusions with audit history", async () => {
    const agent = await createAuthenticatedAgent();
    const parent = await agent.post("/api/entities/PricingItem").send({
      name: "770C600 Drawer runners",
      supplier: "Blum",
      product_number: "770C600",
      unit: "set",
      buy_price: 50,
      is_user_created: true,
    }).expect(201);

    const saved = await agent.post(`/api/pricing/items/${parent.body.id}/auto-inclusions`).send({
      source_import_id: "import-456",
      save_as_default: true,
      inclusions: [{
        inclusion_sku: "EURO-SCREW",
        inclusion_description: "Euro screws",
        inclusion_category: "misc_fixings",
        quantity_logic: "per_set",
        quantity_value: 8,
        unit_cost: 0.08,
        markup_percent: 30,
      }],
    }).expect(200);

    expect(saved.body.saved).toHaveLength(1);
    expect(saved.body.saved[0]).toMatchObject({
      parent_pricing_item_id: parent.body.id,
      inclusion_description: "Euro screws",
      quantity_logic: "per_set",
      quantity_value: 8,
    });

    const audit = await agent.get("/api/entities/AutoInclusionAuditLog").expect(200);
    expect(audit.body[0]).toMatchObject({
      parent_pricing_item_id: parent.body.id,
      source_import_id: "import-456",
    });
  });

  test("stages and commits quote-level CSV imports without updating master pricing", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Kitchen quote", quote_number: "Q-CSV", status: "draft" }).expect(201);
    const master = await agent.post("/api/entities/PricingItem").send({
      name: "Board A",
      supplier: "Acme",
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      unit: "ea",
      buy_price: 12,
      markup_percent: 40,
      is_active: true,
    }).expect(201);

    const csv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,2,ea,ABC-1";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "mozaik.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);

    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      quote_id: quote.body.id,
      import_type: "quote_level",
      heading_category: "Materials",
      pricing_item_id: master.body.id,
      buy_price: 12,
      source_row: 3,
    });
    const attachedFiles = await agent.get("/api/entities/Attachment").expect(200);
    expect(attachedFiles.body).toHaveLength(1);
    expect(attachedFiles.body[0]).toMatchObject({
      related_id: quote.body.id,
      related_type: "quote",
      name: "mozaik.csv",
      source: "pricing-import",
      file_source: "Mozaik Import",
      linked_pricing_import_id: staged.body.import.id,
    });
    expect(attachedFiles.body[0].document_information).toContain("Mozaik material list");
    expect(attachedFiles.body[0].document_information).toContain("Extracted 1 quote line item");

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);
    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body[0]).toMatchObject({
      quote_id: quote.body.id,
      import_id: staged.body.import.id,
      source_file_name: "mozaik.csv",
      source_row: 3,
      original_imported_value: expect.objectContaining({ item: "Board A" }),
      parsed_normalized_value: expect.objectContaining({ normalized_sku: "ABC1" }),
      unit_cost: 12,
    });
    const unchangedMaster = await agent.get(`/api/entities/PricingItem/${master.body.id}`).expect(200);
    expect(unchangedMaster.body.buy_price).toBe(12);
    expect(unchangedMaster.body.price_list_import_id).toBe("");
  });

  test("maps import headings to existing pricing sections and warns when a section is unmatched", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Section mapping quote", quote_number: "Q-SECTION-MAP", status: "draft" }).expect(201);
    await agent.post("/api/entities/PricingSection").send({
      name: "Materials",
      label: "Materials",
      key: "materials_custom",
      value: "materials_custom",
      display_order: 10,
      is_active: true,
    }).expect(201);

    const csv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,2,ea,ABC-1\nStone Tops,,,,\nTop A,Engineered stone,1,ea,STONE-1";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "sections.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);

    expect(staged.body.rows[0]).toMatchObject({
      section: "Materials",
      section_key: "materials",
      section_display_order: 10,
    });
    expect(typeof staged.body.rows[0].section_id).toBe("string");
    expect(staged.body.rows[0].section_id.length).toBeGreaterThan(0);
    expect(staged.body.rows.some((row) => (row.warnings || []).includes('Section "Stone Tops" is not mapped to an active section yet.'))).toBe(true);
  });

  test("new Mozaik quote imports replace the prior Mozaik import and update quote item quantities", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Mozaik refresh", quote_number: "Q-MOZ-REFRESH", status: "draft" }).expect(201);
    await agent.post("/api/entities/PricingItem").send({
      name: "Board A",
      supplier: "Acme",
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      unit: "ea",
      buy_price: 12,
      markup_percent: 30,
      is_active: true,
    }).expect(201);

    const firstCsv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,2,ea,ABC-1";
    const firstStaged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "mozaik-first.csv",
      file_type: "csv",
      file_base64: Buffer.from(firstCsv).toString("base64"),
    }).expect(201);
    await agent.post(`/api/pricing/quote-imports/${firstStaged.body.import.id}/commit`).send({}).expect(200);

    const firstQuoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const firstImportedItem = firstQuoteItems.body.find((item: Record<string, unknown>) => item.import_id === firstStaged.body.import.id);
    expect(firstImportedItem).toMatchObject({
      description: "White board",
      quantity: 2,
      total: 31.2,
    });

    const refreshedCsv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,5,ea,ABC-1";
    const refreshedStaged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "mozaik-refreshed.csv",
      file_type: "csv",
      file_base64: Buffer.from(refreshedCsv).toString("base64"),
    }).expect(201);
    await agent.post(`/api/pricing/quote-imports/${refreshedStaged.body.import.id}/commit`).send({}).expect(200);

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const importedItems = quoteItems.body.filter((item: Record<string, unknown>) => item.import_type === "quote_level");
    expect(importedItems).toHaveLength(1);
    expect(importedItems[0]).toMatchObject({
      id: firstImportedItem.id,
      import_id: refreshedStaged.body.import.id,
      pricing_quote_item_id: refreshedStaged.body.rows[0].id,
      quantity: 5,
      total: 78,
    });

    const oldImport = await agent.get(`/api/entities/QuoteImport/${firstStaged.body.import.id}`).expect(200);
    expect(oldImport.body).toMatchObject({
      import_status: "replaced",
      replaced_by_import_id: refreshedStaged.body.import.id,
    });
  });

  test("blocks destructive quote import replacement when manually managed imported lines exist unless force is provided", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Mozaik protection", quote_number: "Q-MOZ-GUARD", status: "draft" }).expect(201);
    await agent.post("/api/entities/PricingItem").send({
      name: "Board A",
      supplier: "Acme",
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      unit: "ea",
      buy_price: 12,
      markup_percent: 30,
      is_active: true,
    }).expect(201);

    const firstCsv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,2,ea,ABC-1";
    const firstStaged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "mozaik-guard-first.csv",
      file_type: "csv",
      file_base64: Buffer.from(firstCsv).toString("base64"),
    }).expect(201);
    await agent.post(`/api/pricing/quote-imports/${firstStaged.body.import.id}/commit`).send({}).expect(200);

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const imported = quoteItems.body.find((item: Record<string, unknown>) => item.import_id === firstStaged.body.import.id);
    expect(imported).toBeTruthy();
    await updateEntity(agent, "QuoteItem", imported.id, {
      review_status: "confirmed",
      source: "manual",
    });

    const refreshedCsv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,5,ea,ABC-1";
    const refreshedStaged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "mozaik-guard-refresh.csv",
      file_type: "csv",
      file_base64: Buffer.from(refreshedCsv).toString("base64"),
    }).expect(201);

    const blocked = await agent.post(`/api/pricing/quote-imports/${refreshedStaged.body.import.id}/commit`).send({}).expect(409);
    expect(blocked.body.code).toBe("quote_import_destructive_replace_blocked");

    await agent.post(`/api/pricing/quote-imports/${refreshedStaged.body.import.id}/commit`).send({
      force_destructive_replace: true,
    }).expect(200);
  });

  test("generates and stores a client-facing contract PDF from quote list items", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({
      title: "Contract document quote",
      quote_number: "Q-DOC",
      contact_name: "Casey Client",
      site_address: "42 Contract Lane",
      subtotal: 1000,
      gst: 150,
      total: 1150,
      status: "draft",
    }).expect(201);
    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Client-facing cabinetry line",
      quantity: 1,
      unit: "lot",
      unit_cost: 500,
      markup_percent: 50,
      total: 1000,
      is_optional: false,
    }).expect(201);

    const draft = await agent.get(`/api/quotes/${quote.body.id}/document-draft?document_type=contract`).expect(200);
    expect(draft.body.document).toMatchObject({
      customerName: "Casey Client",
      jobName: "Contract document quote",
      totalIncGst: 1150,
      depositAmount: 575,
      balanceDue: 575,
    });
    expect(draft.body.html).toContain("Client-facing cabinetry line");
    expect(draft.body.html).not.toContain("markup_percent");

    const generated = await agent.post(`/api/quotes/${quote.body.id}/documents/generate`).send({
      document: {
        ...draft.body.document,
        jobNotes: "Approved cabinetry scope.",
      },
    }).expect(201);
    expect(generated.body.attachment).toMatchObject({
      related_id: quote.body.id,
      related_type: "quote",
      mime_type: "application/pdf",
      source: "generated-document",
      file_source: "Generated Contract",
    });
    expect(generated.body.generated_document).toMatchObject({
      quote_id: quote.body.id,
      document_type: "contract",
      attachment_id: generated.body.attachment.id,
    });
    const quoteDocuments = await agent.get("/api/entities/QuoteDocument").expect(200);
    expect(quoteDocuments.body[0]).toMatchObject({
      quote_id: quote.body.id,
      status: "generated",
      generatedPdfUrl: generated.body.attachment.url,
    });
  }, 15_000);

  test("provides a default Quote List template and quote-list preview grouped by section order", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({
      title: "Internal quote list",
      quote_number: "Q-LIST",
      contact_name: "Casey Client",
      subtotal: 1000,
      gst: 150,
      total: 1150,
      status: "draft",
    }).expect(201);

    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Freight and packaging",
      quantity: 1,
      unit: "ea",
      total: 120,
      notes: "Packed for standard courier access.",
      gst_treatment: "ex_gst",
      section: "Freight",
      section_display_order: 50,
      is_optional: false,
    }).expect(201);

    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Cabinet panels",
      quantity: 4,
      unit: "ea",
      total: 880,
      notes: "Board grain direction approved.",
      gst_treatment: "ex_gst",
      section: "Cabinetry",
      section_display_order: 10,
      is_optional: false,
    }).expect(201);

    const draft = await agent.get(`/api/quotes/${quote.body.id}/document-draft?document_type=quote_list`).expect(200);
    expect(draft.body.template).toMatchObject({
      name: "Quote List",
      type: "quote_list",
    });
    expect(draft.body.document.documentType).toBe("quote_list");
    expect(draft.body.document.lineItems[0]).toMatchObject({
      description: "Cabinet panels",
      notes: expect.stringContaining("Board grain direction approved."),
    });

    const preview = await agent.post(`/api/quotes/${quote.body.id}/documents/preview`).send({
      document_type: "quote_list",
      template_id: draft.body.template.id,
      document: draft.body.document,
    }).expect(200);

    expect(preview.body.html).toContain("Quote List");
    expect(preview.body.html).toContain("Internal quote list generated from JoinerFlow.");
    expect(preview.body.html).toContain("Board grain direction approved.");
    expect(preview.body.html.indexOf("Cabinetry")).toBeLessThan(preview.body.html.indexOf("Freight"));
  });

  test("creates, previews, publishes, imports, and uses graphical document templates", async () => {
    const agent = await createAuthenticatedAgent();
    const created = await agent.post("/api/document-templates").send({
      name: "Client Safe Contract",
      type: "contract",
    }).expect(201);
    expect(created.body.template_json.blocks.length).toBeGreaterThan(0);

    const preview = await agent.post(`/api/document-templates/${created.body.id}/preview`).send({}).expect(200);
    expect(preview.body.html).toContain("Sample Customer");
    expect(preview.body.html).toContain("Trimtek Squareline Ali Door");

    const blocked = await agent.put(`/api/document-templates/${created.body.id}`).send({
      ...created.body.template_json,
      blocks: [
        ...created.body.template_json.blocks,
        {
          id: "unsafe-field",
          pageIndex: 0,
          type: "text",
          x: 40,
          y: 40,
          width: 200,
          height: 40,
          styleJson: {},
          contentJson: { text: "{{quote.margin}}" },
        },
      ],
    }).expect(400);
    expect(blocked.body.error).toMatch(/Unsupported|internal/);

    await agent.post(`/api/document-templates/${created.body.id}/publish`).send({}).expect(200);
    const imported = await agent.post("/api/document-templates/import/mozaik").send({
      file_name: "Contract.prcrpt",
      type: "contract",
      content: '<Report><XRLabel Text="Contract" /><XRLabel Text="GST Inclusive" /><XRLabel Text="Signature" /></Report>',
    }).expect(201);
    expect(imported.body.import_source.import_status).toBe("best_effort_converted");

    const quote = await agent.post("/api/entities/Quote").send({
      title: "Template generation quote",
      quote_number: "Q-TEMPLATE",
      contact_name: "Taylor Template",
      subtotal: 500,
      gst: 75,
      total: 575,
      status: "draft",
    }).expect(201);
    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Template-rendered line",
      quantity: 1,
      unit: "lot",
      total: 500,
      is_optional: false,
    }).expect(201);

    const draft = await agent.get(`/api/quotes/${quote.body.id}/document-draft?document_type=contract`).expect(200);
    const generated = await agent.post(`/api/quotes/${quote.body.id}/documents/generate`).send({
      template_id: created.body.id,
      document: {
        ...draft.body.document,
        jobNotes: "Template-backed contract.",
      },
    }).expect(201);
    expect(generated.body.quote_document.template_id).toBe(created.body.id);
    expect(generated.body.html).toContain("Taylor Template");
    expect(generated.body.html).not.toContain("buy_cost");
  }, 20000);

  test("stages quote-level XLSX imports consistently with CSV imports", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Excel quote", quote_number: "Q-XLSX", status: "draft" }).expect(201);
    await agent.post("/api/entities/PricingItem").send({
      name: "Board A",
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      unit: "ea",
      buy_price: 12,
      is_active: true,
    }).expect(201);

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "mozaik.xlsx",
      file_type: "xlsx",
      file_base64: makeQuoteImportXlsxBase64(),
    }).expect(201);

    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      source_file_type: "xlsx",
      heading_category: "Materials",
      quantity: 2,
      buy_price: 12,
    });
    const attachedFiles = await agent.get("/api/entities/Attachment").expect(200);
    expect(attachedFiles.body[0]).toMatchObject({
      name: "mozaik.xlsx",
      file_source: "Mozaik Import",
    });
    expect(attachedFiles.body[0].document_information).toContain("Mozaik material list");
  });

  test("extracts PDF line items and PDF total fallback for quote-level imports", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "PDF quote", quote_number: "Q-PDF", status: "draft" }).expect(201);
    const tablePdf = `%PDF-1.4
Acme Hardware
Quote: SUP-42
Date: 2026-04-30
SKU,Description,Qty,Unit Price,Line Total
HNG-1,Hinge pack,2,10,20
RUN-2,Runner set,1,45,45
Total Ex GST 65
%%EOF`;

    const stagedTable = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "supplier-lines.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(tablePdf).toString("base64"),
    }).expect(201);

    expect(stagedTable.body.rows).toHaveLength(2);
    expect(stagedTable.body.rows[0]).toMatchObject({
      source: "quote_pdf",
      source_page: 1,
      supplier: "Acme Hardware",
      original_sku: "HNG-1",
      buy_price: 10,
      total_buy_price: 20,
    });

    const totalPdf = `%PDF-1.4
Stone Supplier Ltd
Quote Ref: ST-9
Supply stone benchtop as specified.
GST 150
Total Inc GST $1,150.00
%%EOF`;
    const stagedTotal = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "stone-total.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(totalPdf).toString("base64"),
    }).expect(201);

    expect(stagedTotal.body.rows).toHaveLength(1);
    expect(stagedTotal.body.metadata).toMatchObject({
      gst_inclusive_total: 1150,
      total_inc_gst: 1150,
      gst_exclusive_total: 1000,
      subtotal_ex_gst: 1000,
      gst_amount: 150,
    });
    expect(stagedTotal.body.rows[0]).toMatchObject({
      source: "quote_pdf",
      unit: "quote",
      buy_price: 1000,
      gst_treatment: "inc_gst",
      source_file_name: "stone-total.pdf",
    });
  });

  test("bypasses column mapping for quote-level PDFs and stages totals directly", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "PDF no mapping", quote_number: "Q-NOMAP", status: "draft" }).expect(201);
    const pdf = `%PDF-1.4
Direct Supplier Ltd
Quote DS-77
Supply package
GST Inclusive Total $2,300.00
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "direct-supplier.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(pdf).toString("base64"),
      column_mapping: { product_number: "This header does not exist" },
    }).expect(201);

    expect(staged.body.import.column_mapping || {}).toEqual({});
    expect(staged.body.metadata).toMatchObject({
      document_type: "supplier_quote",
      document_number: "DS-77",
      total_inc_gst: 2300,
      gst_inclusive_total: 2300,
      subtotal_ex_gst: 2000,
      gst_exclusive_total: 2000,
    });
    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      unit: "quote",
      buy_price: 2000,
      total_buy_price: 2000,
      source: "quote_pdf",
    });
  });

  test("extracts supplier invoice totals and creates a single quote line from the inc-GST total", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Invoice import", quote_number: "Q-INV", status: "draft" }).expect(201);
    const invoicePdf = `%PDF-1.4
Cabinet Supplies Ltd
Invoice INV-1001
Invoice Date: 29/04/2026
Due Date: 20/05/2026
Supply cabinet hardware package.
Subtotal $1,500.00
GST $225.00
Amount Due $1,725.00
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "supplier-invoice.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(invoicePdf).toString("base64"),
    }).expect(201);

    expect(staged.body.metadata).toMatchObject({
      document_type: "supplier_invoice",
      document_number: "INV-1001",
      document_date: "29/04/2026",
      due_date: "20/05/2026",
      supplier_name: "Cabinet Supplies Ltd",
      gst_exclusive_total: 1500,
      gst_amount: 225,
      gst_inclusive_total: 1725,
    });
    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      unit: "quote",
      buy_price: 1500,
      total_buy_price: 1500,
      gst_treatment: "ex_gst",
    });

    const attachments = await agent.get("/api/entities/Attachment").expect(200);
    expect(attachments.body[0]).toMatchObject({
      file_source: "Supplier Invoice",
      document_type: "supplier_invoice",
      document_number: "INV-1001",
      extracted_inc_gst_total: 1725,
      extracted_ex_gst_subtotal: 1500,
      extracted_gst_amount: 225,
      linked_pricing_import_id: staged.body.import.id,
    });
    expect(attachments.body[0].document_information).toContain("Supplier invoice detected.");
    expect(attachments.body[0].document_information).toContain("Extracted total inc GST: $1,725.00.");

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);
    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body[0]).toMatchObject({
      import_type: "quote_level",
      unit_cost: 1500,
      supplier: "Cabinet Supplies Ltd",
    });
    const pricingItems = await agent.get("/api/entities/PricingItem").expect(200);
    expect(pricingItems.body).toHaveLength(0);
  });

  test("detects alternative total labels and flags unclear GST treatment on generic pricing documents", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Generic pricing", quote_number: "Q-GEN", status: "draft" }).expect(201);
    const pricingPdf = `%PDF-1.4
Stone Bench Pricing
Reference: DOC-77
Custom supply and delivery pricing.
Total NZD $575.00
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "generic-pricing.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(pricingPdf).toString("base64"),
    }).expect(201);

    expect(staged.body.metadata).toMatchObject({
      document_type: "generic_pricing_document",
      document_number: "DOC-77",
      gst_inclusive_total: 575,
      gst_exclusive_total: 500,
      gst_amount: 75,
      gst_treatment: "inc_gst",
    });
    expect(staged.body.rows[0]).toMatchObject({
      buy_price: 500,
      total_buy_price: 500,
    });
    expect(staged.body.warnings).not.toContain("No total inc GST could be found.");
  });

  test("calculates inc-GST totals from ex-GST-only pricing PDFs", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Ex GST PDF", quote_number: "Q-EX", status: "draft" }).expect(201);
    const pricingPdf = `%PDF-1.4
Panel Supplier Ltd
Quote EX-44
Prices exclude GST.
Total Ex GST $200.00
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "ex-gst.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(pricingPdf).toString("base64"),
    }).expect(201);

    expect(staged.body.metadata).toMatchObject({
      document_type: "supplier_quote",
      document_number: "EX-44",
      subtotal_ex_gst: 200,
      gst_exclusive_total: 200,
      gst_amount: 30,
      total_inc_gst: 230,
      gst_inclusive_total: 230,
      gst_treatment: "ex_gst",
      gst_was_calculated: true,
    });
    expect(staged.body.rows[0]).toMatchObject({
      buy_price: 200,
      gst_treatment: "ex_gst",
    });
  });

  test("extracts Woodsmiths-style GST Inclusive totals without requiring line extraction", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Woodsmiths total", quote_number: "Q-WTOTAL", status: "draft" }).expect(201);
    const woodsmithsPdf = `%PDF-1.4
The Woodsmiths NZ Ltd
Quote Q-1898
Supply Trimtek aluminium door package as quoted.
GST Exclusive $2,878.00
GST $431.70
GST Inclusive $3,309.70
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "Woodsmiths total Q-1898.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(woodsmithsPdf).toString("base64"),
    }).expect(201);

    expect(staged.body.metadata).toMatchObject({
      supplier_name: "The Woodsmiths NZ Ltd",
      document_type: "supplier_quote",
      document_number: "Q-1898",
      subtotal_ex_gst: 2878,
      gst_exclusive_total: 2878,
      gst_amount: 431.7,
      total_inc_gst: 3309.7,
      gst_inclusive_total: 3309.7,
    });
    expect(staged.body.warnings).not.toContain("No total inc GST could be found.");
    expect(staged.body.warnings).not.toContain("GST does not reconcile with the extracted totals.");
    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      unit: "quote",
      buy_price: 2878,
      total_buy_price: 2878,
    });
    const attachments = await agent.get("/api/entities/Attachment").expect(200);
    expect(attachments.body[0]).toMatchObject({
      extracted_inc_gst_total: 3309.7,
      extracted_ex_gst_subtotal: 2878,
      extracted_gst_amount: 431.7,
    });
    expect(attachments.body[0].document_information).toContain("Extracted total inc GST: $3,309.70.");
  });

  test("flags ambiguous generic totals when GST treatment is unclear", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Ambiguous total", quote_number: "Q-AMB", status: "draft" }).expect(201);
    const pricingPdf = `%PDF-1.4
Unknown Pricing Document
Document Number: DOC-88
Supply allowance
Total $575.00
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "ambiguous-total.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(pricingPdf).toString("base64"),
    }).expect(201);

    expect(staged.body.metadata).toMatchObject({
      document_type: "generic_pricing_document",
      gst_inclusive_total: 575,
      gst_treatment: "unknown",
    });
    expect(staged.body.warnings).toContain("GST treatment is unclear; review whether amounts include or exclude GST.");
    expect(staged.body.warnings).toContain("Total label is ambiguous; review the selected inc-GST total.");
    expect(staged.body.rows[0]).toMatchObject({
      buy_price: 500,
      gst_treatment: "unknown",
    });
  });

  test("creates multiple quote-level lines from invoice rows that include GST", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Invoice lines", quote_number: "Q-LINES", status: "draft" }).expect(201);
    const invoicePdf = `%PDF-1.4
Fast Fixings Ltd
Invoice INV-2002
Prices include GST.
SKU,Description,Qty,Unit Price,Line Total
SCR-1,Screws pack,2,57.50,115.00
Total Including GST $115.00
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "invoice-lines.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(invoicePdf).toString("base64"),
    }).expect(201);

    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      original_sku: "SCR-1",
      quantity: 2,
      buy_price: 50,
      total_buy_price: 100,
      gst_treatment: "inc_gst",
    });
    expect(staged.body.metadata).toMatchObject({
      document_type: "supplier_invoice",
      gst_inclusive_total: 115,
      gst_exclusive_total: 100,
      gst_amount: 15,
    });
    expect(staged.body.warnings).not.toContain("Extracted line totals do not add to the GST exclusive subtotal.");
  });

  test("extracts Woodsmiths-style supplier quote PDFs as quote-level rows", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Woodsmiths quote", quote_number: "Q-WOOD", status: "draft" }).expect(201);
    const woodsmithsPdf = `%PDF-1.4
The Woodsmiths NZ Ltd
GST Number: 123-456-789
Email: quotes@woodsmiths.co.nz
Phone: 09 123 4567
Quote Q-1898
Quote Date: 30/04/2026
Valid Until: 30/05/2026
Account Reference: MILLBROOK
Project: Kitchen Ali Doors
Salesperson: Taylor
Designer: Sam Joiner
These prices are all Excluding GST.
TT-SQL Trimtek Squareline Ali Door; 800h x 340w 2 210.00 420.00
TT-SQL Trimtek Squareline Ali Door; 1100h x 340w 1 260.00 260.00
IPP Investment Protection Packaging 1 35.00 35.00
FREIGHT Freight 1 65.00 65.00
GST Exclusive Total $780.00
GST $117.00
GST Inclusive Total $897.00
Freight notes: rural delivery surcharges excluded
Installation/templating notes: supply only
%%EOF`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "Woodsmiths Q-1898.pdf",
      file_type: "pdf",
      file_base64: Buffer.from(woodsmithsPdf).toString("base64"),
    }).expect(201);

    expect(staged.body.metadata).toMatchObject({
      supplier_name: "The Woodsmiths NZ Ltd",
      supplier_gst_number: "123-456-789",
      supplier_email: "quotes@woodsmiths.co.nz",
      quote_reference: "Q-1898",
      quote_date: "30/04/2026",
      valid_until: "30/05/2026",
      account_reference: "MILLBROOK",
      project_reference: "Kitchen Ali Doors",
      salesperson: "Taylor",
      designer_contact: "Sam Joiner",
      gst_treatment: "ex_gst",
      gst_exclusive_total: 780,
      gst_amount: 117,
      gst_inclusive_total: 897,
    });
    expect(staged.body.warnings).not.toContain("Extracted line totals do not add to the GST exclusive subtotal.");
    expect(staged.body.warnings).not.toContain("GST does not reconcile with the extracted totals.");
    expect(staged.body.rows).toHaveLength(4);
    expect(staged.body.rows[0]).toMatchObject({
      supplier: "The Woodsmiths NZ Ltd",
      quote_reference: "Q-1898",
      original_sku: "TT-SQL",
      description: "Trimtek Squareline Ali Door; 800h x 340w",
      quantity: 2,
      buy_price: 210,
      total_buy_price: 420,
      category: "doors_fronts",
      gst_treatment: "ex_gst",
    });
    expect(staged.body.rows[2]).toMatchObject({ original_sku: "IPP", category: "packaging_freight" });
    expect(staged.body.rows[3]).toMatchObject({ original_sku: "FREIGHT", category: "freight_delivery" });

    const attachedFiles = await agent.get("/api/entities/Attachment").expect(200);
    expect(attachedFiles.body).toHaveLength(1);
    expect(attachedFiles.body[0]).toMatchObject({
      related_id: quote.body.id,
      name: "Woodsmiths Q-1898.pdf",
      source: "pricing-import",
      file_source: "Supplier Quote",
      supplier_name: "The Woodsmiths NZ Ltd",
      supplier_quote_number: "Q-1898",
      linked_pricing_import_id: staged.body.import.id,
    });
    expect(attachedFiles.body[0].document_information).toContain("Supplier: The Woodsmiths NZ Ltd.");
    expect(attachedFiles.body[0].document_information).toContain("Supplier quote detected.");
    expect(attachedFiles.body[0].document_information).toContain("Document: Q-1898.");
    expect(attachedFiles.body[0].document_information).toContain("Extracted 4 line items.");
    expect(attachedFiles.body[0].document_information).toContain("Ex GST: $780.00.");
    expect(attachedFiles.body[0].document_information).toContain("Inc GST total: $897.00.");

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);
    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body).toHaveLength(4);
    expect(quoteItems.body[0]).toMatchObject({
      source_file_name: "Woodsmiths Q-1898.pdf",
      source_item_code: "TT-SQL",
      supplier_quote_number: "Q-1898",
      supplier_gst_number: "123-456-789",
      original_extracted_description: "Trimtek Squareline Ali Door; 800h x 340w",
      unit_cost: 210,
      total: 546,
    });
  });

  test("edits quote file document information and avoids duplicate pricing import files", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "File info quote", quote_number: "Q-FILE", status: "draft" }).expect(201);
    const fileBase64 = Buffer.from("Item,Description,Quantity,Unit\nMaterials,,,,\nBoard A,White board,2,ea").toString("base64");
    const first = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "same.csv",
      file_type: "csv",
      file_base64: fileBase64,
    }).expect(201);
    await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "same.csv",
      file_type: "csv",
      file_base64: fileBase64,
    }).expect(201);

    const attachedFiles = await agent.get("/api/entities/Attachment").expect(200);
    expect(attachedFiles.body).toHaveLength(1);
    expect(attachedFiles.body[0].version_count).toBe(1);

    const updated = await updateEntity(agent, "Attachment", attachedFiles.body[0].id, {
      document_information: "Supplier confirmed revision B. Excludes install.",
    });
    expect(updated.body.document_information).toBe("Supplier confirmed revision B. Excludes install.");
    expect(first.body.attachment.id).toBe(attachedFiles.body[0].id);
  });

  test("uses OCR fallback for scanned supplier quote PDFs and flags confidence", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Scanned quote", quote_number: "Q-OCR", status: "draft" }).expect(201);
    const ocrText = `The Woodsmiths NZ Ltd
Quote Q-1898
These prices are all Excluding GST.
TT-SQL Trimtek Squareline Ali Door;
800h x 340w 2 210.00 420.00
GST Exclusive Total $420.00
GST $63.00
GST Inclusive Total $483.00`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "scanned-woodsmiths.pdf",
      file_type: "pdf",
      file_base64: Buffer.from("%PDF-1.4\n/image only/%%EOF").toString("base64"),
      ocr_text: ocrText,
    }).expect(201);

    expect(staged.body.warnings).toContain("OCR-extracted PDF values require review before commit.");
    expect(staged.body.rows).toHaveLength(1);
    expect(staged.body.rows[0]).toMatchObject({
      original_sku: "TT-SQL",
      description: "Trimtek Squareline Ali Door; 800h x 340w",
      confidence_score: 0.62,
    });
    expect(staged.body.rows[0].warnings).toContain("Low extraction confidence; review before commit.");
  });

  test("allows review edits and exclusions before quote-level import commit", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Review quote", quote_number: "Q-REVIEW", status: "draft" }).expect(201);
    const csv = "Item,Description,Quantity,Unit\nMaterials,,,,\nBoard A,White board,2,ea\nBoard B,Grey board,1,ea";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "review.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);

    await updateEntity(agent, "PricingQuoteItem", staged.body.rows[0].id, {
      buy_price: 20,
      markup_percent: 50,
      sell_price: 30,
      total_buy_price: 40,
      total_sell_price: 60,
    });
    await updateEntity(agent, "PricingQuoteItem", staged.body.rows[1].id, {
      review_state: "excluded",
      status: "excluded",
    });

    const committed = await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);
    expect(committed.body.created).toBe(1);
    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body).toHaveLength(1);
    expect(quoteItems.body[0]).toMatchObject({
      description: "White board",
      unit_cost: 20,
      markup_percent: 50,
      total: 60,
    });
  });

  test("stages and commits Mozaik job costing CSV rows without summary lines", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Job costing import", quote_number: "Q-JOB-COST", status: "draft" }).expect(201);
    const csv = `Tax,Item,Description,QTY,Units,Amount,Total
"True","Materials","","","","",""
"True","     16mm White TE Natural","     ","17","#","54.72","1,209.31"
"True","Add-On","Materials - Freight","","","22.00","22.00"
"True","Labor","Labour","2","Hrs","50.00","100.00"
"False","Subtotal","","","","","1,331.31"
"False","Tax","","","%","15%","199.70"
"False","Deposit","","","%","50%","765.51"
"False","Total","","","","","1,531.01"
"False","Balance Due","","","","","765.50"`;

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "Job Costing (May 04, 26).csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);

    expect(staged.body.rows.map((row: Record<string, unknown>) => row.description)).toEqual([
      "16mm White TE Natural",
      "Materials - Freight",
      "Labour",
    ]);
    expect(staged.body.rows[0]).toMatchObject({
      heading_category: "Materials",
      category: "sheet_materials",
      quantity: 17,
      unit: "#",
      buy_price: 54.72,
      line_total_ex_gst: 1209.31,
      total_buy_price: 1209.31,
    });
    expect(staged.body.import.metadata).toMatchObject({
      subtotal_ex_gst: 1331.31,
      gst_amount: 199.7,
      total_inc_gst: 1531.01,
    });

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body.map((row: Record<string, unknown>) => row.description)).toEqual([
      "16mm White TE Natural",
      "Materials - Freight",
      "Labour",
    ]);
    expect(quoteItems.body[0]).toMatchObject({
      quote_id: quote.body.id,
      section: "Materials",
      unit_cost: 54.72,
      total: 1572.1,
    });
    expect(quoteItems.body.some((row: Record<string, unknown>) => ["Subtotal", "Tax", "Deposit", "Total", "Balance Due"].includes(String(row.description)))).toBe(false);
  });

  test("updates committed quote line items from edited import review rows with audit history", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Update imported rows", quote_number: "Q-UPD", status: "draft" }).expect(201);
    const master = await agent.post("/api/entities/PricingItem").send({
      name: "Board A",
      product_number: "ABC-1",
      normalized_sku: "ABC1",
      unit: "ea",
      buy_price: 10,
      is_active: true,
    }).expect(201);
    const csv = "Item,Description,Quantity,Unit,SKU\nMaterials,,,,\nBoard A,White board,2,ea,ABC-1";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "update-lines.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);
    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);

    await updateEntity(agent, "PricingQuoteItem", staged.body.rows[0].id, {
      description: "Updated board",
      category: "doors_fronts",
      quantity: 3,
      unit: "sheet",
      buy_price: 20,
      markup_percent: 50,
      sell_price: 30,
      total_buy_price: 60,
      total_sell_price: 90,
      gst_treatment: "inc_gst",
    });

    const updated = await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({}).expect(200);
    expect(updated.body).toMatchObject({
      updated: 1,
      skipped: 0,
    });
    expect(updated.body.audit_count).toBeGreaterThanOrEqual(8);
    expect(updated.body.quote).toMatchObject({
      subtotal: 90,
      gst: 13.5,
      total: 103.5,
    });

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body[0]).toMatchObject({
      quote_id: quote.body.id,
      import_id: staged.body.import.id,
      pricing_quote_item_id: staged.body.rows[0].id,
      description: "Updated board",
      category: "doors_fronts",
      quantity: 3,
      unit: "sheet",
      unit_cost: 20,
      markup_percent: 50,
      sell_price: 30,
      total: 90,
      gst_treatment: "inc_gst",
    });

    const audit = await agent.get("/api/entities/QuoteLineItemUpdateAudit").expect(200);
    expect(audit.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quote_id: quote.body.id,
        import_id: staged.body.import.id,
        line_item_id: quoteItems.body[0].id,
        pricing_quote_item_id: staged.body.rows[0].id,
        field: "description",
        old_value: "White board",
        new_value: "Updated board",
      }),
      expect.objectContaining({
        field: "total",
        old_value: 26,
        new_value: 90,
      }),
    ]));

    const unchangedMaster = await agent.get(`/api/entities/PricingItem/${master.body.id}`).expect(200);
    expect(unchangedMaster.body.buy_price).toBe(10);

    await updateEntity(agent, "PricingQuoteItem", staged.body.rows[0].id, {
      buy_price: 0,
      sell_price: 0,
      total_buy_price: 0,
      total_sell_price: 0,
    });
    const warningRefresh = await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({}).expect(200);
    expect(warningRefresh.body.warnings).toContain("Missing buy price.");
    const refreshedRows = await agent.get("/api/entities/PricingQuoteItem").expect(200);
    expect(refreshedRows.body[0].warnings).toContain("Missing buy price.");
  });

  test("does not remove imported quote list items on update unless removals are explicitly applied", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Preserve imported lines", quote_number: "Q-PRESERVE" }).expect(201);
    const csv = "Item,Description,Quantity,Unit\nMaterials,,,,\nBoard A,White board,2,ea";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "preserve-import.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);
    await updateEntity(agent, "PricingQuoteItem", staged.body.rows[0].id, {
      buy_price: 10,
      markup_percent: 30,
      sell_price: 13,
      total_buy_price: 20,
      total_sell_price: 26,
    });
    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);

    const committedItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const quoteItem = committedItems.body.find((item) => item.import_id === staged.body.import.id);
    expect(quoteItem).toMatchObject({
      description: "White board",
      is_optional: false,
      total: 26,
    });

    await updateEntity(agent, "PricingQuoteItem", staged.body.rows[0].id, {
      review_state: "deleted",
      status: "deleted",
      description: "Deleted in review",
      buy_price: 99,
      markup_percent: 0,
      sell_price: 99,
      total_buy_price: 198,
      total_sell_price: 198,
    });

    const defaultUpdate = await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({}).expect(200);
    expect(defaultUpdate.body).toMatchObject({ updated: 0, skipped: 1 });
    const preservedItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const preservedItem = preservedItems.body.find((item) => item.id === quoteItem.id);
    expect(preservedItem).toMatchObject({
      description: "White board",
      is_optional: false,
      total: 26,
    });

    const explicitRemovalUpdate = await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({ apply_removed_rows: true }).expect(200);
    expect(explicitRemovalUpdate.body).toMatchObject({ updated: 1, skipped: 0 });
    const removedItems = await agent.get("/api/entities/QuoteItem").expect(200);
    const removedItem = removedItems.body.find((item) => item.id === quoteItem.id);
    expect(removedItem).toMatchObject({
      description: "Deleted in review",
      is_optional: true,
      review_state: "deleted",
      total: 198,
    });
  });

  test("creates triggered auto-inclusion rows from imported quote items and links them on commit", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Triggered inclusions", quote_number: "Q-TRIGGER-1" }).expect(201);
    await agent.post("/api/entities/TriggeredAutoInclusionRule").send({
      rule_name: "MERIVO E fixing screws",
      match_mode: "all",
      trigger_description_contains: "MERIVO E",
      inclusion_description: "Fixing screws",
      inclusion_category: "hardware",
      inclusion_sku: "FIX-SCREW",
      quantity_logic: "per_imported_item",
      quantity_multiplier: 4,
      unit: "ea",
      cost: 0.2,
      markup_percent: 30,
      gst_treatment: "ex_gst",
      review_required: true,
      active: true,
    }).expect(201);

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "triggered.csv",
      file_type: "csv",
      file_base64: Buffer.from("Item,Description,Quantity,Unit,SKU\nGuides,,,,\nMERIVO E,Guide set,5,ea,MERIVO-E").toString("base64"),
    }).expect(201);

    expect(staged.body.rows).toHaveLength(2);
    const [parentRow, childRow] = staged.body.rows;
    expect(parentRow.description).toBe("Guide set");
    expect(parentRow.name).toBe("MERIVO E");
    expect(childRow).toMatchObject({
      source: "triggered_auto_inclusion",
      parent_pricing_quote_item_id: parentRow.id,
      description: "Fixing screws",
      quantity: 20,
      quantity_multiplier: 4,
      review_status: "auto_added_needs_review",
    });

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);

    const quoteItems = (await agent.get("/api/entities/QuoteItem").expect(200)).body;
    const parentItem = quoteItems.find((item: Record<string, unknown>) => item.pricing_quote_item_id === parentRow.id);
    const childItem = quoteItems.find((item: Record<string, unknown>) => item.pricing_quote_item_id === childRow.id);
    expect(parentItem).toBeTruthy();
    expect(childItem).toMatchObject({
      source: "triggered_auto_inclusion",
      source_rule_id: expect.any(String),
      parent_line_item_id: parentItem.id,
      parent_pricing_quote_item_id: parentRow.id,
      quantity: 20,
      review_status: "auto_added_needs_review",
      auto_added: true,
    });

    const confirmed = await agent.post(`/api/quotes/${quote.body.id}/items/${childItem.id}/confirm-triggered-inclusion`).send({}).expect(200);
    expect(confirmed.body.quote_item.review_status).toBe("confirmed");

    const audit = await agent.get("/api/entities/TriggeredAutoInclusionAudit").expect(200);
    expect(audit.body.some((entry: Record<string, unknown>) => entry.action_type === "committed_to_quote" && entry.parent_pricing_quote_item_id === parentRow.id)).toBe(true);
    expect(audit.body.some((entry: Record<string, unknown>) => entry.action_type === "confirmed" && entry.inclusion_quote_item_id === childItem.id)).toBe(true);
  });

  test("reprocesses triggered auto-inclusions without duplicates and recalculates linked quantities", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Triggered resync", quote_number: "Q-TRIGGER-2" }).expect(201);
    await agent.post("/api/entities/TriggeredAutoInclusionRule").send({
      rule_name: "Guide screws by category",
      match_mode: "all",
      trigger_category: "guides",
      inclusion_description: "Guide screws",
      inclusion_category: "hardware",
      quantity_logic: "per_imported_item",
      quantity_multiplier: 4,
      unit: "ea",
      cost: 0.25,
      markup_percent: 20,
      gst_treatment: "ex_gst",
      review_required: true,
      active: true,
    }).expect(201);

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "guides.csv",
      file_type: "csv",
      file_base64: Buffer.from("Item,Description,Quantity,Unit\nMaterials,,,,\nGuide line,Guide set,5,ea").toString("base64"),
    }).expect(201);
    const parentRow = staged.body.rows.find((row: Record<string, unknown>) => row.source !== "triggered_auto_inclusion");
    await updateEntity(agent, "PricingQuoteItem", parentRow.id, {
      category: "guides",
      quantity: 5,
      buy_price: 10,
      markup_percent: 30,
      total_buy_price: 50,
      total_sell_price: 65,
    });

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/commit`).send({}).expect(200);
    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({}).expect(200);

    let reviewRows = (await agent.get("/api/entities/PricingQuoteItem").expect(200)).body.filter((row: Record<string, unknown>) => row.import_id === staged.body.import.id && row.source === "triggered_auto_inclusion");
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0].quantity).toBe(20);

    await updateEntity(agent, "PricingQuoteItem", parentRow.id, {
      category: "guides",
      quantity: 3,
      buy_price: 10,
      markup_percent: 30,
      total_buy_price: 30,
      total_sell_price: 39,
    });
    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({}).expect(200);

    reviewRows = (await agent.get("/api/entities/PricingQuoteItem").expect(200)).body.filter((row: Record<string, unknown>) => row.import_id === staged.body.import.id && row.source === "triggered_auto_inclusion");
    expect(reviewRows).toHaveLength(1);
    expect(reviewRows[0].quantity).toBe(12);

    const quoteItems = (await agent.get("/api/entities/QuoteItem").expect(200)).body.filter((item: Record<string, unknown>) => item.import_id === staged.body.import.id && item.source === "triggered_auto_inclusion");
    expect(quoteItems).toHaveLength(1);
    expect(quoteItems[0].quantity).toBe(12);

    await updateEntity(agent, "PricingQuoteItem", parentRow.id, {
      review_state: "excluded",
      status: "excluded",
      category: "guides",
      quantity: 3,
      buy_price: 10,
      markup_percent: 30,
      total_buy_price: 30,
      total_sell_price: 39,
    });
    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({ apply_removed_rows: true }).expect(200);

    const excludedChild = (await agent.get("/api/entities/QuoteItem").expect(200)).body.find((item: Record<string, unknown>) => item.import_id === staged.body.import.id && item.source === "triggered_auto_inclusion");
    expect(excludedChild).toMatchObject({
      is_optional: true,
      review_state: "excluded",
    });
  });

  test("supports sku and supplier based triggered auto-inclusion matching", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Triggered matching", quote_number: "Q-TRIGGER-3" }).expect(201);
    await agent.post("/api/entities/TriggeredAutoInclusionRule").send({
      rule_name: "SKU match plates",
      match_mode: "all",
      trigger_product_number_equals: "770C600",
      inclusion_description: "Mounting plates",
      inclusion_category: "hardware",
      quantity_logic: "per_imported_item",
      quantity_multiplier: 2,
      unit: "ea",
      cost: 1.5,
      markup_percent: 20,
      active: true,
    }).expect(201);
    await agent.post("/api/entities/TriggeredAutoInclusionRule").send({
      rule_name: "Supplier freight",
      match_mode: "all",
      trigger_supplier: "The Woodsmiths NZ Ltd",
      inclusion_description: "Freight",
      inclusion_category: "freight_delivery",
      quantity_logic: "fixed",
      quantity_multiplier: 1,
      unit: "ea",
      cost: 25,
      markup_percent: 20,
      active: true,
    }).expect(201);

    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "trigger-match.csv",
      file_type: "csv",
      file_base64: Buffer.from("Item,Description,Quantity,Unit\nMaterials,,,,\nRunner,Runner line,2,ea").toString("base64"),
    }).expect(201);
    const parentRow = staged.body.rows.find((row: Record<string, unknown>) => row.source !== "triggered_auto_inclusion");
    await updateEntity(agent, "PricingQuoteItem", parentRow.id, {
      category: "guides",
      product_number: "770C600",
      source_item_code: "770C600",
      supplier: "The Woodsmiths NZ Ltd",
      quantity: 2,
      buy_price: 15,
      markup_percent: 30,
      total_buy_price: 30,
      total_sell_price: 39,
    });

    await agent.post(`/api/pricing/quote-imports/${staged.body.import.id}/update-line-items`).send({}).expect(200);

    const triggeredRows = (await agent.get("/api/entities/PricingQuoteItem").expect(200)).body
      .filter((row: Record<string, unknown>) => row.import_id === staged.body.import.id && row.source === "triggered_auto_inclusion");
    expect(triggeredRows).toHaveLength(2);
    expect(triggeredRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ description: "Mounting plates", quantity: 4 }),
      expect.objectContaining({ description: "Freight", quantity: 1 }),
    ]));
  });

  test("deletes quote-level import records and related imported rows", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({ title: "Delete import", quote_number: "Q-DEL", status: "draft" }).expect(201);
    const csv = "Item,Description,Quantity,Unit\nMaterials,,,,\nBoard A,White board,2,ea";
    const staged = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "delete-import.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);

    const deletedStaged = await agent.delete(`/api/pricing/quote-imports/${staged.body.import.id}`).expect(200);
    expect(deletedStaged.body).toMatchObject({
      deleted_import_id: staged.body.import.id,
      deleted_review_rows: 1,
      deleted_quote_items: 0,
    });
    await agent.get(`/api/entities/QuoteImport/${staged.body.import.id}`).expect(404);
    expect((await agent.get("/api/entities/PricingQuoteItem").expect(200)).body).toHaveLength(0);
    const retainedFile = await agent.get("/api/entities/Attachment").expect(200);
    expect(retainedFile.body).toHaveLength(1);
    expect(retainedFile.body[0].linked_pricing_import_id).toBe("");

    const stagedCommitted = await agent.post("/api/pricing/quote-imports/stage").send({
      quote_id: quote.body.id,
      file_name: "delete-committed.csv",
      file_type: "csv",
      file_base64: Buffer.from(csv).toString("base64"),
    }).expect(201);
    await updateEntity(agent, "PricingQuoteItem", stagedCommitted.body.rows[0].id, {
      buy_price: 20,
      markup_percent: 50,
      sell_price: 30,
      total_buy_price: 40,
      total_sell_price: 60,
    });
    await agent.post(`/api/pricing/quote-imports/${stagedCommitted.body.import.id}/commit`).send({}).expect(200);
    expect((await agent.get(`/api/entities/Quote/${quote.body.id}`).expect(200)).body).toMatchObject({
      subtotal: 60,
      gst: 9,
      total: 69,
    });

    const deletedCommitted = await agent.delete(`/api/pricing/quote-imports/${stagedCommitted.body.import.id}`).expect(200);
    expect(deletedCommitted.body).toMatchObject({
      deleted_review_rows: 1,
      deleted_quote_items: 1,
    });
    expect(deletedCommitted.body.quote).toMatchObject({
      subtotal: 0,
      gst: 0,
      total: 0,
    });
    expect((await agent.get("/api/entities/QuoteItem").expect(200)).body).toHaveLength(0);
  });
});
