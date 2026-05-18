import { formatCurrency, formatDate } from "@/lib/helpers";

export const REPORT_DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "custom", label: "Custom Range" },
];

export const REPORT_FILTER_KEYS = ["customer", "job", "staff", "status", "category", "source"];

function pad(value) {
  return String(value).padStart(2, "0");
}

export function toDateInputValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseReportDateValue(value);
  if (!date) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseReportDateValue(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [year, month, day] = rawValue.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseReportDateValue(value);
  if (!date) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseReportDateValue(value);
  if (!date) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfWeek(value) {
  const date = startOfDay(value);
  if (!date) {
    return null;
  }

  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return startOfDay(date);
}

function endOfWeek(value) {
  const date = startOfWeek(value);
  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + 6);
  return endOfDay(date);
}

function startOfMonth(value) {
  const date = startOfDay(value);
  if (!date) {
    return null;
  }

  date.setDate(1);
  return startOfDay(date);
}

function endOfMonth(value) {
  const date = startOfMonth(value);
  if (!date) {
    return null;
  }

  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return endOfDay(date);
}

function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseReportDateValue(value);
  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + amount);
  return date;
}

function addMonths(value, amount) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseReportDateValue(value);
  if (!date) {
    return null;
  }

  date.setMonth(date.getMonth() + amount);
  return date;
}

export function resolveDateRange(filters = {}, referenceDate = new Date()) {
  const preset = String(filters.datePreset || "this_month").trim() || "this_month";
  const today = startOfDay(referenceDate);
  if (!today) {
    return { start: null, end: null };
  }

  if (preset === "custom") {
    const start = filters.startDate ? startOfDay(filters.startDate) : null;
    const end = filters.endDate ? endOfDay(filters.endDate) : null;
    return { start, end };
  }

  if (preset === "today") {
    return { start: today, end: endOfDay(today) };
  }

  if (preset === "this_week") {
    return { start: startOfWeek(today), end: endOfWeek(today) };
  }

  if (preset === "last_month") {
    const previousMonth = addMonths(today, -1);
    return { start: startOfMonth(previousMonth), end: endOfMonth(previousMonth) };
  }

  if (preset === "last_90_days") {
    return { start: startOfDay(addDays(today, -89)), end: endOfDay(today) };
  }

  return { start: startOfMonth(today), end: endOfMonth(today) };
}

export function isDateWithinRange(value, range) {
  const date = parseReportDateValue(value);
  if (!date) {
    return false;
  }

  const start = range?.start ? startOfDay(range.start) : null;
  const end = range?.end ? endOfDay(range.end) : null;
  if (start && date < start) {
    return false;
  }
  if (end && date > end) {
    return false;
  }
  return true;
}

export function formatHours(value) {
  const hours = Number(value || 0);
  if (!Number.isFinite(hours)) {
    return "0h";
  }

  const rounded = Math.round(hours * 100) / 100;
  if (Number.isInteger(rounded)) {
    return `${rounded}h`;
  }

  const fixed = rounded >= 10 ? rounded.toFixed(1) : rounded.toFixed(2);
  return `${fixed.replace(/0+$/, "").replace(/\.$/, "")}h`;
}

export function formatPercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0%";
  }

  return `${numeric.toFixed(Math.abs(numeric) >= 10 ? 0 : 1).replace(/\.0$/, "")}%`;
}

