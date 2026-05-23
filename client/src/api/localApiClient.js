import { toast } from "@/components/ui/use-toast";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const APP_KIND = import.meta.env.VITE_APP_KIND || "crm";
const TEST_AUTH_ENABLED = import.meta.env.VITE_ENABLE_TEST_AUTH === "true";
const TEST_AUTH_API_BASE_URL = (import.meta.env.VITE_TEST_AUTH_API_BASE_URL || "").replace(/\/$/, "");
const TIMECLOCK_KIOSK_KEY = import.meta.env.VITE_TIMECLOCK_KIOSK_KEY || "";
const REQUEST_TIMEOUT_MS = 10000;
const ENTITY_CACHE_PREFIX = "crmApi-cache-entity:";
const MUTATION_QUEUE_KEY = "crmApi-mutation-queue";
const STATUS_KEY = "crmApi-api-status";
const USER_CACHE_KEY = "crmApi-auth-user";
const transientStorage = new Map();
const HEARTBEAT_INTERVAL_MS = 15000;

function canUseStorage() {
  return (
    typeof window !== "undefined"
    && typeof window.localStorage !== "undefined"
    && typeof window.localStorage?.getItem === "function"
    && typeof window.localStorage?.setItem === "function"
    && typeof window.localStorage?.removeItem === "function"
  );
}

function safeParse(json, fallback) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function readStorage(key, fallback) {
  if (!canUseStorage()) {
    return transientStorage.has(key) ? transientStorage.get(key) : fallback;
  }

  const localValue = safeParse(window.localStorage.getItem(key), undefined);
  if (localValue !== undefined) {
    return localValue;
  }

  return transientStorage.has(key) ? transientStorage.get(key) : fallback;
}

function writeStorage(key, value) {
  transientStorage.set(key, value);

  if (!canUseStorage()) {
    return true;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (String(error?.name || "") === "QuotaExceededError") {
      return false;
    }

    return false;
  }
}

function removeStorage(key) {
  transientStorage.delete(key);

  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(key);
}

