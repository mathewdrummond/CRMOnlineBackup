/* @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "./toaster";
import { toast } from "./use-toast";

describe("Toaster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test("dismisses a notification when the close button is clicked", async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Global inclusion updated" });
    });

    expect(screen.getByText("Global inclusion updated")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(screen.queryByText("Global inclusion updated")).toBeNull();
  });

  test("auto dismisses notifications after 10 seconds", async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Global inclusion added" });
    });

    expect(screen.getByText("Global inclusion added")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11000);
    });

    expect(screen.queryByText("Global inclusion added")).toBeNull();
  });
});
