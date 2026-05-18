import React from "react";
import { format } from "date-fns";
import { CalendarDays, Layers3, MapPinned } from "lucide-react";
import TimelineDayColumn from "./TimelineDayColumn";
import TimelineItem from "./TimelineItem";

const LANE_SWATCHES = {
  blue: "#5b8def",
  emerald: "#10b981",
  amber: "#f59e0b",
  purple: "#9f7aea",
  pink: "#ec4899",
  teal: "#14b8a6",
  slate: "#64748b",
};

const LABEL_COLUMN_WIDTH = 220;

const TimelineLane = React.memo(function TimelineLane({
  lane,
  days,
  segments,
  rowCount,
  loadSummary,
  dayLoadsByDateKey,
  selectedItemId,
  activeItemId,
  savingRecordId,
  activeDropDateKey,
  onItemClick,
  onCreate,
  onMoveStep,
  onResizeStep,
  onPlannerDragStart,
}) {
  const accentColor = LANE_SWATCHES[lane.color] || LANE_SWATCHES.slate;
  const gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
  const minHeight = Math.max(72, rowCount * 62);
  const crewMembers = Array.isArray(lane.member_staff_ids) && lane.member_staff_ids.length > 0
    ? `${lane.member_staff_ids.length} crew member${lane.member_staff_ids.length === 1 ? "" : "s"}`
    : "";
  const laneMeta = [
    lane.crew_name ? `Crew · ${lane.crew_name}` : "",
    crewMembers,
    lane.description || lane.lane_type || "installation",
  ].filter(Boolean);
  const loadTone = loadSummary?.busyDays > 0
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : loadSummary?.scheduledItems > 0
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-slate-700 bg-slate-50 border-slate-200";
  const loadWidth = Math.min(Math.max(Number(loadSummary?.loadPercent || 0), 0), 140);

  return (
    <div
      className="grid border-b last:border-b-0"
      style={{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px minmax(0, 1fr)` }}
    >
      <div className="border-r bg-muted/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{lane.label}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${loadTone}`}>
                {loadSummary?.busyDays > 0 ? "Busy" : loadSummary?.scheduledItems > 0 ? "Planned" : "Open"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{laneMeta.join(" · ")}</p>
          </div>
        </div>
        {loadSummary ? (
          <div className="mt-3 space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/70">
              <div
                className={`${loadSummary.busyDays > 0 ? "bg-amber-500" : loadSummary.scheduledItems > 0 ? "bg-emerald-500" : "bg-slate-400"} h-full rounded-full`}
                style={{ width: `${loadWidth}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Layers3 className="h-3 w-3" />{loadSummary.scheduledItems} install{loadSummary.scheduledItems === 1 ? "" : "s"} in view</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{loadSummary.activeDays} active day{loadSummary.activeDays === 1 ? "" : "s"}</span>
              {loadSummary.busiestDay ? <span className="inline-flex items-center gap-1"><MapPinned className="h-3 w-3" />Peak {format(new Date(`${loadSummary.busiestDay.dateKey}T00:00:00`), "d MMM")} · {loadSummary.busiestDay.installCount}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative overflow-hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns,
            minHeight,
          }}
        >
          {days.map((day) => (
            <TimelineDayColumn
              key={`${lane.id}-${day.toISOString()}`}
              lane={lane}
              day={day}
              load={dayLoadsByDateKey?.get(format(day, "yyyy-MM-dd")) || null}
              onCreate={onCreate}
              isPointerDropTarget={activeDropDateKey === format(day, "yyyy-MM-dd")}
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-0 grid gap-y-2 p-1"
          style={{
            gridTemplateColumns,
            gridTemplateRows: `repeat(${rowCount}, minmax(52px, auto))`,
          }}
        >
          {segments.map((segment) => (
            <TimelineItem
              key={segment.id}
              item={segment}
              selected={selectedItemId === segment.id}
              active={activeItemId === segment.id}
              saving={savingRecordId === segment.recordId}
              onClick={onItemClick}
              onMoveStep={onMoveStep}
              onResizeStep={onResizeStep}
              onPlannerDragStart={onPlannerDragStart}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default TimelineLane;
