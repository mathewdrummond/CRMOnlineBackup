import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Film, Map, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHelpContextForPath } from "@/lib/helpContent";
import { getRecordingForTour } from "@/lib/helpRecordings";
import { useHelp } from "@/lib/HelpContext";

export default function ContextHelpActions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showTipsAgain, startTour } = useHelp();
  const helpContext = getHelpContextForPath(location.pathname);
  const recording = helpContext?.tourId ? getRecordingForTour(helpContext.tourId) : null;

  const openArticle = () => {
    const articleQuery = helpContext?.articleId ? `?article=${encodeURIComponent(helpContext.articleId)}` : "";
    navigate(`/help${articleQuery}`, {
      state: { fromPath: location.pathname },
    });
  };

  const launchTour = () => {
    if (!helpContext?.tourId) return;
    startTour(helpContext.tourId);
  };

  const openRecording = () => {
    const recordingQuery = recording?.id ? `?recording=${encodeURIComponent(recording.id)}` : "";
    navigate(`/help${recordingQuery}`, {
      state: { fromPath: location.pathname },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={helpContext?.label || "Open Help Centre"}
        onClick={openArticle}
        className="min-h-[38px] gap-2 rounded-md px-2.5 text-xs text-foreground/75 hover:bg-muted/55 hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" />
        <span className="hidden sm:inline">Help</span>
      </Button>
      {helpContext?.tourId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Start guided tour"
          onClick={launchTour}
          className="min-h-[38px] gap-2 rounded-md border-transparent bg-transparent px-2.5 text-xs text-foreground/75 shadow-none hover:bg-muted/55 hover:text-foreground"
        >
          <Map className="h-4 w-4" />
          <span className="hidden sm:inline">Tour</span>
        </Button>
      ) : null}
      {recording ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Show Me How: ${recording.title}`}
          onClick={openRecording}
          className="min-h-[38px] gap-2 rounded-md border-transparent bg-transparent px-2.5 text-xs text-foreground/75 shadow-none hover:bg-muted/55 hover:text-foreground"
        >
          <Film className="h-4 w-4" />
          <span className="hidden sm:inline">Show Me How</span>
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Show tips again"
        onClick={showTipsAgain}
        className="min-h-[38px] gap-2 rounded-md px-2.5 text-xs text-foreground/75 hover:bg-muted/55 hover:text-foreground"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="hidden lg:inline">Tips</span>
      </Button>
    </div>
  );
}
