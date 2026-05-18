import React, { useEffect, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock3, Download, FileText, History } from "lucide-react";
import { formatDate } from "../lib/helpers";

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / (1024 ** exponent);
  return `${scaled >= 10 || exponent === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[exponent]}`;
}

export default function AttachmentVersionDialog({ attachment, open, onOpenChange }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadVersions = async (ignoreRef = { current: false }) => {
    setLoading(true);
    setError("");

    try {
      const nextVersions = await crmApi.filesystem.listVersions(attachment.id);
      if (!ignoreRef.current) {
        setVersions(Array.isArray(nextVersions) ? nextVersions : []);
      }
    } catch (nextError) {
      if (!ignoreRef.current) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load version history");
      }
    } finally {
      if (!ignoreRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!open || !attachment?.id) {
      return;
    }

    const ignoreRef = { current: false };
    void loadVersions(ignoreRef);

    return () => {
      ignoreRef.current = true;
    };
  }, [open, attachment?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="jf-document-workspace max-w-3xl">
        <DialogHeader>
          <DialogTitle>{attachment?.name || "File"} Version History</DialogTitle>
          <DialogDescription>Review previous uploads, versions, authors, and timestamps for this file.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading version history...</div>
        ) : error ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            <div>{error}</div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadVersions()}>
              Retry
            </Button>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No version history recorded for this file yet.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto space-y-3">
            {versions.map((version, index) => (
              <div key={version.id} className="jf-document-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <History className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Version {version.version_number}</span>
                      {index === 0 && <Badge variant="secondary">Current</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground break-all">
                      {version.stored_name}
                    </p>
                  </div>
                  <Button type="button" size="sm" asChild>
                    <a href={version.url} target="_blank" rel="noreferrer">
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Open
                    </a>
                  </Button>
                </div>

                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Saved</div>
                    <div className="mt-1 flex items-center gap-1">
                      <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
                      {formatDate(version.created_date)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Size</div>
                    <div className="mt-1">{formatFileSize(version.size)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Saved By</div>
                    <div className="mt-1">{version.actor_name || version.actor_email || "System"}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-md border border-border/35 bg-[#f8f4ed]/70 px-3 py-2 text-xs text-muted-foreground">
                  <FileText className="w-3.5 h-3.5 mt-0.5" />
                  <span className="break-all">{version.relative_path}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
