import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContextHelpActions from "./ContextHelpActions";
import { HelpProvider } from "@/lib/HelpContext";

function HelpLocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderWithRoute(initialEntry) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[initialEntry]}>
      <HelpProvider>
        <Routes>
          <Route path="/leads" element={<ContextHelpActions />} />
          <Route path="/quotes/:id" element={<ContextHelpActions />} />
          <Route path="/pricing" element={<ContextHelpActions />} />
          <Route path="/help" element={<HelpLocationProbe />} />
        </Routes>
      </HelpProvider>
    </MemoryRouter>
  );
}

describe("ContextHelpActions", () => {
  test("opens the leads help article from the leads page", async () => {
    renderWithRoute("/leads");

    await userEvent.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByTestId("location-probe")).toHaveTextContent("/help?article=leads-and-contacts");
  });

  test("opens the quote workflow article from a quote detail page", async () => {
    renderWithRoute("/quotes/quote-1");

    await userEvent.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByTestId("location-probe")).toHaveTextContent("/help?article=quotes-workflow");
  });

  test("opens the related Show Me How recording from a workflow screen", async () => {
    renderWithRoute("/pricing");

    await userEvent.click(screen.getByRole("button", { name: /show me how/i }));

    expect(screen.getByTestId("location-probe")).toHaveTextContent("/help?recording=confirm-import");
  });
});
