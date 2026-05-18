import React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

function SortIcon({ direction }) {
  if (direction === "asc") return <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />;
  if (direction === "desc") return <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ChevronsUpDown className="h-3.5 w-3.5 opacity-45" aria-hidden="true" />;
}

export function SortableHeader({
  as: Component = "th",
  columnKey,
  sortState,
  onSort,
  children,
  className,
  buttonClassName,
  align = "left",
  ...props
}) {
  const direction = sortState?.key === columnKey ? sortState.direction : null;
  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";
  return (
    <Component className={className} aria-sort={ariaSort} {...props}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          "inline-flex min-h-8 w-full items-center gap-1.5 rounded-md px-1 text-inherit transition-colors hover:bg-white/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start",
          buttonClassName
        )}
      >
        <span>{children}</span>
        <SortIcon direction={direction} />
        <span className="sr-only">
          {direction === "asc" ? "sorted ascending" : direction === "desc" ? "sorted descending" : "not sorted"}
        </span>
      </button>
    </Component>
  );
}

export function SortableButton({ columnKey, sortState, onSort, children, className, align = "left" }) {
  const direction = sortState?.key === columnKey ? sortState.direction : null;
  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      aria-pressed={Boolean(direction)}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition hover:bg-white/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start",
        className
      )}
    >
      <span>{children}</span>
      <SortIcon direction={direction} />
    </button>
  );
}
