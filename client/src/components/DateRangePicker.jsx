import { useEffect, useMemo, useRef, useState } from "react";
import { format, isBefore, isSameDay, parseISO } from "date-fns";
import { useDayRender } from "react-day-picker";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseDate(value) {
  if (!value) {
    return undefined;
  }

  try {
    return parseISO(value);
  } catch {
    return undefined;
  }
}

function normalizeRange(from, to) {
  if (!from && !to) {
    return { from: undefined, to: undefined };
  }

  if (!from) {
    return { from: to, to };
  }

  if (!to) {
    return { from, to: from };
  }

  if (isBefore(to, from)) {
    return { from: to, to: from };
  }

  return { from, to };
}

function rangesMatch(left, right) {
  const leftFrom = left?.from;
  const leftTo = left?.to;
  const rightFrom = right?.from;
  const rightTo = right?.to;

  const sameFrom = (!leftFrom && !rightFrom) || (leftFrom && rightFrom && isSameDay(leftFrom, rightFrom));
  const sameTo = (!leftTo && !rightTo) || (leftTo && rightTo && isSameDay(leftTo, rightTo));

  return sameFrom && sameTo;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  placeholder = "Choose dates",
}) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(() => normalizeRange(parseDate(startDate), parseDate(endDate)));
  const dragAnchorRef = useRef(undefined);
  const isDraggingRef = useRef(false);

  const selectedRange = useMemo(
    () => normalizeRange(parseDate(startDate), parseDate(endDate)),
    [endDate, startDate]
  );

  useEffect(() => {
    if (!isDraggingRef.current && !rangesMatch(draftRange, selectedRange)) {
      setDraftRange(selectedRange);
    }
  }, [draftRange, selectedRange]);

  useEffect(() => {
    const stopDragging = () => {
      dragAnchorRef.current = undefined;
      isDraggingRef.current = false;
    };

    document.addEventListener("mouseup", stopDragging);
    document.addEventListener("touchend", stopDragging);

    return () => {
      document.removeEventListener("mouseup", stopDragging);
      document.removeEventListener("touchend", stopDragging);
    };
  }, []);

  const commitRange = (nextRange) => {
    const normalized = normalizeRange(nextRange?.from, nextRange?.to);
    setDraftRange(normalized);
    onChange?.({
      start_date: normalized.from ? format(normalized.from, "yyyy-MM-dd") : "",
      end_date: normalized.to ? format(normalized.to, "yyyy-MM-dd") : "",
    });
  };

  const startDragSelection = (day) => {
    dragAnchorRef.current = day;
    isDraggingRef.current = true;
    commitRange({ from: day, to: day });
  };

  const extendDragSelection = (day) => {
    if (!isDraggingRef.current || !dragAnchorRef.current) {
      return;
    }

    const nextRange = normalizeRange(dragAnchorRef.current, day);
    commitRange(nextRange);
  };

  const clearRange = () => {
    dragAnchorRef.current = undefined;
    isDraggingRef.current = false;
    commitRange({ from: undefined, to: undefined });
  };

  const label = selectedRange.from
    ? selectedRange.to && !isSameDay(selectedRange.from, selectedRange.to)
      ? `${format(selectedRange.from, "d MMM yyyy")} - ${format(selectedRange.to, "d MMM yyyy")}`
      : format(selectedRange.from, "d MMM yyyy")
    : placeholder;

  const DragSelectDay = ({ date, displayMonth }) => {
    const buttonRef = useRef(null);
    const dayRender = useDayRender(date, displayMonth, buttonRef);

    if (dayRender.isHidden) {
      return <></>;
    }

    if (!dayRender.isButton) {
      return <div {...dayRender.divProps} />;
    }

    const { onMouseEnter, onTouchStart, className, ...buttonProps } = dayRender.buttonProps;

    return (
      <button
        {...buttonProps}
        ref={buttonRef}
        className={cn(className, "cursor-crosshair")}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          startDragSelection(date);
        }}
        onMouseEnter={(event) => {
          onMouseEnter?.(event);
          extendDragSelection(date);
        }}
        onTouchStart={(event) => {
          onTouchStart?.(event);
          startDragSelection(date);
        }}
      />
    );
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-between text-left font-normal", !selectedRange.from && "text-muted-foreground")}
          >
            <span className="truncate">{label}</span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Schedule range</p>
            <p className="text-xs text-muted-foreground">Click and drag across the calendar to set the start and end date.</p>
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draftRange}
            defaultMonth={draftRange.from || new Date()}
            components={{ Day: DragSelectDay }}
          />
          <div className="flex items-center justify-between border-t px-4 py-3">
            <div className="text-xs text-muted-foreground">
              <span>{selectedRange.from ? format(selectedRange.from, "d MMM yyyy") : "No start date"}</span>
              <span className="mx-2">to</span>
              <span>{selectedRange.to ? format(selectedRange.to, "d MMM yyyy") : "No end date"}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearRange}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