export function prettifyReportValue(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "Unspecified";
  }

  return rawValue
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function dedupeSourceRecords(records = []) {
  const seen = new Set();
  return (records || []).filter((record) => {
    const key = `${record?.entity || ""}:${record?.id || ""}:${record?.label || record?.title || ""}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getFilterComparisonValue(row, filterKey) {
  if (filterKey === "customer") {
    return row.customer_key || row.customer || "";
  }
  if (filterKey === "job") {
    return row.job_id || row.job_label || "";
  }
  if (filterKey === "staff") {
    return row.staff_id || row.staff_name || "";
  }

  return row[filterKey] || "";
}

export function applyReportFilters(rows, filters = {}) {
  const dateRange = resolveDateRange(filters);

  return (rows || []).filter((row) => {
    if (dateRange.start || dateRange.end) {
      if (!isDateWithinRange(row.filter_date || row.date || row.created_date, dateRange)) {
        return false;
      }
    }

    return REPORT_FILTER_KEYS.every((filterKey) => {
      const expected = String(filters?.[filterKey] || "").trim();
      if (!expected) {
        return true;
      }

      return String(getFilterComparisonValue(row, filterKey) || "").trim() === expected;
    });
  });
}

function getGroupValueLabel(grouping, row) {
  const value = grouping?.getValue ? grouping.getValue(row) : row?.[grouping?.key];
  const normalizedValue = value == null || value === "" ? "__empty__" : String(value);
  const label = grouping?.getLabel
    ? grouping.getLabel(row, normalizedValue)
    : normalizedValue === "__empty__"
      ? "Unspecified"
      : prettifyReportValue(normalizedValue);

  return {
    value: normalizedValue,
    label,
  };
}

function average(values) {
  const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function distinctValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function readColumnValue(column, row) {
  if (typeof column?.getValue === "function") {
    return column.getValue(row);
  }

  return row?.[column?.key];
}

function defaultAggregateForColumn(column) {
  if (column?.type === "currency" || column?.type === "hours" || column?.type === "number") {
    return "sum";
  }
  if (column?.type === "percent") {
    return "avg";
  }
  if (column?.type === "date") {
    return "first";
  }

  return "distinct";
}

export function groupReportRows(rows, definition, groupingKey) {
  if (!groupingKey || groupingKey === "none") {
    return (rows || []).map((row) => ({
      ...row,
      is_grouped: false,
      group_count: row.group_count || 1,
      source_rows: row.source_rows || [row],
      source_records: dedupeSourceRecords(row.source_records || []),
    }));
  }

  const grouping = (definition?.groupings || []).find((candidate) => candidate.key === groupingKey);
  if (!grouping) {
    return groupReportRows(rows, definition, "none");
  }

  const groups = new Map();
  (rows || []).forEach((row) => {
    const { value, label } = getGroupValueLabel(grouping, row);
    const groupKey = `${groupingKey}:${value}`;
    const currentGroup = groups.get(groupKey) || {
      id: `group:${groupKey}`,
      group_key: groupingKey,
      group_value: value,
      group_label: label,
      is_grouped: true,
      group_count: 0,
      source_rows: [],
      source_records: [],
    };

    currentGroup.group_count += 1;
    currentGroup.source_rows.push(row);
    currentGroup.source_records.push(...(row.source_records || []));
    groups.set(groupKey, currentGroup);
  });

  return [...groups.values()].map((group) => {
    const groupedRow = {
      ...group,
      label: group.group_label,
      source_records: dedupeSourceRecords(group.source_records),
      filter_date: group.source_rows
        .map((row) => parseReportDateValue(row.filter_date || row.date || row.created_date))
        .filter(Boolean)
        .sort((left, right) => left.getTime() - right.getTime())[0]
        ? toDateInputValue(
            group.source_rows
              .map((row) => parseReportDateValue(row.filter_date || row.date || row.created_date))
              .filter(Boolean)
              .sort((left, right) => left.getTime() - right.getTime())[0]
          )
        : "",
    };

    (definition?.columns || []).forEach((column) => {
      const aggregate = column.aggregate || defaultAggregateForColumn(column);
      const values = group.source_rows.map((row) => readColumnValue(column, row));

      if (aggregate === "groupLabel") {
        groupedRow[column.key] = group.group_label;
        return;
      }

      if (aggregate === "count") {
        groupedRow[column.key] = group.group_count;
        return;
      }

      if (aggregate === "sum") {
        groupedRow[column.key] = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
        return;
      }

      if (aggregate === "avg") {
        groupedRow[column.key] = average(values);
        return;
      }

      if (typeof aggregate === "object" && aggregate?.type === "weightedPercent") {
        const numerator = group.source_rows.reduce((sum, row) => sum + (Number(row?.[aggregate.numerator] || 0)), 0);
        const denominator = group.source_rows.reduce((sum, row) => sum + (Number(row?.[aggregate.denominator] || 0)), 0);
        groupedRow[column.key] = denominator > 0 ? (numerator / denominator) * 100 : 0;
        return;
      }

      if (aggregate === "maxDate" || aggregate === "minDate") {
        const sortedDates = values
          .map((value) => parseReportDateValue(value))
          .filter(Boolean)
          .sort((left, right) => left.getTime() - right.getTime());
        groupedRow[column.key] = sortedDates.length > 0
          ? toDateInputValue(aggregate === "maxDate" ? sortedDates[sortedDates.length - 1] : sortedDates[0])
          : "";
        return;
      }

      if (aggregate === "first") {
        groupedRow[column.key] = values.find((value) => value != null && String(value).trim() !== "") || "";
        return;
      }

      const uniqueValues = distinctValues(values);
      if (uniqueValues.length <= 1) {
        groupedRow[column.key] = uniqueValues[0] || "";
        return;
      }

      groupedRow[column.key] = uniqueValues.length <= 3
        ? uniqueValues.join(", ")
        : `${uniqueValues.length} values`;
    });

    if (typeof definition?.finalizeGroupedRow === "function") {
      definition.finalizeGroupedRow(groupedRow, group.source_rows);
    }

    return groupedRow;
  });
}

function normalizeSortConfig(sort = {}, definition) {
  const fallbackColumn = (definition?.columns || []).find((column) => column.sortable !== false);
  return {
    column: sort?.column || fallbackColumn?.key || "label",
    direction: sort?.direction === "asc" ? "asc" : "desc",
  };
}

function compareValues(leftValue, rightValue) {
  const leftDate = parseReportDateValue(leftValue);
  const rightDate = parseReportDateValue(rightValue);
  if (leftDate && rightDate) {
    return leftDate.getTime() - rightDate.getTime();
  }

  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (String(leftValue ?? "").trim() !== "" && String(rightValue ?? "").trim() !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(leftValue || "").localeCompare(String(rightValue || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortReportRows(rows, definition, sort) {
  const normalizedSort = normalizeSortConfig(sort, definition);
  const column = (definition?.columns || []).find((candidate) => candidate.key === normalizedSort.column);

  return [...(rows || [])].sort((left, right) => {
    const result = compareValues(readColumnValue(column || { key: normalizedSort.column }, left), readColumnValue(column || { key: normalizedSort.column }, right));
    return normalizedSort.direction === "asc" ? result : -result;
  });
}

export function paginateRows(rows, page = 1, pageSize = 25) {
  const safePageSize = Math.max(1, Number(pageSize) || 25);
  const totalPages = Math.max(1, Math.ceil((rows?.length || 0) / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const startIndex = (safePage - 1) * safePageSize;

  return {
    rows: (rows || []).slice(startIndex, startIndex + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    totalRows: rows?.length || 0,
  };
}

export function buildFilterOptions(rows, definition) {
  const options = {};
  const supportedFilters = definition?.supportedFilters || {};

  if (supportedFilters.customer) {
    options.customer = [...new Map(
      (rows || [])
        .filter((row) => String(row.customer || "").trim())
        .map((row) => [String(row.customer_key || row.customer), {
          value: String(row.customer_key || row.customer),
          label: String(row.customer),
        }])
    ).values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }));
  }

  if (supportedFilters.job) {
    options.job = [...new Map(
      (rows || [])
        .filter((row) => String(row.job_label || "").trim())
        .map((row) => [String(row.job_id || row.job_label), {
          value: String(row.job_id || row.job_label),
          label: String(row.job_label),
        }])
    ).values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }));
  }

  if (supportedFilters.staff) {
    options.staff = [...new Map(
      (rows || [])
        .filter((row) => String(row.staff_name || "").trim())
        .map((row) => [String(row.staff_id || row.staff_name), {
          value: String(row.staff_id || row.staff_name),
          label: String(row.staff_name),
        }])
    ).values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }));
  }

  ["status", "category", "source"].forEach((filterKey) => {
    if (!supportedFilters[filterKey]) {
      return;
    }

    options[filterKey] = distinctValues((rows || []).map((row) => row[filterKey]))
      .map((value) => ({ value, label: prettifyReportValue(value) }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }));
  });

  return options;
}

function getOptionLabel(optionList = [], value) {
  return optionList.find((option) => option.value === value)?.label || prettifyReportValue(value);
}

export function buildActiveFilterBadges(filters = {}, filterOptions = {}) {
  const badges = [];
  const datePreset = String(filters.datePreset || "this_month");
  const dateLabel = REPORT_DATE_PRESETS.find((option) => option.value === datePreset)?.label || prettifyReportValue(datePreset);
  if (datePreset === "custom") {
    const customStart = filters.startDate ? formatDate(filters.startDate) : "Start";
    const customEnd = filters.endDate ? formatDate(filters.endDate) : "End";
    badges.push({ key: "datePreset", label: `Date: ${customStart} to ${customEnd}` });
  } else {
    badges.push({ key: "datePreset", label: `Date: ${dateLabel}` });
  }

  REPORT_FILTER_KEYS.forEach((filterKey) => {
    const value = String(filters?.[filterKey] || "").trim();
    if (!value) {
      return;
    }

    badges.push({
      key: filterKey,
      label: `${prettifyReportValue(filterKey)}: ${getOptionLabel(filterOptions?.[filterKey], value)}`,
    });
  });

  return badges;
}

export function readColumnText(column, row) {
  const value = readColumnValue(column, row);
  if (typeof column?.format === "function") {
    return column.format(value, row);
  }

  if (value == null || value === "") {
    return "—";
  }

  if (column?.type === "currency") {
    return formatCurrency(value);
  }
  if (column?.type === "hours") {
    return formatHours(value);
  }
  if (column?.type === "percent") {
    return formatPercent(value);
  }
  if (column?.type === "date") {
    return formatDate(value);
  }
  if (column?.type === "number") {
    return Number(value).toLocaleString("en-NZ");
  }
  if (column?.type === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

export function readColumnExportValue(column, row) {
  if (typeof column?.exportValue === "function") {
    return column.exportValue(row);
  }

  const value = readColumnValue(column, row);
  if (value == null) {
    return "";
  }

  if (["currency", "hours", "percent", "number"].includes(column?.type)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : "";
  }

  return column?.type === "date" ? formatDate(value) : value;
}

export function cloneReportFilters(filters = {}) {
  return {
    datePreset: filters.datePreset || "this_month",
    startDate: filters.startDate || "",
    endDate: filters.endDate || "",
    customer: filters.customer || "",
    job: filters.job || "",
    staff: filters.staff || "",
    status: filters.status || "",
    category: filters.category || "",
    source: filters.source || "",
  };
}
