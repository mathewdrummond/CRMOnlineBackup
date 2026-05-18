export const LEAD_CATEGORY_COLOR_OPTIONS = [
  { value: "blue", label: "Blue" },
  { value: "cyan", label: "Cyan" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "orange", label: "Orange" },
  { value: "amber", label: "Amber" },
  { value: "teal", label: "Teal" },
  { value: "emerald", label: "Emerald" },
  { value: "red", label: "Red" },
  { value: "slate", label: "Slate" },
];

export function normalizeLeadCategoryName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyLeadCategoryName(value) {
  return normalizeLeadCategoryName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "general_enquiry";
}

export function sortLeadCategories(categories) {
  return [...(categories || [])].sort((left, right) => {
    const sortDifference = Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
    if (sortDifference !== 0) {
      return sortDifference;
    }

    return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function getDefaultLeadCategory(categories) {
  const sorted = sortLeadCategories(categories);
  return sorted.find((category) => category?.is_default === true) || sorted[0] || null;
}

export function getLeadCategoryById(categories, categoryId) {
  if (!categoryId) {
    return null;
  }

  return (categories || []).find((category) => category?.id === categoryId) || null;
}

export function getLeadCategoryForLead(lead, categories) {
  return (
    getLeadCategoryById(categories, lead?.category_id) ||
    getDefaultLeadCategory(categories) || {
      id: "",
      name: "Uncategorised",
      color: "slate",
      is_default: true,
    }
  );
}

export function createDraftLeadCategory(index = 0) {
  return {
    id: `draft-lead-category-${Date.now()}-${index}`,
    name: "",
    color: "slate",
    sort_order: index,
    is_default: index === 0,
    is_active: true,
    isNew: true,
  };
}

export function validateLeadCategoryDrafts(drafts) {
  const normalized = (drafts || []).map((draft, index) => ({
    ...draft,
    name: normalizeLeadCategoryName(draft?.name),
    key: slugifyLeadCategoryName(draft?.name),
    color: String(draft?.color || "slate"),
    sort_order: index,
    is_default: draft?.is_default === true,
    is_active: draft?.is_active !== false,
  }));

  if (normalized.length === 0) {
    return { valid: false, error: "At least one lead category is required.", categories: normalized };
  }

  if (normalized.some((category) => !category.name)) {
    return { valid: false, error: "Every lead category needs a name.", categories: normalized };
  }

  const names = new Set();
  for (const category of normalized) {
    const key = String(category.key || "").toLowerCase();
    if (names.has(key)) {
      return { valid: false, error: "Lead category names must be unique.", categories: normalized };
    }
    names.add(key);
  }

  let hasDefault = false;
  const categoriesWithDefault = normalized.map((category) => {
    if (category.is_default && !hasDefault) {
      hasDefault = true;
      return category;
    }

    return {
      ...category,
      is_default: false,
    };
  });

  if (!hasDefault && categoriesWithDefault.length > 0) {
    categoriesWithDefault[0] = {
      ...categoriesWithDefault[0],
      is_default: true,
    };
  }

  return {
    valid: true,
    error: "",
    categories: categoriesWithDefault,
  };
}
