import { AuthError } from "./auth";
import {
  createEntityRecord,
  deleteEntityRecord,
  EntityConflictError,
  getEntityRecord,
  listEntityRecords,
  runInTransaction,
  updateEntityRecord,
} from "./db";
import { EntityData, EntityRecord, MutationActor } from "./types";

type MutationOptions = {
  actor?: MutationActor | null;
  requestSource?: string;
  expectedRowVersion?: number | null;
  skipAudit?: boolean;
};

export const DEFAULT_LEAD_CATEGORIES = [
  {
    id: "lead-category-general",
    name: "General enquiry",
    key: "general_enquiry",
    color: "blue",
    sort_order: 0,
    is_default: true,
    is_active: true,
  },
  {
    id: "lead-category-kitchen",
    name: "Kitchen",
    key: "kitchen",
    color: "amber",
    sort_order: 1,
    is_default: false,
    is_active: true,
  },
  {
    id: "lead-category-wardrobe",
    name: "Wardrobe",
    key: "wardrobe",
    color: "purple",
    sort_order: 2,
    is_default: false,
    is_active: true,
  },
  {
    id: "lead-category-commercial",
    name: "Commercial",
    key: "commercial",
    color: "teal",
    sort_order: 3,
    is_default: false,
    is_active: true,
  },
];

const ALLOWED_CATEGORY_COLORS = new Set([
  "blue",
  "cyan",
  "purple",
  "pink",
  "orange",
  "amber",
  "teal",
  "emerald",
  "red",
  "slate",
  "green",
]);

