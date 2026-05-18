import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HelpCenter from "./HelpCenter";
import { HelpProvider } from "@/lib/HelpContext";
import GuidedTourDialog from "@/components/help/GuidedTourDialog";

const mockWindowOpen = vi.fn();

function renderHelpCenter(initialEntry = "/help") {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[initialEntry]}>
      <HelpProvider>
        <Routes>
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/pricing" element={<div>Pricing screen</div>} />
        </Routes>
        <GuidedTourDialog />
      </HelpProvider>
    </MemoryRouter>
  );
}

describe("HelpCenter", () => {
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
    mockWindowOpen.mockReset();
    mockWindowOpen.mockReturnValue({});
    Object.defineProperty(window, "open", {
      writable: true,
      value: mockWindowOpen,
    });
    URL.createObjectURL = vi.fn(() => "blob:help-article");
    URL.revokeObjectURL = vi.fn();
  });

  test("renders the help centre and default article", async () => {
    renderHelpCenter();

    expect(await screen.findByText("Help Centre")).toBeInTheDocument();
    expect(screen.getAllByText("Getting Started with JoinerFlow").length).toBeGreaterThan(0);
  });

  test("search narrows the article list", async () => {
    renderHelpCenter();

    await userEvent.type(screen.getByPlaceholderText("Search help..."), "crew");

    expect(await screen.findByText("Crews, Capacity, and Install Duration Estimates")).toBeInTheDocument();
    expect(screen.queryByText("Leads and Contacts Workflow")).not.toBeInTheDocument();
  });

  test("clicking a help article opens the rendered HTML guide in a new tab", async () => {
    renderHelpCenter();

    const quoteArticleButtons = await screen.findAllByRole("button", { name: /quotes: create, price, and manage/i });
    await userEvent.click(quoteArticleButtons[0]);

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockWindowOpen).toHaveBeenCalledWith("blob:help-article", "_blank", "noopener,noreferrer");
  });

  test("guided tours can be launched from a help article", async () => {
    renderHelpCenter("/help?article=pricing-auto-inclusions");

    const startTourButtons = await screen.findAllByRole("button", { name: "Start tour" });
    await userEvent.click(startTourButtons[0]);

    expect(await screen.findByText("Every Job Additions")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  test("shows common tasks and hides advanced review content in beginner mode", async () => {
    renderHelpCenter();

    expect(await screen.findByText("Most Common Tasks")).toBeInTheDocument();
    expect(screen.getByText("Most Common Mistakes")).toBeInTheDocument();
    expect(screen.getByText("Recommended Next Steps")).toBeInTheDocument();
    expect(screen.getByText("Video Library")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search help..."), "Application Review");

    expect(screen.queryByText("Application Review: Guidance Gaps and UX Priorities")).not.toBeInTheDocument();
  });

  test("beginner mode can be switched off to show advanced guidance", async () => {
    renderHelpCenter();

    await userEvent.click(screen.getByRole("button", { name: /Beginner Mode On/i }));
    await userEvent.type(screen.getByPlaceholderText("Search help..."), "Application Review");

    expect(await screen.findByText("Application Review: Guidance Gaps and UX Priorities")).toBeInTheDocument();
  });

  test("video library search opens a Scribe-style walkthrough", async () => {
    renderHelpCenter();

    await userEvent.type(screen.getByPlaceholderText("Search help..."), "Mozaik");
    await userEvent.click(await screen.findByRole("button", { name: /Open video: Import Mozaik CSV/i }));

    expect(await screen.findByTestId("process-walkthrough")).toBeInTheDocument();
    expect(screen.getByText("Show Me How")).toBeInTheDocument();
    expect(screen.getByText(/walkthrough frame 1/i)).toBeInTheDocument();
  });

  test("guided tours can launch related walkthrough recordings", async () => {
    renderHelpCenter("/help?article=import-guide");

    const startTourButtons = await screen.findAllByRole("button", { name: "Start tour" });
    await userEvent.click(startTourButtons[0]);
    await userEvent.click(await screen.findByRole("button", { name: /Watch example/i }));

    expect(await screen.findByTestId("process-walkthrough")).toBeInTheDocument();
  });
});
