import { crmApi } from "@/api/localApiClient";

const OPERATIONS_DATA_TTL_MS = 60 * 1000;

const operationsCache = new Map();
const inflightOperationsLoads = new Map();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getModuleFlags(modules = {}) {
  return {
    leadsEnabled: Boolean(modules.leadsEnabled),
    quotesEnabled: Boolean(modules.quotesEnabled),
    contactsEnabled: Boolean(modules.contactsEnabled),
  };
}

function getCacheKey(flags) {
  return JSON.stringify(flags);
}

function buildEmptyOperationsSnapshot(flags) {
  return {
    leads: flags.leadsEnabled ? [] : [],
    jobs: [],
    quotes: flags.quotesEnabled ? [] : [],
    leadTasks: [],
    jobOperations: [],
    contactTasks: flags.contactsEnabled ? [] : [],
    contacts: flags.contactsEnabled ? [] : [],
    timeEntries: [],
    exportHistory: [],
    notes: [],
  };
}

export function getOperationsHubSnapshot(modules = {}) {
  const flags = getModuleFlags(modules);
  const cacheKey = getCacheKey(flags);
  const cached = operationsCache.get(cacheKey);
  return cached?.data || buildEmptyOperationsSnapshot(flags);
}

export async function loadOperationsHubData(modules = {}) {
  const flags = getModuleFlags(modules);
  const cacheKey = getCacheKey(flags);
  const cached = operationsCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < OPERATIONS_DATA_TTL_MS) {
    return { data: cached.data, failedLabels: [] };
  }

  if (inflightOperationsLoads.has(cacheKey)) {
    return inflightOperationsLoads.get(cacheKey);
  }

  const snapshot = buildEmptyOperationsSnapshot(flags);

  const request = crmApi.operations.getHub()
    .then((result) => {
      const nextData = {
        ...snapshot,
        ...result,
        leads: flags.leadsEnabled ? ensureArray(result?.leads) : [],
        jobs: ensureArray(result?.jobs),
        quotes: flags.quotesEnabled ? ensureArray(result?.quotes) : [],
        leadTasks: ensureArray(result?.leadTasks),
        jobOperations: ensureArray(result?.jobOperations),
        contactTasks: flags.contactsEnabled ? ensureArray(result?.contactTasks) : [],
        contacts: flags.contactsEnabled ? ensureArray(result?.contacts) : [],
        timeEntries: ensureArray(result?.timeEntries),
        exportHistory: ensureArray(result?.exportHistory),
        notes: ensureArray(result?.notes),
      };
      operationsCache.set(cacheKey, {
        loadedAt: Date.now(),
        data: nextData,
      });
      return { data: nextData, failedLabels: [] };
    })
    .catch(() => {
      const cachedData = operationsCache.get(cacheKey)?.data || snapshot;
      return { data: cachedData, failedLabels: ["operations hub"] };
    })
    .finally(() => {
      inflightOperationsLoads.delete(cacheKey);
    });

  inflightOperationsLoads.set(cacheKey, request);
  return request;
}
