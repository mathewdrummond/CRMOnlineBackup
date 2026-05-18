import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

function getDefaultActionAriaLabel(label) {
  const match = String(label || "").match(/^(Add|New)\s+(.+)$/i);
  if (match) {
    return `Create first ${match[2]}`;
  }
  return "Run empty state action";
}

export default function EmptyState({ icon: Icon, title, description, actionLabel, actionAriaLabel, onAction }) {
  const resolvedActionLabel = actionAriaLabel || (actionLabel ? getDefaultActionAriaLabel(actionLabel) : undefined);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg bg-muted/20 px-6 py-10 text-center">
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-muted/60">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="mb-1 font-heading text-base font-semibold text-foreground">{title}</div>
      {description && <p className="mb-5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button aria-label={resolvedActionLabel} onClick={onAction} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />{actionLabel}
        </Button>
      )}
    </div>
  );
}
