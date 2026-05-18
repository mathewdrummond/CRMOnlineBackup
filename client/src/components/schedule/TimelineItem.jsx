import React from "react";
import { CalendarRange, GripVertical } from "lucide-react";
import { getStageConfig, OPERATIONS } from "../../lib/helpers";

export const STAGE_ACCENT_COLORS = {
  purple: "#7a617d",
  blue: "#607487",
  cyan: "#607487",
  teal: "#6f7f61",
  amber: "#c9974e",
  orange: "#9f6132",
  pink: "#a45f52",
  emerald: "#6f7f61",
  green: "#6f7f61",
  slate: "#8a7462",
  red: "#a45f52",
};

const STATUS_TONES = {
  pending: "bg-[#e7ded2] text-[#4f4137] dark:bg-[#302a24] dark:text-[#e6d7c4]",
  scheduled: "bg-[#e3eaf0] text-[#40586c] dark:bg-[#22303a] dark:text-[#cfdeea]",
  ready: "bg-[#e6ece0] text-[#4f6540] dark:bg-[#263321] dark:text-[#dbe8d2]",
  in_progress: "bg-[#f2e2c6] text-[#7a5621] dark:bg-[#3d301b] dark:text-[#efd190]",
  completed: "bg-[#ddd6ce] text-[#514942] dark:bg-[#2c2925] dark:text-[#d9cdbd]",
  blocked: "bg-[#eedbd7] text-[#7e4038] dark:bg-[#3b241f] dark:text-[#f1cbc3]",
  on_hold: "bg-[#efe0cf] text-[#794c2e] dark:bg-[#3a2a1d] dark:text-[#efcfab]",
};

function getStatusTone(status) {
  return STATUS_TONES[String(status || "").trim().toLowerCase()] || STATUS_TONES.scheduled;
}

function compactMetaLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function buildCardMeta(item, stage) {
  const referenceLabel = item.recordScope === "quote"
    ? item.quoteNumber || "Quote"
    : item.jobNumber || "Job";
  const contextBits = [
    item.installLabel || compactMetaLabel(item.phase || item.role || stage.label),
    item.clientSiteLabel,
    item.noteExcerpt,
  ].filter(Boolean);

  return {
    referenceLabel,
    title: item.continuesBefore ? `${item.jobTitle || item.title} (cont.)` : item.jobTitle || item.title,
    contextLabel: contextBits.join(" · "),
    assignmentLabel: item.assignedCrewName || item.assignedToDisplay || item.location || "",
    hoursLabel: item.actualHours > 0
      ? `${item.actualHours}h actual`
      : item.durationHours > 0
        ? `${item.durationHours}h planned`
        : item.estimatedHours > 0
          ? `${item.estimatedHours}h est`
        : item.span > 1
          ? `${item.span} day install`
          : "",
  };
}

function stopHandleEvent(event) {
  event.stopPropagation();
}

