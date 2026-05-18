import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { format, isSameDay } from "date-fns";
import { getScheduleDayMeta } from "../../lib/scheduleTimeline";

function handleCreateFromKeyboard(event, callback) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback?.();
  }
}

const TimelineDayColumn = React.memo(function TimelineDayColumn({
  lane,
  day,
  load,
  onCreate,
  isPointerDropTarget = false,
}) {
  const dateKey = format(day, "yyyy-MM-dd");
  const droppableId = `schedule-cell-${lane.id}-${dateKey}`;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: {
      type: "schedule-cell",
      laneId: lane.id,
      date: dateKey,
    },
  });
  const isToday = isSameDay(day, new Date());
  const dayMeta = getScheduleDayMeta(day);
  const baseClassName = dayMeta.isSunday
    ? "bg-rose-50/60"
    : dayMeta.isSaturday
      ? "bg-amber-50/40"
      : dayMeta.isShortDay
        ? "bg-sky-50/40"
        : "bg-card/80";
  const installCount = Number(load?.installCount || 0);
  const barWidth = Math.min(Math.max(Number(load?.relativeLoadPercent || 0), 0), 100);

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={droppableId}
      data-schedule-drop-date={dateKey}
      data-schedule-drop-lane={lane.id}
      aria-label={`Plan install for ${lane.label} on ${format(day, "d MMMM yyyy")}`}
      className={`relative min-h-[60px] border-r p-0 transition-colors ${
        isToday ? "ring-1 ring-inset ring-primary/30" : ""
      } ${load?.hasOverlap ? "bg-amber-50/55" : installCount > 0 ? "bg-emerald-50/45" : baseClassName} ${(isOver || isPointerDropTarget) ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : ""}`}
      onDoubleClick={() => onCreate?.(lane, dateKey)}
      onKeyDown={(event) => handleCreateFromKeyboard(event, () => onCreate?.(lane, dateKey))}
    >
      <div className={`absolute inset-y-0 left-0 w-0.5 ${isToday ? "bg-primary/80" : "bg-transparent"}`} />
      <div className="flex h-full flex-col justify-between px-1 py-1">
        <span className="sr-only">{lane.label} {format(day, "d MMM yyyy")} {dayMeta.label}</span>
        {load ? (
          <span className={`self-end rounded px-1 py-0.5 text-[9px] font-semibold ${
            load.hasOverlap
              ? "bg-amber-100 text-amber-700"
              : installCount > 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-transparent text-muted-foreground"
          }`}>
            {installCount > 0 ? `${installCount} install${installCount === 1 ? "" : "s"}` : ""}
          </span>
        ) : null}
        {load ? (
          <div className="mt-auto">
            <div className="h-1 overflow-hidden rounded-full bg-background/60">
              <div
                className={`${load.hasOverlap ? "bg-amber-500" : installCount > 0 ? "bg-emerald-500" : "bg-slate-300"} h-full rounded-full`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
});

export default TimelineDayColumn;
