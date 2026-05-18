import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Stock from "./Stock";

const mockGetDashboard = vi.fn();
const mockListItems = vi.fn();
const mockListShortages = vi.fn();
const mockListTransactions = vi.fn();
const mockStockLocationList = vi.fn();
const mockCompanyFilter = vi.fn();
const mockJobList = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    stock: {
      getDashboard: (...args) => mockGetDashboard(...args),
      listItems: (...args) => mockListItems(...args),
      listShortages: (...args) => mockListShortages(...args),
      listTransactions: (...args) => mockListTransactions(...args),
    },
    entities: {
      StockLocation: {
        list: (...args) => mockStockLocationList(...args),
      },
      Company: {
        filter: (...args) => mockCompanyFilter(...args),
      },
      Job: {
        list: (...args) => mockJobList(...args),
      },
    },
  },
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    isAdmin: true,
  }),
}));

vi.mock("@/lib/ModuleContext", () => ({
  useModules: () => ({
    isModuleEnabled: () => true,
  }),
}));

function renderStock() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Stock />
    </MemoryRouter>
  );
}

describe("Stock dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDashboard.mockResolvedValue({
      counts: {
        items: 1,
        low_stock: 0,
        shortages: 0,
        on_order_items: 0,
        overdue_purchase_orders: 0,
      },
      valuation: { stock_value: 42 },
      low_stock_items: [],
      stock_by_category: [],
    });
    mockListItems.mockResolvedValue([
      {
        id: "stock-1",
        name: "Melamine board",
        code: "MEL-18",
        category: "sheet",
        supplier_name: "Panel Supplies",
        location_name: "Main rack",
        on_hand: 10,
        allocated: 2,
        available: 8,
        on_order: 0,
        low_stock: false,
      },
    ]);
    mockListShortages.mockResolvedValue([]);
    mockListTransactions.mockResolvedValue([]);
    mockStockLocationList.mockResolvedValue([{ id: "loc-1", name: "Main rack" }]);
    mockCompanyFilter.mockResolvedValue([{ id: "supplier-1", name: "Panel Supplies" }]);
    mockJobList.mockResolvedValue([{ id: "job-1", job_number: "JOB-0001", title: "Kitchen install" }]);
  });

  test("opens the new item dialog with an accessible description", async () => {
    renderStock();

    await screen.findByRole("heading", { name: "Stock" });
    await userEvent.click(screen.getByRole("button", { name: "New Item" }));

    expect(screen.getByRole("dialog", { name: "New Stock Item" })).toBeInTheDocument();
    expect(screen.getByText("Define the stock item, units, supplier, location, and reorder thresholds.")).toBeInTheDocument();
  });

  test("opens stock movement dialogs with accessible descriptions", async () => {
    renderStock();

    await screen.findByRole("heading", { name: "Stock" });
    await userEvent.click(screen.getByRole("tab", { name: "Items" }));
    await screen.findByText("Melamine board");
    await userEvent.click(screen.getByRole("button", { name: "Receive" }));

    expect(screen.getByRole("dialog", { name: "Receive Melamine board" })).toBeInTheDocument();
    expect(screen.getByText("Record stock arriving into inventory and update available on-hand quantity.")).toBeInTheDocument();
  });
});
