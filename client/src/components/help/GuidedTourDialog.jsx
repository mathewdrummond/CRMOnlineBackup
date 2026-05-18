import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHelp } from "@/lib/HelpContext";
import ProcessWalkthrough from "@/components/help/ProcessWalkthrough";
import { getRecordingForTour } from "@/lib/helpRecordings";

export default function GuidedTourDialog() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeTour,
    activeStep,
    activeStepIndex,
    closeTour,
    completeTour,
    previousStep,
    nextStep,
  } = useHelp();
  const [showRecording, setShowRecording] = useState(false);

  const open = Boolean(activeTour && activeStep);
  const isLastStep = open ? activeStepIndex >= activeTour.steps.length - 1 : true;
  const activeRecording = useMemo(() => (activeTour ? getRecordingForTour(activeTour.id) : null), [activeTour]);

  const goToNext = () => {
    if (!activeTour || !activeStep) return;
    if (isLastStep) {
      completeTour(activeTour.id);
      closeTour();
      return;
    }
    const next = activeTour.steps[activeStepIndex + 1];
    nextStep();
    if (next?.route && location.pathname !== next.route) {
      navigate(next.route);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeTour()}>
      <DialogContent className="jf-reference-panel jf-guided-tour-dialog grid max-h-[min(720px,calc(100dvh-5rem))] max-w-xl grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Guided tour</Badge>
            {activeTour ? <span className="text-xs text-muted-foreground">Step {activeStepIndex + 1} of {activeTour.steps.length}</span> : null}
          </div>
          <DialogTitle>{activeStep?.title || activeTour?.title || "Guided tour"}</DialogTitle>
          <DialogDescription>{activeTour?.summary || "Follow the guided steps to learn the current workflow."}</DialogDescription>
        </DialogHeader>
        {activeTour ? (
          <div className="mx-5 h-2 overflow-hidden rounded-full bg-muted sm:mx-6" aria-label={`Tour progress ${activeStepIndex + 1} of ${activeTour.steps.length}`}>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((activeStepIndex + 1) / activeTour.steps.length) * 100}%` }}
            />
          </div>
        ) : null}
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4 text-sm text-muted-foreground sm:px-6">
          {activeRecording && !showRecording ? (
            <Button type="button" variant="outline" className="min-h-[44px] gap-2" onClick={() => setShowRecording(true)}>
              Watch example
            </Button>
          ) : null}
          {activeRecording && showRecording ? (
            <ProcessWalkthrough
              recording={activeRecording}
              compact
              onOpenArticle={(articleId) => {
                navigate(`/help?article=${articleId}`);
                closeTour();
              }}
              onStartTour={() => setShowRecording(false)}
            />
          ) : null}
          {activeStep?.body ? <p className="jf-target-callout p-4 text-base leading-7 text-foreground">{activeStep.body}</p> : null}
          {activeStep?.why ? (
            <div className="jf-sage-callout p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">Why this matters</p>
              <p className="mt-2 leading-6">{activeStep.why}</p>
            </div>
          ) : null}
          {activeStep?.target ? (
            <div className="jf-target-callout p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Look for</p>
              <p className="mt-2 text-foreground">{activeStep.target}</p>
            </div>
          ) : null}
          {activeStep?.route ? (
            <p>
              Suggested screen:{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => navigate(activeStep.route)}
              >
                {activeStep.route}
              </button>
            </p>
          ) : null}
          {activeStep?.learnMoreArticleId ? (
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-[44px] p-0 text-primary"
              onClick={() => {
                navigate(`/help?article=${activeStep.learnMoreArticleId}`);
                closeTour();
              }}
            >
              What does this mean?
            </Button>
          ) : null}
        </div>
        <DialogFooter className="flex flex-wrap gap-2 border-t border-border/45 bg-card/70 px-5 py-4 shadow-[0_-12px_28px_rgba(62,45,31,0.06)] sm:justify-between sm:px-6">
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={closeTour}>Skip tour</Button>
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={previousStep} disabled={activeStepIndex === 0}>Back</Button>
          </div>
          <Button type="button" className="min-h-[44px]" onClick={goToNext}>{isLastStep ? "Finish tour" : "Next step"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
