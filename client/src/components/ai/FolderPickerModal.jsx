import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { crmApi } from "@/api/localApiClient";
import FolderBreadcrumbs from "./FolderBreadcrumbs";
import FolderSearchInput from "./FolderSearchInput";
import FolderTreeView from "./FolderTreeView";

export default function FolderPickerModal({
  open,
  onOpenChange,
  value = "",
  indexedPaths = [],
  onSelect,
  title = "Browse NAS Folder",
}) {
  const [roots, setRoots] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [selectedPath, setSelectedPath] = useState(value);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cacheRef = useRef(new Map());

  const duplicate = useMemo(
    () => indexedPaths.some((path) => path && selectedPath && path === selectedPath && path !== value),
    [indexedPaths, selectedPath, value]
  );

  useEffect(() => {
    if (!open) return;
    setSelectedPath(value || "");
    setError("");
    const controller = new AbortController();
    setLoading(true);
    crmApi.ai.knowledgeRoots({ signal: controller.signal })
      .then((response) => {
        const nextRoots = Array.isArray(response?.roots) ? response.roots : [];
        setRoots(nextRoots);
        const initial = value || nextRoots[0]?.path || "";
        setCurrentPath(initial);
      })
      .catch((nextError) => {
        if (nextError?.name !== "AbortError") {
          setError(nextError instanceof Error ? nextError.message : "Allowed roots could not be loaded.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, value]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || !currentPath) return;
    const cacheKey = `${currentPath}::${debouncedQuery}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setDirectory(cached);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    crmApi.ai.browseKnowledgeFolders(
      { path: currentPath, query: debouncedQuery, limit: 150 },
      { signal: controller.signal }
    )
      .then((response) => {
        cacheRef.current.set(cacheKey, response);
        setDirectory(response);
      })
      .catch((nextError) => {
        if (nextError?.name !== "AbortError") {
          setDirectory(null);
          setError(nextError instanceof Error ? nextError.message : "Folder could not be opened.");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, currentPath, debouncedQuery]);

  const handleOpenFolder = (path) => {
    setCurrentPath(path);
    setSelectedPath(path);
    setQuery("");
  };

  const handleConfirm = () => {
    if (!selectedPath || duplicate) return;
    onSelect(selectedPath);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose a folder from configured NAS roots. System folders, symlinks, and unauthorized mounts are hidden.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <FolderBreadcrumbs breadcrumbs={directory?.breadcrumbs || []} onNavigate={handleOpenFolder} />
          <FolderSearchInput value={query} onChange={setQuery} disabled={!currentPath} />
          <FolderTreeView
            roots={roots}
            entries={directory?.entries || []}
            currentPath={currentPath}
            selectedPath={selectedPath}
            loading={loading}
            error={error}
            onOpen={handleOpenFolder}
            onSelect={setSelectedPath}
          />
        </div>

        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          {selectedPath ? (
            <div className="flex items-start gap-2">
              {duplicate ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{duplicate ? "Folder already indexed" : "Selected folder"}</p>
                <p className="break-all text-xs text-muted-foreground">{selectedPath}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Select a folder to continue.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!selectedPath || duplicate || loading}>
            Use Selected Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
