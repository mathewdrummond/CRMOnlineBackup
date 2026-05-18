import { describe, expect, test } from "vitest";
import {
  ADD_PRICING_SECTION_VALUE,
  buildPricingSectionRecord,
  findMatchingPricingSection,
  isDuplicatePricingSectionName,
  normalisePricingSectionOptions,
  slugifyPricingSectionName,
} from "./pricingSections";

describe("pricing section helpers", () => {
  test("loads existing built-in and saved sections", () => {
    const options = normalisePricingSectionOptions([{ name: "Stone", key: "stone", display_order: 25 }]);
    expect(options.some((option) => option.value === "materials")).toBe(true);
    expect(options).toContainEqual({ value: "stone", label: "Stone", display_order: 25 });
  });

  test("builds a section record and blocks duplicates case-insensitively", () => {
    expect(slugifyPricingSectionName("Install Joinery")).toBe("install_joinery");
    expect(buildPricingSectionRecord("Install Joinery")).toMatchObject({
      name: "Install Joinery",
      key: "install_joinery",
      value: "install_joinery",
      is_active: true,
    });
    const options = normalisePricingSectionOptions([{ name: "Install Joinery", key: "install_joinery" }], []);
    expect(isDuplicatePricingSectionName(options, "install joinery")).toBe(true);
  });

  test("finds matching sections by normalized heading text", () => {
    const sections = [{ id: "1", name: "Add-Ons", key: "add_ons", value: "add_ons", is_active: true }];
    expect(findMatchingPricingSection(sections, "Add Ons")?.id).toBe("1");
  });

  test("exposes the add-section sentinel for dropdown flows", () => {
    expect(ADD_PRICING_SECTION_VALUE).toBe("__add_new_pricing_section__");
  });
});
