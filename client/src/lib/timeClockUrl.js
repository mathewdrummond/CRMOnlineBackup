export const DEFAULT_TIMECLOCK_URL = "https://timeclock.millbrookfurniture.co.nz";

export function resolveTimeClockUrl({ configuredUrl = "", isDev = false, location } = {}) {
  const trimmedConfiguredUrl = String(configuredUrl || "").trim();
  if (trimmedConfiguredUrl) {
    return trimmedConfiguredUrl;
  }

  if (!isDev) {
    return DEFAULT_TIMECLOCK_URL;
  }

  if (!location) {
    return "http://127.0.0.1:5174/";
  }

  return `${location.protocol}//${location.hostname}:5174/`;
}
