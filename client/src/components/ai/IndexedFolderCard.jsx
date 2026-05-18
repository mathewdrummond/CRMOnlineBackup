import React from "react";
import { FolderCog, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function formatKnowledgeBytes(value) {
  const size = Number(value || 0);
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const scaled = size / (1024 ** exponent);
  return `${scaled.toFixed(scaled >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function IndexedFolderCard({
  source,
  onToggle,
  onReindex,
  onDelete,
  onChangeFolder,
}) {
  const health = source.last_error ? "Needs attention" : source.paused ? "Paused" : source.enabled ? "Healthy" : "Disabled";
  const healthVariant = source.last_error ? "destructive" : source.enabled ? "secondary" : "outline";

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{source.label}</p>
            <Badge variant={healthVariant}>{health}</Badge>
          </div>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">{source.root_path}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={Boolean(source.enabled)}
            onCheckedChange={(checked) => onToggle(source, checked)}
            aria-label={`Enable indexing for ${source.label}`}
          />
          <Button type="button" size="icon" variant="outline" onClick={() => onReindex(source.id)} aria-label={`Reindex ${source.label}`}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={() => onDelete(source.id)} aria-label={`Remove ${source.label}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-4">
        <div>Files: <span className="font-medium text-foreground">{Number(source?.stats?.file_count || 0)}</span></div>
        <div>Chunks: <span className="font-medium text-foreground">{Number(source?.stats?.chunk_count || 0)}</span></div>
        <div>Embeddings: <span className="font-medium text-foreground">{Number(source?.stats?.embedding_count || 0)}</span></div>
        <div>Size: <span className="font-medium text-foreground">{formatKnowledgeBytes(source?.stats?.total_bytes || 0)}</span></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Last indexed: {source?.stats?.latest_indexed_date || source.last_indexed_date || "Never"}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChangeFolder(source)}>
          <FolderCog className="h-4 w-4" />
          Browse / Change Folder
        </Button>
      </div>
      {source.last_error ? <p className="mt-2 text-xs text-destructive">{source.last_error}</p> : null}
    </div>
  );
}
