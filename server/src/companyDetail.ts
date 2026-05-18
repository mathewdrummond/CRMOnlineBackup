import { getEntityRecord, listAuditLogRecords, listEntityRecords } from "./db";
import { RouteRequestError } from "./routeError";
import { AuditLogRecord, EntityRecord } from "./types";

function toText(value: unknown) {
  return String(value || "").trim();
}

function sortNewestFirst(left: Record<string, unknown>, right: Record<string, unknown>) {
  return String(right.created_date || right.updated_date || "").localeCompare(String(left.created_date || left.updated_date || ""));
}

function dedupeById(records: EntityRecord[]) {
  const map = new Map<string, EntityRecord>();
  records.forEach((record) => {
    const id = toText(record?.id);
    if (id) {
      map.set(id, record);
    }
  });
  return [...map.values()];
}

function listCompanyRelatedRecords(entity: string, companyId: string, companyName: string, limit = 200) {
  const byCompanyId = listEntityRecords(entity, {
    filters: { company_id: companyId },
    sort: "-created_date",
    limit,
  });
  const byCompanyName = companyName
    ? listEntityRecords(entity, {
      filters: { company_name: companyName },
      sort: "-created_date",
      limit,
    })
    : [];

  return dedupeById([...(Array.isArray(byCompanyId) ? byCompanyId : []), ...(Array.isArray(byCompanyName) ? byCompanyName : [])])
    .sort(sortNewestFirst);
}

function buildCompanyHistoryEvents(input: {
  notes: EntityRecord[];
  attachments: EntityRecord[];
  pricingItems: EntityRecord[];
  auditEntries: AuditLogRecord[];
}) {
  const noteEvents = input.notes.map((note) => ({
    id: `note-${note.id}`,
    type: "note",
    created_date: String(note.created_date || note.updated_date || ""),
    title: "Note added",
    description: String(note.content || "").trim(),
    href: "",
    source_entity: "Note",
    source_record_id: String(note.id || ""),
  }));

  const attachmentEvents = input.attachments.map((attachment) => ({
    id: `attachment-${attachment.id}`,
    type: "document",
    created_date: String(attachment.created_date || attachment.updated_date || ""),
    title: String(attachment.name || "Document"),
    description: "Supplier document uploaded",
    href: String(attachment.url || ""),
    source_entity: "Attachment",
    source_record_id: String(attachment.id || ""),
  }));

  const pricingItemEvents = input.pricingItems.map((item) => ({
    id: `pricing-item-${item.id}`,
    type: "pricing_item",
    created_date: String(item.updated_date || item.created_date || ""),
    title: String(item.product_number || item.supplier_sku ? `${item.product_number || item.supplier_sku} · ${item.name}` : item.name || "Pricing item"),
    description: "Supplier-linked pricing item",
    href: "/pricing",
    amount: Number(item.buy_price || 0),
    source_entity: "PricingItem",
    source_record_id: String(item.id || ""),
  }));

  const auditEvents = input.auditEntries.map((entry) => {
    const changedFields = Array.isArray(entry.summary?.changed_fields)
      ? entry.summary.changed_fields.map((field) => String(field || "").trim()).filter(Boolean)
      : [];
    const previousStatus = String(entry.previous_data?.status || "").trim();
    const nextStatus = String(entry.next_data?.status || "").trim();
    const statusChanged = changedFields.includes("status") && (previousStatus || nextStatus);

    return {
      id: `audit-${entry.id}`,
      type: statusChanged ? "status_change" : "company_change",
      created_date: String(entry.created_date || ""),
      title: entry.action === "create"
        ? "Supplier record created"
        : entry.action === "delete"
          ? "Supplier record deleted"
          : statusChanged
            ? "Supplier status updated"
            : "Supplier details updated",
      description: statusChanged
        ? [previousStatus ? `From ${previousStatus.replace(/_/g, " ")}` : "", nextStatus ? `to ${nextStatus.replace(/_/g, " ")}` : ""].filter(Boolean).join(" ")
        : changedFields.length > 0
          ? `Changed ${changedFields.slice(0, 4).map((field) => field.replace(/_/g, " ")).join(", ")}`
          : "Supplier record updated",
      href: "",
      status: nextStatus || previousStatus,
      actor_name: String(entry.actor_name || entry.actor_email || ""),
      source_entity: "AuditLog",
      source_record_id: String(entry.id || ""),
    };
  });

  return dedupeById([
    ...noteEvents,
    ...attachmentEvents,
    ...pricingItemEvents,
    ...auditEvents,
  ] as unknown as EntityRecord[])
    .sort(sortNewestFirst)
    .slice(0, 80);
}

export function getCompanyDetailBundle(companyId: string) {
  const company = getEntityRecord("Company", companyId);
  if (!company) {
    throw new RouteRequestError(404, "company_not_found", "Company not found.");
  }

  const companyName = toText(company.name);
  const contacts = listCompanyRelatedRecords("Contact", companyId, companyName, 300);
  const leads = listCompanyRelatedRecords("Lead", companyId, companyName, 300);
  const quotes = listCompanyRelatedRecords("Quote", companyId, companyName, 300);
  const jobs = listCompanyRelatedRecords("Job", companyId, companyName, 300);
  const notes = listEntityRecords("Note", {
    filters: { related_id: companyId, related_type: "company" },
    sort: "-created_date",
    limit: 200,
  });
  const attachments = listEntityRecords("Attachment", {
    filters: { related_id: companyId, related_type: "company" },
    sort: "-created_date",
    limit: 200,
  });
  const pricingItems = dedupeById([
    ...listEntityRecords("PricingItem", {
      filters: { supplier_id: companyId },
      sort: "-updated_date",
      limit: 200,
    }),
    ...(companyName
      ? listEntityRecords("PricingItem", {
        filters: { supplier: companyName },
        sort: "-updated_date",
        limit: 200,
      })
      : []),
  ]).sort(sortNewestFirst);
  const auditEntries = listAuditLogRecords({
    entity: "Company",
    record_id: companyId,
    limit: 40,
  });

  return {
    company,
    contacts,
    leads,
    quotes,
    jobs,
    notes,
    attachments,
    pricingItems,
    auditEntries,
    history: buildCompanyHistoryEvents({
      notes,
      attachments,
      pricingItems,
      auditEntries,
    }),
  };
}
