import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "../StatusBadge";
import { APPROVAL_STATUS_OPTIONS, getOptionMeta } from "../../lib/workflowReadiness";
import { formatDate } from "../../lib/helpers";

export default function ApprovalPanel({
  title,
  description,
  status,
  owner,
  requestedDate,
  completedDate,
  history = [],
  onPatch,
  onQuickAction,
}) {
  const [note, setNote] = useState("");
  const statusMeta = getOptionMeta(APPROVAL_STATUS_OPTIONS, status, "Approval");

  const triggerAction = async (nextStatus) => {
    await onQuickAction?.(nextStatus, note);
    setNote("");
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <StatusBadge label={statusMeta.label} color={statusMeta.color} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status || "draft"} onValueChange={(value) => onPatch?.({ approval_status: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPROVAL_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Owner</Label>
          <Input value={owner || ""} onChange={(event) => onPatch?.({ approval_owner: event.target.value })} placeholder="Who is responsible" />
        </div>
        <div className="space-y-2">
          <Label>Requested</Label>
          <Input type="date" value={requestedDate || ""} onChange={(event) => onPatch?.({ approval_requested_date: event.target.value })} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Label>Completed</Label>
          <Input type="date" value={completedDate || ""} onChange={(event) => onPatch?.({ approval_completed_date: event.target.value })} />
        </div>
        <div className="flex items-end">
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {completedDate ? `Completed ${formatDate(completedDate)}` : "No completed date recorded"}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label>Approval Note</Label>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Record what changed, what was approved, or what still needs attention…"
          rows={3}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void triggerAction("pending_internal")}>
          Request review
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void triggerAction("changes_requested")}>
          Request changes
        </Button>
        <Button type="button" size="sm" onClick={() => void triggerAction("approved")}>
          Mark approved
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Approval History</p>
          <p className="text-xs text-muted-foreground">{history.length} event{history.length === 1 ? "" : "s"}</p>
        </div>
        {history.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            No approval events recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {history.slice().reverse().slice(0, 5).map((entry) => {
              const entryMeta = getOptionMeta(APPROVAL_STATUS_OPTIONS, entry.status, "Approval");
              return (
                <div key={entry.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={entryMeta.label} color={entryMeta.color} className="text-[10px]" />
                      <span className="text-sm font-medium text-foreground">{entry.actor || "System"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                  </div>
                  {entry.note ? <p className="mt-2 text-sm text-muted-foreground">{entry.note}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
