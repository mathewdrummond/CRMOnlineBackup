import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

const testRoot = path.join(os.tmpdir(), "joinerflow-vitest");
const sqlitePath = path.join(testRoot, "joinerflow.test.sqlite");
const filesystemRoot = path.join(testRoot, "filesystem");

let app;
let closeDatabase;
let setGoogleProfileVerifierForTests: ((verifier: null | ((credential: string) => Promise<{
  googleSubject: string;
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  avatarUrl: string;
}>)) => void) | undefined;
let setEmbeddingProviderForTests: ((provider: null | ((text: string) => Promise<number[]>)) => void) | undefined;

async function createAuthenticatedAgent(email = "admin@example.test", role = "admin") {
  const agent = request.agent(app);
  await agent
    .post("/api/test/session")
    .send({ email, role })
    .expect(201);
  return agent;
}

beforeAll(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.ENABLE_TEST_AUTH = "true";
  process.env.AUTH_SESSION_SECRET = "joinerflow-test-session-secret";
  process.env.SQLITE_PATH = sqlitePath;
  process.env.FILESYSTEM_ROOT = filesystemRoot;
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = `${filesystemRoot},${testRoot}`;
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "";
  process.env.PUBLIC_API_ORIGIN = "";

  const dbModule = await import("./db");
  closeDatabase = dbModule.closeDatabase;
  const authModule = await import("./auth");
  setGoogleProfileVerifierForTests = authModule.setGoogleProfileVerifierForTests;
  const embeddingModule = await import("./ai/embeddings/embeddingService");
  setEmbeddingProviderForTests = embeddingModule.setEmbeddingProviderForTests;
  setEmbeddingProviderForTests?.(async (text: string) => {
    const lower = text.toLowerCase();
    return [
      lower.includes("kitchen") ? 1 : 0,
      lower.includes("wardrobe") ? 1 : 0,
      lower.includes("quote") ? 1 : 0,
      lower.includes("job") ? 1 : 0,
    ];
  });

  const serverModule = await import("./index");
  app = await serverModule.createApp();
});

beforeEach(async () => {
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "";
  process.env.PUBLIC_API_ORIGIN = "";
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = `${filesystemRoot},${testRoot}`;
  delete process.env.AI_ENABLED;
  setGoogleProfileVerifierForTests?.(null);
  await request(app).post("/api/test/reset").expect(204);
});

afterAll(() => {
  setGoogleProfileVerifierForTests?.(null);
  setEmbeddingProviderForTests?.(null);
  closeDatabase?.();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("quote versioning API", () => {
  test("duplicates quote versions with isolated pricing rows and comparison metadata", async () => {
    const agent = await createAuthenticatedAgent();
    const quoteResponse = await agent.post("/api/entities/Quote").send({
      title: "Yandell kitchen",
      quote_number: "QTE-VERSION-1",
      status: "draft",
      subtotal: 1000,
      gst: 150,
      total: 1150,
      contact_name: "S Yandell",
    }).expect(201);
    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quoteResponse.body.id,
      description: "Melteca cabinetry",
      category: "materials",
      quantity: 2,
      unit_cost: 250,
      markup_percent: 100,
      sell_price: 500,
      total: 1000,
      section: "Materials",
    }).expect(201);

    const duplicate = await agent.post(`/api/quotes/${quoteResponse.body.id}/duplicate`).send({
      option_name: "Option B - Veneer",
      option_description: "Premium veneer material option",
    }).expect(201);

    expect(duplicate.body.quote.id).not.toBe(quoteResponse.body.id);
    expect(duplicate.body.quote.quote_family_id).toBe(quoteResponse.body.id);
    expect(duplicate.body.quote.parent_quote_id).toBe(quoteResponse.body.id);
    expect(duplicate.body.quote.quote_version_number).toBe(2);
    expect(duplicate.body.quote.quote_option_name).toBe("Option B - Veneer");
    expect(duplicate.body.quote.status).toBe("draft");
    expect(duplicate.body.quote.approval_history).toEqual([]);
    expect(duplicate.body.copied_record_counts.QuoteItem).toBe(1);

    const copiedItems = await agent.get("/api/entities/QuoteItem").query({ quote_id: duplicate.body.quote.id }).expect(200);
    expect(copiedItems.body).toHaveLength(1);
    expect(copiedItems.body[0].quote_id).toBe(duplicate.body.quote.id);
    expect(copiedItems.body[0].copied_from_quote_id).toBe(quoteResponse.body.id);

    const family = await agent.get(`/api/quotes/${duplicate.body.quote.id}/versions`).expect(200);
    expect(family.body.versions.map((quote) => quote.quote_number)).toEqual(["QTE-VERSION-1", "QTE-VERSION-1-V2"]);

    await agent.put(`/api/entities/QuoteItem/${copiedItems.body[0].id}`).send({
      ...copiedItems.body[0],
      total: 1400,
      sell_price: 700,
      row_version: copiedItems.body[0].row_version,
    }).expect(200);
    const comparison = await agent
      .get(`/api/quotes/${quoteResponse.body.id}/versions/compare`)
      .query({ compare_quote_id: duplicate.body.quote.id })
      .expect(200);
    expect(comparison.body.changed_items[0].change_type).toBe("changed");
    expect(comparison.body.changed_items[0].delta_total).toBe(400);

    const audits = await agent.get("/api/entities/QuoteVersionAudit").expect(200);
    expect(audits.body.some((record) => record.action_type === "version_created" && record.quote_id === duplicate.body.quote.id)).toBe(true);
  });

  test("prevents two sibling quote versions from becoming production jobs", async () => {
    const agent = await createAuthenticatedAgent();
    const quoteResponse = await agent.post("/api/entities/Quote").send({
      title: "Kitchen option set",
      quote_number: "QTE-PROD-1",
      status: "draft",
      subtotal: 500,
      gst: 75,
      total: 575,
    }).expect(201);
    const duplicate = await agent.post(`/api/quotes/${quoteResponse.body.id}/duplicate`).send({
      option_name: "Premium appliance version",
    }).expect(201);

    await agent.post(`/api/quotes/${duplicate.body.quote.id}/convert-to-job`).send({ job_number: "JOB-OPTION-B" }).expect(201);
    await agent.post(`/api/quotes/${quoteResponse.body.id}/convert-to-job`).send({ job_number: "JOB-OPTION-A" }).expect(409);

    const source = await agent.get(`/api/entities/Quote/${quoteResponse.body.id}`).expect(200);
    const accepted = await agent.get(`/api/entities/Quote/${duplicate.body.quote.id}`).expect(200);
    expect(accepted.body.version_status).toBe("accepted");
    expect(source.body.version_status).toBe("not_selected");
    expect(source.body.sibling_accepted_quote_id).toBe(duplicate.body.quote.id);
  });
});

