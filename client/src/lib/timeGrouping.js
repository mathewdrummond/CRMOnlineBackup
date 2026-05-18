function normalizeGroupingValue(value) {
  return String(value ?? "").trim();
}

function normalizeGroupingKeyPart(value) {
  return normalizeGroupingValue(value).toLowerCase();
}

function buildGroupingKey(parts) {
  return parts.map(normalizeGroupingKeyPart).join("\u001f");
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function roundValue(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function groupTimesheetDisplayEntries(entries = [], options = {}) {
  const getActivityLabel = typeof options.getActivityLabel === "function"
    ? options.getActivityLabel
    : (entry) => entry.activity || entry.operation || "";
  const getJobLabel = typeof options.getJobLabel === "function"
    ? options.getJobLabel
    : (entry) => entry.job_title || entry.job_name || "";
  const groups = new Map();

  entries.forEach((entry) => {
    const activityLabel = normalizeGroupingValue(getActivityLabel(entry));
    const jobLabel = normalizeGroupingValue(getJobLabel(entry));
    const notes = normalizeGroupingValue(entry.description || entry.notes);
    const sourceId = normalizeGroupingValue(entry.id);
    const key = buildGroupingKey([
      entry.staff_id,
      entry.staff_name,
      entry.date,
      entry.job_id,
      entry.job_number,
      jobLabel,
      activityLabel,
      notes,
      entry.exported ? "exported" : "pending",
    ]);
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        ...entry,
        id: sourceId || key,
        source_ids: sourceId ? [sourceId] : [],
        entry_count: 1,
        activity_label: activityLabel,
        job_label: jobLabel,
        notes,
        description: notes,
        hours: roundValue(entry.hours || 0),
        total_cost: Number(entry.total_cost || 0),
      });
      return;
    }

    current.source_ids = unique([...current.source_ids, sourceId]);
    current.entry_count += 1;
    current.hours = roundValue(current.hours + Number(entry.hours || 0));
    current.total_cost += Number(entry.total_cost || 0);
    if (!current.job_number && entry.job_number) current.job_number = entry.job_number;
    if (!current.job_id && entry.job_id) current.job_id = entry.job_id;
    if (!current.job_label && jobLabel) current.job_label = jobLabel;
    if (!current.activity_label && activityLabel) current.activity_label = activityLabel;
    if (!current.notes && notes) current.notes = notes;
    if (!current.description && notes) current.description = notes;
  });

  return [...groups.values()];
}

export function groupActivitySlipExportRecords(records = []) {
  const groups = new Map();

  records.forEach((record) => {
    const sourceId = normalizeGroupingValue(record.source_id || record.id);
    const key = buildGroupingKey([
      record.staff_name,
      record.employee_id,
      record.customer_name,
      record.customer,
      record.first_name,
      record.date,
      record.activity,
      record.job_number,
      record.job_name,
      record.notes,
    ]);
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        ...record,
        id: sourceId || key,
        source_id: sourceId || key,
        source_ids: sourceId ? [sourceId] : [],
        source_count: 1,
        units: roundValue(record.units || 0),
      });
      return;
    }

    current.source_ids = unique([...current.source_ids, sourceId]);
    current.source_count += 1;
    current.units = roundValue(current.units + Number(record.units || 0));
    if (!current.customer_name && record.customer_name) current.customer_name = record.customer_name;
    if (!current.customer && record.customer) current.customer = record.customer;
    if (!current.job_name && record.job_name) current.job_name = record.job_name;
  });

  return [...groups.values()]
    .map((record) => {
      const sourceIds = unique(record.source_ids);
      const groupedId = sourceIds.length === 1 ? sourceIds[0] : `group:${sourceIds.join("|")}`;

      return {
        ...record,
        id: groupedId,
        source_id: groupedId,
        source_ids: sourceIds,
        source_count: sourceIds.length,
        source_type: sourceIds.length > 1 ? "TimeEntryGroup" : record.source_type,
      };
    })
    .sort((left, right) => {
      const dateComparison = String(right.date || "").localeCompare(String(left.date || ""));
      if (dateComparison !== 0) return dateComparison;

      const customerComparison = String(left.customer_name || "").localeCompare(String(right.customer_name || ""));
      if (customerComparison !== 0) return customerComparison;

      const jobComparison = String(left.job_number || "").localeCompare(String(right.job_number || ""));
      if (jobComparison !== 0) return jobComparison;

      const notesComparison = String(left.notes || "").localeCompare(String(right.notes || ""));
      if (notesComparison !== 0) return notesComparison;

      return String(left.id || "").localeCompare(String(right.id || ""));
    });
}
