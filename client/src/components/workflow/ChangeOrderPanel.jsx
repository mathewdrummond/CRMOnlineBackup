import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "../StatusBadge";
import { CHANGE_ORDER_STATUS_OPTIONS, getOptionMeta } from "../../lib/workflowReadiness";
import { formatCurrency, formatDate } from "../../lib/helpers";

const EMPTY_FORM = {
  title: "",
  amount: 0,
  requested_by: "",
  requested_date: "",
  due_date: "",
  impact: "",
  notes: "",
  status: "pricing",
};

export default function ChangeOrderPanel({
  title,
  description,
  changeOrders = [],
  onAdd,
  onUpdateStatus,
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const totalValue = changeOrders.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const handleAdd = async () => {
    if (!String(form.title || "").trim()) {
      return;
    }

    await onAdd?.(form);
    setForm(EMPTY_FORM);
    setOpen(false);
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            Add change order
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Variations</p>
            <p className="mt-1 text-2xl font-semibold">{changeOrders.length}</p>
          </div>
          <div className="rounded-xl border bg-muted/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Variation Value</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(totalValue)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {changeOrders.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
              No change orders recorded yet.
            </div>
          ) : changeOrders.map((entry) => {
            const meta = getOptionMeta(CHANGE_ORDER_STATUS_OPTIONS, entry.status, "Change");
            return (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{entry.title}</p>
                      <StatusBadge label={meta.label} color={meta.color} className="text-[10px]" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[entry.requested_by, entry.requested_date ? `Requested ${formatDate(entry.requested_date)}` : "", entry.due_date ? `Due ${formatDate(entry.due_date)}` : ""].filter(Boolean).join(" · ")}
                    </p>
                    {entry.impact ? <p className="mt-2 text-sm text-muted-foreground">{entry.impact}</p> : null}
                    {entry.notes ? <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(entry.amount)}</span>
                    <Select value={entry.status} onValueChange={(value) => onUpdateStatus?.(entry.id, value)}>
                      <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANGE_ORDER_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Change Order</DialogTitle>
            <DialogDescription>Record the scope, amount, status, and reason for a job change order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANGE_ORDER_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Requested By</Label>
                <Input value={form.requested_by} onChange={(event) => setForm((current) => ({ ...current, requested_by: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Requested Date</Label>
                <Input type="date" value={form.requested_date} onChange={(event) => setForm((current) => ({ ...current, requested_date: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Delivery / Programme Impact</Label>
              <Input value={form.impact} onChange={(event) => setForm((current) => ({ ...current, impact: event.target.value }))} placeholder="e.g. adds one extra install day" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleAdd()} disabled={!String(form.title || "").trim()}>
                Add Change Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
