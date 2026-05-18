import { describe, expect, test } from "vitest";
import {
  ADD_PRICING_CATEGORY_VALUE,
  buildPricingCategoryRecord,
  isDuplicatePricingCategoryName,
  normalisePricingCategoryOptions,
  slugifyPricingCategoryName,
} from "./pricingCategories";

describe("pricing category helpers", () => {
  test("loads existing built-in and saved categories", () => {
    const options = normalisePricingCategoryOptions([{ name: "Delivery Allowance", key: "delivery_allowance" }]);

    expect(options.some((option) => option.value === "sheet_materials")).toBe(true);
    expect(options).toContainEqual({ value: "delivery_allowance", label: "Delivery Allowance" });
  });

  test("allows inactive saved categories to hide built-in dropdown options", () => {
    const options = normalisePricingCategoryOptions([{ name: "Hardware", key: "hardware", is_active: false }]);

    expect(options.some((option) => option.value === "hardware")).toBe(false);
  });

  test("builds a saved category record and select value from a new name", () => {
    expect(slugifyPricingCategoryName("Install Consumables")).toBe("install_consumables");
    expect(buildPricingCategoryRecord("Install Consumables")).toMatchObject({
      name: "Install Consumables",
      key: "install_consumables",
      value: "install_consumables",
      is_active: true,
    });
  });

  test("blocks duplicate categories case-insensitively", () => {
    const options = normalisePricingCategoryOptions([{ name: "Install Consumables", key: "install_consumables" }]);

    expect(isDuplicatePricingCategoryName(options, "install consumables")).toBe(true);
    expect(isDuplicatePricingCategoryName(options, "INSTALL-CONSUMABLES")).toBe(true);
    expect(isDuplicatePricingCategoryName(options, "Delivery Allowance")).toBe(false);
  });

  test("exposes the add-category sentinel for dropdown flows", () => {
    expect(ADD_PRICING_CATEGORY_VALUE).toBe("__add_new_pricing_category__");
  });
});
