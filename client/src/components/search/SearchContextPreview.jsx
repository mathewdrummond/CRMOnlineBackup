import { Badge } from "@/components/ui/badge";

export default function SearchContextPreview({ intent, diagnostics }) {
  if (!intent) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <Badge variant="outline" className="rounded-md">
        {formatIntent(intent.primary)}
      </Badge>
      {intent.requiresSemantic ? <span>Semantic retrieval enabled</span> : <span>Direct index first</span>}
      {diagnostics?.degraded ? <span className="text-amber-700">Degraded AI/vector mode</span> : null}
      {Number.isFinite(diagnostics?.total_ms) ? <span>{diagnostics.total_ms} ms</span> : null}
    </div>
  );
}

function formatIntent(value) {
  return String(value || "search").replace(/_/g, " ");
}
