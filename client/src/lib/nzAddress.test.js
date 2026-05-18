import { describe, expect, test } from "vitest";
import { mapNzAddressSuggestionToFields } from "./nzAddress";

describe("mapNzAddressSuggestionToFields", () => {
  test("maps a typical NZ address suggestion into structured fields", () => {
    const suggestion = {
      display_name: "12 Queen Street, Auckland Central, Auckland, 1010, New Zealand",
      address: {
        house_number: "12",
        road: "Queen Street",
        suburb: "Auckland Central",
        city: "Auckland",
        state: "Auckland",
        postcode: "1010",
        country: "New Zealand",
      },
    };

    expect(mapNzAddressSuggestionToFields(suggestion)).toEqual({
      address: "12 Queen Street, Auckland Central",
      city: "Auckland",
      state: "Auckland",
      postal_code: "1010",
      country: "New Zealand",
      suburb: "Auckland Central",
      display_name: "12 Queen Street, Auckland Central, Auckland, 1010, New Zealand",
    });
  });

  test("falls back to display name when street parts are unavailable", () => {
    const suggestion = {
      display_name: "Warkworth, Auckland, New Zealand",
      address: {
        town: "Warkworth",
        state: "Auckland",
      },
    };

    expect(mapNzAddressSuggestionToFields(suggestion)).toMatchObject({
      address: "Warkworth, Auckland, New Zealand",
      city: "Warkworth",
      state: "Auckland",
      country: "New Zealand",
    });
  });
});
