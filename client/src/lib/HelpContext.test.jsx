import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpProvider, useHelp } from "./HelpContext";

function HelpHarness() {
  const help = useHelp();
  const tipId = "route:/quotes";
  return (
    <div>
      <p>{help.isTipDismissed(tipId) ? "dismissed" : "visible"}</p>
      <p>{help.onboardingEnabled ? "tips on" : "tips off"}</p>
      <p>{help.beginnerMode ? "beginner on" : "beginner off"}</p>
      <p>{help.isTourCompleted("create-first-quote") ? "tour complete" : "tour incomplete"}</p>
      <button type="button" onClick={() => help.dismissTip(tipId)}>Dismiss</button>
      <button type="button" onClick={() => help.showTipsAgain()}>Show again</button>
      <button type="button" onClick={() => help.setOnboardingEnabled(false)}>Turn off</button>
      <button type="button" onClick={() => help.setBeginnerMode(false)}>Turn beginner off</button>
      <button type="button" onClick={() => help.completeTour("create-first-quote")}>Complete quote tour</button>
      <button type="button" onClick={() => help.restartGuidedTours()}>Restart all tours</button>
      <button type="button" onClick={() => help.startTour("create-first-quote")}>Start quote tour</button>
      <p>{help.activeTour?.title || "no tour"}</p>
    </div>
  );
}

describe("HelpContext onboarding state", () => {
  beforeEach(() => {
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
  });

  test("persists dismissed tips and can show tips again", async () => {
    const user = userEvent.setup();
    render(<HelpProvider><HelpHarness /></HelpProvider>);

    expect(screen.getByText("visible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByText("dismissed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show again" }));
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  test("guided tours can be restarted", async () => {
    const user = userEvent.setup();
    render(<HelpProvider><HelpHarness /></HelpProvider>);

    await user.click(screen.getByRole("button", { name: "Start quote tour" }));

    expect(screen.getByText("Create your first quote")).toBeInTheDocument();
  });

  test("persists completed tours and beginner mode can be restarted", async () => {
    const user = userEvent.setup();
    render(<HelpProvider><HelpHarness /></HelpProvider>);

    expect(screen.getByText("beginner on")).toBeInTheDocument();
    expect(screen.getByText("tour incomplete")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn beginner off" }));
    expect(screen.getByText("beginner off")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Complete quote tour" }));
    expect(screen.getByText("tour complete")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart all tours" }));
    expect(screen.getByText("beginner on")).toBeInTheDocument();
    expect(screen.getByText("tour incomplete")).toBeInTheDocument();
  });
});
