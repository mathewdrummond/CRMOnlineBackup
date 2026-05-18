import React from "react";
import { ChevronRight, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FolderBreadcrumbs({ breadcrumbs = [], onNavigate }) {
  if (!breadcrumbs.length) {
    return (
      <div className="flex min-h-9 items-center rounded-md border bg-muted/25 px-3 text-sm text-muted-foreground">
        Select an allowed NAS root
      </div>
    );
  }

  return (
    <nav aria-label="Folder location" className="flex min-h-9 items-center overflow-x-auto rounded-md border bg-muted/25 px-2">
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.path} className="flex shrink-0 items-center">
          {index > 0 ? <ChevronRight className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => onNavigate(crumb.path)}
          >
            {index === 0 ? <HardDrive className="h-4 w-4" aria-hidden="true" /> : null}
            <span className="max-w-[11rem] truncate">{crumb.label}</span>
          </Button>
        </div>
      ))}
    </nav>
  );
}
