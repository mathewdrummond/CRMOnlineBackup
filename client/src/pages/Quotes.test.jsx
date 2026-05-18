import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import Quotes from "./Quotes";

const mockList = vi.fn();

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: {
      Quote: { list: (...args) => mockList("Quote", ...args) },
      Contact: { list: (...args) => mockList("Contact", ...args) },
    },
  },
}));

vi.mock("../components/AddressAutocompleteInput", () => ({
  default: function MockAddressAutocompleteInput({ value, onChange }) {
    return <input aria-label="Site Address" value={value} onChange={(event) => onChange(event.target.value)} />;
  },
}));

function renderQuotes() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Quotes />
    </MemoryRouter>
  );
}

describe("Quotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows a simple guided quote path for low-friction quoting", async () => {
    mockList.mockImplementation((entity) => {
      if (entity === "Quote") {
        return Promise.resolve([
          { id: "quote-1", quote_number: "QTE-0001", title: "Kitchen quote", status: "draft", total: 1250, created_date: "2026-05-01" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderQuotes();

    await waitFor(() => {
      expect(screen.getByText("Quote path")).toBeInTheDocument();
    });

    expect(screen.getByText("Create quote")).toBeInTheDocument();
    expect(screen.getByText("Add pricing")).toBeInTheDocument();
    expect(screen.getByText("Review quote list")).toBeInTheDocument();
    expect(screen.getByText("Print or send")).toBeInTheDocument();
  });

  test("shows a retryable error message when quotes fail to load", async () => {
    mockList.mockRejectedValue(new Error("Quotes API unavailable"));

    renderQuotes();

    await waitFor(() => {
      expect(screen.getByText("Quotes API unavailable")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
