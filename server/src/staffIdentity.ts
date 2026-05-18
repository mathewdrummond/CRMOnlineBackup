import { EntityRecord } from "./types";

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

function normalizeKey(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function unique(values: unknown[]) {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

export function buildStaffLookup(staffRecords: EntityRecord[] = []) {
  const byId = new Map<string, EntityRecord>();
  const byEmployeeId = new Map<string, EntityRecord>();
  const byName = new Map<string, EntityRecord>();

  staffRecords.forEach((record) => {
    const id = normalizeString(record.id);
    const employeeId = normalizeString(record.employee_id);
    const name = normalizeString(record.name || record.staff_name);

    if (id) {
      byId.set(id, record);
    }
    if (employeeId) {
      byEmployeeId.set(normalizeKey(employeeId), record);
    }
    if (name) {
      byName.set(normalizeKey(name), record);
    }
  });

  return { byId, byEmployeeId, byName };
}

export function parseAssignedStaffIds(value: unknown) {
  if (Array.isArray(value)) {
    return unique(value);
  }

  const trimmed = normalizeString(value);
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return unique(parsed);
    }
  } catch {
    // Legacy string value.
  }

  return unique(trimmed.split(/[|;]/));
}

export function resolveLegacyAssignedStaffIds(value: unknown, staffRecords: EntityRecord[] = []) {
  const raw = normalizeString(value);
  if (!raw) {
    return [];
  }

  const { byName } = buildStaffLookup(staffRecords);
  const directMatch = byName.get(normalizeKey(raw));
  if (directMatch?.id) {
    return [normalizeString(directMatch.id)];
  }

  const normalizedRaw = raw.toLowerCase();
  const matchedIds = [...byName.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .filter(([name]) => normalizedRaw.includes(name))
    .map(([, member]) => normalizeString(member.id))
    .filter(Boolean);

  if (matchedIds.length > 0) {
    return unique(matchedIds);
  }

  return unique(
    raw
      .split(/[,;|•]+/)
      .map((token) => byName.get(normalizeKey(token))?.id || "")
  );
}

export function resolveAssignedStaffIds(record: Record<string, unknown>, staffRecords: EntityRecord[] = []) {
  const explicitIds = parseAssignedStaffIds(record.assigned_staff_ids);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  return resolveLegacyAssignedStaffIds(record.assigned_to, staffRecords);
}

export function buildAssignedStaffDisplay(staffIds: string[], staffRecords: EntityRecord[] = [], fallback = "") {
  const { byId } = buildStaffLookup(staffRecords);
  const labels = unique(staffIds.map((staffId) => byId.get(normalizeString(staffId))?.name || ""));
  return labels.length > 0 ? labels.join(" • ") : normalizeString(fallback);
}

export function resolveLaneStaffRecord(lane: Record<string, unknown>, staffRecords: EntityRecord[] = []) {
  const lookup = buildStaffLookup(staffRecords);
  return lookup.byId.get(normalizeString(lane.staff_id)) || lookup.byName.get(normalizeKey(lane.staff_name)) || null;
}
