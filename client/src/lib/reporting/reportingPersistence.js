import { crmApi } from "@/api/localApiClient";
import { cloneReportFilters } from "./reportingUtils";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeReportViewRecord(view) {
  if (!view) {
    return null;
  }

  return {
    ...view,
    filters: cloneReportFilters(view.filters || {}),
    sort: {
      column: String(view.sort?.column || "").trim(),
      direction: String(view.sort?.direction || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc",
    },
    visible_columns: ensureArray(view.visible_columns).map((value) => String(value || "").trim()).filter(Boolean),
    grouping: String(view.grouping || "none").trim() || "none",
    is_default: Boolean(view.is_default),
  };
}

export function buildReportViewPayload({ name, description, reportState }) {
  return {
    name: String(name || "").trim(),
    description: String(description || "").trim(),
    pack_key: String(reportState?.packKey || "").trim(),
    report_key: String(reportState?.reportKey || "").trim(),
    is_default: Boolean(reportState?.isDefault),
    filters: cloneReportFilters(reportState?.filters || {}),
    grouping: String(reportState?.grouping || "none").trim() || "none",
    sort: {
      column: String(reportState?.sort?.column || "").trim(),
      direction: String(reportState?.sort?.direction || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc",
    },
    visible_columns: ensureArray(reportState?.visibleColumns).map((value) => String(value || "").trim()).filter(Boolean),
  };
}

export function extractReportViewState(view) {
  const normalized = normalizeReportViewRecord(view);
  if (!normalized) {
    return null;
  }

  return {
    packKey: String(normalized.pack_key || "").trim(),
    reportKey: String(normalized.report_key || "").trim(),
    filters: cloneReportFilters(normalized.filters || {}),
    grouping: String(normalized.grouping || "none").trim() || "none",
    sort: {
      column: String(normalized.sort?.column || "").trim(),
      direction: String(normalized.sort?.direction || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc",
    },
    visibleColumns: ensureArray(normalized.visible_columns),
  };
}

export async function listReportViews(userId) {
  const filters = String(userId || "").trim() ? { user_id: String(userId).trim() } : {};
  const records = await crmApi.entities.ReportView.filter(filters, "name", 200);
  return ensureArray(records).map(normalizeReportViewRecord).filter(Boolean);
}

export async function createReportView(payload) {
  const created = await crmApi.entities.ReportView.create(payload);
  return normalizeReportViewRecord(created);
}

export async function updateReportView(viewId, payload) {
  const updated = await crmApi.entities.ReportView.update(viewId, payload);
  return normalizeReportViewRecord(updated);
}

export async function renameReportView(view, name) {
  return updateReportView(view.id, {
    name: String(name || "").trim(),
  });
}

export async function deleteReportView(viewId) {
  return crmApi.entities.ReportView.delete(viewId);
}

export async function setDefaultReportView(targetView, views = []) {
  const normalizedViews = ensureArray(views).map(normalizeReportViewRecord).filter(Boolean);
  const updates = normalizedViews
    .filter((view) => Boolean(view?.is_default) || String(view?.id || "") === String(targetView?.id || ""))
    .map((view) => updateReportView(view.id, {
      is_default: String(view.id) === String(targetView.id),
    }));

  const updatedViews = await Promise.all(updates);
  return updatedViews.find((view) => String(view?.id || "") === String(targetView?.id || "")) || null;
}
