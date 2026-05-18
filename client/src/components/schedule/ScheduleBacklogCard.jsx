import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { getStageConfig, OPERATIONS } from "../../lib/helpers";

const ScheduleBacklogCard = React.memo(function ScheduleBacklogCard({
  item,
  active,
  onClick,
}) {
  const stage = getStageConfig(OPERATIONS, item.type);
  const dragId = `schedule-item-move-${item.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: {
      mode: "move",
      itemId: item.id,
      recordId: item.recordId,
      laneId: item.laneId,
      sourceType: item.sourceType,
    },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onClick?.(item)}
      data-testid={`schedule-backlog-${item.id}`}
      className={`flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-xs shadow-sm transition hover:border-primary/40 hover:shadow-md ${
        active || isDragging ? "opacity-60" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {item.jobNumber || item.quoteNumber || stage.label}
      </span>
      <span className="max-w-[18rem] truncate font-medium">{item.taskName || item.title}</span>
      {item.clientSiteLabel ? <span className="max-w-[12rem] truncate text-muted-foreground">· {item.clientSiteLabel}</span> : null}
      {item.installStatusLabel ? <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{item.installStatusLabel}</span> : null}
      <GripVertical className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
    </button>
  );
});

export default ScheduleBacklogCard;
