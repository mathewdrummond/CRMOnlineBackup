const HELP_RECENT_KEY = "joinerflow-help-recent";
const HELP_VIEW_COUNT_KEY = "joinerflow-help-view-counts";
const HELP_DISMISSED_TIPS_KEY = "joinerflow-help-dismissed-tips";
const HELP_ONBOARDING_ENABLED_KEY = "joinerflow-help-onboarding-enabled";
const HELP_COMPLETED_TOURS_KEY = "joinerflow-help-completed-tours";
const HELP_SKIPPED_ONBOARDING_KEY = "joinerflow-help-skipped-onboarding";
const HELP_BEGINNER_MODE_KEY = "joinerflow-help-beginner-mode";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures in help tracking
  }
}

export function recordHelpArticleView(articleId) {
  if (!articleId) return;
  const recent = readJson(HELP_RECENT_KEY, []);
  const nextRecent = [articleId, ...recent.filter((value) => value !== articleId)].slice(0, 8);
  writeJson(HELP_RECENT_KEY, nextRecent);

  const counts = readJson(HELP_VIEW_COUNT_KEY, {});
  counts[articleId] = Number(counts[articleId] || 0) + 1;
  writeJson(HELP_VIEW_COUNT_KEY, counts);
}

export function getRecentHelpArticleIds() {
  return readJson(HELP_RECENT_KEY, []);
}

export function getHelpArticleViewCounts() {
  return readJson(HELP_VIEW_COUNT_KEY, {});
}

export function getDismissedHelpTipIds(userKey = "local") {
  const allDismissals = readJson(HELP_DISMISSED_TIPS_KEY, {});
  return Array.isArray(allDismissals[userKey]) ? allDismissals[userKey] : [];
}

export function dismissHelpTip(tipId, userKey = "local") {
  if (!tipId) return;
  const allDismissals = readJson(HELP_DISMISSED_TIPS_KEY, {});
  const current = Array.isArray(allDismissals[userKey]) ? allDismissals[userKey] : [];
  allDismissals[userKey] = [...new Set([...current, tipId])];
  writeJson(HELP_DISMISSED_TIPS_KEY, allDismissals);
}

export function resetHelpTips(userKey = "local") {
  const allDismissals = readJson(HELP_DISMISSED_TIPS_KEY, {});
  allDismissals[userKey] = [];
  writeJson(HELP_DISMISSED_TIPS_KEY, allDismissals);
}

export function getOnboardingEnabled(userKey = "local") {
  const values = readJson(HELP_ONBOARDING_ENABLED_KEY, {});
  return values[userKey] !== false;
}

export function setOnboardingEnabled(enabled, userKey = "local") {
  const values = readJson(HELP_ONBOARDING_ENABLED_KEY, {});
  values[userKey] = enabled === true;
  writeJson(HELP_ONBOARDING_ENABLED_KEY, values);
}

export function getCompletedHelpTourIds(userKey = "local") {
  const allCompleted = readJson(HELP_COMPLETED_TOURS_KEY, {});
  return Array.isArray(allCompleted[userKey]) ? allCompleted[userKey] : [];
}

export function completeHelpTour(tourId, userKey = "local") {
  if (!tourId) return;
  const allCompleted = readJson(HELP_COMPLETED_TOURS_KEY, {});
  const current = Array.isArray(allCompleted[userKey]) ? allCompleted[userKey] : [];
  allCompleted[userKey] = [...new Set([...current, tourId])];
  writeJson(HELP_COMPLETED_TOURS_KEY, allCompleted);
}

export function resetCompletedHelpTours(userKey = "local") {
  const allCompleted = readJson(HELP_COMPLETED_TOURS_KEY, {});
  allCompleted[userKey] = [];
  writeJson(HELP_COMPLETED_TOURS_KEY, allCompleted);
}

export function getSkippedOnboarding(userKey = "local") {
  const values = readJson(HELP_SKIPPED_ONBOARDING_KEY, {});
  return values[userKey] === true;
}

export function setSkippedOnboarding(skipped, userKey = "local") {
  const values = readJson(HELP_SKIPPED_ONBOARDING_KEY, {});
  values[userKey] = skipped === true;
  writeJson(HELP_SKIPPED_ONBOARDING_KEY, values);
}

export function getBeginnerMode(userKey = "local") {
  const values = readJson(HELP_BEGINNER_MODE_KEY, {});
  return values[userKey] !== false;
}

export function setBeginnerMode(enabled, userKey = "local") {
  const values = readJson(HELP_BEGINNER_MODE_KEY, {});
  values[userKey] = enabled === true;
  writeJson(HELP_BEGINNER_MODE_KEY, values);
}
