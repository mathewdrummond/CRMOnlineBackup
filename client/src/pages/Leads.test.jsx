import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Leads from "./Leads";

const mockNavigate = vi.fn();
const mockList = vi.fn();
const mockLeadCreate = vi.fn();
const mockContactCreate = vi.fn();
const mockToast = vi.fn();

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
      Lead: {
        list: (...args) => mockList("Lead", ...args),
        create: (...args) => mockLeadCreate(...args),
      },
      Contact: {
        list: (...args) => mockList("Contact", ...args),
        create: (...args) => mockContactCreate(...args),
      },
      Quote: { list: (...args) => mockList("Quote", ...args) },
      LeadCategory: { list: (...args) => mockList("LeadCategory", ...args) },
    },
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args) => mockToast(...args),
}));

vi.mock("../components/AddressAutocompleteInput", () => ({
  default: function MockAddressAutocompleteInput({ value, onChange }) {
    return <input aria-label="Site Address" value={value} onChange={(event) => onChange(event.target.value)} />;
  },
}));

vi.mock("../components/leads/LeadCategorySettingsDialog", () => ({
  default: function MockLeadCategorySettingsDialog() {
    return null;
  },
}));

function renderLeads() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Leads />
    </MemoryRouter>
  );
}

describe("Leads", () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockLeadCreate.mockResolvedValue({ id: "lead-new" });
    mockContactCreate.mockResolvedValue({
      id: "contact-new",
      first_name: "Morgan",
      last_name: "Taylor",
      full_name: "Morgan Taylor",
      company_name: "Taylor Homes",
    });
  });

  test("shows a retryable error message when leads fail to load", async () => {
    mockList.mockRejectedValue(new Error("Leads API unavailable"));

    renderLeads();

    await waitFor(() => {
      expect(screen.getByText("Leads API unavailable")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("can create and link a new contact while creating a lead", async () => {
    mockList.mockImplementation((entity) => {
      if (entity === "Lead") return Promise.resolve([]);
      if (entity === "Contact") return Promise.resolve([]);
      if (entity === "Quote") return Promise.resolve([]);
      if (entity === "LeadCategory") {
        return Promise.resolve([{ id: "cat-general", name: "General", color: "blue", sort_order: 0, is_default: true }]);
      }
      return Promise.resolve([]);
    });

    renderLeads();

    await screen.findByText("Leads");
    await userEvent.click(screen.getAllByRole("button", { name: "New Lead" })[0]);

    const dialog = screen.getByRole("dialog", { name: "New Lead" });
    await userEvent.type(within(dialog).getByLabelText("Title *"), "Kitchen enquiry");
    await userEvent.type(within(dialog).getByLabelText("Contact Name"), "Morgan Taylor");
    await userEvent.type(within(dialog).getByLabelText("Company Name"), "Taylor Homes");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Create this person as a contact" }));
    await userEvent.type(within(dialog).getByLabelText("Email"), "morgan@example.test");
    await userEvent.type(within(dialog).getByLabelText("Phone"), "021 555 0101");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create Lead" }));

    await waitFor(() => {
      expect(mockContactCreate).toHaveBeenCalledWith(expect.objectContaining({
        first_name: "Morgan",
        last_name: "Taylor",
        full_name: "Morgan Taylor",
        company_name: "Taylor Homes",
        email: "morgan@example.test",
        phone: "021 555 0101",
      }));
    });

    expect(mockLeadCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Kitchen enquiry",
      contact_id: "contact-new",
      contact_name: "Morgan Taylor",
      company_name: "Taylor Homes",
    }));
  });

  test("clicking Quote in Progress opens the most recent matching quote", async () => {
    mockList.mockImplementation((entity) => {
      if (entity === "Lead") {
        return Promise.resolve([{
          id: "lead-1",
          title: "Kitchen refresh",
          stage: "quote_in_progress",
          contact_id: "contact-1",
          contact_name: "Jane Smith",
          company_name: "Smith Homes",
          value: 12000,
          created_date: "2026-05-01T10:00:00.000Z",
        }]);
      }
      if (entity === "Contact") {
        return Promise.resolve([{ id: "contact-1", first_name: "Jane", last_name: "Smith", company_name: "Smith Homes" }]);
      }
      if (entity === "Quote") {
        return Promise.resolve([
          { id: "quote-old", lead_id: "lead-1", contact_id: "contact-1", quote_number: "QTE-0001", updated_date: "2026-05-01T10:00:00.000Z" },
          { id: "quote-new", lead_id: "lead-1", contact_id: "contact-1", quote_number: "QTE-0002", updated_date: "2026-05-03T10:00:00.000Z" },
        ]);
      }
      if (entity === "LeadCategory") {
        return Promise.resolve([{ id: "cat-general", name: "General", color: "blue", sort_order: 0, is_default: true }]);
      }
      return Promise.resolve([]);
    });

    renderLeads();

    const openQuoteButton = await screen.findByRole("button", { name: /open most recent quote for jane smith/i });
    await userEvent.click(openQuoteButton);

    expect(mockNavigate).toHaveBeenCalledWith("/quotes/quote-new");
  });

  test("shows a clear message when no quote is found for Quote in Progress", async () => {
    mockList.mockImplementation((entity) => {
      if (entity === "Lead") {
        return Promise.resolve([{
          id: "lead-1",
          title: "Kitchen refresh",
          stage: "quote_in_progress",
          contact_name: "Jane Smith",
          contact_email: "jane@example.test",
          company_name: "Smith Homes",
          value: 12000,
        }]);
      }
      if (entity === "Contact") return Promise.resolve([]);
      if (entity === "Quote") return Promise.resolve([]);
      if (entity === "LeadCategory") {
        return Promise.resolve([{ id: "cat-general", name: "General", color: "blue", sort_order: 0, is_default: true }]);
      }
      return Promise.resolve([]);
    });

    renderLeads();

    const openQuoteButton = await screen.findByRole("button", { name: /open most recent quote for jane smith/i });
    await userEvent.click(openQuoteButton);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "No quote found for this customer.",
    }));
  });

  test("stages without quotes do not render a clickable quote badge", async () => {
    mockList.mockImplementation((entity) => {
      if (entity === "Lead") {
        return Promise.resolve([{
          id: "lead-1",
          title: "Fresh enquiry",
          stage: "new_enquiry",
          contact_name: "Chris Lane",
          company_name: "Lane Build",
          value: 5000,
        }]);
      }
      if (entity === "Contact") return Promise.resolve([]);
      if (entity === "Quote") return Promise.resolve([]);
      if (entity === "LeadCategory") {
        return Promise.resolve([{ id: "cat-general", name: "General", color: "blue", sort_order: 0, is_default: true }]);
      }
      return Promise.resolve([]);
    });

    renderLeads();

    await screen.findAllByText("Fresh enquiry");
    expect(screen.queryByRole("button", { name: /open most recent quote/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("New Enquiry").length).toBeGreaterThan(0);
  });
});
