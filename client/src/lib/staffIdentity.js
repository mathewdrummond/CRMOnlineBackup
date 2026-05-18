function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function parseLegacyNameTokens(value) {
  return unique(
    String(value || "")
      .split(/[,;|•]+/)
      .map((item) => item.trim())
  );
}

function buildStaffMaps(staff = []) {
  const safeStaff = Array.isArray(staff) ? staff : [];
  const byId = new Map();
  const byEmployeeId = new Map();
  const byName = new Map();

  safeStaff.forEach((member) => {
    const id = normalizeString(member?.id);
    const employeeId = normalizeString(member?.employee_id);
    const name = normalizeString(member?.name || member?.staff_name);

    if (id) {
      byId.set(id, member);
    }
    if (employeeId) {
      byEmployeeId.set(normalizeKey(employeeId), member);
    }
    if (name) {
      byName.set(normalizeKey(name), member);
    }
  });

  return { byId, byEmployeeId, byName };
}

function parseAssignedStaffIds(value) {
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
    // Keep legacy plain-text compatibility.
  }

  return unique(trimmed.split(/[|;]/));
}

function resolveLegacyAssignedStaffIds(displayValue, staff = []) {
  const raw = normalizeString(displayValue);
  if (!raw) {
    return [];
  }

  const maps = buildStaffMaps(staff);
  const exactMatch = maps.byName.get(normalizeKey(raw));
  if (exactMatch?.id) {
    return [exactMatch.id];
  }

  const normalizedRaw = raw.toLowerCase();
  const matchedIds = [];
  [...maps.byName.entries()]
    .sort((left, right) => right[0].length - left[0].length)
    .forEach(([normalizedName, member]) => {
      if (!member?.id || !normalizedRaw.includes(normalizedName)) {
        return;
      }
      matchedIds.push(member.id);
    });

  if (matchedIds.length > 0) {
    return unique(matchedIds);
  }

  return parseLegacyNameTokens(raw)
    .map((token) => maps.byName.get(normalizeKey(token))?.id || "")
    .filter(Boolean);
}

export function resolveAssignedStaffIds({ assignedStaffIds, assignedTo, staff = [] } = {}) {
  const explicitIds = parseAssignedStaffIds(assignedStaffIds);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  return resolveLegacyAssignedStaffIds(assignedTo, staff);
}

export function getAssignedStaffMembers({ assignedStaffIds, assignedTo, staff = [] } = {}) {
  const maps = buildStaffMaps(staff);
  return resolveAssignedStaffIds({ assignedStaffIds, assignedTo, staff })
    .map((staffId) => maps.byId.get(staffId))
    .filter(Boolean);
}

export function buildAssignedStaffDisplay(staffIds = [], staff = [], fallbackDisplay = "") {
  const maps = buildStaffMaps(staff);
  const labels = unique(
    staffIds
      .map((staffId) => maps.byId.get(normalizeString(staffId))?.name || "")
  );

  if (labels.length > 0) {
    return labels.join(" • ");
  }

  return normalizeString(fallbackDisplay);
}

export function resolveLaneStaffMember(lane, staff = []) {
  const maps = buildStaffMaps(staff);
  const directMatch = maps.byId.get(normalizeString(lane?.staff_id));
  if (directMatch) {
    return directMatch;
  }

  return maps.byName.get(normalizeKey(lane?.staff_name));
}

export function normalizeScheduleLaneStaff(lane, staff = []) {
  const member = resolveLaneStaffMember(lane, staff);
  if (!member) {
    return {
      staff_id: normalizeString(lane?.staff_id),
      staff_name: normalizeString(lane?.staff_name),
    };
  }

  return {
    staff_id: normalizeString(member.id),
    staff_name: normalizeString(member.name || lane?.staff_name),
  };
}

export function getStaffDisplayNameById(staffId, staff = [], fallback = "") {
  const member = buildStaffMaps(staff).byId.get(normalizeString(staffId));
  return normalizeString(member?.name || fallback);
}
