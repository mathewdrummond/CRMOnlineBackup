import { crmApi } from "@/api/localApiClient";

const DATASET_CACHE_TTL_MS = 60 * 1000;
const datasetCache = new Map();
const inflightDatasetLoads = new Map();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getModuleFlags(modules = {}) {
  return {
    leadsEnabled: Boolean(modules.leadsEnabled),
    quotesEnabled: Boolean(modules.quotesEnabled),
    contactsEnabled: Boolean(modules.contactsEnabled),
    suppliersEnabled: Boolean(modules.suppliersEnabled),
  };
}

function getCacheKey(flags) {
  return JSON.stringify(flags);
}

function buildEmptyDatasetSnapshot(flags) {
  return {
    leads: flags.leadsEnabled ? [] : [],
    jobs: [],
    quotes: flags.quotesEnabled ? [] : [],
    timeEntries: [],
    jobOperations: [],
    staff: [],
    contacts: flags.contactsEnabled ? [] : [],
    companies: flags.contactsEnabled || flags.suppliersEnabled ? [] : [],
  };
}

export function getReportingDatasetSnapshot(modules = {}) {
  const flags = getModuleFlags(modules);
  const cacheKey = getCacheKey(flags);
  const cached = datasetCache.get(cacheKey);
  return cached?.data || buildEmptyDatasetSnapshot(flags);
}

export async function loadReportingDatasets(modules = {}) {
  const flags = getModuleFlags(modules);
  const cacheKey = getCacheKey(flags);
  const cached = datasetCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < DATASET_CACHE_TTL_MS) {
    return cached.data;
  }

  if (inflightDatasetLoads.has(cacheKey)) {
    return inflightDatasetLoads.get(cacheKey);
  }

  const snapshot = buildEmptyDatasetSnapshot(flags);

  const request = crmApi.reporting.getDatasets()
    .then((result) => {
      const nextData = {
        ...snapshot,
        ...result,
        leads: flags.leadsEnabled ? ensureArray(result?.leads) : [],
        jobs: ensureArray(result?.jobs),
        quotes: flags.quotesEnabled ? ensureArray(result?.quotes) : [],
        timeEntries: ensureArray(result?.timeEntries),
        jobOperations: ensureArray(result?.jobOperations),
        staff: ensureArray(result?.staff),
        contacts: flags.contactsEnabled ? ensureArray(result?.contacts) : [],
        companies: flags.contactsEnabled || flags.suppliersEnabled ? ensureArray(result?.companies) : [],
      };
      datasetCache.set(cacheKey, {
        loadedAt: Date.now(),
        data: nextData,
      });
      return nextData;
    })
    .finally(() => {
      inflightDatasetLoads.delete(cacheKey);
    });

  inflightDatasetLoads.set(cacheKey, request);
  return request;
}
