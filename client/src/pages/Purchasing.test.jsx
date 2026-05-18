import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Purchasing from "./Purchasing";

const mockPurchaseOrderList = vi.fn();
const mockJobList = vi.fn();
const mockEnsureSupplierCompaniesSynced = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      PurchaseOrder: {
        list: (...args) => mockPurchaseOrderList(...args),
      },
      Job: {
        list: (...args) => mockJobList(...args),
      },
    },
  },
}));

vi.mock("../lib/suppliers", () => ({
  ensureSupplierCompaniesSynced: (...args) => mockEnsureSupplierCompaniesSynced(...args),
}));

vi.mock("@/lib/ModuleContext", () => ({
  useModules: () => ({
    isModuleEnabled: () => true,
  }),
}));

function renderPurchasing() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Purchasing />
    </MemoryRouter>
  );
}

describe("Purchasing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobList.mockResolvedValue([]);
    mockEnsureSupplierCompaniesSynced.mockResolvedValue([]);
  });

  test("shows a retryable error message when purchase orders fail to load", async () => {
    mockPurchaseOrderList.mockRejectedValue(new Error("Purchasing API unavailable"));

    renderPurchasing();

    await waitFor(() => {
      expect(screen.getByText("Purchasing API unavailable")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("opens the new purchase order dialog with an accessible description", async () => {
    mockPurchaseOrderList.mockResolvedValue([]);

    renderPurchasing();

    await screen.findByRole("button", { name: "New PO" });
    await userEvent.click(screen.getByRole("button", { name: "New PO" }));

    expect(screen.getByRole("dialog", { name: "New Purchase Order" })).toBeInTheDocument();
    expect(screen.getByText("Choose the supplier, job link, and expected delivery date for this purchase order.")).toBeInTheDocument();
  });
});
