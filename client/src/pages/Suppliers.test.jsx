import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import Suppliers from "./Suppliers";

const mockEnsureSupplierCompaniesSynced = vi.fn();

vi.mock("../lib/suppliers", () => ({
  ensureSupplierCompaniesSynced: (...args) => mockEnsureSupplierCompaniesSynced(...args),
}));

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Company: {
        create: vi.fn(),
      },
    },
  },
}));

function renderSuppliers() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suppliers />
    </MemoryRouter>
  );
}

describe("Suppliers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows a retryable error message when suppliers fail to load", async () => {
    mockEnsureSupplierCompaniesSynced.mockRejectedValue(new Error("Suppliers API unavailable"));

    renderSuppliers();

    await waitFor(() => {
      expect(screen.getByText("Suppliers API unavailable")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
