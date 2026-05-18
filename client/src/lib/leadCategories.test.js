import {
  getDefaultLeadCategory,
  getLeadCategoryForLead,
  validateLeadCategoryDrafts,
} from "./leadCategories";

describe("leadCategories helpers", () => {
  test("validateLeadCategoryDrafts rejects duplicate names", () => {
    const result = validateLeadCategoryDrafts([
      { id: "cat-1", name: "Kitchen", color: "amber", is_default: true },
      { id: "cat-2", name: " kitchen ", color: "blue", is_default: false },
    ]);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unique/i);
  });

  test("validateLeadCategoryDrafts assigns a default when one is missing", () => {
    const result = validateLeadCategoryDrafts([
      { id: "cat-1", name: "Kitchen", color: "amber", is_default: false },
      { id: "cat-2", name: "Wardrobe", color: "purple", is_default: false },
    ]);

    expect(result.valid).toBe(true);
    expect(result.categories[0].is_default).toBe(true);
    expect(result.categories[1].is_default).toBe(false);
  });

  test("getLeadCategoryForLead falls back to the default category", () => {
    const categories = [
      { id: "cat-general", name: "General enquiry", color: "blue", sort_order: 0, is_default: true },
      { id: "cat-kitchen", name: "Kitchen", color: "amber", sort_order: 1, is_default: false },
    ];

    expect(getDefaultLeadCategory(categories)?.id).toBe("cat-general");
    expect(getLeadCategoryForLead({ id: "lead-1", category_id: "" }, categories)).toEqual(
      expect.objectContaining({ id: "cat-general", name: "General enquiry" })
    );
  });
});