function sortLeadCategories(records: EntityRecord[]) {
  return [...records].sort((left, right) => {
    const sortDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    if (sortDifference !== 0) {
      return sortDifference;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeColor(value: unknown) {
  const normalized = String(value || "slate").trim().toLowerCase();
  return ALLOWED_CATEGORY_COLORS.has(normalized) ? normalized : "slate";
}

export function slugifyLeadCategoryName(value: unknown) {
  const normalized = normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "general_enquiry";
}

export function listLeadCategories() {
  return sortLeadCategories(listEntityRecords("LeadCategory")).filter((record) => record.is_active !== false);
}

export function getDefaultLeadCategory(categories = listLeadCategories()) {
  return categories.find((category) => category.is_default === true) || categories[0] || null;
}

export function applyLeadCategoryDefaultsToLeadPayload(payload: EntityData) {
  const trimmedCategoryId = String(payload.category_id || "").trim();
  if (trimmedCategoryId) {
    return payload;
  }

  const defaultCategory = getDefaultLeadCategory();
  if (!defaultCategory) {
    return payload;
  }

  return {
    ...payload,
    category_id: defaultCategory.id,
  };
}

function normalizeLeadCategoryPayload(payload: EntityData, fallbackSortOrder = 0) {
  const name = normalizeName(payload.name);
  if (!name) {
    throw new AuthError(400, "lead_category_invalid", "Lead category name is required.");
  }

  const sortOrder = Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : fallbackSortOrder;

  return {
    ...payload,
    name,
    key: String(payload.key || slugifyLeadCategoryName(name)).trim() || slugifyLeadCategoryName(name),
    color: normalizeColor(payload.color),
    sort_order: sortOrder,
    is_default: payload.is_default === true,
    is_active: payload.is_active !== false,
  };
}

function clearOtherDefaultFlags(categoryId: string, options: MutationOptions = {}) {
  listLeadCategories()
    .filter((category) => category.id !== categoryId && category.is_default === true)
    .forEach((category) => {
      updateEntityRecord("LeadCategory", String(category.id), {
        is_default: false,
        row_version: category.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "lead-category-default-sync",
        expected_row_version: category.row_version,
        skip_audit: options.skipAudit,
      });
    });
}

function ensureLeadCategoryDefault(options: MutationOptions = {}) {
  const categories = listLeadCategories();
  if (categories.length === 0) {
    return;
  }

  const currentDefault = categories.find((category) => category.is_default === true);
  if (currentDefault) {
    clearOtherDefaultFlags(String(currentDefault.id), options);
    return;
  }

  const [firstCategory] = categories;
  updateEntityRecord("LeadCategory", String(firstCategory.id), {
    is_default: true,
    row_version: firstCategory.row_version,
  }, {
    actor: options.actor,
    request_source: options.requestSource || "lead-category-default-sync",
    expected_row_version: firstCategory.row_version,
    skip_audit: options.skipAudit,
  });
}

export function ensureLeadCategoryDefaults(options: MutationOptions = {}) {
  const existing = listLeadCategories();
  if (existing.length === 0) {
    DEFAULT_LEAD_CATEGORIES.forEach((category) => {
      createEntityRecord("LeadCategory", category, {
        actor: options.actor,
        request_source: options.requestSource || "lead-category-defaults",
        skip_audit: options.skipAudit,
      });
    });
  }

  ensureLeadCategoryDefault(options);
  ensureLeadCategoryAssignments(options);
}

export function ensureLeadCategoryAssignments(options: MutationOptions = {}) {
  const categories = listLeadCategories();
  const defaultCategory = getDefaultLeadCategory(categories);
  if (!defaultCategory) {
    return;
  }

  const validCategoryIds = new Set(categories.map((category) => String(category.id)));
  listEntityRecords("Lead").forEach((lead) => {
    const categoryId = String(lead.category_id || "").trim();
    if (categoryId && validCategoryIds.has(categoryId)) {
      return;
    }

    updateEntityRecord("Lead", String(lead.id), {
      category_id: defaultCategory.id,
      row_version: lead.row_version,
    }, {
      actor: options.actor,
      request_source: options.requestSource || "lead-category-backfill",
      expected_row_version: lead.row_version,
      skip_audit: options.skipAudit,
    });
  });
}

export function createLeadCategoryRecord(payload: EntityData, options: MutationOptions = {}): EntityRecord {
  const categories = listLeadCategories();
  const normalized = normalizeLeadCategoryPayload(payload, categories.length);
  const record = createEntityRecord("LeadCategory", normalized, {
    actor: options.actor,
    request_source: options.requestSource || "lead-category-create",
    skip_audit: options.skipAudit,
  });

  if (record.is_default) {
    clearOtherDefaultFlags(String(record.id), options);
  } else {
    ensureLeadCategoryDefault(options);
  }

  ensureLeadCategoryAssignments(options);

  const refreshedRecord = getEntityRecord("LeadCategory", String(record.id));
  if (!refreshedRecord) {
    throw new Error("Lead category was created but could not be reloaded.");
  }

  return refreshedRecord;
}

export function updateLeadCategoryRecord(id: string, payload: EntityData, options: MutationOptions = {}): EntityRecord | null {
  const existing = getEntityRecord("LeadCategory", id);
  if (!existing) {
    return null;
  }

  const normalized = normalizeLeadCategoryPayload({
    ...existing,
    ...payload,
  }, Number(existing.sort_order || 0));

  const record = updateEntityRecord("LeadCategory", id, {
    ...normalized,
    row_version:
      typeof options.expectedRowVersion === "number"
        ? options.expectedRowVersion
        : existing.row_version,
  }, {
    actor: options.actor,
    request_source: options.requestSource || "lead-category-update",
    expected_row_version:
      typeof options.expectedRowVersion === "number"
        ? options.expectedRowVersion
        : existing.row_version,
    skip_audit: options.skipAudit,
  });

  if (!record) {
    return null;
  }

  if (record.is_default) {
    clearOtherDefaultFlags(String(record.id), options);
  } else {
    ensureLeadCategoryDefault(options);
  }

  ensureLeadCategoryAssignments(options);
  return getEntityRecord("LeadCategory", String(record.id));
}

export function deleteLeadCategoryRecord(id: string, options: MutationOptions = {}) {
  return runInTransaction(() => {
    const existing = getEntityRecord("LeadCategory", id);
    if (!existing) {
      return false;
    }

    const expectedRowVersion =
      typeof options.expectedRowVersion === "number" && Number.isFinite(options.expectedRowVersion)
        ? options.expectedRowVersion
        : existing.row_version;

    if (expectedRowVersion !== existing.row_version) {
      throw new EntityConflictError("This record has changed since it was loaded. Refresh and try again.", existing);
    }

    const categories = listLeadCategories();
    if (categories.length <= 1) {
      throw new AuthError(400, "lead_category_invalid", "At least one lead category is required.");
    }

    const fallbackCategory =
      getDefaultLeadCategory(categories.filter((category) => String(category.id) !== id)) ||
      categories.find((category) => String(category.id) !== id) ||
      null;

    if (!fallbackCategory) {
      throw new AuthError(400, "lead_category_invalid", "A fallback lead category is required before deleting this category.");
    }

    listEntityRecords("Lead", { filters: { category_id: id } }).forEach((lead) => {
      updateEntityRecord("Lead", String(lead.id), {
        category_id: fallbackCategory.id,
        row_version: lead.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "lead-category-delete",
        expected_row_version: lead.row_version,
        skip_audit: options.skipAudit,
      });
    });

    const deleted = deleteEntityRecord("LeadCategory", id, {
      actor: options.actor,
      request_source: options.requestSource || "lead-category-delete",
      expected_row_version: expectedRowVersion,
      skip_audit: options.skipAudit,
    });

    if (!deleted) {
      return false;
    }

    const refreshedFallback = getEntityRecord("LeadCategory", String(fallbackCategory.id));
    if (refreshedFallback && (existing.is_default === true || refreshedFallback.is_default !== true)) {
      updateEntityRecord("LeadCategory", String(refreshedFallback.id), {
        is_default: true,
        row_version: refreshedFallback.row_version,
      }, {
        actor: options.actor,
        request_source: options.requestSource || "lead-category-delete",
        expected_row_version: refreshedFallback.row_version,
        skip_audit: options.skipAudit,
      });
    }

    ensureLeadCategoryDefault(options);
    ensureLeadCategoryAssignments(options);
    return true;
  });
}
