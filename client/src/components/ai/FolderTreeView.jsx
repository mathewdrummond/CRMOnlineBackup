import React from "react";
import { ChevronRight, Folder, FolderOpen, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function FolderTreeView({
  roots = [],
  entries = [],
  currentPath = "",
  selectedPath = "",
  loading = false,
  error = "",
  onOpen,
  onSelect,
}) {
  const rows = currentPath ? entries : roots.map((root) => ({ ...root, name: root.label, has_children: true }));

  const handleKeyDown = (event, entry) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(entry.path);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onOpen(entry.path);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-md border border-dashed p-6 text-center">
        <div>
          <p className="text-sm font-medium">Folder cannot be opened</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading folders
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-md border border-dashed p-6 text-center">
        <div>
          <p className="text-sm font-medium">No folders found</p>
          <p className="mt-1 text-sm text-muted-foreground">This location has no visible allowed subfolders.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="tree"
      aria-label="NAS folder browser"
      aria-busy={loading}
      className="min-h-[18rem] overflow-hidden rounded-md border"
    >
      <div className="max-h-[48vh] overflow-y-auto">
        {rows.map((entry) => {
          const selected = selectedPath === entry.path;
          const active = currentPath === entry.path;
          return (
            <div
              key={entry.path}
              role="treeitem"
              aria-selected={selected}
              tabIndex={0}
              onKeyDown={(event) => handleKeyDown(event, entry)}
              className={cn(
                "flex min-h-11 items-center gap-2 border-b px-2 text-sm outline-none last:border-b-0 focus-visible:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring/45",
                selected ? "bg-primary/10" : "bg-card/30",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => onOpen(entry.path)}
                aria-label={`Open ${entry.name}`}
              >
                {currentPath ? <ChevronRight className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
              </Button>
              {active ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0" />}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left focus:outline-none"
                onClick={() => onSelect(entry.path)}
                onDoubleClick={() => onOpen(entry.path)}
              >
                <span className="block truncate font-medium">{entry.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{entry.path}</span>
              </button>
              {entry.has_children ? (
                <Button type="button" size="sm" variant="outline" onClick={() => onOpen(entry.path)}>
                  Open
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {loading ? (
        <div className="flex items-center border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          Updating folder list
        </div>
      ) : null}
    </div>
  );
}