describe("server security and reliability", () => {
  test("exposes stable unauthenticated health checks with production security headers", async () => {
    for (const healthPath of ["/health", "/api/health"]) {
      const response = await request(app).get(healthPath).expect(200);

      expect(response.body.status).toBe("ok");
      expect(response.body.server_version).toBeTruthy();
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  test("reports the configured Google sign-in origin requirements without exposing secrets", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
    process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "admin@example.test";
    process.env.PUBLIC_API_ORIGIN = "https://crm.example.com";

    const response = await request(app)
      .get("/api/auth/config")
      .set("Host", "127.0.0.1:4000")
      .expect(200);

    expect(response.body.googleClientId).toBe("test-google-client-id.apps.googleusercontent.com");
    expect(response.body.publicApiOrigin).toBe("https://crm.example.com");
    expect(response.body.googleAuthorizedJavaScriptOrigins).toEqual(["https://crm.example.com"]);
    expect(response.body.originMatchesPublicOrigin).toBe(false);
    expect(Array.isArray(response.body.warnings)).toBe(true);
    expect(response.body.warnings[0]).toContain("Google Sign-In");
    expect(response.body.client_secret).toBeUndefined();
  });

  test("creates a signed session via Google login without exposing secrets", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
    process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "admin@example.test";

    setGoogleProfileVerifierForTests(async () => ({
      googleSubject: "google-sub-123",
      email: "admin@example.test",
      fullName: "Admin Example",
      givenName: "Admin",
      familyName: "Example",
      avatarUrl: "https://example.test/avatar.png",
    }));

    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: "test-google-credential" })
      .expect(201);

    expect(response.body.user.email).toBe("admin@example.test");
    expect(response.body.user.role).toBe("admin");
    expect(response.body.access_token).toBeUndefined();
    expect(response.body.client_secret).toBeUndefined();
    expect(response.body.googleClientId).toBeUndefined();

    const cookies = response.headers["set-cookie"] || [];
    expect(cookies.some((value) => value.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((value) => value.includes("SameSite=Strict"))).toBe(true);
  });

  test("logout clears the session and blocks further authenticated access", async () => {
    const agent = await createAuthenticatedAgent();

    const meResponse = await agent.get("/api/auth/me").expect(200);
    const cookies = meResponse.headers["set-cookie"] || [];
    const sessionCookie = cookies.find((value) => value.includes("crm_session") || value.includes("__Host-crm_session"));

    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
    await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionCookie || "")
      .expect(401);
  });

  test("rejects non-admin users from admin APIs", async () => {
    const memberAgent = await createAuthenticatedAgent("member@example.test", "member");
    await memberAgent.get("/api/admin/health").expect(403);
    await memberAgent.get("/api/ai/health").expect(403);
    await memberAgent.get("/api/access/users").expect(403);
  }, 10_000);

  test("rejects unauthenticated access to protected APIs", async () => {
    await request(app).get("/api/entities/Job").expect(401);
    await request(app).get("/api/admin/health").expect(401);
  });

  test("allows a test admin session to access admin health data", async () => {
    const agent = await createAuthenticatedAgent();
    const response = await agent.get("/api/admin/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(path.basename(response.body.database.path)).toContain("joinerflow.test");
    expect(Array.isArray(response.body.entities)).toBe(true);
  });

  test("exposes admin-only AI health without requiring Ollama at startup", async () => {
    process.env.AI_ENABLED = "false";
    const agent = await createAuthenticatedAgent();
    const response = await agent.get("/api/ai/health").expect(200);

    expect(response.body.enabled).toBe(false);
    expect(response.body.status).toBe("disabled");
  });

  test("returns a safe AI error when AI test is disabled", async () => {
    process.env.AI_ENABLED = "false";
    const agent = await createAuthenticatedAgent();
    const response = await agent.post("/api/ai/test").send({ prompt: "diagnostic" }).expect(503);

    expect(response.body.code).toBe("disabled");
    expect(response.body.error).toContain("disabled");
  });

  test("searches AI semantic index without mutating business records", async () => {
    const agent = await createAuthenticatedAgent();
    const created = await agent.post("/api/entities/Job").send({
      title: "Kitchen pantry install",
      job_number: "JOB-SEM-001",
      notes: "Tall kitchen pantry with oak shelves",
    }).expect(201);

    const response = await agent.post("/api/ai/search").send({
      query: "oak kitchen storage",
      entity_types: ["Job"],
      limit: 5,
    }).expect(200);

    expect(response.body.results.some((result) => result.record_id === created.body.id)).toBe(true);
    expect(response.body.results[0].entity).toBe("Job");
    expect(Array.isArray(response.body.index)).toBe(true);
  });

  test("returns quote insights and historical risk analysis without mutating quote pricing", async () => {
    const agent = await createAuthenticatedAgent();
    const sourceQuote = await agent.post("/api/entities/Quote").send({
      title: "Kitchen joinery proposal",
      quote_number: "Q-INT-001",
      total: 12000,
      subtotal: 10434.78,
      gst: 1565.22,
    }).expect(201);
    await agent.post("/api/entities/QuoteItem").send({
      quote_id: sourceQuote.body.id,
      description: "Kitchen carcass set",
      category: "materials",
      quantity: 5,
      unit_cost: 600,
      total: 4100,
      supplier_name: "TimberCo",
      product_number: "KIT-BASE",
    }).expect(201);

    const historicalQuote = await agent.post("/api/entities/Quote").send({
      title: "Kitchen joinery completed",
      quote_number: "Q-INT-002",
      total: 21000,
      status: "won",
    }).expect(201);
    const historicalJob = await agent.post("/api/entities/Job").send({
      quote_id: historicalQuote.body.id,
      title: "Kitchen joinery completed",
      job_number: "JOB-INT-002",
      install_date: "2026-05-01",
      install_end_date: "2026-05-04",
    }).expect(201);
    await agent.post("/api/entities/JobOperation").send({
      quote_id: historicalQuote.body.id,
      job_id: historicalJob.body.id,
      workflow_phase: "installation",
      operation: "install",
      estimated_hours: 20,
      actual_hours: 22,
    }).expect(201);

    const insights = await agent.get(`/api/ai/quote-insights/${sourceQuote.body.id}`).expect(200);
    const risk = await agent.get(`/api/ai/quote-risk-analysis/${sourceQuote.body.id}`).expect(200);
    const similar = await agent.get(`/api/ai/similar-historical-jobs/${sourceQuote.body.id}?limit=5`).expect(200);
    const reloadedQuote = await agent.get(`/api/entities/Quote/${sourceQuote.body.id}`).expect(200);

    expect(insights.body.quote_id).toBe(sourceQuote.body.id);
    expect(insights.body.margin).toBeTruthy();
    expect(Array.isArray(insights.body.recommendations)).toBe(true);
    expect(risk.body.quote_id).toBe(sourceQuote.body.id);
    expect(["low", "medium", "high"]).toContain(risk.body.overall_risk);
    expect(Array.isArray(similar.body.results)).toBe(true);
    expect(reloadedQuote.body.total).toBe(sourceQuote.body.total);
    expect(reloadedQuote.body.subtotal).toBe(sourceQuote.body.subtotal);
  });

  test("indexes configured NAS folders and serves permission-safe knowledge retrieval", async () => {
    const adminAgent = await createAuthenticatedAgent();
    const memberAgent = await createAuthenticatedAgent("member@example.test", "member");
    const sourceRoot = path.join(filesystemRoot, "knowledge");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "walnut-install.txt"), "Historical walnut kitchen install with curved island and Legrabox pricing.");

    const source = await adminAgent.post("/api/ai/knowledge/sources").send({
      label: "Knowledge Files",
      root_path: sourceRoot,
      enabled: true,
      allowed_extensions: ["txt", "md"],
      excluded_patterns: [],
      max_file_size_bytes: 1024 * 1024,
      chunk_size: 500,
      chunk_overlap: 50,
      scan_interval_minutes: 60,
    }).expect(201);

    await adminAgent.post("/api/ai/knowledge/reindex").send({ source_id: source.body.id }).expect(202);
    for (let index = 0; index < 10; index += 1) {
      const status = await adminAgent.get("/api/ai/knowledge/status").expect(200);
      const pending = Array.isArray(status.body?.queue?.queue)
        ? status.body.queue.queue.reduce((sum, row) => sum + Number(row.count || 0), 0)
        : 0;
      if (pending === 0) break;
    }

    const search = await memberAgent.post("/api/ai/knowledge/search").send({
      query: "walnut curved island install",
      limit: 5,
    }).expect(200);

    expect(Array.isArray(search.body.results)).toBe(true);
    expect(search.body.results.length).toBeGreaterThan(0);
    expect(String(search.body.results[0].relative_path || "")).toContain("walnut-install.txt");

    await memberAgent.get("/api/ai/knowledge/sources").expect(403);
  });

  test("rejects unsafe knowledge source paths outside allowlisted roots", async () => {
    const agent = await createAuthenticatedAgent();
    process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = filesystemRoot;
    await agent.post("/api/ai/knowledge/sources").send({
      label: "Unsafe",
      root_path: path.resolve("/", "tmp"),
      enabled: true,
    }).expect(400);
  });

  test("browses only allowlisted knowledge folders and filters hidden system directories", async () => {
    const agent = await createAuthenticatedAgent();
    const allowedRoot = path.join(filesystemRoot, "browse-root");
    fs.mkdirSync(path.join(allowedRoot, "jobs", "active"), { recursive: true });
    fs.mkdirSync(path.join(allowedRoot, ".git"), { recursive: true });
    fs.mkdirSync(path.join(allowedRoot, "@eaDir"), { recursive: true });
    fs.writeFileSync(path.join(allowedRoot, "readme.txt"), "not a folder");
    process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = allowedRoot;

    const roots = await agent.get("/api/ai/knowledge/roots").expect(200);
    expect(roots.body.roots).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: fs.realpathSync.native(allowedRoot), selectable: true }),
    ]));

    const browse = await agent
      .get("/api/ai/knowledge/browse")
      .query({ path: allowedRoot })
      .expect(200);
    expect(browse.body.entries.map((entry) => entry.name)).toEqual(["jobs"]);
    expect(browse.body.entries[0]).toEqual(expect.objectContaining({
      selectable: true,
      has_children: true,
    }));

    await agent
      .get("/api/ai/knowledge/browse")
      .query({ path: path.join(allowedRoot, "..", "..") })
      .expect(403);
  });

  test("blocks symlink escape during knowledge folder browsing", async () => {
    const agent = await createAuthenticatedAgent();
    const allowedRoot = path.join(filesystemRoot, "symlink-root");
    const outsideRoot = path.join(testRoot, "outside-secret");
    fs.mkdirSync(allowedRoot, { recursive: true });
    fs.mkdirSync(outsideRoot, { recursive: true });
    fs.symlinkSync(outsideRoot, path.join(allowedRoot, "escaped-link"), "dir");
    process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = allowedRoot;

    const browse = await agent
      .get("/api/ai/knowledge/browse")
      .query({ path: allowedRoot })
      .expect(200);
    expect(browse.body.entries.map((entry) => entry.name)).not.toContain("escaped-link");

    await agent
      .get("/api/ai/knowledge/browse")
      .query({ path: path.join(allowedRoot, "escaped-link") })
      .expect(404);
  });

  test("rejects duplicate indexed folder paths", async () => {
    const agent = await createAuthenticatedAgent();
    const sourceRoot = path.join(filesystemRoot, "duplicate-root");
    fs.mkdirSync(sourceRoot, { recursive: true });
    process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = sourceRoot;

    await agent.post("/api/ai/knowledge/sources").send({
      label: "First",
      root_path: sourceRoot,
      enabled: true,
    }).expect(201);
    await agent.post("/api/ai/knowledge/sources").send({
      label: "Second",
      root_path: path.join(sourceRoot, "."),
      enabled: true,
    }).expect(409);
  });

  test("rejects unknown application module keys from admin updates", async () => {
    const agent = await createAuthenticatedAgent();
    const response = await agent.put("/api/modules").send({
      modules: {
        purchasing: true,
      },
    }).expect(400);

    expect(response.body.code).toBe("module_config_unknown_key");
    expect(response.body.error).toContain("not a registered application module");
  });

  test("rejects unknown entity names", async () => {
    const agent = await createAuthenticatedAgent();
    await agent.get("/api/entities/DefinitelyNotReal").expect(404);
  });

  test("rejects invalid upload targets and missing related records", async () => {
    const agent = await createAuthenticatedAgent();

    await agent.post("/api/filesystem").send({
      related_id: "missing",
      related_type: "nope",
      name: "bad.txt",
      mime_type: "text/plain",
      data_base64: Buffer.from("hello").toString("base64"),
    }).expect(400);

    await agent.post("/api/filesystem").send({
      related_id: "missing-job",
      related_type: "job",
      name: "bad.txt",
      mime_type: "text/plain",
      data_base64: Buffer.from("hello").toString("base64"),
    }).expect(404);
  });

  test("allows safe contact uploads and records version history", async () => {
    const agent = await createAuthenticatedAgent();
    const createdContact = await agent.post("/api/entities/Contact").send({
      first_name: "Upload",
      last_name: "Contact",
      email: "upload-contact@example.test",
    }).expect(201);

    const upload = await agent.post("/api/filesystem").send({
      related_id: createdContact.body.id,
      related_type: "contact",
      name: "profile-note.txt",
      mime_type: "text/plain",
      data_base64: Buffer.from("hello from contact file").toString("base64"),
    }).expect(201);

    expect(upload.body.related_type).toBe("contact");

    const versions = await agent
      .get(`/api/filesystem/${upload.body.id}/versions`)
      .expect(200);

    expect(Array.isArray(versions.body)).toBe(true);
    expect(versions.body[0].attachment_id).toBe(upload.body.id);
  });

  test("allows authenticated PDF uploads to render in JoinerFlow preview dialogs", async () => {
    const agent = await createAuthenticatedAgent();
    const createdQuote = await agent.post("/api/entities/Quote").send({
      quote_number: "Q-PREVIEW-001",
      title: "Preview header quote",
    }).expect(201);

    const upload = await agent.post("/api/filesystem").send({
      related_id: createdQuote.body.id,
      related_type: "quote",
      name: "preview-drawing.pdf",
      mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\n% preview pdf").toString("base64"),
    }).expect(201);

    const previewPath = new URL(upload.body.url).pathname;
    const response = await agent.get(previewPath).expect(200);

    expect(response.headers["content-disposition"]).toContain("inline");
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
  });

  test("serves production handover files through attachment ownership and visibility checks", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await agent.post("/api/entities/Job").send({
      job_number: "JOB-FILE-001",
      title: "Production file job",
    }).expect(201);

    const upload = await agent.post("/api/filesystem").send({
      related_id: job.body.id,
      related_type: "job",
      name: "workshop-drawing.pdf",
      mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\n% test pdf").toString("base64"),
      production_visibility: "production",
    }).expect(201);

    const response = await agent
      .get(`/api/timeclock/filesystem/${upload.body.id}/content?disposition=inline`)
      .expect(200);

    expect(response.headers["content-disposition"]).toContain("inline");
    expect(response.headers["content-type"]).toContain("application/pdf");
  });

  test("blocks production handover access to management-only files", async () => {
    const agent = await createAuthenticatedAgent();
    const job = await agent.post("/api/entities/Job").send({
      job_number: "JOB-FILE-002",
      title: "Hidden production file job",
    }).expect(201);

    const upload = await agent.post("/api/filesystem").send({
      related_id: job.body.id,
      related_type: "job",
      name: "management-note.txt",
      mime_type: "text/plain",
      data_base64: Buffer.from("private management note").toString("base64"),
      production_visibility: "management",
    }).expect(201);

    await agent
      .get(`/api/timeclock/filesystem/${upload.body.id}/content`)
      .expect(403);
  });

  test("serves kiosk handover data without exposing management-only files", async () => {
    const agent = await createAuthenticatedAgent();
    const quote = await agent.post("/api/entities/Quote").send({
      quote_number: "Q-HANDOVER-001",
      title: "Kiosk Handover Quote",
    }).expect(201);
    const job = await agent.post("/api/entities/Job").send({
      job_number: "JOB-HANDOVER-001",
      title: "Kiosk Handover Job",
      quote_id: quote.body.id,
    }).expect(201);
    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Base cabinets",
      section: "Cabinetry",
      quantity: 4,
      unit: "ea",
    }).expect(201);
    await agent.post("/api/entities/SiteMeasure").send({
      quote_id: quote.body.id,
      notes: "Check walls before install.",
      include_in_handover_pack: true,
    }).expect(201);
    const visibleUpload = await agent.post("/api/filesystem").send({
      related_id: job.body.id,
      related_type: "job",
      name: "visible-drawing.pdf",
      mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\n% visible").toString("base64"),
      production_visibility: "production",
    }).expect(201);
    await agent.post("/api/filesystem").send({
      related_id: job.body.id,
      related_type: "job",
      name: "private-note.pdf",
      mime_type: "application/pdf",
      data_base64: Buffer.from("%PDF-1.4\n% private").toString("base64"),
      production_visibility: "management",
    }).expect(201);

    const response = await request(app)
      .get("/api/timeclock/handover-data")
      .set("X-CRM-App", "timeclock")
      .expect(200);

    expect(response.body.jobs.map((record: Record<string, unknown>) => record.id)).toContain(job.body.id);
    expect(response.body.quotes.map((record: Record<string, unknown>) => record.id)).toEqual([quote.body.id]);
    expect(response.body.quoteItems.map((record: Record<string, unknown>) => record.description)).toEqual(["Base cabinets"]);
    expect(response.body.siteMeasures.map((record: Record<string, unknown>) => record.notes)).toEqual(["Check walls before install."]);
    expect(response.body.attachments.map((record: Record<string, unknown>) => record.id)).toEqual([visibleUpload.body.id]);
  });

  test("does not expose removed stock APIs", async () => {
    const agent = await createAuthenticatedAgent();

    await agent.get("/api/stock/dashboard").expect(404);
    await agent.post("/api/stock/items").send({ name: "Removed Stock" }).expect(404);
    await agent.get("/api/entities/StockItem").expect(404);
  });

  test("registers purchasing entities and prevents orphaned purchase order line items", async () => {
    const agent = await createAuthenticatedAgent();

    const job = await agent.post("/api/entities/Job").send({
      title: "Purchasing kitchen",
      job_number: "JOB-PO-0001",
      job_name: "Purchasing kitchen",
      status: "planning",
    }).expect(201);

    const purchaseOrder = await agent.post("/api/entities/PurchaseOrder").send({
      po_number: "PO-0001",
      supplier_name: "Hardware Supplies Ltd",
      job_id: job.body.id,
      job_number: job.body.job_number,
      job_title: job.body.title,
      expected_date: "2026-04-30",
    }).expect(201);

    expect(purchaseOrder.body).toMatchObject({
      po_number: "PO-0001",
      supplier_name: "Hardware Supplies Ltd",
      job_id: job.body.id,
      status: "draft",
      subtotal: 0,
      gst: 0,
      total: 0,
    });

    const poItem = await agent.post("/api/entities/POItem").send({
      po_id: purchaseOrder.body.id,
      description: "Drawer runners",
      quantity: 4,
      unit: "ea",
      unit_price: 25,
      total: 100,
    }).expect(201);

    expect(poItem.body).toMatchObject({
      po_id: purchaseOrder.body.id,
      description: "Drawer runners",
      quantity: 4,
      unit: "ea",
      unit_price: 25,
      total: 100,
      received_qty: 0,
    });

    const orphanLine = await agent.post("/api/entities/POItem").send({
      po_id: "missing-po",
      description: "Orphan line",
    }).expect(400);
    expect(orphanLine.body).toMatchObject({
      code: "po_item_purchase_order_not_found",
    });

    const orphanPurchaseOrder = await agent.post("/api/entities/PurchaseOrder").send({
      supplier_name: "Hardware Supplies Ltd",
      job_id: "missing-job",
    }).expect(400);
    expect(orphanPurchaseOrder.body).toMatchObject({
      code: "purchase_order_job_not_found",
    });
  });

  test("merges used pricing sections and blocks deleting sections still in use", async () => {
    const agent = await createAuthenticatedAgent();
    const materials = await agent.post("/api/entities/PricingSection").send({
      name: "Materials",
      label: "Materials",
      key: "materials_custom",
      value: "materials_custom",
      display_order: 10,
      is_active: true,
    }).expect(201);
    const hardware = await agent.post("/api/entities/PricingSection").send({
      name: "Hardware",
      label: "Hardware",
      key: "hardware_custom",
      value: "hardware_custom",
      display_order: 20,
      is_active: true,
    }).expect(201);

    const quote = await agent.post("/api/entities/Quote").send({
      title: "Section merge quote",
      quote_number: "Q-SECTIONS-1",
    }).expect(201);

    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Panel item",
      quantity: 1,
      unit: "ea",
      unit_cost: 100,
      markup_percent: 30,
      total: 130,
      section: "Materials",
      section_id: materials.body.id,
      section_key: "materials_custom",
      section_display_order: 10,
    }).expect(201);

    const quoteImport = await agent.post("/api/entities/QuoteImport").send({
      quote_id: quote.body.id,
      import_type: "quote_level",
      import_status: "staged",
      structured_items: [{ heading_category: "Materials", section: "Materials" }],
    }).expect(201);

    await agent.post("/api/entities/PricingQuoteItem").send({
      quote_id: quote.body.id,
      import_id: quoteImport.body.id,
      name: "Imported panel",
      description: "Imported panel",
      quantity: 1,
      unit: "ea",
      buy_price: 100,
      markup_percent: 30,
      section: "Materials",
      section_id: materials.body.id,
      section_key: "materials_custom",
      section_display_order: 10,
    }).expect(201);

    await agent.delete(`/api/pricing/sections/${encodeURIComponent(materials.body.id)}`).expect(400);

    const merged = await agent.post(`/api/pricing/sections/${encodeURIComponent(materials.body.id)}/merge`).send({
      target_section_id: hardware.body.id,
    }).expect(200);

    expect(merged.body.impact.quote_items).toBe(1);
    expect(merged.body.impact.pricing_quote_items).toBe(1);
    expect(merged.body.impact.import_mappings).toBe(1);

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body[0]).toMatchObject({
      section: "Hardware",
      section_id: hardware.body.id,
      section_key: "hardware_custom",
      section_display_order: 20,
    });

    const pricingQuoteItems = await agent.get("/api/entities/PricingQuoteItem").expect(200);
    expect(pricingQuoteItems.body[0]).toMatchObject({
      section: "Hardware",
      section_id: hardware.body.id,
      section_key: "hardware_custom",
      section_display_order: 20,
    });

    const refreshedSource = await agent.get(`/api/entities/PricingSection/${encodeURIComponent(materials.body.id)}`).expect(200);
    expect(refreshedSource.body.is_active).toBe(false);
    expect(refreshedSource.body.merged_into_section_id).toBe(hardware.body.id);
  });

  test("deletes unused categories and merges used categories safely", async () => {
    const agent = await createAuthenticatedAgent();
    const source = await agent.post("/api/entities/PricingCategory").send({
      name: "Legacy Doors",
      label: "Legacy Doors",
      key: "legacy_doors",
      value: "legacy_doors",
      is_active: true,
    }).expect(201);
    const target = await agent.post("/api/entities/PricingCategory").send({
      name: "Doors / fronts",
      label: "Doors / fronts",
      key: "doors_fronts_custom",
      value: "doors_fronts_custom",
      is_active: true,
    }).expect(201);
    const unused = await agent.post("/api/entities/PricingCategory").send({
      name: "Delete Me",
      label: "Delete Me",
      key: "delete_me",
      value: "delete_me",
      is_active: true,
    }).expect(201);

    await agent.delete(`/api/pricing/categories/${encodeURIComponent(unused.body.id)}`).expect(200);

    const quote = await agent.post("/api/entities/Quote").send({
      title: "Category merge quote",
      quote_number: "Q-CATEGORIES-1",
    }).expect(201);

    await agent.post("/api/entities/PricingItem").send({
      name: "Legacy panel",
      category: "legacy_doors",
      buy_price: 100,
      markup_percent: 30,
      unit: "ea",
    }).expect(201);

    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Legacy door",
      category: "legacy_doors",
      quantity: 1,
      unit: "ea",
      unit_cost: 100,
      markup_percent: 30,
      total: 130,
    }).expect(201);

    const quoteImport = await agent.post("/api/entities/QuoteImport").send({
      quote_id: quote.body.id,
      import_type: "quote_level",
      import_status: "staged",
      structured_items: [{ category: "legacy_doors", description: "Imported legacy door" }],
    }).expect(201);

    await agent.post("/api/entities/PricingQuoteItem").send({
      quote_id: quote.body.id,
      import_id: quoteImport.body.id,
      name: "Imported legacy door",
      description: "Imported legacy door",
      category: "legacy_doors",
      quantity: 1,
      unit: "ea",
      buy_price: 100,
      markup_percent: 30,
    }).expect(201);

    await agent.post("/api/entities/GlobalAutoInclusion").send({
      description: "Legacy delivery",
      category: "legacy_doors",
      quantity: 1,
      unit: "ea",
      cost: 25,
      markup: 30,
      active: true,
    }).expect(201);

    await agent.post("/api/entities/TriggeredAutoInclusionRule").send({
      rule_name: "Legacy trigger",
      trigger_category: "legacy_doors",
      inclusion_description: "Legacy screws",
      inclusion_category: "legacy_doors",
      quantity_logic: "per_imported_item",
      quantity_multiplier: 4,
      unit: "ea",
      cost: 1,
      markup_percent: 30,
      active: true,
    }).expect(201);

    await agent.delete(`/api/pricing/categories/${encodeURIComponent(source.body.id)}`).expect(400);

    const merge = await agent.post(`/api/pricing/categories/${encodeURIComponent(source.body.id)}/merge`).send({
      target_category_id: target.body.id,
    }).expect(200);

    expect(merge.body.impact).toMatchObject({
      pricing_items: 1,
      quote_items: 1,
      pricing_quote_items: 1,
      global_auto_inclusions: 1,
      triggered_rule_inclusions: 1,
      triggered_rule_triggers: 1,
      import_mappings: 1,
    });

    const pricingItems = await agent.get("/api/entities/PricingItem").expect(200);
    expect(pricingItems.body.find((record: Record<string, unknown>) => record.name === "Legacy panel")?.category).toBe("doors_fronts_custom");

    const quoteItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(quoteItems.body.find((record: Record<string, unknown>) => record.description === "Legacy door")?.category).toBe("doors_fronts_custom");

    const importRows = await agent.get("/api/entities/PricingQuoteItem").expect(200);
    expect(importRows.body.find((record: Record<string, unknown>) => record.description === "Imported legacy door")?.category).toBe("doors_fronts_custom");

    const globalInclusions = await agent.get("/api/entities/GlobalAutoInclusion").expect(200);
    expect(globalInclusions.body[0].category).toBe("doors_fronts_custom");

    const triggeredRules = await agent.get("/api/entities/TriggeredAutoInclusionRule").expect(200);
    expect(triggeredRules.body[0].trigger_category).toBe("doors_fronts_custom");
    expect(triggeredRules.body[0].inclusion_category).toBe("doors_fronts_custom");

    const refreshedSource = await agent.get(`/api/entities/PricingCategory/${encodeURIComponent(source.body.id)}`).expect(200);
    expect(refreshedSource.body.is_active).toBe(false);
    expect(refreshedSource.body.merged_into_category_id).toBe(target.body.id);

    const categoryAudit = await agent.get("/api/admin/audit").query({ entity: "PricingCategory", limit: 50 }).expect(200);
    expect(categoryAudit.body.some((entry: Record<string, unknown>) =>
      entry.action === "delete" && String(entry.record_id || "") === String(unused.body.id || "")
    )).toBe(true);
    expect(categoryAudit.body.some((entry: Record<string, unknown>) =>
      entry.action === "update" && String(entry.record_id || "") === String(source.body.id || "")
    )).toBe(true);
  });

  test("supports supplier documents and returns a company detail bundle with history", async () => {
    const agent = await createAuthenticatedAgent();

    const company = await agent.post("/api/entities/Company").send({
      name: "Supplier Bundle Co",
      type: "supplier",
      contact_name: "Bundle Owner",
      email: "bundle@example.test",
    }).expect(201);

    await agent.put(`/api/entities/Company/${company.body.id}`).send({
      status: "archived",
      payment_terms: "14_days",
      row_version: company.body.row_version,
    }).expect(200);

    await agent.post("/api/entities/Note").send({
      related_id: company.body.id,
      related_type: "company",
      type: "note",
      content: "Supplier account opened",
    }).expect(201);

    await agent.post("/api/entities/PricingItem").send({
      name: "Bundle Supplier Board",
      category: "sheet_materials",
      unit: "sheet",
      buy_price: 120,
      supplier_id: company.body.id,
      supplier: "Supplier Bundle Co",
      product_number: "SUP-BUNDLE-01",
    }).expect(201);

    const upload = await agent.post("/api/filesystem").send({
      related_id: company.body.id,
      related_type: "company",
      name: "bundle-sheet.txt",
      mime_type: "text/plain",
      data_base64: Buffer.from("supplier bundle document").toString("base64"),
    }).expect(201);

    expect(upload.body.related_type).toBe("company");

    const detail = await agent.get(`/api/companies/${company.body.id}/detail`).expect(200);
    expect(detail.body.attachments).toHaveLength(1);
    expect(detail.body.pricingItems).toHaveLength(1);
    expect(detail.body.history.some((event) => event.type === "document")).toBe(true);
    expect(detail.body.history.some((event) => event.type === "pricing_item")).toBe(true);
    expect(detail.body.history.some((event) => event.type === "note")).toBe(true);
    expect(detail.body.history.some((event) => event.type === "status_change")).toBe(true);

    await agent.delete(`/api/filesystem/${upload.body.id}`).expect(204);

    const refreshed = await agent.get(`/api/companies/${company.body.id}/detail`).expect(200);
    expect(refreshed.body.attachments).toHaveLength(0);
  });

  test("applies quote margin adjustments, recalculates totals, and records audit entries", async () => {
    const agent = await createAuthenticatedAgent();

    const quote = await agent.post("/api/entities/Quote").send({
      quote_number: "QTE-MARGIN-0001",
      title: "Margin test quote",
      contact_name: "Margin Client",
    }).expect(201);

    const material = await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Cabinet panels",
      category: "materials",
      quantity: 1,
      unit_cost: 100,
      markup_percent: 30,
      sell_price: 130,
      total: 130,
      sort_order: 1,
    }).expect(201);

    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Install labour",
      category: "labour",
      quantity: 1,
      unit_cost: 80,
      markup_percent: 50,
      sell_price: 120,
      total: 120,
      sort_order: 2,
    }).expect(201);

    const lockedMaterial = await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Handles",
      category: "hardware",
      quantity: 1,
      unit_cost: 50,
      markup_percent: 40,
      sell_price: 70,
      total: 70,
      is_price_locked: true,
      sort_order: 3,
    }).expect(201);

    const materialAdjustment = await agent.post(`/api/quotes/${quote.body.id}/margin-adjustments`).send({
      action_type: "material_margin_adjustment",
      target_margin_percent: 40,
      include_locked: false,
    }).expect(200);

    expect(materialAdjustment.body.summary).toMatchObject({
      previous_margin_percent: 25,
      target_margin_percent: 40,
      affected_count: 1,
      locked_count: 1,
      current_sell_total: 130,
      new_sell_total: 166.67,
      delta: 36.67,
    });

    const refreshedItems = await agent.get("/api/entities/QuoteItem").expect(200);
    expect(refreshedItems.body.find((item: Record<string, unknown>) => item.id === material.body.id)).toMatchObject({
      total: 166.67,
      markup_percent: 66.67,
      is_manual_override: true,
    });
    expect(refreshedItems.body.find((item: Record<string, unknown>) => item.id === lockedMaterial.body.id)).toMatchObject({
      total: 70,
      is_price_locked: true,
    });

    const quoteAfterMaterialAdjustment = await agent.get(`/api/entities/Quote/${quote.body.id}`).expect(200);
    expect(quoteAfterMaterialAdjustment.body).toMatchObject({
      subtotal: 356.67,
      gst: 53.5,
      total: 410.17,
    });

    const grossAdjustment = await agent.post(`/api/quotes/${quote.body.id}/margin-adjustments`).send({
      action_type: "gross_margin_adjustment",
      target_margin_percent: 40,
      include_locked: true,
    }).expect(200);

    expect(grossAdjustment.body.summary).toMatchObject({
      target_margin_percent: 40,
      affected_count: 2,
      locked_count: 1,
    });

    const quoteAfterGrossAdjustment = await agent.get(`/api/entities/Quote/${quote.body.id}`).expect(200);
    expect(quoteAfterGrossAdjustment.body).toMatchObject({
      subtotal: 370,
      gst: 55.5,
      total: 425.5,
    });

    const lineItemAudit = await agent.get("/api/entities/QuoteLineItemUpdateAudit").expect(200);
    expect(lineItemAudit.body.some((entry: Record<string, unknown>) =>
      entry.line_item_id === material.body.id && entry.field === "markup_percent"
    )).toBe(true);

    const marginAudit = await agent.get("/api/entities/QuoteMarginAdjustmentAudit").expect(200);
    expect(marginAudit.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quote_id: quote.body.id,
        action_type: "material_margin_adjustment",
        target_margin_percent: 40,
      }),
      expect.objectContaining({
        quote_id: quote.body.id,
        action_type: "gross_margin_adjustment",
        target_margin_percent: 40,
      }),
    ]));
  });

  test("returns server-backed dashboard, operations, and reporting bundles", async () => {
    const agent = await createAuthenticatedAgent();

    const dashboard = await agent.get("/api/dashboard/overview").expect(200);
    expect(Array.isArray(dashboard.body.jobs)).toBe(true);
    expect(Array.isArray(dashboard.body.jobOperations)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(dashboard.body, "stockDashboard")).toBe(false);

    const operations = await agent.get("/api/operations/hub").expect(200);
    expect(Array.isArray(operations.body.jobs)).toBe(true);
    expect(Array.isArray(operations.body.timeEntries)).toBe(true);
    expect(Array.isArray(operations.body.notes)).toBe(true);

    const reporting = await agent.get("/api/reporting/datasets").expect(200);
    expect(Array.isArray(reporting.body.jobs)).toBe(true);
    expect(Array.isArray(reporting.body.timeEntries)).toBe(true);
    expect(Array.isArray(reporting.body.staff)).toBe(true);
  });

  test("blocks dangerous upload extensions even when the MIME type claims text", async () => {
    const agent = await createAuthenticatedAgent();
    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Upload Guard",
      job_number: "JOB-UPLOAD-0001",
      contact_name: "Upload Guard",
    }).expect(201);

    await agent.post("/api/filesystem").send({
      related_id: createdJob.body.id,
      related_type: "job",
      name: "payload.svg",
      mime_type: "text/plain",
      data_base64: Buffer.from("<svg><script>alert(1)</script></svg>").toString("base64"),
    }).expect(415);
  });

  test("returns a clear 409 conflict for stale row_version updates", async () => {
    const agent = await createAuthenticatedAgent();
    const created = await agent.post("/api/entities/Contact").send({
      first_name: "Conflict",
      last_name: "Case",
      email: "conflict@example.test",
    }).expect(201);

    const current = created.body;

    const updated = await agent.put(`/api/entities/Contact/${current.id}`).send({
      first_name: "Changed",
      row_version: current.row_version,
    }).expect(200);

    const conflict = await agent.put(`/api/entities/Contact/${current.id}`).send({
      first_name: "Stale",
      row_version: current.row_version,
    }).expect(409);

    expect(updated.body.row_version).toBe(current.row_version + 1);
    expect(conflict.body.code).toBe("row_version_conflict");
    expect(conflict.body.current_record.first_name).toBe("Changed");
  });

  test("rejects malformed row_version metadata before applying entity updates", async () => {
    const agent = await createAuthenticatedAgent();
    const created = await agent.post("/api/entities/Contact").send({
      first_name: "Malformed",
      last_name: "Version",
      email: "malformed-version@example.test",
    }).expect(201);

    const response = await agent.put(`/api/entities/Contact/${created.body.id}`).send({
      first_name: "Should Not Apply",
      row_version: String(created.body.row_version),
    }).expect(400);

    expect(response.body.code).toBe("invalid_entity_payload");
    expect(response.body.error).toContain("row_version must be a positive integer");

    const unchanged = await agent.get(`/api/entities/Contact/${created.body.id}`).expect(200);
    expect(unchanged.body.first_name).toBe("Malformed");
    expect(unchanged.body.row_version).toBe(created.body.row_version);
  });

  test("returns a clear 409 conflict for stale row_version deletes", async () => {
    const agent = await createAuthenticatedAgent();
    const created = await agent.post("/api/entities/Contact").send({
      first_name: "Delete",
      last_name: "Conflict",
      email: "delete-conflict@example.test",
    }).expect(201);

    await agent.put(`/api/entities/Contact/${created.body.id}`).send({
      first_name: "Delete Updated",
      row_version: created.body.row_version,
    }).expect(200);

    const conflict = await agent
      .delete(`/api/entities/Contact/${created.body.id}`)
      .query({ row_version: created.body.row_version })
      .expect(409);

    expect(conflict.body.code).toBe("row_version_conflict");
    expect(conflict.body.current_record.first_name).toBe("Delete Updated");

    const stillExists = await agent.get(`/api/entities/Contact/${created.body.id}`).expect(200);
    expect(stillExists.body.first_name).toBe("Delete Updated");
  });

  test("rejects malformed row_version metadata before applying entity deletes", async () => {
    const agent = await createAuthenticatedAgent();
    const created = await agent.post("/api/entities/Contact").send({
      first_name: "Delete",
      last_name: "Malformed",
      email: "delete-malformed@example.test",
    }).expect(201);

    const response = await agent
      .delete(`/api/entities/Contact/${created.body.id}`)
      .query({ row_version: `${created.body.row_version}abc` })
      .expect(400);

    expect(response.body.code).toBe("invalid_row_version");
    expect(response.body.error).toContain("row_version must be a positive integer");

    const stillExists = await agent.get(`/api/entities/Contact/${created.body.id}`).expect(200);
    expect(stillExists.body.first_name).toBe("Delete");
  });

  test("does not partially reassign leads when a lead category delete is stale", async () => {
    const agent = await createAuthenticatedAgent();
    const createdCategory = await agent.post("/api/entities/LeadCategory").send({
      name: "Conflict Delete Category",
      key: "conflict_delete_category",
      color: "blue",
    }).expect(201);

    const createdLead = await agent.post("/api/entities/Lead").send({
      title: "Lead category delete conflict",
      category_id: createdCategory.body.id,
    }).expect(201);

    await agent.put(`/api/entities/LeadCategory/${createdCategory.body.id}`).send({
      name: "Conflict Delete Category Updated",
      row_version: createdCategory.body.row_version,
    }).expect(200);

    const conflict = await agent
      .delete(`/api/entities/LeadCategory/${createdCategory.body.id}`)
      .query({ row_version: createdCategory.body.row_version })
      .expect(409);

    expect(conflict.body.code).toBe("row_version_conflict");
    expect(conflict.body.current_record.name).toBe("Conflict Delete Category Updated");

    const leadAfterConflict = await agent.get(`/api/entities/Lead/${createdLead.body.id}`).expect(200);
    expect(leadAfterConflict.body.category_id).toBe(createdCategory.body.id);
  });

  test("rejects invalid create payloads for core business entities", async () => {
    const agent = await createAuthenticatedAgent();

    const invalidStaff = await agent.post("/api/entities/Staff").send({
      name: "Jamie Worker",
      employee_id: "",
    }).expect(400);
    expect(invalidStaff.body.code).toBe("invalid_entity_payload");
    expect(invalidStaff.body.error).toContain("Employee ID is required");

    const invalidJob = await agent.post("/api/entities/Job").send({
      title: "   ",
      job_number: "JOB-VALID-0001",
    }).expect(400);
    expect(invalidJob.body.code).toBe("invalid_entity_payload");
    expect(invalidJob.body.error).toContain("Job title is required");

    const invalidTimeEntry = await agent.post("/api/entities/TimeEntry").send({
      staff_id: "staff-1",
      staff_name: "Jamie Worker",
      date: "2026-04-06",
      break_minutes: "abc",
    }).expect(400);
    expect(invalidTimeEntry.body.code).toBe("invalid_entity_payload");
    expect(invalidTimeEntry.body.error).toContain("Break minutes must be a valid number");
  });

  test("rejects invalid update payloads for validated entities", async () => {
    const agent = await createAuthenticatedAgent();
    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Validation Time Job",
      job_number: "JOB-VALID-TIME-0001",
      contact_name: "Validation Contact",
    }).expect(201);

    const createdQuote = await agent.post("/api/entities/Quote").send({
      title: "Validation Quote",
      quote_number: "Q-VALID-0001",
      contact_name: "Validation Contact",
      status: "draft",
    }).expect(201);

    const invalidQuoteUpdate = await agent.put(`/api/entities/Quote/${createdQuote.body.id}`).send({
      title: "   ",
      row_version: createdQuote.body.row_version,
    }).expect(400);
    expect(invalidQuoteUpdate.body.code).toBe("invalid_entity_payload");
    expect(invalidQuoteUpdate.body.error).toContain("Quote title is required");

    const createdTimeEntry = await agent.post("/api/entities/TimeEntry").send({
      staff_id: "staff-1",
      staff_name: "Jamie Worker",
      job_id: createdJob.body.id,
      date: "2026-04-06",
      activity: "Labour",
      status: "completed",
      clock_in: "2026-04-06T08:00:00.000Z",
      clock_out: "2026-04-06T10:00:00.000Z",
    }).expect(201);

    const invalidTimeEntryUpdate = await agent.put(`/api/entities/TimeEntry/${createdTimeEntry.body.id}`).send({
      break_minutes: -5,
      row_version: createdTimeEntry.body.row_version,
    }).expect(400);
    expect(invalidTimeEntryUpdate.body.code).toBe("invalid_entity_payload");
    expect(invalidTimeEntryUpdate.body.error).toContain("Break minutes must be at least 0");
  });

  test("validates invoice job references on create and update", async () => {
    const agent = await createAuthenticatedAgent();
    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Invoice Reference Job",
      job_number: "JOB-INVOICE-0001",
      contact_name: "Invoice Contact",
    }).expect(201);

    const validInvoice = await agent.post("/api/entities/Invoice").send({
      invoice_number: "INV-VALID-0001",
      job_id: createdJob.body.id,
      job_number: createdJob.body.job_number,
      status: "draft",
      total: 1250,
    }).expect(201);

    expect(validInvoice.body.job_id).toBe(createdJob.body.id);
    expect(validInvoice.body.row_version).toBe(1);

    const missingJobInvoice = await agent.post("/api/entities/Invoice").send({
      invoice_number: "INV-MISSING-0001",
      job_id: "missing-job",
      status: "draft",
      total: 500,
    }).expect(400);
    expect(missingJobInvoice.body.code).toBe("invoice_job_not_found");

    const updateWithoutJobId = await agent.put(`/api/entities/Invoice/${validInvoice.body.id}`).send({
      status: "sent",
      row_version: validInvoice.body.row_version,
    }).expect(200);
    expect(updateWithoutJobId.body.job_id).toBe(createdJob.body.id);
    expect(updateWithoutJobId.body.status).toBe("sent");

    const invalidJobUpdate = await agent.put(`/api/entities/Invoice/${validInvoice.body.id}`).send({
      job_id: "missing-job",
      row_version: updateWithoutJobId.body.row_version,
    }).expect(400);
    expect(invalidJobUpdate.body.code).toBe("invoice_job_not_found");

    const unchangedInvoice = await agent.get(`/api/entities/Invoice/${validInvoice.body.id}`).expect(200);
    expect(unchangedInvoice.body.job_id).toBe(createdJob.body.id);
    expect(unchangedInvoice.body.row_version).toBe(updateWithoutJobId.body.row_version);
  });

  test("scopes saved report views to the owning user", async () => {
    const adminAgent = await createAuthenticatedAgent("admin@example.test", "admin");
    await adminAgent.put("/api/modules").send({
      modules: {
        reports: true,
      },
    }).expect(200);

    const memberAgent = await createAuthenticatedAgent("member@example.test", "member");
    const otherMemberAgent = await createAuthenticatedAgent("other-member@example.test", "member");

    const createdView = await memberAgent.post("/api/entities/ReportView").send({
      name: "Weekly install readiness",
      pack_key: "operations",
      report_key: "upcoming_installations",
      filters: {
        datePreset: "this_week",
      },
      grouping: "status",
      sort: {
        column: "install_date",
        direction: "asc",
      },
      visible_columns: ["label", "customer", "install_date"],
    }).expect(201);

    expect(createdView.body.user_id).toBeTruthy();
    expect(createdView.body.user_name).toBeTruthy();

    const ownList = await memberAgent.get("/api/entities/ReportView").expect(200);
    expect(Array.isArray(ownList.body)).toBe(true);
    expect(ownList.body.some((view) => view.id === createdView.body.id)).toBe(true);

    const otherList = await otherMemberAgent.get("/api/entities/ReportView").expect(200);
    expect(Array.isArray(otherList.body)).toBe(true);
    expect(otherList.body.some((view) => view.id === createdView.body.id)).toBe(false);

    await otherMemberAgent.get(`/api/entities/ReportView/${createdView.body.id}`).expect(403);
  });

  test("rejects invalid saved report view payloads", async () => {
    const adminAgent = await createAuthenticatedAgent("admin@example.test", "admin");
    await adminAgent.put("/api/modules").send({
      modules: {
        reports: true,
      },
    }).expect(200);

    const invalidView = await adminAgent.post("/api/entities/ReportView").send({
      name: "   ",
      report_key: "revenue_summary",
    }).expect(400);

    expect(invalidView.body.code).toBe("invalid_entity_payload");
    expect(invalidView.body.error).toContain("Report view name is required");
  });

  test("blocks overlapping completed time entries for the same staff member", async () => {
    const agent = await createAuthenticatedAgent();
    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Overlap Validation Job",
      job_number: "JOB-VALID-TIME-0002",
      contact_name: "Overlap Contact",
    }).expect(201);

    await agent.post("/api/entities/TimeEntry").send({
      staff_id: "staff-1",
      staff_name: "Jamie Worker",
      job_id: createdJob.body.id,
      date: "2026-04-06",
      activity: "Labour",
      status: "completed",
      clock_in: "2026-04-06T08:00:00.000Z",
      clock_out: "2026-04-06T10:00:00.000Z",
    }).expect(201);

    const overlap = await agent.post("/api/entities/TimeEntry").send({
      staff_id: "staff-1",
      staff_name: "Jamie Worker",
      job_id: createdJob.body.id,
      date: "2026-04-06",
      activity: "Assembly",
      status: "completed",
      clock_in: "2026-04-06T09:30:00.000Z",
      clock_out: "2026-04-06T11:00:00.000Z",
    }).expect(409);

    expect(overlap.body.code).toBe("time_entry_overlap");
  });

  test("syncs linked job operation actual hours from time entries", async () => {
    const agent = await createAuthenticatedAgent();

    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Sync Job",
      job_number: "JOB-SYNC-0001",
      contact_name: "Sync Customer",
    }).expect(201);

    const createdOperation = await agent.post("/api/entities/JobOperation").send({
      job_id: createdJob.body.id,
      name: "Assembly",
      operation: "assembly",
      workflow_phase: "manufacturing",
      status: "pending",
      estimated_hours: 8,
    }).expect(201);

    await agent.post("/api/entities/TimeEntry").send({
      staff_id: "staff-1",
      staff_name: "Jamie Worker",
      job_id: createdJob.body.id,
      job_operation_id: createdOperation.body.id,
      date: "2026-04-06",
      activity: "Assembly",
      status: "completed",
      clock_in: "2026-04-06T08:00:00.000Z",
      clock_out: "2026-04-06T12:30:00.000Z",
      break_minutes: 30,
    }).expect(201);

    const refreshedOperation = await agent.get(`/api/entities/JobOperation/${createdOperation.body.id}`).expect(200);

    expect(refreshedOperation.body.actual_hours).toBe(4);
    expect(refreshedOperation.body.status).toBe("in_progress");
    expect(refreshedOperation.body.actual_start_date).toBe("2026-04-06");
  });

  test("preserves the lead to quote to job to time entry workflow relationships", async () => {
    const agent = await createAuthenticatedAgent();

    const company = await agent.post("/api/entities/Company").send({
      name: "Workflow Kitchens Ltd",
      type: "client",
    }).expect(201);

    const contact = await agent.post("/api/entities/Contact").send({
      first_name: "Taylor",
      last_name: "Workflow",
      email: "taylor.workflow@example.test",
      company_id: company.body.id,
      company_name: company.body.name,
      type: "client",
    }).expect(201);

    const lead = await agent.post("/api/entities/Lead").send({
      title: "Lead to invoice-ready job",
      stage: "new_enquiry",
      contact_id: contact.body.id,
      contact_name: "Taylor Workflow",
      company_id: company.body.id,
      company_name: company.body.name,
      value: 12500,
    }).expect(201);

    const quote = await agent.post("/api/entities/Quote").send({
      title: "Workflow kitchen quote",
      quote_number: "Q-WORKFLOW-001",
      lead_id: lead.body.id,
      contact_id: contact.body.id,
      contact_name: "Taylor Workflow",
      company_id: company.body.id,
      company_name: company.body.name,
      status: "draft",
      subtotal: 10000,
      gst: 1500,
      total: 11500,
      quote_scope_signed_off: true,
      quote_drawings_signed_off: true,
      quote_internal_notes: "Check site access before production.",
    }).expect(201);

    await agent.post("/api/entities/QuoteItem").send({
      quote_id: quote.body.id,
      description: "Custom cabinetry package",
      category: "materials",
      quantity: 1,
      unit: "ea",
      unit_cost: 10000,
      markup_percent: 15,
      total: 11500,
      sort_order: 1,
    }).expect(201);

    const createdJob = await agent.post(`/api/quotes/${quote.body.id}/convert-to-job`).send({
      job_number: "JOB-WORKFLOW-E2E-0001",
    }).expect(201);

    expect(createdJob.body).toMatchObject({
      job_number: "JOB-WORKFLOW-E2E-0001",
      quote_id: quote.body.id,
      quote_number: "Q-WORKFLOW-001",
      lead_id: lead.body.id,
      contact_id: contact.body.id,
      company_id: company.body.id,
      quoted_value: 11500,
      status: "planning",
      handoff_status: "not_ready",
      handoff_drawings_ready: true,
      handoff_materials_confirmed: true,
      internal_operational_notes: "Check site access before production.",
    });
    expect(createdJob.body.quote_items_snapshot).toHaveLength(1);

    const refreshedQuote = await agent.get(`/api/entities/Quote/${quote.body.id}`).expect(200);
    expect(refreshedQuote.body.status).toBe("won");

    const refreshedLead = await agent.get(`/api/entities/Lead/${lead.body.id}`).expect(200);
    expect(refreshedLead.body.stage).toBe("won");

    const operations = await agent.get("/api/entities/JobOperation")
      .query({ filters: JSON.stringify({ job_id: createdJob.body.id }), sort: "sort_order" })
      .expect(200);
    const siteMeasureTask = operations.body.find((task) => task.workflow_template_key === "site_measure");
    expect(siteMeasureTask).toMatchObject({
      job_id: createdJob.body.id,
      is_workflow_task: true,
      status: "ready",
    });

    const timeEntry = await agent.post("/api/entities/TimeEntry").send({
      staff_id: "staff-workflow-1",
      staff_name: "Jamie Workflow",
      job_id: createdJob.body.id,
      job_operation_id: siteMeasureTask.id,
      date: "2026-04-07",
      activity: "Site measure",
      status: "completed",
      hours: 2.5,
    }).expect(201);

    expect(timeEntry.body).toMatchObject({
      job_id: createdJob.body.id,
      job_operation_id: siteMeasureTask.id,
      job_number: "JOB-WORKFLOW-E2E-0001",
      job_name: "Workflow kitchen quote",
      customer: "Taylor Workflow",
      hours: 2.5,
      status: "completed",
    });

    const refreshedTask = await agent.get(`/api/entities/JobOperation/${siteMeasureTask.id}`).expect(200);
    expect(refreshedTask.body.actual_hours).toBe(2.5);
    expect(refreshedTask.body.actual_start_date).toBe("2026-04-07");
    expect(refreshedTask.body.status).toBe("in_progress");
  });

  test("registers invoice entity contract and rejects invalid invoice states", async () => {
    const agent = await createAuthenticatedAgent();

    const job = await agent.post("/api/entities/Job").send({
      title: "Invoice-ready kitchen",
      job_number: "JOB-INVOICE-0001",
      job_name: "Invoice-ready kitchen",
      contact_name: "Alex Invoice",
      company_name: "Invoice Kitchens Ltd",
      status: "planning",
    }).expect(201);

    const invoice = await agent.post("/api/entities/Invoice").send({
      invoice_number: "INV-0001",
      job_id: job.body.id,
      job_number: job.body.job_number,
      job_title: job.body.title,
      contact_name: job.body.contact_name,
      company_name: job.body.company_name,
      type: "final",
      status: "draft",
      subtotal: 10000,
      gst: 1500,
      total: 11500,
      issue_date: "2026-04-10",
      due_date: "2026-04-24",
    }).expect(201);

    expect(invoice.body).toMatchObject({
      invoice_number: "INV-0001",
      job_id: job.body.id,
      job_number: "JOB-INVOICE-0001",
      type: "final",
      status: "draft",
      subtotal: 10000,
      gst: 1500,
      total: 11500,
      amount_paid: 0,
    });

    const invoices = await agent.get("/api/entities/Invoice")
      .query({ filters: JSON.stringify({ job_id: job.body.id }) })
      .expect(200);
    expect(invoices.body).toHaveLength(1);
    expect(invoices.body[0].id).toBe(invoice.body.id);

    const missingJob = await agent.post("/api/entities/Invoice").send({
      invoice_number: "INV-MISSING-JOB",
      job_id: "missing-job",
    }).expect(400);
    expect(missingJob.body).toMatchObject({
      code: "invoice_job_not_found",
    });

    const invalidAmount = await agent.post("/api/entities/Invoice").send({
      invoice_number: "INV-NEGATIVE",
      job_id: job.body.id,
      total: -1,
    }).expect(400);
    expect(invalidAmount.body).toMatchObject({
      code: "invalid_entity_payload",
    });
  });

  test("sanitises dangerous keys and does not allow prototype pollution", async () => {
    const agent = await createAuthenticatedAgent();

    const response = await agent.post("/api/entities/Contact").send({
      first_name: "Safe",
      last_name: "User",
      nested: {
        safe: true,
        __proto__: {
          polluted: "yes",
        },
      },
      __proto__: {
        polluted: "yes",
      },
    }).expect(201);

    expect(response.body.nested.safe).toBe(true);
    expect(response.body.nested.polluted).toBeUndefined();
    expect({}.polluted).toBeUndefined();
  });

  test("auto-generates workflow tasks and role lanes when a job is created", async () => {
    const agent = await createAuthenticatedAgent();

    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Workflow Test Job",
      job_number: "JOB-WORKFLOW-0001",
      contact_name: "Workflow Customer",
    }).expect(201);

    const operations = await agent.get("/api/entities/JobOperation")
      .query({ filters: JSON.stringify({ job_id: createdJob.body.id }) })
      .expect(200);

    expect(operations.body.length).toBeGreaterThanOrEqual(9);
    const measureTask = operations.body.find((task) => task.workflow_template_key === "site_measure");
    expect(measureTask).toMatchObject({
      job_id: createdJob.body.id,
      is_workflow_task: true,
      is_system_generated: true,
      is_unassigned_placeholder: true,
      workflow_phase: "measure",
      workflow_role: "management",
      status: "ready",
    });

    const installationTask = operations.body.find((task) => task.operation === "install");
    expect(installationTask).toBeTruthy();
    expect(installationTask.status).toBe("pending");
    expect(Array.isArray(installationTask.dependency_task_ids)).toBe(true);

    const lanes = await agent.get("/api/entities/ScheduleLane").expect(200);
    expect(lanes.body.some((lane) => lane.workflow_role === "management")).toBe(true);
    expect(lanes.body.some((lane) => lane.workflow_role === "joiner")).toBe(true);
    expect(lanes.body.some((lane) => lane.workflow_role === "install")).toBe(true);
  });

  test("auto-generates quote workflow tasks and advances them with quote status", async () => {
    const agent = await createAuthenticatedAgent();

    const createdQuote = await agent.post("/api/entities/Quote").send({
      title: "Workflow Quote",
      quote_number: "Q-TEST-001",
      contact_name: "Workflow Customer",
      status: "draft",
    }).expect(201);

    let operations = await agent.get("/api/entities/JobOperation")
      .query({ filters: JSON.stringify({ quote_id: createdQuote.body.id }), sort: "sort_order" })
      .expect(200);

    expect(operations.body.length).toBeGreaterThanOrEqual(8);
    const briefTask = operations.body.find((task) => task.workflow_template_key === "quote_brief_review");
    expect(briefTask).toMatchObject({
      quote_id: createdQuote.body.id,
      record_scope: "quote",
      is_workflow_task: true,
      is_system_generated: true,
      workflow_phase: "enquiry",
    });

    await agent.put(`/api/entities/Quote/${createdQuote.body.id}`).send({
      status: "awaiting_confirmation",
      row_version: createdQuote.body.row_version,
    }).expect(200);

    operations = await agent.get("/api/entities/JobOperation")
      .query({ filters: JSON.stringify({ quote_id: createdQuote.body.id }), sort: "sort_order" })
      .expect(200);

    const sendTask = operations.body.find((task) => task.workflow_template_key === "quote_send");
    const followUpTask = operations.body.find((task) => task.workflow_template_key === "quote_follow_up");
    expect(sendTask?.status).toBe("complete");
    expect(followUpTask?.start_date).toBeTruthy();
  });

  test("moves later workflow tasks to ready only when dependencies are complete", async () => {
    const agent = await createAuthenticatedAgent();

    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Dependency Test Job",
      job_number: "JOB-WORKFLOW-0002",
      contact_name: "Workflow Customer",
    }).expect(201);

    const fetchTasks = async () => {
      const response = await agent.get("/api/entities/JobOperation")
        .query({ filters: JSON.stringify({ job_id: createdJob.body.id }), sort: "sort_order" })
        .expect(200);
      return response.body;
    };

    let tasks = await fetchTasks();
    const measureTask = tasks.find((task) => task.workflow_template_key === "site_measure");
    const handoffTask = tasks.find((task) => task.workflow_template_key === "pre_production_review");

    expect(measureTask.status).toBe("ready");
    expect(handoffTask.status).toBe("pending");

    await agent.put(`/api/entities/JobOperation/${measureTask.id}`).send({
      status: "complete",
      row_version: measureTask.row_version,
    }).expect(200);

    tasks = await fetchTasks();
    const refreshedHandoffTask = tasks.find((task) => task.workflow_template_key === "pre_production_review");
    expect(refreshedHandoffTask.status).toBe("ready");

    const summary = await agent.get(`/api/workflow/summary/${createdJob.body.id}`).expect(200);
    expect(summary.body.templates.length).toBeGreaterThanOrEqual(9);
    expect(summary.body.roles.map((role) => role.role)).toEqual(expect.arrayContaining(["management", "joiner", "install"]));
    expect(summary.body.tasks.some((task) => task.status === "ready")).toBe(true);
  });

  test("lists install planner entries without exposing non-install workflow tasks", async () => {
    const agent = await createAuthenticatedAgent();

    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Install Planner Listing Job",
      job_number: "JOB-INSTALL-0000",
      contact_name: "Planner Customer",
    }).expect(201);

    await agent.post("/api/entities/JobOperation").send({
      job_id: createdJob.body.id,
      job_number: createdJob.body.job_number,
      job_title: createdJob.body.title,
      task_name: "Delivery shadow task",
      operation: "delivery",
      workflow_phase: "installation",
      status: "scheduled",
      start_date: "2026-05-10",
      end_date: "2026-05-10",
    }).expect(201);

    const response = await agent.get("/api/install-planner/entries").expect(200);

    expect(Array.isArray(response.body.jobs)).toBe(true);
    expect(Array.isArray(response.body.operations)).toBe(true);
    expect(response.body.jobs.some((job) => job.id === createdJob.body.id)).toBe(true);
    expect(response.body.operations.some((task) => task.job_id === createdJob.body.id && task.operation === "install")).toBe(true);
    expect(response.body.operations.some((task) => task.job_id === createdJob.body.id && task.operation === "delivery")).toBe(false);
  });

  test("saves install planner calendar edits and syncs related workflow dates", async () => {
    const agent = await createAuthenticatedAgent();

    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Install Planner Sync Job",
      job_number: "JOB-INSTALL-0001",
      contact_name: "Planner Customer",
    }).expect(201);

    const operations = await agent.get("/api/entities/JobOperation")
      .query({ filters: JSON.stringify({ job_id: createdJob.body.id }), sort: "sort_order" })
      .expect(200);

    const installationTask = operations.body.find((task) => task.operation === "install");
    const preinstallTask = operations.body.find((task) => task.workflow_template_key === "preinstall_check");

    expect(installationTask).toBeTruthy();
    expect(preinstallTask).toBeTruthy();

    const response = await agent.post("/api/install-planner/entries").send({
      job_id: createdJob.body.id,
      operation_id: installationTask.id,
      install_label: "Main site install",
      status: "scheduled",
      start_date: "2030-05-13",
      end_date: "2030-05-16",
      notes: "Site lift booked",
    }).expect(200);

    expect(response.body.job.install_date).toBe("2030-05-13");
    expect(response.body.job.install_end_date).toBe("2030-05-16");
    expect(response.body.operations.some((task) => task.id === installationTask.id && task.start_date === "2030-05-13" && task.end_date === "2030-05-16")).toBe(true);

    const refreshedJob = await agent.get(`/api/entities/Job/${createdJob.body.id}`).expect(200);
    expect(refreshedJob.body.install_date).toBe("2030-05-13");
    expect(refreshedJob.body.install_end_date).toBe("2030-05-16");

    const refreshedInstallTask = await agent.get(`/api/entities/JobOperation/${installationTask.id}`).expect(200);
    expect(refreshedInstallTask.body.task_name).toBe("Main site install");
    expect(refreshedInstallTask.body.start_date).toBe("2030-05-13");
    expect(refreshedInstallTask.body.end_date).toBe("2030-05-16");
    expect(refreshedInstallTask.body.schedule_manual_override).toBe(true);

    const refreshedPreinstallTask = await agent.get(`/api/entities/JobOperation/${preinstallTask.id}`).expect(200);
    expect(refreshedPreinstallTask.body.start_date).toBeTruthy();
    expect(refreshedPreinstallTask.body.start_date <= "2030-05-13").toBe(true);
  });

  test("clears workflow-backed install plans without recreating scheduled dates", async () => {
    const agent = await createAuthenticatedAgent();

    const createdJob = await agent.post("/api/entities/Job").send({
      title: "Install Planner Clear Job",
      job_number: "JOB-INSTALL-0002",
      contact_name: "Planner Customer",
    }).expect(201);

    const operations = await agent.get("/api/entities/JobOperation")
      .query({ filters: JSON.stringify({ job_id: createdJob.body.id }), sort: "sort_order" })
      .expect(200);

    const installationTask = operations.body.find((task) => task.operation === "install");
    expect(installationTask).toBeTruthy();

    await agent.post("/api/install-planner/entries").send({
      job_id: createdJob.body.id,
      operation_id: installationTask.id,
      install_label: "Main site install",
      status: "scheduled",
      start_date: "2026-05-20",
      end_date: "2026-05-21",
    }).expect(200);

    const response = await agent.delete("/api/install-planner/entries").send({
      job_id: createdJob.body.id,
      operation_id: installationTask.id,
    }).expect(200);

    expect(response.body.job.install_date).toBe("");
    expect(response.body.job.install_end_date).toBe("");
    expect(response.body.operations.some((task) => task.id === installationTask.id && task.start_date)).toBe(false);

    const refreshedJob = await agent.get(`/api/entities/Job/${createdJob.body.id}`).expect(200);
    expect(refreshedJob.body.install_date).toBe("");
    expect(refreshedJob.body.install_end_date).toBe("");

    const refreshedInstallTask = await agent.get(`/api/entities/JobOperation/${installationTask.id}`).expect(200);
    expect(refreshedInstallTask.body.start_date).toBe("");
    expect(refreshedInstallTask.body.end_date).toBe("");
    expect(refreshedInstallTask.body.schedule_manual_override).toBe(true);
  });

  test("creates and restores admin backup snapshots", async () => {
    const agent = await createAuthenticatedAgent();

    const backup = await agent.post("/api/admin/backups").send({
      label: "Before contact import",
      note: "Snapshot before creating a temporary contact",
    }).expect(201);

    expect(backup.body.database.integrity_check).toBe("ok");

    const createdContact = await agent.post("/api/entities/Contact").send({
      first_name: "Restore",
      last_name: "Candidate",
      email: "restore-candidate@example.test",
    }).expect(201);

    await agent.post(`/api/admin/backups/${backup.body.id}/restore`).expect(200);
    await agent.get(`/api/entities/Contact/${createdContact.body.id}`).expect(404);
  });

  test("imports backup folders, exports diagnostics, and applies retention controls", async () => {
    const agent = await createAuthenticatedAgent();

    const createdBackup = await agent.post("/api/admin/backups").send({
      label: "Portable snapshot",
    }).expect(201);

    const importSourcePath = path.join(testRoot, "portable-snapshot");
    fs.rmSync(importSourcePath, { recursive: true, force: true });
    fs.cpSync(createdBackup.body.path, importSourcePath, { recursive: true });

    const importedBackup = await agent.post("/api/admin/backups/import").send({
      source_path: importSourcePath,
    }).expect(201);

    expect(importedBackup.body.source).toBe("imported");
    expect(importedBackup.body.import_source_path).toBe(importSourcePath);

    const diagnostics = await agent.get("/api/admin/diagnostics/download").expect(200);
    expect(String(diagnostics.headers["content-disposition"] || "")).toContain("attachment;");
    expect(diagnostics.text).toContain("\"generated_at\"");
    expect(diagnostics.text).toContain("\"backups\"");

    const auditExport = await agent.get("/api/admin/audit/export").query({ format: "csv" }).expect(200);
    expect(String(auditExport.headers["content-type"] || "")).toContain("text/csv");
    expect(auditExport.text).toContain("\"created_date\"");

    const retention = await agent.post("/api/admin/backups/retention").send({
      keep_latest: 1,
    }).expect(200);
    expect(retention.body.remaining).toHaveLength(1);
    expect(retention.body.removed.length).toBeGreaterThanOrEqual(1);

    const logRetention = await agent.post("/api/admin/logs/retention").send({
      app_keep_entries: 1,
      security_keep_entries: 1,
    }).expect(200);
    expect(logRetention.body.app.retained_entries).toBeLessThanOrEqual(1);
    expect(logRetention.body.security.retained_entries).toBeLessThanOrEqual(1);
  });
});
