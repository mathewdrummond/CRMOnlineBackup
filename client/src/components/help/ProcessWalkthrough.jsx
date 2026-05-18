import React, { useMemo, useState } from "react";
import { BookOpen, Clock, Film, Map, MousePointer2, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getHelpRecording } from "@/lib/helpRecordings";

function formatDuration(seconds) {
  const minutes = Math.floor(Number(seconds || 0) / 60);
  const remainder = Number(seconds || 0) % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

export default function ProcessWalkthrough({ recording, recordingId, compact = false, onOpenArticle, onStartTour }) {
  const resolvedRecording = recording || getHelpRecording(recordingId);
  const [currentStep, setCurrentStep] = useState(0);
  const steps = resolvedRecording?.steps || [];
  const activeStep = steps[currentStep] || steps[0] || null;
  const progress = useMemo(() => {
    if (!steps.length) return 0;
    return ((currentStep + 1) / steps.length) * 100;
  }, [currentStep, steps.length]);

  if (!resolvedRecording) return null;

  const nextStep = () => setCurrentStep((index) => Math.min(index + 1, steps.length - 1));
  const restart = () => setCurrentStep(0);
  const activeScreenshotUrl = activeStep?.screenshotUrl || resolvedRecording.videoUrl || resolvedRecording.thumbnailUrl;
  const hasVisualMedia = Boolean(activeScreenshotUrl);
  const click = activeStep?.click || null;

  return (
    <Card className={`overflow-hidden border-primary/20 ${compact ? "p-3" : "p-4"}`} data-testid="process-walkthrough">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Film className="h-3.5 w-3.5" />
              Show Me How
            </Badge>
            <Badge variant="outline">{resolvedRecording.category}</Badge>
            <Badge variant={resolvedRecording.level === "beginner" ? "default" : "secondary"}>{resolvedRecording.level}</Badge>
          </div>
          <h3 className={`${compact ? "mt-2 text-base" : "mt-3 text-lg"} font-semibold text-foreground`}>{resolvedRecording.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{resolvedRecording.summary}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-4 w-4" />
          {formatDuration(resolvedRecording.durationSeconds)}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[10px] border border-[#674e36]/15 bg-[#201d19] text-white">
        <div className="relative aspect-[16/10] min-h-[190px] bg-[#201d19]">
          {hasVisualMedia ? (
            <img
              src={activeScreenshotUrl}
              alt={`${resolvedRecording.title} application walkthrough screenshot`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/80">
              This walkthrough is being generated. Try Replay in a moment, or open the written guide.
            </div>
          )}
          <div className="absolute inset-x-4 top-4 flex items-center justify-between rounded-lg border border-white/10 bg-[#201d19]/80 px-3 py-2 text-xs backdrop-blur">
            <span>{resolvedRecording.route}</span>
            <span>{activeStep?.targetLabel || activeStep?.highlight}</span>
          </div>
          <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-white/10 bg-[#201d19]/82 p-3 text-sm leading-6 backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white">Subtitles</p>
            <p className="mt-1 text-white/85">{activeStep?.caption}</p>
          </div>
          {click ? (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${click.xPercent}%`, top: `${click.yPercent}%` }}
            >
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-[#d0b487]/25" />
                <div className="relative rounded-full bg-[#d0b487] p-2 text-[#201a14] shadow-[0_0_0_10px_rgba(208,180,135,0.18)]">
                  <MousePointer2 className="h-5 w-5" />
                </div>
                <span className="absolute left-8 top-1/2 max-w-40 -translate-y-1/2 rounded-md border border-white/15 bg-[#201d19]/90 px-2 py-1 text-xs font-medium text-white shadow-lg">
                  {click.label}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="h-2 bg-white/10">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="jf-target-callout mt-4 p-3">
        <p className="text-sm font-semibold text-foreground">{currentStep + 1}. {activeStep?.title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeStep?.instruction}</p>
        <div className="jf-sage-callout mt-3 p-3 text-sm">
          <p className="font-semibold">Why this matters</p>
          <p className="mt-1">{activeStep?.why}</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li key={step.title}>
            <button
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${index === currentStep ? "border-[#4f5148] bg-[#e7ded2]/60 dark:border-[#d0b487] dark:bg-[#3a2f24]/70" : "hover:bg-muted/40"}`}
              onClick={() => setCurrentStep(index)}
            >
              <span className="font-medium text-foreground">{index + 1}. {step.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{step.screenshotAlt}</span>
              {step.screenshotUrl ? (
                <img
                  src={step.screenshotUrl}
                  alt={step.screenshotAlt}
                  className="mt-2 aspect-video w-full rounded-md border object-cover"
                  loading="lazy"
                />
              ) : null}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" className="min-h-[40px] gap-2" onClick={nextStep} disabled={currentStep >= steps.length - 1}>
          <Play className="h-4 w-4" />
          Next pause point
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] gap-2" onClick={restart}>
          <RotateCcw className="h-4 w-4" />
          Replay
        </Button>
        {resolvedRecording.tourId && onStartTour ? (
          <Button type="button" variant="outline" className="min-h-[40px] gap-2" onClick={() => onStartTour(resolvedRecording.tourId)}>
            <Map className="h-4 w-4" />
            Start guided tour
          </Button>
        ) : null}
        {resolvedRecording.articleId && onOpenArticle ? (
          <Button type="button" variant="outline" className="min-h-[40px] gap-2" onClick={() => onOpenArticle(resolvedRecording.articleId)}>
            <BookOpen className="h-4 w-4" />
            Open written guide
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
