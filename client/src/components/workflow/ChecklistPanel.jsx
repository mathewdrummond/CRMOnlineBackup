import React from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import StatusBadge from "../StatusBadge";

export default function ChecklistPanel({
  title,
  description,
  items = [],
  badgeLabel,
  badgeColor = "slate",
  note,
  onNoteChange,
  onToggle,
}) {
  const completeCount = items.filter((item) => item.checked).length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {badgeLabel ? <StatusBadge label={badgeLabel} color={badgeColor} /> : null}
      </div>

      <div className="mt-4 rounded-xl border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        {completeCount} of {items.length} checkpoints complete
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <label key={item.key} className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={Boolean(item.checked)} onCheckedChange={(checked) => onToggle?.(item.key, checked === true)} />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">{item.label}</span>
              {item.hint ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>

      {typeof note === "string" && onNoteChange ? (
        <div className="mt-4">
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={3}
            className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            placeholder="Add operational notes…"
          />
        </div>
      ) : null}
    </Card>
  );
}
