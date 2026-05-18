import React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function FolderSearchInput({ value, onChange, disabled = false }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filter folders in this location"
        className="h-10 pl-9 pr-10"
        disabled={disabled}
        aria-label="Filter folders"
      />
      {value ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
          onClick={() => onChange("")}
          aria-label="Clear folder filter"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
