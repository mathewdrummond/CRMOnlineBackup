import { AlertTriangle, Brain, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AIAnswerPanel({ answer, onOpen }) {
  if (!answer || answer.status === "skipped") return null;

  const weak = answer.status !== "ready" || answer.confidence === "low";

  return (
    <section className="border-b bg-card px-4 py-3" aria-label="AI grounded answer">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {weak ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Brain className="h-4 w-4 text-primary" />}
          <h3 className="text-sm font-semibold">Operational Answer</h3>
        </div>
        <Badge variant={weak ? "outline" : "secondary"} className="rounded-md">
          {answer.confidence || "low"} confidence
        </Badge>
      </div>
      <p className="text-sm leading-5 text-foreground">{answer.answer}</p>
      {Array.isArray(answer.sources) && answer.sources.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">Sources</p>
          {answer.sources.slice(0, 4).map((source) => (
            <button
              key={source.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => source.href && onOpen?.(source.href)}
              className="flex w-full items-start justify-between gap-3 rounded-md border bg-muted/25 px-3 py-2 text-left hover:bg-muted/45"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{source.title}</span>
                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{source.snippet}</span>
              </span>
              {source.href ? <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
