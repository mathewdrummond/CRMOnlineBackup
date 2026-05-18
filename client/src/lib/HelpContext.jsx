import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { getHelpTour } from "@/lib/helpContent";
import {
  completeHelpTour,
  getBeginnerMode,
  getCompletedHelpTourIds,
  dismissHelpTip,
  getDismissedHelpTipIds,
  getOnboardingEnabled,
  getSkippedOnboarding,
  resetCompletedHelpTours,
  resetHelpTips,
  setBeginnerMode as persistBeginnerMode,
  setOnboardingEnabled as persistOnboardingEnabled,
  setSkippedOnboarding as persistSkippedOnboarding,
} from "@/lib/helpStorage";

const HelpContext = createContext(null);

export function HelpProvider({ children }) {
  const [activeTourId, setActiveTourId] = useState("");
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [userKey, setUserKey] = useState("local");
  const [dismissedTipIds, setDismissedTipIds] = useState(() => getDismissedHelpTipIds("local"));
  const [onboardingEnabled, setOnboardingEnabledState] = useState(() => getOnboardingEnabled("local"));
  const [completedTourIds, setCompletedTourIds] = useState(() => getCompletedHelpTourIds("local"));
  const [skippedOnboarding, setSkippedOnboardingState] = useState(() => getSkippedOnboarding("local"));
  const [beginnerMode, setBeginnerModeState] = useState(() => getBeginnerMode("local"));

  const activeTour = useMemo(() => getHelpTour(activeTourId), [activeTourId]);
  const activeStep = activeTour?.steps?.[activeStepIndex] || null;

  const setHelpUserKey = useCallback((nextUserKey = "local") => {
    const safeUserKey = String(nextUserKey || "local");
    setUserKey(safeUserKey);
    setDismissedTipIds(getDismissedHelpTipIds(safeUserKey));
    setOnboardingEnabledState(getOnboardingEnabled(safeUserKey));
    setCompletedTourIds(getCompletedHelpTourIds(safeUserKey));
    setSkippedOnboardingState(getSkippedOnboarding(safeUserKey));
    setBeginnerModeState(getBeginnerMode(safeUserKey));
  }, []);

  const startTour = useCallback((tourId, stepIndex = 0) => {
    const tour = getHelpTour(tourId);
    if (!tour) return false;
    const safeStepIndex = Math.max(0, Math.min(Number(stepIndex) || 0, tour.steps.length - 1));
    setActiveTourId(tourId);
    setActiveStepIndex(safeStepIndex);
    return true;
  }, []);

  const closeTour = useCallback(() => {
    setActiveTourId("");
    setActiveStepIndex(0);
  }, []);

  const nextStep = useCallback(() => {
    setActiveStepIndex((current) => {
      const tour = getHelpTour(activeTourId);
      if (!tour) return current;
      return Math.min(current + 1, tour.steps.length - 1);
    });
  }, [activeTourId]);

  const previousStep = useCallback(() => {
    setActiveStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goToStep = useCallback((index) => {
    const tour = getHelpTour(activeTourId);
    if (!tour) return;
    const nextIndex = Number(index);
    if (!Number.isFinite(nextIndex)) return;
    setActiveStepIndex(Math.max(0, Math.min(nextIndex, tour.steps.length - 1)));
  }, [activeTourId]);

  const isTipDismissed = useCallback((tipId) => dismissedTipIds.includes(tipId), [dismissedTipIds]);

  const dismissTip = useCallback((tipId) => {
    if (!tipId) return;
    setDismissedTipIds((current) => [...new Set([...current, tipId])]);
    dismissHelpTip(tipId, userKey);
  }, [userKey]);

  const isTourCompleted = useCallback((tourId) => completedTourIds.includes(tourId), [completedTourIds]);

  const completeTour = useCallback((tourId) => {
    if (!tourId) return;
    setCompletedTourIds((current) => [...new Set([...current, tourId])]);
    completeHelpTour(tourId, userKey);
  }, [userKey]);

  const showTipsAgain = useCallback(() => {
    setDismissedTipIds([]);
    setOnboardingEnabledState(true);
    setSkippedOnboardingState(false);
    resetHelpTips(userKey);
    persistOnboardingEnabled(true, userKey);
    persistSkippedOnboarding(false, userKey);
  }, [userKey]);

  const setOnboardingEnabled = useCallback((enabled) => {
    setOnboardingEnabledState(enabled === true);
    persistOnboardingEnabled(enabled, userKey);
  }, [userKey]);

  const setBeginnerMode = useCallback((enabled) => {
    setBeginnerModeState(enabled === true);
    persistBeginnerMode(enabled, userKey);
  }, [userKey]);

  const skipOnboarding = useCallback(() => {
    setSkippedOnboardingState(true);
    setOnboardingEnabledState(false);
    persistSkippedOnboarding(true, userKey);
    persistOnboardingEnabled(false, userKey);
  }, [userKey]);

  const restartGuidedTours = useCallback(() => {
    setCompletedTourIds([]);
    setSkippedOnboardingState(false);
    setOnboardingEnabledState(true);
    setBeginnerModeState(true);
    resetCompletedHelpTours(userKey);
    persistSkippedOnboarding(false, userKey);
    persistOnboardingEnabled(true, userKey);
    persistBeginnerMode(true, userKey);
  }, [userKey]);

  const value = useMemo(() => ({
    activeTour,
    activeStep,
    activeStepIndex,
    beginnerMode,
    completedTourIds,
    dismissedTipIds,
    onboardingEnabled,
    skippedOnboarding,
    userKey,
    setHelpUserKey,
    startTour,
    closeTour,
    nextStep,
    previousStep,
    goToStep,
    isTipDismissed,
    isTourCompleted,
    completeTour,
    dismissTip,
    showTipsAgain,
    setOnboardingEnabled,
    setBeginnerMode,
    skipOnboarding,
    restartGuidedTours,
  }), [activeStep, activeStepIndex, activeTour, beginnerMode, closeTour, completeTour, completedTourIds, dismissTip, dismissedTipIds, goToStep, isTipDismissed, isTourCompleted, nextStep, onboardingEnabled, previousStep, restartGuidedTours, setBeginnerMode, setHelpUserKey, setOnboardingEnabled, showTipsAgain, skipOnboarding, skippedOnboarding, startTour, userKey]);

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp() {
  const context = useContext(HelpContext);
  if (!context) {
    throw new Error("useHelp must be used inside HelpProvider.");
  }
  return context;
}
