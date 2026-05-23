import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SuggestedActionCard({ suggestion, onSelect }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-auto justify-between rounded-md px-3 py-2 text-left text-xs"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect?.(suggestion.query)}
    >
      <span className="min-w-0 truncate">{suggestion.label}</span>
      <ArrowUpRight className="ml-2 h-3.5 w-3.5 shrink-0" />
    </Button>
  );
}