function DragHandle({
  id,
  label,
  className = "",
  children,
  onNudge,
  onPlannerDragStart,
}) {
  const handleKeyDown = (event) => {
    stopHandleEvent(event);

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNudge?.(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNudge?.(1);
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      data-testid={id}
      className={`${className} relative z-10 touch-none select-none cursor-ew-resize`}
      onClick={stopHandleEvent}
      onMouseDown={(event) => {
        stopHandleEvent(event);
        onPlannerDragStart?.(event);
      }}
      onTouchStart={(event) => {
        stopHandleEvent(event);
        onPlannerDragStart?.(event);
      }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}

function MoveHandleButton({
  item,
  moveTestId,
  onMoveStep,
  onPlannerDragStart,
}) {
  const handleKeyDown = (event) => {
    stopHandleEvent(event);

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onMoveStep?.(item, { dayDelta: -1, laneDelta: 0 });
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onMoveStep?.(item, { dayDelta: 1, laneDelta: 0 });
    }
  };

  return (
    <button
      type="button"
      aria-label={`Move ${item.title}`}
      data-testid={moveTestId}
      className="relative z-10 flex w-8 shrink-0 touch-none select-none items-center justify-center border-l border-border/60 bg-muted/20 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      onMouseDown={(event) => {
        stopHandleEvent(event);
        onPlannerDragStart?.(event);
      }}
      onTouchStart={(event) => {
        stopHandleEvent(event);
        onPlannerDragStart?.(event);
      }}
      onKeyDown={handleKeyDown}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
}

export function TimelineItemCard({
  item,
  selected,
  active,
  saving,
  onClick,
  onMoveStep,
  moveTestId,
  onResizeStep,
  onPlannerDragStart,
  showHandles = true,
  dragOverlay = false,
  testIdSegment = item.id,
}) {
  const stage = getStageConfig(OPERATIONS, item.type);
  const accentColor = STAGE_ACCENT_COLORS[item.colorKey || stage.color] || STAGE_ACCENT_COLORS.slate;
  const statusTone = getStatusTone(item.status);
  const cardMeta = buildCardMeta(item, stage);

  return (
    <div
      className={`group relative flex h-[60px] w-full items-stretch overflow-hidden rounded-lg border bg-card text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? "border-primary ring-2 ring-primary/30 shadow-md" : "border-border/80 hover:border-primary/40 hover:shadow-md"
      } ${saving ? "animate-pulse" : ""} ${active ? "opacity-70 shadow-lg" : ""} ${dragOverlay ? "shadow-xl ring-2 ring-primary/20" : ""}`}
    >
      {showHandles ? (
        <DragHandle
          id={`schedule-item-resize-start-${testIdSegment}`}
          label={`Resize start for ${item.title}`}
          onNudge={(delta) => onResizeStep?.(item, "start", delta)}
          onPlannerDragStart={(event) => onPlannerDragStart?.(event, item, "resize-start")}
          className="flex w-6 items-center justify-center border-r border-border/60 bg-muted/35 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
        >
          <CalendarRange className="h-3 w-3 opacity-80" />
        </DragHandle>
      ) : (
        <div className="w-1.5 shrink-0" style={{ backgroundColor: accentColor }} />
      )}

      <div className="relative flex min-w-0 flex-1 items-stretch">
        <button
          type="button"
          onClick={() => onClick?.(item)}
          className="relative flex min-w-0 flex-1 items-stretch text-left focus-visible:outline-none"
        >
          <div className="w-1.5 shrink-0" style={{ backgroundColor: accentColor }} />
          <div className="grid min-w-0 flex-1 grid-rows-[auto,1fr,auto] gap-0.5 px-2 py-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {cardMeta.referenceLabel}
                </span>
                {item.assignedCrewName ? <span className="rounded-full bg-blue-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-blue-700">{item.assignedCrewName}</span> : null}
                {item.manuallyLocked ? <span className="rounded-full bg-amber-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-700">Locked</span> : null}
                {item.isSystemGenerated ? <span className="rounded-full bg-slate-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-600">Auto</span> : null}
                {Array.isArray(item.scheduleWarnings) && item.scheduleWarnings.length > 0 ? <span className="rounded-full bg-rose-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-rose-700">Warning</span> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.continuesBefore ? <span className="text-[10px] text-muted-foreground">←</span> : null}
                {item.continuesAfter ? <span className="text-[10px] text-muted-foreground">→</span> : null}
                <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] ${statusTone}`}>
                  {item.installStatusLabel || compactMetaLabel(item.status)}
                </span>
              </div>
            </div>
            <p className="truncate text-[11px] font-semibold leading-4 text-foreground">{cardMeta.title}</p>
            <div className="flex min-w-0 items-center gap-1.5 text-[9px] leading-3 text-muted-foreground">
              <span className="truncate">{cardMeta.contextLabel}</span>
              {cardMeta.assignmentLabel ? <span className="shrink-0 text-[8px]">•</span> : null}
              {cardMeta.assignmentLabel ? <span className="truncate">{cardMeta.assignmentLabel}</span> : null}
              {cardMeta.hoursLabel ? <span className="shrink-0 text-[8px]">•</span> : null}
              {cardMeta.hoursLabel ? <span className="shrink-0">{cardMeta.hoursLabel}</span> : null}
            </div>
          </div>
        </button>
        <MoveHandleButton
          item={item}
          moveTestId={moveTestId}
          onMoveStep={onMoveStep}
          onPlannerDragStart={(event) => onPlannerDragStart?.(event, item, "move")}
        />
      </div>

      <div className="pointer-events-none absolute -top-8 right-2 z-10 rounded-md border bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
        Arrows move item. Edge handles resize.
      </div>

      {showHandles ? (
        <DragHandle
          id={`schedule-item-resize-end-${testIdSegment}`}
          label={`Resize end for ${item.title}`}
          onNudge={(delta) => onResizeStep?.(item, "end", delta)}
          onPlannerDragStart={(event) => onPlannerDragStart?.(event, item, "resize-end")}
          className="flex w-6 items-center justify-center border-l border-border/60 bg-muted/35 text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
        >
          <CalendarRange className="h-3 w-3 opacity-80" />
        </DragHandle>
      ) : (
        <div className="w-1.5 shrink-0" style={{ backgroundColor: accentColor }} />
      )}
    </div>
  );
}

export default function TimelineItem({
  item,
  selected,
  active,
  saving,
  onClick,
  onMoveStep,
  onResizeStep,
  onPlannerDragStart,
}) {
  const testIdSegment = item.continuesBefore ? `${item.id}-${item.sectionStart || "continued"}` : item.id;
  const moveId = `schedule-item-move-${testIdSegment}`;

  return (
    <div
      style={{
        gridColumn: `${item.startColumn} / span ${item.span}`,
        gridRow: `${Number(item.stackIndex || 0) + 1}`,
      }}
      className="pointer-events-auto relative min-w-0"
      data-testid={`schedule-item-${testIdSegment}`}
    >
      <TimelineItemCard
        item={item}
        selected={selected}
        active={active}
        saving={saving}
        onClick={onClick}
        onMoveStep={onMoveStep}
        onResizeStep={onResizeStep}
        onPlannerDragStart={onPlannerDragStart}
        showHandles={item.canResize !== false}
        moveTestId={moveId}
        testIdSegment={testIdSegment}
      />
    </div>
  );
}
