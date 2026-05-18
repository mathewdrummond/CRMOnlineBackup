import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDefaultLane, LANE_COLOR_OPTIONS, LANE_TYPE_OPTIONS } from "../../lib/scheduleTimeline";
import { normalizeScheduleLaneStaff } from "../../lib/staffIdentity";

function cloneLane(lane, index) {
  const normalizedStaff = normalizeScheduleLaneStaff(lane);
  return {
    ...lane,
    label: String(lane.label || `Lane ${index + 1}`),
    color: String(lane.color || "slate"),
    staff_id: normalizedStaff.staff_id,
    staff_name: normalizedStaff.staff_name,
    lane_type: String(lane.lane_type || (normalizedStaff.staff_id ? "staff" : "workflow")),
    crew_size: Math.max(1, Number(lane.crew_size || 1)),
    capacity_hours_per_day: Number(lane.capacity_hours_per_day || 10.5),
    workstation_name: String(lane.workstation_name || ""),
    sort_order: Number(lane.sort_order || index),
  };
}

export default function LaneSettingsDialog({
  open,
  onOpenChange,
  lanes,
  staffMembers,
  onSave,
}) {
  const [draftLanes, setDraftLanes] = useState([]);

  useEffect(() => {
    if (open) {
      setDraftLanes((lanes || []).map((lane, index) => cloneLane(lane, index)));
    }
  }, [lanes, open]);

  const staffUsage = useMemo(() => {
    const counts = new Map();
    draftLanes.forEach((lane) => {
      const staffId = String(lane.staff_id || "").trim();
      if (staffId) {
        counts.set(staffId, Number(counts.get(staffId) || 0) + 1);
      }
    });
    return counts;
  }, [draftLanes]);

  const updateLane = (laneId, patch) => {
    setDraftLanes((current) =>
      current.map((lane) => (lane.id === laneId ? { ...lane, ...patch } : lane))
    );
  };

  const addLane = () => {
    setDraftLanes((current) => [
      ...current,
      {
        ...createDefaultLane(current.length),
        id: `draft-lane-${Date.now()}-${current.length}`,
      },
    ]);
  };

  const moveLane = (index, direction) => {
    setDraftLanes((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [lane] = next.splice(index, 1);
      next.splice(nextIndex, 0, lane);
      return next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex }));
    });
  };

  const removeLane = (laneId) => {
    setDraftLanes((current) =>
      current
        .filter((lane) => lane.id !== laneId)
        .map((lane, index) => ({ ...lane, sort_order: index }))
    );
  };

  const saveChanges = () => {
    const normalized = draftLanes.map((lane, index) => ({
      ...lane,
      label: String(lane.label || `Lane ${index + 1}`).trim() || `Lane ${index + 1}`,
      color: String(lane.color || "slate"),
      staff_id: String(lane.staff_id || "").trim(),
      staff_name: String(lane.staff_name || "").trim(),
      lane_type: String(lane.lane_type || (lane.staff_id ? "staff" : "workflow")),
      crew_size: Math.max(1, Number(lane.crew_size || 1)),
      capacity_hours_per_day: Math.max(0, Number(lane.capacity_hours_per_day || 0)),
      workstation_name: String(lane.workstation_name || "").trim(),
      sort_order: index,
    }));
    onSave?.(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configure Schedule Lanes</DialogTitle>
          <DialogDescription>
            Add, remove, reorder, and label the Kanban-style rows used on the timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {draftLanes.map((lane, index) => (
            <div key={lane.id} className="rounded-lg border bg-card/80 p-4">
              <div className="grid gap-3 md:grid-cols-[1.1fr_180px_1fr_180px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`lane-label-${lane.id}`}>Lane Label</Label>
                  <Input
                    id={`lane-label-${lane.id}`}
                    value={lane.label}
                    onChange={(event) => updateLane(lane.id, { label: event.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`lane-type-${lane.id}`}>Lane Type</Label>
                  <Select
                    value={lane.lane_type || "workflow"}
                    onValueChange={(value) => updateLane(lane.id, { lane_type: value })}
                  >
                    <SelectTrigger id={`lane-type-${lane.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`lane-staff-${lane.id}`}>Lane Staff</Label>
                      <Select
                    value={lane.staff_id || "__none"}
                    onValueChange={(value) => {
                      if (value === "__none") {
                        updateLane(lane.id, { staff_id: "", staff_name: "" });
                        return;
                      }
                      const member = (staffMembers || []).find((record) => String(record.id || "") === value);
                      updateLane(lane.id, {
                        staff_id: value,
                        staff_name: String(member?.name || lane.staff_name || "").trim(),
                      });
                    }}
                  >
                    <SelectTrigger id={`lane-staff-${lane.id}`}>
                      <SelectValue placeholder="No staff assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No staff assignment</SelectItem>
                      {(staffMembers || []).map((member) => {
                        const name = String(member.name || "").trim();
                        const staffId = String(member.id || "").trim();
                        const isUsedElsewhere =
                          staffId !== lane.staff_id && Number(staffUsage.get(staffId) || 0) > 0;
                        return (
                          <SelectItem key={`${lane.id}-${staffId}`} value={staffId} disabled={isUsedElsewhere}>
                            {name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`lane-color-${lane.id}`}>Lane Color</Label>
                  <Select
                    value={lane.color || "slate"}
                    onValueChange={(value) => updateLane(lane.id, { color: value })}
                  >
                    <SelectTrigger id={`lane-color-${lane.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANE_COLOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="icon" onClick={() => moveLane(index, -1)} disabled={index === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => moveLane(index, 1)}
                    disabled={index === draftLanes.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeLane(lane.id)}
                    disabled={draftLanes.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`lane-capacity-${lane.id}`}>Daily Capacity (hours)</Label>
                  <Input
                    id={`lane-capacity-${lane.id}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={lane.capacity_hours_per_day}
                    onChange={(event) => updateLane(lane.id, { capacity_hours_per_day: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`lane-crew-${lane.id}`}>Crew Size</Label>
                  <Input
                    id={`lane-crew-${lane.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={lane.crew_size}
                    onChange={(event) => updateLane(lane.id, { crew_size: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`lane-workstation-${lane.id}`}>Workstation / Area</Label>
                  <Input
                    id={`lane-workstation-${lane.id}`}
                    value={lane.workstation_name || ""}
                    onChange={(event) => updateLane(lane.id, { workstation_name: event.target.value })}
                    placeholder="e.g. CNC, Assembly bench, Install van"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addLane} className="w-full">
            <Plus className="h-4 w-4" />
            Add Lane
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={saveChanges}>
            Save Lanes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
