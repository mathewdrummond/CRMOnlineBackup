import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuoteDetail from "./QuoteDetail";

const mockNavigate = vi.fn();

const mockQuoteGet = vi.fn();
const mockQuoteItemFilter = vi.fn();
const mockJobOperationFilter = vi.fn();
const mockAttachmentFilter = vi.fn();
const mockContactList = vi.fn();
const mockJobList = vi.fn();
const mockStaffList = vi.fn();
const mockQuoteImportFilter = vi.fn();
const mockSiteMeasureFilter = vi.fn();
const mockPricingQuoteItemFilter = vi.fn();
const mockPricingCategoryList = vi.fn();
const mockPricingSectionList = vi.fn();
const mockJobOperationUpdate = vi.fn();
const mockQuoteUpdate = vi.fn();
const mockFilesystemListVersions = vi.fn();
const mockAdjustQuoteMargins = vi.fn();
const mockQuoteItemUpdate = vi.fn();
const mockSaveItemDefaults = vi.fn();
const mockQuoteDocumentDraft = vi.fn();
const mockQuotePreviewDocument = vi.fn();
const mockDocumentTemplateList = vi.fn();
const mockTimeEntryList = vi.fn();
const mockTimeEntryUpdate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Quote: {
        get: (...args) => mockQuoteGet(...args),
        update: (...args) => mockQuoteUpdate(...args),
      },
      QuoteItem: {
        filter: (...args) => mockQuoteItemFilter(...args),
        create: vi.fn(),
        update: (...args) => mockQuoteItemUpdate(...args),
        delete: vi.fn(),
      },
      JobOperation: {
        filter: (...args) => mockJobOperationFilter(...args),
        update: (...args) => mockJobOperationUpdate(...args),
      },
      Attachment: {
        filter: (...args) => mockAttachmentFilter(...args),
        update: vi.fn(),
      },
      Contact: {
        list: (...args) => mockContactList(...args),
      },
      Job: {
        list: (...args) => mockJobList(...args),
      },
      Staff: {
        list: (...args) => mockStaffList(...args),
      },
      QuoteImport: {
        filter: (...args) => mockQuoteImportFilter(...args),
        update: vi.fn(),
      },
      SiteMeasure: {
        filter: (...args) => mockSiteMeasureFilter(...args),
        create: vi.fn(),
        update: vi.fn(),
      },
      PricingQuoteItem: {
        filter: (...args) => mockPricingQuoteItemFilter(...args),
        update: vi.fn(),
        create: vi.fn(),
      },
      PricingCategory: {
        list: (...args) => mockPricingCategoryList(...args),
        create: vi.fn(),
      },
      PricingSection: {
        list: (...args) => mockPricingSectionList(...args),
        create: vi.fn(),
      },
      TimeEntry: {
        list: (...args) => mockTimeEntryList(...args),
        update: (...args) => mockTimeEntryUpdate(...args),
      },
    },
    pricing: {
      confirmGlobalInclusion: vi.fn(),
      confirmTriggeredInclusion: vi.fn(),
      confirmAllGlobalInclusions: vi.fn(),
      adjustQuoteMargins: (...args) => mockAdjustQuoteMargins(...args),
      saveItemDefaults: (...args) => mockSaveItemDefaults(...args),
      stageQuoteImport: vi.fn(),
      commitQuoteImport: vi.fn(),
      updateQuoteImportLineItems: vi.fn(),
      deleteQuoteImport: vi.fn(),
    },
    quotes: {
      convertToJob: vi.fn(),
      getDocumentDraft: (...args) => mockQuoteDocumentDraft(...args),
      previewDocument: (...args) => mockQuotePreviewDocument(...args),
      generateDocument: vi.fn(),
    },
    documentTemplates: {
      list: (...args) => mockDocumentTemplateList(...args),
    },
    filesystem: {
      create: vi.fn(),
      listVersions: (...args) => mockFilesystemListVersions(...args),
    },
  },
}));