function purgeLegacyContactCache() {
  if (!canUseStorage()) {
    return;
  }

  const contactCacheKey = getEntityCacheKey("Contact");
  const rawValue = window.localStorage.getItem(contactCacheKey);
  if (!rawValue) {
    return;
  }

  if (rawValue.includes("\"vcard_raw\"") || rawValue.length > 1024 * 1024) {
    window.localStorage.removeItem(contactCacheKey);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function createLocalId(prefix = "local") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function compareValues(leftValue, rightValue) {
  if (leftValue == null && rightValue == null) {
    return 0;
  }

  if (leftValue == null) {
    return 1;
  }

  if (rightValue == null) {
    return -1;
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "boolean" && typeof rightValue === "boolean") {
    return Number(leftValue) - Number(rightValue);
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function applyLocalQuery(records, { filters, sort, limit } = {}) {
  let nextRecords = Array.isArray(records) ? [...records] : [];

  if (filters && Object.keys(filters).length > 0) {
    nextRecords = nextRecords.filter((record) =>
      Object.entries(filters).every(([key, expected]) => {
        const actual = record?.[key];

        if (Array.isArray(expected)) {
          return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
        }

        return actual === expected;
      })
    );
  }

  if (sort) {
    const descending = String(sort).startsWith("-");
    const key = descending ? String(sort).slice(1) : String(sort);
    nextRecords.sort((left, right) => {
      const comparison = compareValues(left?.[key], right?.[key]);
      return descending ? -comparison : comparison;
    });
  }

  if (typeof limit === "number") {
    nextRecords = nextRecords.slice(0, limit);
  }

  return nextRecords;
}

function getEntityCacheKey(entityName) {
  return `${ENTITY_CACHE_PREFIX}${entityName}`;
}

function sanitiseRecordForCache(entityName, record) {
  if (!record || typeof record !== "object") {
    return record;
  }

  if (entityName === "Contact") {
    const {
      vcard_raw,
      vcard_fields,
      ...rest
    } = record;

    return {
      ...rest,
      vcard_has_raw: Boolean(vcard_raw),
      vcard_field_names: vcard_fields && typeof vcard_fields === "object" ? Object.keys(vcard_fields) : [],
    };
  }

  return record;
}

function readEntityCache(entityName) {
  return readStorage(getEntityCacheKey(entityName), []);
}

function writeEntityCache(entityName, records) {
  const preparedRecords = Array.isArray(records)
    ? records.map((record) => sanitiseRecordForCache(entityName, record))
    : [];

  const didPersist = writeStorage(getEntityCacheKey(entityName), preparedRecords);
  if (!didPersist) {
    transientStorage.set(getEntityCacheKey(entityName), preparedRecords);
  }
}

function upsertCachedRecords(entityName, incomingRecords) {
  if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) {
    return readEntityCache(entityName);
  }

  const currentRecords = readEntityCache(entityName);
  const merged = new Map(currentRecords.map((record) => [record.id, record]));

  incomingRecords.forEach((record) => {
    if (record?.id) {
      merged.set(record.id, record);
    }
  });

  const nextRecords = [...merged.values()];
  writeEntityCache(entityName, nextRecords);
  return nextRecords;
}

function upsertCachedRecord(entityName, record) {
  if (!record?.id) {
    return null;
  }

  upsertCachedRecords(entityName, [record]);
  return record;
}

function getCachedRecord(entityName, id) {
  return readEntityCache(entityName).find((record) => record.id === id) || null;
}

function removeCachedRecord(entityName, id) {
  const nextRecords = readEntityCache(entityName).filter((record) => record.id !== id);
  writeEntityCache(entityName, nextRecords);
}

function isConflictError(error) {
  return error?.status === 409 && String(error?.payload?.code || "") === "row_version_conflict";
}

function handleConflictError(entityName, error, options = {}) {
  const currentRecord = error?.payload?.current_record || null;
  if (currentRecord?.id) {
    upsertCachedRecord(entityName, currentRecord);
  }

  setApiStatus({
    lastError: error?.message || "This record changed on another screen.",
  });

  toast({
    variant: "destructive",
    title: "Record changed elsewhere",
    description:
      options.description ||
      `The latest ${entityName.toLowerCase()} has been reloaded. Please review it and try your change again.`,
  });

  return currentRecord;
}

const defaultApiStatus = {
  connected: true,
  queueCount: 0,
  lastError: "",
  lastSuccessfulAt: null,
};

let apiStatus = {
  ...defaultApiStatus,
  ...readStorage(STATUS_KEY, defaultApiStatus),
};

const statusListeners = new Set();

function emitApiStatus() {
  writeStorage(STATUS_KEY, apiStatus);
  statusListeners.forEach((listener) => listener(apiStatus));
}

function setApiStatus(patch) {
  apiStatus = {
    ...apiStatus,
    ...patch,
  };
  emitApiStatus();
}

function updateQueueCountStatus() {
  const queue = readMutationQueue();
  setApiStatus({
    queueCount: queue.length,
  });
}

export function subscribeApiStatus(listener) {
  statusListeners.add(listener);
  listener(apiStatus);

  return () => {
    statusListeners.delete(listener);
  };
}

export function getApiStatus() {
  return apiStatus;
}

function readMutationQueue() {
  return readStorage(MUTATION_QUEUE_KEY, []);
}

function writeMutationQueue(queue) {
  writeStorage(MUTATION_QUEUE_KEY, queue);
  setApiStatus({
    queueCount: queue.length,
  });
}

function makeOptimisticRecord(entityName, payload, id) {
  const timestamp = nowIso();
  return {
    ...payload,
    id: id || payload?.id || createLocalId(entityName.toLowerCase()),
    created_date: payload?.created_date || timestamp,
    updated_date: timestamp,
    row_version: Number(payload?.row_version || 1),
    _pending_sync: true,
  };
}

function enqueueMutation(nextItem) {
  const queue = readMutationQueue();
  const existingIndex = queue.findIndex(
    (item) => item.entity === nextItem.entity && item.recordId === nextItem.recordId
  );

  if (existingIndex >= 0) {
    const existingItem = queue[existingIndex];

    if (nextItem.type === "update" && existingItem.type === "create") {
      queue[existingIndex] = {
        ...existingItem,
        payload: {
          ...existingItem.payload,
          ...nextItem.payload,
        },
        queuedAt: nextItem.queuedAt,
      };
      writeMutationQueue(queue);
      return;
    }

    if (nextItem.type === "update" && existingItem.type === "update") {
      queue[existingIndex] = {
        ...existingItem,
        payload: {
          ...existingItem.payload,
          ...nextItem.payload,
        },
        queuedAt: nextItem.queuedAt,
      };
      writeMutationQueue(queue);
      return;
    }

    if (nextItem.type === "delete" && existingItem.type === "create") {
      queue.splice(existingIndex, 1);
      writeMutationQueue(queue);
      return;
    }

    if (nextItem.type === "delete") {
      queue.splice(existingIndex, 1, nextItem);
      writeMutationQueue(queue);
      return;
    }
  }

  queue.push(nextItem);
  writeMutationQueue(queue);
}

function isRecoverableRequestFailure(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("couldn't connect") ||
    message.includes("could not connect") ||
    message.includes("load failed") ||
    message.includes("aborted") ||
    message.includes("timeout")
  );
}

async function directTestAuthRequest(path, body) {
  const response = await fetch(`${TEST_AUTH_API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: buildRequestHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function request(path, options = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const {
    timeoutMs = REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs)
    : null;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: buildRequestHeaders(fetchOptions.headers || {}),
      ...fetchOptions,
      signal: fetchOptions.signal || controller?.signal,
    });

    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      let payload = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      const message =
        (payload && typeof payload.error === "string" && payload.error) ||
        text ||
        `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    setApiStatus({
      connected: true,
      lastError: "",
      lastSuccessfulAt: nowIso(),
    });

    if (!options.skipQueueFlush) {
      void flushQueuedMutations();
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  } catch (error) {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }

    if (isRecoverableRequestFailure(error)) {
      setApiStatus({
        connected: false,
        lastError: error instanceof Error ? error.message : "API unavailable",
      });
    }

    throw error;
  }
}

function parseContentDispositionFilename(headerValue) {
  const value = String(headerValue || "");
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const basicMatch = value.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || "";
}

async function requestBlob(path, options = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(new Error("Request timeout")), REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: buildRequestHeaders(options.headers || {}),
      ...options,
      signal: options.signal || controller?.signal,
    });

    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      let payload = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      const message =
        (payload && typeof payload.error === "string" && payload.error) ||
        text ||
        `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    setApiStatus({
      connected: true,
      lastError: "",
      lastSuccessfulAt: nowIso(),
    });

    const blob = await response.blob();
    return {
      blob,
      fileName: parseContentDispositionFilename(response.headers.get("content-disposition")),
      contentType: response.headers.get("content-type") || blob.type || "application/octet-stream",
    };
  } catch (error) {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }

    if (isRecoverableRequestFailure(error)) {
      setApiStatus({
        connected: false,
        lastError: error instanceof Error ? error.message : "API unavailable",
      });
    }

    throw error;
  }
}

function buildRequestHeaders(extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-CRM-App": APP_KIND,
    ...extraHeaders,
  };

  if (APP_KIND === "timeclock" && TIMECLOCK_KIOSK_KEY) {
    headers["X-Timeclock-Kiosk-Key"] = TIMECLOCK_KIOSK_KEY;
  }

  return headers;
}

function sanitizeRedirectPath(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return "/login";
  }

  return rawValue;
}

function buildDeleteRequestPath(basePath, rowVersion) {
  if (typeof rowVersion !== "number" || !Number.isFinite(rowVersion) || rowVersion <= 0) {
    return basePath;
  }

  const params = new URLSearchParams();
  params.set("row_version", String(rowVersion));
  return `${basePath}?${params.toString()}`;
}

function hasUsableRowVersion(record) {
  return typeof record?.row_version === "number" && Number.isSafeInteger(record.row_version) && record.row_version > 0;
}

function buildMissingRowVersionError(entityName, action) {
  const error = new Error(`Cannot ${action} ${entityName} while offline because the current row_version is unknown.`);
  error.status = 409;
  error.payload = {
    code: "row_version_required",
  };
  return error;
}

function assertPayloadRowVersion(entityName, payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "row_version") || hasUsableRowVersion(payload)) {
    return;
  }

  const error = new Error(`Cannot update ${entityName} because row_version must be a positive integer.`);
  error.status = 400;
  error.payload = {
    code: "invalid_entity_payload",
  };
  throw error;
}

async function resolveRecordForMutation(entityName, encodedEntity, id, cachedRecord, action) {
  if (hasUsableRowVersion(cachedRecord)) {
    return cachedRecord;
  }

  try {
    const latest = await request(`/api/entities/${encodedEntity}/${encodeURIComponent(id)}`, {
      skipQueueFlush: true,
    });
    upsertCachedRecord(entityName, latest);
    return latest;
  } catch (error) {
    if (isRecoverableRequestFailure(error)) {
      const rowVersionError = buildMissingRowVersionError(entityName, action);
      setApiStatus({
        connected: false,
        lastError: rowVersionError.message,
      });
      throw rowVersionError;
    }

    throw error;
  }
}

let flushingQueue = false;

async function flushQueuedMutations() {
  if (flushingQueue) {
    return;
  }

  const queue = readMutationQueue();
  if (queue.length === 0) {
    return;
  }

  flushingQueue = true;
  const remaining = [...queue];

  try {
    while (remaining.length > 0) {
      const item = remaining[0];
      const encodedEntity = encodeURIComponent(item.entity);

      if (item.type === "create") {
        const created = await request(`/api/entities/${encodedEntity}`, {
          method: "POST",
          body: JSON.stringify(item.payload),
          skipQueueFlush: true,
        });
        upsertCachedRecord(item.entity, { ...created, _pending_sync: false });
      } else if (item.type === "update") {
        try {
          const updated = await request(`/api/entities/${encodedEntity}/${encodeURIComponent(item.recordId)}`, {
            method: "PUT",
            body: JSON.stringify(item.payload),
            skipQueueFlush: true,
          });
          upsertCachedRecord(item.entity, { ...updated, _pending_sync: false });
        } catch (error) {
          if (isConflictError(error)) {
            handleConflictError(item.entity, error, {
              description: `A queued change for this ${item.entity.toLowerCase()} conflicted with a newer edit, so it was not applied automatically.`,
            });
            remaining.shift();
            writeMutationQueue(remaining);
            continue;
          }

          throw error;
        }
      } else if (item.type === "delete") {
        try {
          const deletePath = buildDeleteRequestPath(
            `/api/entities/${encodedEntity}/${encodeURIComponent(item.recordId)}`,
            item.payload?.row_version
          );
          await request(deletePath, {
            method: "DELETE",
            skipQueueFlush: true,
          });
          removeCachedRecord(item.entity, item.recordId);
        } catch (error) {
          if (isConflictError(error)) {
            handleConflictError(item.entity, error, {
              description: `A queued delete for this ${item.entity.toLowerCase()} conflicted with a newer edit, so the record was restored.`,
            });
            remaining.shift();
            writeMutationQueue(remaining);
            continue;
          }

          throw error;
        }
      }

      remaining.shift();
      writeMutationQueue(remaining);
    }
  } catch (error) {
    if (!isRecoverableRequestFailure(error)) {
      setApiStatus({
        lastError: error instanceof Error ? error.message : "Sync failed",
      });
    }
  } finally {
    flushingQueue = false;
    updateQueueCountStatus();
  }
}

async function heartbeatApi() {
  if (flushingQueue) {
    return;
  }

  if (apiStatus.connected && readMutationQueue().length === 0) {
    return;
  }

  try {
    await request("/health", { skipQueueFlush: true });
    await flushQueuedMutations();
  } catch {
    // Ignore heartbeat failures; status is already updated by request().
  }
}

let heartbeatIntervalId = null;
let apiRuntimeStartCount = 0;
let apiRuntimeCleanup = null;

function canUseWindowRuntime() {
  return typeof window !== "undefined" && typeof window.addEventListener === "function";
}

function clearApiHeartbeatInterval() {
  if (heartbeatIntervalId == null) {
    return;
  }

  globalThis.clearInterval(heartbeatIntervalId);
  heartbeatIntervalId = null;
}

function runApiHeartbeat() {
  void heartbeatApi();
}

export function startApiRuntime() {
  apiRuntimeStartCount += 1;
  if (apiRuntimeCleanup) {
    return apiRuntimeCleanup;
  }

  if (!canUseWindowRuntime()) {
    apiRuntimeCleanup = () => {
      apiRuntimeStartCount = Math.max(0, apiRuntimeStartCount - 1);
      if (apiRuntimeStartCount === 0) {
        apiRuntimeCleanup = null;
      }
    };
    return apiRuntimeCleanup;
  }

  purgeLegacyContactCache();

  const handleOnline = () => {
    runApiHeartbeat();
  };
  const handleFocus = () => {
    runApiHeartbeat();
  };
  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }
    runApiHeartbeat();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("focus", handleFocus);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  heartbeatIntervalId = globalThis.setInterval(runApiHeartbeat, HEARTBEAT_INTERVAL_MS);
  runApiHeartbeat();

  apiRuntimeCleanup = () => {
    apiRuntimeStartCount = Math.max(0, apiRuntimeStartCount - 1);
    if (apiRuntimeStartCount > 0) {
      return;
    }

    clearApiHeartbeatInterval();
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("focus", handleFocus);
    if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    apiRuntimeCleanup = null;
  };

  return apiRuntimeCleanup;
}

export function stopApiRuntime() {
  if (!apiRuntimeCleanup) {
    apiRuntimeStartCount = 0;
    clearApiHeartbeatInterval();
    return;
  }

  while (apiRuntimeCleanup) {
    apiRuntimeCleanup();
  }
}

function buildEntityClient(entityName) {
  const encodedEntity = encodeURIComponent(entityName);

  const queryEntities = async ({ filters, sort, limit } = {}) => {
    const params = new URLSearchParams();

    if (sort) {
      params.set("sort", sort);
    }

    if (typeof limit === "number") {
      params.set("limit", String(limit));
    }

    if (filters && Object.keys(filters).length > 0) {
      params.set("filters", JSON.stringify(filters));
    }

    const search = params.toString();

    try {
      const records = await request(`/api/entities/${encodedEntity}${search ? `?${search}` : ""}`);
      upsertCachedRecords(entityName, records);
      return records;
    } catch (error) {
      if (!isRecoverableRequestFailure(error)) {
        throw error;
      }

      return applyLocalQuery(readEntityCache(entityName), { filters, sort, limit });
    }
  };

  return {
    peek(sort, limit) {
      return applyLocalQuery(readEntityCache(entityName), { sort, limit });
    },
    peekFiltered(filters = {}, sort, limit) {
      return applyLocalQuery(readEntityCache(entityName), { filters, sort, limit });
    },
    list(sort, limit) {
      return queryEntities({ sort, limit });
    },
    filter(filters = {}, sort, limit) {
      return queryEntities({ filters, sort, limit });
    },
    async get(id) {
      try {
        const record = await request(`/api/entities/${encodedEntity}/${encodeURIComponent(id)}`);
        upsertCachedRecord(entityName, record);
        return record;
      } catch (error) {
        if (!isRecoverableRequestFailure(error)) {
          throw error;
        }

        return getCachedRecord(entityName, id);
      }
    },
    async create(data) {
      try {
        const created = await request(`/api/entities/${encodedEntity}`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        upsertCachedRecord(entityName, created);
        return created;
      } catch (error) {
        if (!isRecoverableRequestFailure(error)) {
          throw error;
        }

        const optimisticRecord = makeOptimisticRecord(entityName, data);
        upsertCachedRecord(entityName, optimisticRecord);
        enqueueMutation({
          type: "create",
          entity: entityName,
          recordId: optimisticRecord.id,
          payload: optimisticRecord,
          queuedAt: nowIso(),
        });
        return optimisticRecord;
      }
    },
    async update(id, data) {
      let existing = getCachedRecord(entityName, id) || { id };
      const payload = {
        ...(data || {}),
      };
      const callerProvidedRowVersion = Object.prototype.hasOwnProperty.call(payload, "row_version");
      assertPayloadRowVersion(entityName, payload);

      if (payload.row_version == null && typeof existing?.row_version === "number") {
        payload.row_version = existing.row_version;
      }

      if (!hasUsableRowVersion(payload)) {
        existing = await resolveRecordForMutation(entityName, encodedEntity, id, existing, "update");
        payload.row_version = existing.row_version;
      }

      try {
        const updated = await request(`/api/entities/${encodedEntity}/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        upsertCachedRecord(entityName, updated);
        return updated;
      } catch (error) {
        if (isConflictError(error)) {
          const currentRecord = error?.payload?.current_record || null;
          if (!callerProvidedRowVersion && hasUsableRowVersion(currentRecord)) {
            upsertCachedRecord(entityName, currentRecord);
            const retryPayload = {
              ...payload,
              row_version: currentRecord.row_version,
            };
            const updated = await request(`/api/entities/${encodedEntity}/${encodeURIComponent(id)}`, {
              method: "PUT",
              body: JSON.stringify(retryPayload),
            });
            upsertCachedRecord(entityName, updated);
            return updated;
          }

          handleConflictError(entityName, error);
          throw error;
        }

        if (!isRecoverableRequestFailure(error)) {
          throw error;
        }

        const optimisticRecord = {
          ...existing,
          ...payload,
          id,
          updated_date: nowIso(),
          row_version: Number(existing?.row_version || 0) + 1,
          _pending_sync: true,
        };
        upsertCachedRecord(entityName, optimisticRecord);
        enqueueMutation({
          type: "update",
          entity: entityName,
          recordId: id,
          payload,
          queuedAt: nowIso(),
        });
        return optimisticRecord;
      }
    },
    async delete(id) {
      const existing = await resolveRecordForMutation(
        entityName,
        encodedEntity,
        id,
        getCachedRecord(entityName, id) || { id },
        "delete"
      );
      const deletePath = buildDeleteRequestPath(
        `/api/entities/${encodedEntity}/${encodeURIComponent(id)}`,
        existing?.row_version
      );

      try {
        await request(deletePath, {
          method: "DELETE",
        });
        removeCachedRecord(entityName, id);
        return null;
      } catch (error) {
        if (isConflictError(error)) {
          handleConflictError(entityName, error, {
            description: `This ${entityName.toLowerCase()} changed before it could be deleted, so it has been refreshed instead.`,
          });
          throw error;
        }

        if (!isRecoverableRequestFailure(error)) {
          throw error;
        }

        removeCachedRecord(entityName, id);
        enqueueMutation({
          type: "delete",
          entity: entityName,
          recordId: id,
          payload: typeof existing?.row_version === "number"
            ? { row_version: existing.row_version }
            : {},
          queuedAt: nowIso(),
        });
        return null;
      }
    },
  };
}

