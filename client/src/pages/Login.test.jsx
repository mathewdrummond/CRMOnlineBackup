import { describe, expect, test } from "vitest";
import { resolveTimeClockUrl } from "@/lib/timeClockUrl";

describe("resolveTimeClockUrl", () => {
  test("uses the Millbrook production timeclock URL when no override is configured outside dev", () => {
    expect(resolveTimeClockUrl({ isDev: false })).toBe("https://timeclock.millbrookfurniture.co.nz");
  });

  test("uses a configured timeclock URL before the production default", () => {
    expect(resolveTimeClockUrl({ configuredUrl: " https://clock.example.test/kiosk ", isDev: false })).toBe(
      "https://clock.example.test/kiosk"
    );
  });

  test("keeps the local timeclock port fallback in dev", () => {
    expect(
      resolveTimeClockUrl({
        isDev: true,
        location: {
          protocol: "http:",
          hostname: "joinerflow.local",
        },
      })
    ).toBe("http://joinerflow.local:5174/");
  });
});
