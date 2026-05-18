import { crmApi } from "@/api/localApiClient";

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

function copyRecords(records) {
  return Array.isArray(records) ? [...records] : [];
}

function buildSearchData(jobs = [], quotes = [], contacts = [], leads = [], companies = []) {
  return {
    jobs: copyRecords(jobs),
    quotes: copyRecords(quotes),
    contacts: copyRecords(contacts),
    leads: copyRecords(leads),
    companies: copyRecords(companies),
  };
}

function buildShellCacheKey(options = {}) {
  return [
    options.contactsEnabled ? "1" : "0",
    options.leadsEnabled ? "1" : "0",
    options.quotesEnabled ? "1" : "0",
    options.suppliersEnabled ? "1" : "0",
  ].join(":");
}

function isEntryFresh(entry, ttlMs) {
  return Boolean(entry && Date.now() - Number(entry.updatedAt || 0) < ttlMs);
}

function cloneSearchData(data) {
  return buildSearchData(
    data?.jobs,
    data?.quotes,
    data?.contacts,
    data?.leads,
    data?.companies
  );
}

function buildSearchSnapshot(options = {}) {
  return buildSearchData(
    crmApi.entities.Job.peek("job_number", 400),
    options.quotesEnabled ? crmApi.entities.Quote.peek("-created_date", 400) : [],
    options.contactsEnabled ? crmApi.entities.Contact.peek("last_name", 600) : [],
    options.leadsEnabled ? crmApi.entities.Lead.peek("-created_date", 400) : [],
    options.contactsEnabled || options.suppliersEnabled ? crmApi.entities.Company.peek("name", 400) : []
  );
}

const searchDataCache = new Map();

export function getLayoutSearchSnapshot(options = {}) {
  return buildSearchSnapshot(options);
}

export function loadLayoutSearchData(options = {}, { force = false } = {}) {
  const cacheKey = buildShellCacheKey(options);
  const cachedEntry = searchDataCache.get(cacheKey);

  if (!force && isEntryFresh(cachedEntry, SEARCH_CACHE_TTL_MS)) {
    return Promise.resolve(cloneSearchData(cachedEntry.value));
  }

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  const fallbackValue = buildSearchSnapshot(options);
  const promise = Promise.all([
    crmApi.entities.Job.list("job_number", 400),
    options.quotesEnabled ? crmApi.entities.Quote.list("-created_date", 400) : Promise.resolve([]),
    options.contactsEnabled ? crmApi.entities.Contact.list("last_name", 600) : Promise.resolve([]),
    options.leadsEnabled ? crmApi.entities.Lead.list("-created_date", 400) : Promise.resolve([]),
    options.contactsEnabled || options.suppliersEnabled ? crmApi.entities.Company.list("name", 400) : Promise.resolve([]),
  ])
    .then(([jobs, quotes, contacts, leads, companies]) => {
      const value = buildSearchData(jobs, quotes, contacts, leads, companies);
      searchDataCache.set(cacheKey, {
        promise: null,
        updatedAt: Date.now(),
        value,
      });
      return cloneSearchData(value);
    })
    .catch(() => {
      searchDataCache.set(cacheKey, {
        promise: null,
        updatedAt: Date.now(),
        value: fallbackValue,
      });
      return cloneSearchData(fallbackValue);
    });

  searchDataCache.set(cacheKey, {
    promise,
    updatedAt: cachedEntry?.updatedAt || 0,
    value: cachedEntry?.value ?? fallbackValue,
  });

  return promise;
}

export function resetLayoutDataCache() {
  searchDataCache.clear();
}
