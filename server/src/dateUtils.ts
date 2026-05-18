const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDate(value: Date | string | number = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

export function normalizeDateOnly(value: unknown) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  if (DATE_ONLY_PATTERN.test(rawValue)) {
    return rawValue;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return formatLocalDate(parsed);
}
