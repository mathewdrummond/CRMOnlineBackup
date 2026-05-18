import React from "react";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHelpContextForPath } from "@/lib/helpContent";
import { useHelp } from "@/lib/HelpContext";

export default function OnboardingHint({ pathname }) {
  const helpContext = getHelpContextForPath(pathname);
  const {
    onboardingEnabled,
    beginnerMode,
    isTipDismissed,
    dismissTip,
    skipOnboarding,
    startTour,
  } = useHelp();
  const tipId = helpContext ? `route:${helpContext.path}` : "";

  if (!helpContext || !onboardingEnabled || isTipDismissed(tipId)) {
    return null;
  }

  return (
    <div className="px-4 pt-3 lg:px-6">
      <div className="jf-help-banner flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{helpContext.label || "Help available"}</p>
            <p className="mt-1 text-sm opacity-80">
              {beginnerMode ? "Beginner Mode is on. " : ""}Use the guided tour or open Help when you want a plain-English walkthrough.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {helpContext.tourId ? (
            <Button type="button" size="sm" onClick={() => startTour(helpContext.tourId)}>
              Start tour
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={skipOnboarding}>
            Skip onboarding
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => dismissTip(tipId)}>
            <X className="mr-1.5 h-4 w-4" />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
