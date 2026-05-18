import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PurchaseOrderDetail from "./PurchaseOrderDetail";

const mockPurchaseOrderList = vi.fn();
const mockPoItemFilter = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      PurchaseOrder: {
        list: (...args) => mockPurchaseOrderList(...args),
        update: vi.fn(),
      },
      POItem: {
        create: vi.fn(),
        delete: vi.fn(),
        filter: (...args) => mockPoItemFilter(...args),
      },
    },
  },
}));

vi.mock("../components/RecordAuditPanel", () => ({
  default: () => <div data-testid="record-audit-panel" />,
}));

function renderPurchaseOrderDetail() {
  return render(
    <MemoryRouter
      initialEntries={["/purchasing/po-1"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/purchasing/:id" element={<PurchaseOrderDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PurchaseOrderDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPurchaseOrderList.mockResolvedValue([
      {
        id: "po-1",
        po_number: "PO-0001",
        supplier_name: "Hardware Supplies Ltd",
        status: "draft",
        subtotal: 0,
        gst: 0,
        total: 0,
      },
    ]);
    mockPoItemFilter.mockResolvedValue([]);
  });

  test("opens the add item dialog with an accessible description", async () => {
    renderPurchaseOrderDetail();

    await screen.findByRole("heading", { name: "PO-0001" });
    await userEvent.click(screen.getByRole("button", { name: "Add Item" }));

    expect(screen.getByRole("dialog", { name: "Add Item" })).toBeInTheDocument();
    expect(screen.getByText("Enter the purchased item details and line total for this purchase order.")).toBeInTheDocument();
  });
});