vi.mock("../components/AddressAutocompleteInput", () => ({
  default: function MockAddressAutocompleteInput() {
    return null;
  },
}));

vi.mock("../components/RecordAuditPanel", () => ({
  default: function MockRecordAuditPanel() {
    return null;
  },
}));

vi.mock("../components/AttachmentVersionDialog", () => ({
  default: function MockAttachmentVersionDialog() {
    return null;
  },
}));

vi.mock("../components/workflow/ApprovalPanel", () => ({
  default: function MockApprovalPanel() {
    return null;
  },
}));

vi.mock("../components/workflow/ChecklistPanel", () => ({
  default: function MockChecklistPanel() {
    return null;
  },
}));

vi.mock("../components/workflow/ChangeOrderPanel", () => ({
  default: function MockChangeOrderPanel() {
    return null;
  },
}));

describe("QuoteDetail", () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const store = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => store.get(key) || null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
      },
    });
    mockQuoteGet.mockResolvedValue({
      id: "quote-1",
      quote_number: "QTE-0001",
      title: "Kitchen Renovation",
      status: "draft",
      revision: 1,
      total: 1500,
      subtotal: 1304.35,
      gst: 195.65,
      contact_name: "Alex Builder",
      company_name: "Builder Co",
      approval_history: [],
      change_orders: [],
    });
    mockQuoteItemFilter.mockResolvedValue([]);
    mockJobOperationFilter.mockResolvedValue([]);
    mockAttachmentFilter.mockResolvedValue([]);
    mockContactList.mockResolvedValue([]);
    mockJobList.mockResolvedValue([]);
    mockStaffList.mockResolvedValue([]);
    mockQuoteImportFilter.mockResolvedValue([]);
    mockSiteMeasureFilter.mockResolvedValue([]);
    mockPricingQuoteItemFilter.mockResolvedValue([]);
    mockPricingCategoryList.mockResolvedValue([]);
    mockPricingSectionList.mockResolvedValue([]);
    mockJobOperationUpdate.mockResolvedValue({});
    mockQuoteUpdate.mockResolvedValue({});
    mockFilesystemListVersions.mockResolvedValue([]);
    mockQuoteItemUpdate.mockResolvedValue({});
    mockSaveItemDefaults.mockResolvedValue({ updated: 1, created: 0, records: [] });
    mockQuoteDocumentDraft.mockResolvedValue({
      document: {
        quoteId: "quote-1",
        quoteNumber: "QTE-0001",
        customerName: "Alex Builder",
        customerPhone: "",
        customerEmail: "",
        jobName: "Kitchen Renovation",
        jobAddress: "",
        jobNotes: "",
        scopeNotes: "",
        specificationNotes: "",
        lineItems: [],
        subtotalExGst: 1304.35,
        gstAmount: 195.65,
        totalIncGst: 1500,
        depositAmount: 0,
        balanceDue: 0,
        issueDate: "2026-05-09",
        documentType: "quote_list",
        paymentTerms: "",
        disclaimer: "",
        termsSections: [],
        status: "draft",
      },
      html: "<html><body>Quote List</body></html>",
      template: { id: "template-quote-list", name: "Quote List", is_default: true },
      warnings: [],
      errors: [],
    });
    mockQuotePreviewDocument.mockResolvedValue({
      html: "<html><body>Quote List Preview</body></html>",
      document: { quoteId: "quote-1", lineItems: [] },
      warnings: [],
      errors: [],
    });
    mockDocumentTemplateList.mockResolvedValue([
      { id: "template-quote-list", name: "Quote List", is_default: true, type: "quote_list" },
    ]);
    mockTimeEntryList.mockResolvedValue([]);
    mockTimeEntryUpdate.mockResolvedValue({});
    mockAdjustQuoteMargins.mockResolvedValue({
      quote: {
        id: "quote-1",
        quote_number: "QTE-0001",
        title: "Kitchen Renovation",
        status: "draft",
        revision: 1,
        total: 1600,
        subtotal: 1391.3,
        gst: 208.7,
      },
      items: [],
      summary: {},
    });
  });

  test("loads a quote after the initial empty render without crashing hook order", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");

    await waitFor(() => {
      expect(screen.getByText("QTE-0001")).toBeInTheDocument();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Rendered more hooks than during the previous render")
    );

    consoleErrorSpy.mockRestore();
  });

  test("hides advanced quote tabs by default and reveals them on request", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");

    expect(screen.queryByRole("tab", { name: /workflow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /history/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show advanced/i }));

    expect(screen.getByRole("tab", { name: /workflow/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /history/i })).toBeInTheDocument();
  });

  test("shows the complete guided quote workflow and jumps to the next work area", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");

    expect(screen.getByText("Core workshop flow")).toBeInTheDocument();
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Import / Pricing")).toBeInTheDocument();
    expect(screen.getByText("Archive / Complete")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /add pricing/i }));

    expect(screen.getByText("Quote pricing import")).toBeInTheDocument();
  });

  test("archives and restores quotes as a recoverable end-state", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await userEvent.click(screen.getAllByRole("button", { name: /archive quote/i })[0]);

    await waitFor(() => {
      expect(mockQuoteUpdate).toHaveBeenCalledWith("quote-1", expect.objectContaining({
        status: "archived",
        archived_at: expect.any(String),
      }));
    });
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/can be restored later/i));

    confirmSpy.mockRestore();
  });

  test("creates quote, pricing, and document approval snapshots from the quote overview", async () => {
    const user = userEvent.setup();
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-1",
        description: "Kitchen cabinets",
        category: "materials",
        quantity: 2,
        unit: "ea",
        unit_cost: 200,
        markup_percent: 50,
        total: 600,
        is_optional: false,
      },
    ]);
    mockAttachmentFilter.mockResolvedValue([
      {
        id: "attachment-1",
        name: "QTE-0001.pdf",
        mime_type: "application/pdf",
        source: "generated-document",
        current_version: 2,
        url: "/files/qte-0001.pdf",
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await user.click(screen.getByRole("button", { name: /create approval snapshot/i }));

    await waitFor(() => {
      expect(mockQuoteUpdate).toHaveBeenCalledWith("quote-1", expect.objectContaining({
        approval_status: "approved",
        quote_approval_locked: true,
        approved_totals: { subtotal: 1304.35, gst: 195.65, total: 1500 },
        approved_document_attachment_id: "attachment-1",
        approval_snapshots: expect.arrayContaining([
          expect.objectContaining({ type: "quote" }),
          expect.objectContaining({ type: "pricing" }),
          expect.objectContaining({ type: "document" }),
        ]),
      }));
    });
  });

  test("warns before editing an approved locked quote", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockQuoteGet.mockResolvedValue({
      id: "quote-1",
      quote_number: "QTE-0001",
      title: "Kitchen Renovation",
      status: "draft",
      revision: 1,
      total: 1500,
      subtotal: 1304.35,
      gst: 195.65,
      contact_name: "Alex Builder",
      company_name: "Builder Co",
      approval_status: "approved",
      quote_approval_locked: true,
      approved_totals: { subtotal: 1304.35, gst: 195.65, total: 1500 },
      approval_history: [],
      change_orders: [],
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    expect(screen.getByText("Approved quote locked")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/unlock editing/i));
    expect(screen.queryByRole("dialog", { name: /edit quote/i })).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  test("lets users mark quote workflow tasks as done from the workflow tab", async () => {
    mockJobOperationFilter.mockResolvedValue([
      {
        id: "task-1",
        task_name: "Send quote pack",
        status: "pending",
        workflow_phase: "quote_sent",
        is_system_generated: true,
        is_unassigned_placeholder: false,
        assigned_to: "Jamie",
        actual_completion_date: "",
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await userEvent.click(screen.getByRole("button", { name: /show advanced/i }));
    await userEvent.click(screen.getByRole("tab", { name: /workflow/i }));
    await userEvent.click(await screen.findByRole("button", { name: /mark done/i }));

    await waitFor(() => {
      expect(mockJobOperationUpdate).toHaveBeenCalledWith("task-1", { status: "complete" });
    });
  });

  test("lets users click an assigned workflow owner to reallocate the task", async () => {
    mockJobOperationFilter.mockResolvedValue([
      {
        id: "task-1",
        task_name: "Follow up quote",
        status: "ready",
        workflow_phase: "quote_follow_up",
        is_system_generated: true,
        is_unassigned_placeholder: false,
        assigned_to: "Jamie",
        assigned_staff_ids: ["staff-1"],
      },
    ]);
    mockStaffList.mockResolvedValue([
      { id: "staff-1", name: "Jamie" },
      { id: "staff-2", name: "Morgan" },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await userEvent.click(screen.getByRole("button", { name: /show advanced/i }));
    await userEvent.click(screen.getByRole("tab", { name: /workflow/i }));
    await userEvent.click(await screen.findByRole("button", { name: /jamie/i }));

    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes.some((element) => element.textContent?.includes("Jamie"))).toBe(true);
  });

  test("asks for a section when confirming an every job inclusion", async () => {
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-1",
        quote_id: "quote-1",
        section: "Every Job Inclusions",
        section_key: "every_job_inclusions",
        category: "freight_delivery",
        description: "Freight",
        quantity: 1,
        unit: "ea",
        unit_cost: 120,
        markup_percent: 25,
        total: 150,
        source: "global_auto_inclusion",
        review_status: "auto_added_needs_review",
      },
    ]);
    mockPricingSectionList.mockResolvedValue([
      { id: "section-1", key: "freight", name: "Freight", display_order: 50, is_active: true },
      { id: "section-2", key: "general", name: "General", display_order: 999, is_active: true },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await userEvent.click(screen.getByRole("tab", { name: /quote list/i }));
    const confirmButtons = await screen.findAllByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButtons.find((button) => button.textContent === "Confirm") || confirmButtons[0]);

    expect(await screen.findByText("Confirm Every Job Inclusion")).toBeInTheDocument();
    expect(screen.getAllByText(/choose which quote section/i).length).toBeGreaterThan(0);
  });

  test("shows only the latest file version by default and reveals older versions on demand", async () => {
    mockAttachmentFilter.mockResolvedValue([
      {
        id: "attachment-1",
        name: "Quote Pack.pdf",
        mime_type: "application/pdf",
        size: 180000,
        url: "/files/quote-pack.pdf",
        source: "manual-upload",
        version_count: 3,
        current_version: 3,
        document_information: "Current version for client issue.",
        created_date: "2026-05-07T08:00:00.000Z",
        updated_date: "2026-05-07T09:00:00.000Z",
      },
    ]);
    mockFilesystemListVersions.mockResolvedValue([
      {
        id: "version-3",
        attachment_id: "attachment-1",
        version_number: 3,
        name: "Quote Pack.pdf",
        stored_name: "quote-pack-v3.pdf",
        mime_type: "application/pdf",
        size: 180000,
        url: "/files/quote-pack-v3.pdf",
        actor_name: "Morgan",
        created_date: "2026-05-07T09:00:00.000Z",
      },
      {
        id: "version-2",
        attachment_id: "attachment-1",
        version_number: 2,
        name: "Quote Pack.pdf",
        stored_name: "quote-pack-v2.pdf",
        mime_type: "application/pdf",
        size: 175000,
        url: "/files/quote-pack-v2.pdf",
        actor_name: "Jamie",
        created_date: "2026-05-06T09:00:00.000Z",
      },
      {
        id: "version-1",
        attachment_id: "attachment-1",
        version_number: 1,
        name: "Quote Pack.pdf",
        stored_name: "quote-pack-v1.pdf",
        mime_type: "application/pdf",
        size: 160000,
        url: "/files/quote-pack-v1.pdf",
        actor_name: "Alex",
        created_date: "2026-05-05T09:00:00.000Z",
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await userEvent.click(screen.getByRole("tab", { name: /files/i }));

    expect(await screen.findByText("Quote Pack.pdf")).toBeInTheDocument();
    expect(screen.getByText("Current version")).toBeInTheDocument();
    expect(screen.queryByText("Older versions")).not.toBeInTheDocument();
    expect(screen.queryByText("Version 2")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show older versions/i }));

    expect(await screen.findByText("Older versions")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFilesystemListVersions).toHaveBeenCalledWith("attachment-1");
    });

    await userEvent.click(screen.getByRole("button", { name: /hide older versions/i }));

    await waitFor(() => {
      expect(screen.queryByText("Older versions")).not.toBeInTheDocument();
      expect(screen.queryByText("Version 2")).not.toBeInTheDocument();
    });
  });

  test("hides .bak files by default and reveals them on demand", async () => {
    mockAttachmentFilter.mockResolvedValue([
      {
        id: "attachment-live",
        name: "Quote-QTE-0001.pdf",
        mime_type: "application/pdf",
        size: 180000,
        url: "/files/quote.pdf",
        source: "generated-document",
        version_count: 1,
        current_version: 1,
        created_date: "2026-05-07T08:00:00.000Z",
        updated_date: "2026-05-07T09:00:00.000Z",
      },
      {
        id: "attachment-backup",
        name: "Quote-QTE-0001.pdf.bak-1778029811269",
        mime_type: "application/pdf",
        size: 170000,
        url: "/files/quote-backup.pdf",
        source: "generated-document",
        version_count: 1,
        current_version: 1,
        created_date: "2026-05-07T07:00:00.000Z",
        updated_date: "2026-05-07T07:05:00.000Z",
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await userEvent.click(screen.getByRole("tab", { name: /files/i }));

    expect(await screen.findByText("Quote-QTE-0001.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/\.bak-/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show backup files/i }));

    expect(await screen.findByText(/\.bak-1778029811269/i)).toBeInTheDocument();
  });

  test("shows gross and material margin cards using active ex GST quote line items", async () => {
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-material",
        description: "Cabinet panels",
        category: "materials",
        quantity: 2,
        unit_cost: 50,
        markup_percent: 50,
        total: 150,
        is_optional: false,
      },
      {
        id: "item-labour",
        description: "Install labour",
        category: "labour",
        quantity: 1,
        unit_cost: 80,
        markup_percent: 50,
        total: 120,
        is_optional: false,
      },
      {
        id: "item-freight",
        description: "Freight",
        category: "freight_delivery",
        quantity: 1,
        unit_cost: 20,
        markup_percent: 0,
        total: 20,
        is_optional: false,
      },
      {
        id: "item-optional",
        description: "Optional add-on",
        category: "materials",
        quantity: 1,
        unit_cost: 100,
        markup_percent: 40,
        total: 140,
        is_optional: true,
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");

    expect(await screen.findByText("Gross Margin")).toBeInTheDocument();
    expect(screen.getByText("29.4%")).toBeInTheDocument();
    expect(screen.getAllByText(/profit/i).length).toBe(2);
    expect(screen.getByText((content) => content.includes("$170.00 / $120.00"))).toBeInTheDocument();
    expect(screen.getByText("Below target")).toBeInTheDocument();

    expect(screen.getByText("Material Margin")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("$150.00 / $100.00"))).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  test("shows quote-specific gross margin scenarios beside the quote list", async () => {
    const user = userEvent.setup();
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-material",
        description: "Cabinet panels",
        category: "materials",
        quantity: 2,
        unit_cost: 50,
        markup_percent: 50,
        total: 150,
        is_optional: false,
      },
      {
        id: "item-labour",
        description: "Install labour",
        category: "labour",
        quantity: 1,
        unit_cost: 80,
        markup_percent: 50,
        total: 120,
        is_optional: false,
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await user.click(screen.getByRole("button", { name: /show advanced/i }));
    await user.click(screen.getByRole("tab", { name: /scenarios/i }));

    expect(await screen.findByText("Quote Gross Margin Scenarios")).toBeInTheDocument();
    expect(screen.getByText("35% gross margin")).toBeInTheDocument();
    expect(screen.getByText("40% gross margin")).toBeInTheDocument();
    expect(screen.getAllByText(/Labour excluded/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /apply scenario/i }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: /apply scenario/i })[0]);

    expect(await screen.findByText("Line items to update")).toBeInTheDocument();
    expect(screen.getByText("Cabinet panels")).toBeInTheDocument();
    expect(screen.getByText("Current margin")).toBeInTheDocument();
  });

  test("applies a gross margin adjustment from the summary card", async () => {
    const user = userEvent.setup();
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-material",
        description: "Cabinet panels",
        category: "materials",
        quantity: 2,
        unit_cost: 50,
        markup_percent: 50,
        total: 150,
        is_optional: false,
      },
      {
        id: "item-labour",
        description: "Install labour",
        category: "labour",
        quantity: 1,
        unit_cost: 80,
        markup_percent: 50,
        total: 120,
        is_optional: false,
      },
    ]);
    mockAdjustQuoteMargins.mockResolvedValue({
      quote: {
        id: "quote-1",
        quote_number: "QTE-0001",
        title: "Kitchen Renovation",
        status: "draft",
        revision: 1,
        total: 1725,
        subtotal: 1500,
        gst: 225,
      },
      items: [
        {
          id: "item-material",
          description: "Cabinet panels",
          category: "materials",
          quantity: 2,
          unit_cost: 50,
          markup_percent: 66.67,
          total: 166.67,
          is_optional: false,
        },
        {
          id: "item-labour",
          description: "Install labour",
          category: "labour",
          quantity: 1,
          unit_cost: 80,
          markup_percent: 66.67,
          total: 133.33,
          is_optional: false,
        },
      ],
      summary: {
        previous_margin_percent: 33.3,
        target_margin_percent: 40,
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    const grossInput = screen.getByLabelText("Target gross margin");
    await user.clear(grossInput);
    await user.type(grossInput, "40");
    await user.click(screen.getAllByRole("button", { name: "Apply" })[0]);

    expect(await screen.findByText("Apply target gross margin")).toBeInTheDocument();
    expect(screen.getByText("Current margin")).toBeInTheDocument();
    expect(screen.getByText("Target margin")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply changes" }));

    await waitFor(() => {
      expect(mockAdjustQuoteMargins).toHaveBeenCalledWith("quote-1", {
        action_type: "gross_margin_adjustment",
        target_margin_percent: 40,
        include_locked: false,
      });
    });
  });

  test("can save edited quote line item pricing defaults for future imports", async () => {
    const user = userEvent.setup();
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-1",
        description: "Cabinet panels",
        category: "materials",
        quantity: 2,
        unit: "sheet",
        unit_cost: 50,
        markup_percent: 30,
        total: 130,
        section: "Materials",
        section_key: "materials",
        section_display_order: 10,
        product_number: "PNL-001",
        source_item_code: "PNL-001",
        is_optional: false,
      },
    ]);
    mockPricingSectionList.mockResolvedValue([
      { id: "section-materials", name: "Materials", label: "Materials", key: "materials", value: "materials", display_order: 10, is_active: true },
      { id: "section-hardware", name: "Hardware", label: "Hardware", key: "hardware", value: "hardware", display_order: 30, is_active: true },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await user.click(screen.getByRole("tab", { name: /quote list/i }));
    await user.click(screen.getByLabelText("Edit line item"));
    await user.click(screen.getByLabelText(/save cost, category, and section as the default/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockSaveItemDefaults).toHaveBeenCalledWith({
        source_quote_id: "quote-1",
        items: [
          {
            pricing_item_id: "",
            match_name: "Cabinet panels",
            fields: expect.objectContaining({
              description: "Cabinet panels",
              category: "materials",
              buy_price: 50,
              section: "Materials",
              section_key: "materials",
              product_number: "PNL-001",
            }),
          },
        ],
      });
    });
  });

  test("lets users save selected quote list defaults from the row action", async () => {
    const user = userEvent.setup();
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-1",
        quote_id: "quote-1",
        description: "Cabinet panels",
        category: "materials",
        quantity: 2,
        unit: "ea",
        unit_cost: 84.5,
        markup_percent: 30,
        total: 219.7,
        section: "Cabinetry",
        section_id: "section-1",
        section_key: "cabinetry",
        section_display_order: 10,
        pricing_item_id: "pricing-1",
        product_number: "PNL-001",
        supplier: "Board Co",
        is_optional: false,
      },
    ]);
    mockPricingSectionList.mockResolvedValue([
      { id: "section-1", key: "cabinetry", name: "Cabinetry", display_order: 10, is_active: true },
      { id: "section-2", key: "general", name: "General", display_order: 999, is_active: true },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await user.click(screen.getByRole("tab", { name: /quote list/i }));
    await user.click(await screen.findByRole("button", { name: /save line item defaults/i }));

    expect(await screen.findByText("Save line item defaults")).toBeInTheDocument();

    const categoryCheckbox = screen.getByRole("checkbox", { name: /category save the current category assignment/i });
    const priceCheckbox = screen.getByRole("checkbox", { name: /price save the current cost, markup, and unit/i });
    const sectionCheckbox = screen.getByRole("checkbox", { name: /section save the current quote section/i });

    await user.click(priceCheckbox);
    await user.click(sectionCheckbox);
    await user.click(screen.getByRole("button", { name: /^save defaults$/i }));

    await waitFor(() => {
      expect(mockSaveItemDefaults).toHaveBeenCalledWith({
        source_quote_id: "quote-1",
        items: [
          {
            pricing_item_id: "pricing-1",
            match_name: "Cabinet panels",
            fields: {
              category: "materials",
              supplier: "Board Co",
              product_number: "PNL-001",
              supplier_sku: "PNL-001",
              original_sku: "PNL-001",
            },
          },
        ],
      });
    });

    expect(categoryCheckbox).toBeChecked();
  });

  test("shows a Print Quote List button and loads the quote list template flow", async () => {
    const user = userEvent.setup();
    mockQuoteItemFilter.mockResolvedValue([
      {
        id: "item-1",
        quote_id: "quote-1",
        description: "Cabinet panels",
        quantity: 2,
        unit: "ea",
        unit_cost: 84.5,
        markup_percent: 30,
        total: 219.7,
        section: "Cabinetry",
        section_display_order: 10,
        is_optional: false,
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={["/quotes/quote-1"]}>
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Kitchen Renovation");
    await user.click(screen.getByRole("tab", { name: /quote list/i }));
    await user.click(screen.getByRole("button", { name: /print quote list/i }));

    await waitFor(() => {
      expect(mockQuoteDocumentDraft).toHaveBeenCalledWith("quote-1", "quote_list");
      expect(mockDocumentTemplateList).toHaveBeenCalledWith({ type: "quote_list" });
      expect(mockQuotePreviewDocument).toHaveBeenCalledWith("quote-1", expect.objectContaining({
        document_type: "quote_list",
        template_id: "template-quote-list",
      }));
    });
  });
});