const entities = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      return buildEntityClient(property);
    },
  }
);

export const crmApi = {
  entities,
  ai: {
    health() {
      return request("/api/ai/health");
    },
    search(data) {
      return request("/api/ai/search", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    similarJobs(jobId, data = {}) {
      return request("/api/ai/similar-jobs", {
        method: "POST",
        body: JSON.stringify({ ...data, job_id: jobId }),
      });
    },
    similarQuotes(quoteId, data = {}) {
      return request("/api/ai/similar-quotes", {
        method: "POST",
        body: JSON.stringify({ ...data, quote_id: quoteId }),
      });
    },
    quoteInsights(quoteId) {
      return request(`/api/ai/quote-insights/${encodeURIComponent(quoteId)}`);
    },
    quoteRiskAnalysis(quoteId) {
      return request(`/api/ai/quote-risk-analysis/${encodeURIComponent(quoteId)}`);
    },
    similarHistoricalJobs(quoteId, data = {}) {
      const params = new URLSearchParams();
      if (data.limit != null) params.set("limit", String(data.limit));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request(`/api/ai/similar-historical-jobs/${encodeURIComponent(quoteId)}${suffix}`);
    },
    generateDocumentDraft(data) {
      return request("/api/ai/document-drafts", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    knowledgeSearch(data) {
      return request("/api/ai/knowledge/search", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    unifiedSearch(data, options = {}) {
      return request("/api/search/unified", {
        method: "POST",
        body: JSON.stringify(data),
        timeoutMs: 120000,
        ...options,
      });
    },
    knowledgeStatus() {
      return request("/api/ai/knowledge/status");
    },
    knowledgeStats() {
      return request("/api/ai/knowledge/stats");
    },
    knowledgeRoots(options = {}) {
      return request("/api/ai/knowledge/roots", options);
    },
    browseKnowledgeFolders(params = {}, options = {}) {
      const search = new URLSearchParams();
      if (params.path) search.set("path", params.path);
      if (params.query) search.set("query", params.query);
      if (params.offset !== undefined) search.set("offset", String(params.offset));
      if (params.limit !== undefined) search.set("limit", String(params.limit));
      return request(`/api/ai/knowledge/browse?${search.toString()}`, options);
    },
    listKnowledgeSources() {
      return request("/api/ai/knowledge/sources");
    },
    createKnowledgeSource(data) {
      return request("/api/ai/knowledge/sources", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    updateKnowledgeSource(sourceId, data) {
      return request(`/api/ai/knowledge/sources/${encodeURIComponent(sourceId)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    deleteKnowledgeSource(sourceId) {
      return request(`/api/ai/knowledge/sources/${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
      });
    },
    reindexKnowledge(data = {}) {
      return request("/api/ai/knowledge/reindex", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    pauseKnowledge(paused) {
      return request("/api/ai/knowledge/pause", {
        method: "POST",
        body: JSON.stringify({ paused: Boolean(paused) }),
      });
    },
  },
  quotes: {
    duplicate(quoteId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/duplicate`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    listVersions(quoteId) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/versions`);
    },
    compareVersions(quoteId, compareQuoteId) {
      const search = new URLSearchParams({ compare_quote_id: compareQuoteId });
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/versions/compare?${search.toString()}`);
    },
    markPrimaryVersion(quoteId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/versions/primary`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    archiveVersion(quoteId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/versions/archive`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async convertToJob(quoteId, data) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/convert-to-job`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    getDocumentDraft(quoteId, documentType = "contract") {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/document-draft?document_type=${encodeURIComponent(documentType)}`);
    },
    previewDocument(quoteId, data) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/documents/preview`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    generateDocument(quoteId, data) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/documents/generate`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },
  documentTemplates: {
    list(params = {}) {
      const search = new URLSearchParams();
      if (params.type) search.set("type", params.type);
      return request(`/api/document-templates${search.toString() ? `?${search.toString()}` : ""}`);
    },
    get(id) {
      return request(`/api/document-templates/${encodeURIComponent(id)}`);
    },
    create(data) {
      return request("/api/document-templates", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    update(id, data) {
      return request(`/api/document-templates/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    duplicate(id) {
      return request(`/api/document-templates/${encodeURIComponent(id)}/duplicate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    publish(id) {
      return request(`/api/document-templates/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    importMozaik(data) {
      return request("/api/document-templates/import/mozaik", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    preview(id, data = {}) {
      return request(`/api/document-templates/${encodeURIComponent(id)}/preview`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    mergeFields() {
      return request("/api/document-templates/merge-fields");
    },
  },
  dashboard: {
    getOverview() {
      return request("/api/dashboard/overview");
    },
  },
  operations: {
    getHub() {
      return request("/api/operations/hub");
    },
  },
  installPlanner: {
    getEntries() {
      return request("/api/install-planner/entries");
    },
    saveEntry(data) {
      return request("/api/install-planner/entries", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    deleteEntry(data) {
      return request("/api/install-planner/entries", {
        method: "DELETE",
        body: JSON.stringify(data),
      });
    },
  },
  reporting: {
    getDatasets() {
      return request("/api/reporting/datasets");
    },
  },
  pricing: {
    importMozaikCsv(data) {
      return request("/api/pricing/imports/mozaik", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    stageQuoteImport(data) {
      return request("/api/pricing/quote-imports/stage", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    commitQuoteImport(importId, data = {}) {
      return request(`/api/pricing/quote-imports/${encodeURIComponent(importId)}/commit`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    updateQuoteImportLineItems(importId, data = {}) {
      return request(`/api/pricing/quote-imports/${encodeURIComponent(importId)}/update-line-items`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    deleteQuoteImport(importId) {
      return request(`/api/pricing/quote-imports/${encodeURIComponent(importId)}`, {
        method: "DELETE",
      });
    },
    calculate(data) {
      return request("/api/pricing/calculate", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    stagePriceListImport(data) {
      return request("/api/pricing/price-list-imports/stage", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    commitPriceListImport(importId, data = {}) {
      return request(`/api/pricing/price-list-imports/${encodeURIComponent(importId)}/commit`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    rollbackPriceListImport(importId) {
      return request(`/api/pricing/price-list-imports/${encodeURIComponent(importId)}/rollback`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    saveItemDefaults(data) {
      return request("/api/pricing/items/save-defaults", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    deactivateItem(itemId, data = {}) {
      return request(`/api/pricing/items/${encodeURIComponent(itemId)}/deactivate`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    saveItemAutoInclusions(itemId, data = {}) {
      return request(`/api/pricing/items/${encodeURIComponent(itemId)}/auto-inclusions`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    applyGlobalInclusions(quoteId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/global-inclusions/apply`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    confirmGlobalInclusion(quoteId, itemId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/items/${encodeURIComponent(itemId)}/confirm-global-inclusion`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    confirmTriggeredInclusion(quoteId, itemId) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/items/${encodeURIComponent(itemId)}/confirm-triggered-inclusion`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    confirmAllGlobalInclusions(quoteId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/global-inclusions/confirm-all`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    adjustQuoteMargins(quoteId, data = {}) {
      return request(`/api/quotes/${encodeURIComponent(quoteId)}/margin-adjustments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    mergeCategory(categoryId, data = {}) {
      return request(`/api/pricing/categories/${encodeURIComponent(categoryId)}/merge`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    deleteCategory(categoryId) {
      return request(`/api/pricing/categories/${encodeURIComponent(categoryId)}`, {
        method: "DELETE",
      });
    },
    mergeSection(sectionId, data = {}) {
      return request(`/api/pricing/sections/${encodeURIComponent(sectionId)}/merge`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    deleteSection(sectionId) {
      return request(`/api/pricing/sections/${encodeURIComponent(sectionId)}`, {
        method: "DELETE",
      });
    },
  },
  apiStatus: {
    subscribe: subscribeApiStatus,
    getSnapshot: getApiStatus,
    flushQueue: flushQueuedMutations,
  },
  runtime: {
    start: startApiRuntime,
    stop: stopApiRuntime,
  },
  addresses: {
    async search(query) {
      const params = new URLSearchParams();
      params.set("q", query);

      try {
        return await request(`/api/addresses/search?${params.toString()}`);
      } catch (error) {
        if (!isRecoverableRequestFailure(error)) {
          throw error;
        }

        return query
          ? [{ place_id: `manual-${query}`, display_name: query, lat: "", lon: "", address: {} }]
          : [];
      }
    },
  },
  filesystem: {
    create(data) {
      return request("/api/filesystem", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    delete(attachmentId) {
      return request(`/api/filesystem/${encodeURIComponent(attachmentId)}`, {
        method: "DELETE",
      });
    },
    listVersions(attachmentId) {
      return request(`/api/filesystem/${encodeURIComponent(attachmentId)}/versions`);
    },
    productionContentUrl(attachmentId, disposition = "inline") {
      const params = new URLSearchParams({ disposition });
      return `${API_BASE_URL}/api/timeclock/filesystem/${encodeURIComponent(attachmentId)}/content?${params.toString()}`;
    },
  },
  timeclock: {
    getHandoverData() {
      return request("/api/timeclock/handover-data");
    },
  },
  companies: {
    getDetail(id) {
      return request(`/api/companies/${encodeURIComponent(id)}/detail`);
    },
  },
  audit: {
    list(entityName, recordId, limit = 100) {
      const params = new URLSearchParams();
      if (typeof limit === "number" && limit > 0) {
        params.set("limit", String(limit));
      }
      const query = params.toString();
      return request(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(recordId)}/audit${query ? `?${query}` : ""}`);
    },
  },
  modules: {
    getConfig() {
      return request("/api/modules");
    },
    updateConfig(data) {
      return request("/api/modules", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
  },
  admin: {
    listAudit(filters = {}) {
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      });

      const query = params.toString();
      return request(`/api/admin/audit${query ? `?${query}` : ""}`);
    },
    getHealth() {
      return request("/api/admin/health");
    },
    listBackups() {
      return request("/api/admin/backups");
    },
    createBackup(data = {}) {
      return request("/api/admin/backups", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    importBackup(data) {
      return request("/api/admin/backups/import", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    restoreBackup(snapshotId) {
      return request(`/api/admin/backups/${encodeURIComponent(snapshotId)}/restore`, {
        method: "POST",
      });
    },
    deleteBackup(snapshotId) {
      return request(`/api/admin/backups/${encodeURIComponent(snapshotId)}`, {
        method: "DELETE",
      });
    },
    setBackupRetention(keepLatest) {
      return request("/api/admin/backups/retention", {
        method: "POST",
        body: JSON.stringify({ keep_latest: keepLatest }),
      });
    },
    setLogRetention(data) {
      return request("/api/admin/logs/retention", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    optimizeDatabase() {
      return request("/api/admin/maintenance/database/optimize", {
        method: "POST",
      });
    },
    repairTimeTracking() {
      return request("/api/admin/maintenance/time-tracking/repair", {
        method: "POST",
      });
    },
    reconcileFilesystem() {
      return request("/api/admin/maintenance/filesystem/reconcile", {
        method: "POST",
      });
    },
    downloadDiagnostics() {
      return requestBlob("/api/admin/diagnostics/download");
    },
    downloadLog(kind = "app") {
      return requestBlob(`/api/admin/logs/${encodeURIComponent(kind)}/download`);
    },
    downloadAudit(filters = {}, format = "csv") {
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      });

      params.set("format", format === "json" ? "json" : "csv");
      return requestBlob(`/api/admin/audit/export?${params.toString()}`);
    },
  },
  access: {
    listUsers() {
      return request("/api/access/users");
    },
    createUser(data) {
      return request("/api/access/users", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    updateUser(id, data) {
      return request(`/api/access/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    deleteUser(id) {
      return request(`/api/access/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  },
  auth: {
    getConfig() {
      return request("/api/auth/config");
    },
    async loginWithGoogle(credential) {
      const session = await request("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential }),
      });
      writeStorage(USER_CACHE_KEY, session.user || null);
      return session.user || null;
    },
    async loginAsTestUser(email, role = "admin") {
      if (!TEST_AUTH_ENABLED) {
        const error = new Error("Test sign-in is disabled in this build.");
        error.status = 403;
        error.payload = { code: "test_auth_disabled" };
        throw error;
      }
      const session = TEST_AUTH_API_BASE_URL
        ? await directTestAuthRequest("/api/test/session", { email, role })
        : await request("/api/test/session", {
            method: "POST",
            body: JSON.stringify({ email, role }),
          });
      writeStorage(USER_CACHE_KEY, session.user || null);
      return session.user || null;
    },
    async me() {
      if (APP_KIND === "timeclock") {
        return readStorage(USER_CACHE_KEY, {
          id: "timeclock-kiosk",
          full_name: "Time Clock",
          role: "kiosk",
          email: "",
        });
      }

      try {
        const user = await request("/api/auth/me");
        writeStorage(USER_CACHE_KEY, user);
        return user;
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          if (TEST_AUTH_ENABLED) {
            const cachedUser = readStorage(USER_CACHE_KEY, null);
            if (cachedUser) {
              return cachedUser;
            }
          }
          removeStorage(USER_CACHE_KEY);
          throw error;
        }

        if (!isRecoverableRequestFailure(error)) {
          throw error;
        }

        if (TEST_AUTH_ENABLED) {
          const cachedUser = readStorage(USER_CACHE_KEY, null);
          if (cachedUser) {
            return cachedUser;
          }
        }

        throw error;
      }
    },
    async logout(redirectUrl) {
      try {
        await request("/api/auth/logout", {
          method: "POST",
        });
      } catch {
        // Always clear local auth state on logout, even if the server is unavailable.
      }

      removeStorage(USER_CACHE_KEY);

      if (redirectUrl) {
        window.location.assign(sanitizeRedirectPath(redirectUrl));
      }
    },
    async redirectToLogin(redirectUrl) {
      if (redirectUrl) {
        window.location.assign(sanitizeRedirectPath(redirectUrl));
      }
    },
  },
};

setApiStatus({
  queueCount: readMutationQueue().length,
});
