import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingHint from "./OnboardingHint";
import GuidedTourDialog from "./GuidedTourDialog";
import { HelpProvider } from "@/lib/HelpContext";

function renderHint(pathname = "/quotes") {
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

  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[pathname]}>
      <HelpProvider>
        <OnboardingHint pathname={pathname} />
        <GuidedTourDialog />
      </HelpProvider>
    </MemoryRouter>
  );
}

describe("OnboardingHint", () => {
  test("starts and advances the guided tour from the tip button", async () => {
    const user = userEvent.setup();
    renderHint("/quotes");

    await user.click(screen.getByRole("button", { name: /start tour/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Start from Quotes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next step" }));

    expect(screen.getByText("Create the quote shell")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Start from Quotes")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Skip tour" })[0]);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("dismisses the tip immediately", async () => {
    const user = userEvent.setup();
    renderHint("/quotes");

    expect(screen.getByText("Quotes help")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText("Quotes help")).not.toBeInTheDocument();
  });

  test("can skip onboarding tips from the hint", async () => {
    const user = userEvent.setup();
    renderHint("/quotes");

    await user.click(screen.getByRole("button", { name: /skip onboarding/i }));

    expect(screen.queryByText("Quotes help")).not.toBeInTheDocument();
  });
});
