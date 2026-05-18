import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "../StatusBadge";
import {
  LABOUR_CATEGORIES,
  buildActualLabourSummary,
  buildTimeEntryAssignmentPatch,
  buildTimeEntryAuditEvent,
  getActualLabourDurationHours,
  getTimeEntryEndValue,
  getTimeEntryStartValue,
  isExcludedFromLabourCosting,
  mapTimeEntryToLabourCategory,
} from "../../lib/actualLabour";
import { formatCurrency, formatDate } from "../../lib/helpers";

function formatHours(value) {
  return `${(Number(value) || 0).toFixed(1)}h`;
}

function formatTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function appendAuditEvent(entry, event) {
  const existing = Array.isArray(entry?.labour_audit) ? entry.labour_audit : [];
  return [...existing, event];
}

function TimeEntryReviewRow({ entry, jobs, quoteId, defaultJobId, onUpdateTimeEntry }) {
  const [note, setNote] = useState(entry.costing_note || entry.notes || "");
  const category = mapTimeEntryToLabourCategory(entry);
  const linkedJob = jobs.find((job) => String(job.id) === String(entry.job_id));
  const excluded = isExcludedFromLabourCosting(entry);
  const duration = getActualLabourDurationHours(entry);

  const updateEntry = async (patch, action) => {
    await onUpdateTimeEntry?.(entry.id, {
      ...patch,
      labour_audit: appendAuditEvent(entry, buildTimeEntryAuditEvent(action, entry)),
    });
  };

  return (
    <div className={`grid gap-3 border-t border-border/45 p-4 text-sm xl:grid-cols-[92px_130px_1.2fr_150px_76px_76px_76px_1fr_180px] ${excluded ? "bg-muted/40 opacity-70" : ""}`}>
      <div>
        <p className="font-medium">{entry.date ? formatDate(entry.date) : formatDate(getTimeEntryStartValue(entry))}</p>
      </div>
      <div>
        <p className="font-medium">{entry.staff_name || "Unassigned"}</p>
      </div>
      <div>
        <p className="font-medium">{entry.task_name || entry.activity || entry.operation || entry.job_operation_label || "Time entry"}</p>
        <p className="text-xs text-muted-foreground">{entry.source === "manual" ? "Manual entry" : "From timeclock"}</p>
      </div>
      <Select value={category} onValueChange={(value) => updateEntry({ labour_category: value, costing_reviewed: false }, "time entry category changed")}>
        <SelectTrigger className="min-h-10"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LABOUR_CATEGORIES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
      <div>{formatTime(getTimeEntryStartValue(entry))}</div>
      <div>{formatTime(getTimeEntryEndValue(entry))}</div>
      <div className="font-semibold">{formatHours(duration)}</div>
      <div>
        <p>{linkedJob?.job_number || entry.job_number || (entry.quote_id ? "Linked to quote" : "Unassigned")}</p>
        {entry.costing_reviewed ? <StatusBadge label="Reviewed" color="emerald" /> : <StatusBadge label="Needs Review" color="amber" />}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {!entry.quote_id && !entry.job_id ? (
          <Button
            size="sm"
            variant="outline"
            className="min-h-10"
            onClick={() => updateEntry(buildTimeEntryAssignmentPatch(entry, { quoteId, jobId: defaultJobId, labourCategory: category }), "time entry linked to quote")}
          >
            Assign
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="min-h-10" onClick={() => updateEntry({ quote_id: "", job_id: "", costing_reviewed: false }, "time entry unlinked from quote")}>Unlink</Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="min-h-10"
          onClick={() => updateEntry({ exclude_from_costing: !excluded, excluded_from_costing: !excluded, costing_reviewed: false }, excluded ? "time entry included in costing" : "time entry excluded from costing")}
        >
          {excluded ? "Include" : "Exclude"}
        </Button>
        <Button size="sm" className="min-h-10 bg-[#4f5148] text-white hover:bg-[#3f4239]" onClick={() => updateEntry({ costing_reviewed: true, reviewed_at: new Date().toISOString() }, "time entry reviewed")}>Reviewed</Button>
      </div>
      <div className="xl:col-span-9">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a simple review note"
            className="min-h-11"
          />
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => updateEntry({ costing_note: note }, "time entry note added")}
          >
            Save note
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ActualLabourPanel({
  quoteId = "",
  jobIds = [],
  jobs = [],
  entries = [],
  operations = [],
  quoteItems = [],
  labourRate = 0,
  labourSellAllowance,
  onUpdateTimeEntry,
}) {
  const [showReview, setShowReview] = useState(false);
  const summary = useMemo(() => buildActualLabourSummary({
    quoteId,
    jobIds,
    entries,
    operations,
    quoteItems,
    labourRate,
    labourSellAllowance,
  }), [entries, jobIds, labourRate, labourSellAllowance, operations, quoteId, quoteItems]);

  const defaultJobId = jobIds[0] || "";
  const reviewEntries = [...summary.entries, ...summary.unassignedEntries];
  const varianceTone = summary.varianceHours > 0 ? "amber" : "emerald";

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">Actual Labour</h3>
            <StatusBadge label="Uses timeclock" color="blue" />
            {summary.unassignedEntries.length ? <StatusBadge label={`${summary.unassignedEntries.length} unassigned`} color="amber" /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Actual hours come from clocked time. Use Review Time Entries to link missed time, check categories, or exclude entries that should not affect costing.
          </p>
        </div>
        <Button className="jf-workshop-touch bg-[#4f5148] text-white hover:bg-[#3f4239]" onClick={() => setShowReview((current) => !current)}>
          {showReview ? "Hide Time Entries" : "Review Time Entries"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-[10px] border border-border/55 bg-white/58 p-3">
          <p className="text-xs text-muted-foreground">Estimated</p>
          <p className="text-xl font-bold">{formatHours(summary.estimatedHours)}</p>
        </div>
        <div className="rounded-[10px] border border-border/55 bg-white/58 p-3">
          <p className="text-xs text-muted-foreground">Actual</p>
          <p className="text-xl font-bold">{formatHours(summary.actualHours)}</p>
        </div>
        <div className="rounded-[10px] border border-border/55 bg-white/58 p-3">
          <p className="text-xs text-muted-foreground">Variance</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">{formatHours(summary.varianceHours)}</p>
            <StatusBadge label={`${summary.variancePercent.toFixed(1)}%`} color={varianceTone} />
          </div>
        </div>
        <div className="rounded-[10px] border border-border/55 bg-white/58 p-3">
          <p className="text-xs text-muted-foreground">Labour cost</p>
          <p className="text-xl font-bold">{formatCurrency(summary.labourCost)}</p>
        </div>
        <div className="rounded-[10px] border border-border/55 bg-white/58 p-3">
          <p className="text-xs text-muted-foreground">Allowance impact</p>
          <p className={`text-xl font-bold ${summary.labourProfitLossImpact < 0 ? "text-amber-700" : "text-emerald-700"}`}>
            {formatCurrency(summary.labourProfitLossImpact)}
          </p>
        </div>
      </div>

      {summary.unassignedEntries.length ? (
        <div className="mt-4 rounded-[10px] border border-[#dfc38e] bg-[#f2e2c6]/70 p-3 text-sm text-[#7a5621]">
          Some clocked time has no quote or job attached. Assign it here so labour cost and future estimates stay accurate.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[10px] border border-border/55 bg-white/50">
          <div className="border-b bg-muted/20 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By category</div>
          {summary.breakdown.byCategory.length ? summary.breakdown.byCategory.map((row) => (
            <div key={row.category} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0">
              <span>{row.category}</span>
              <span className="font-semibold">{formatHours(row.hours)}</span>
            </div>
          )) : <p className="p-3 text-sm text-muted-foreground">No linked time yet.</p>}
        </div>
        <div className="rounded-[10px] border border-border/55 bg-white/50">
          <div className="border-b bg-muted/20 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By staff member</div>
          {summary.breakdown.byStaff.length ? summary.breakdown.byStaff.map((row) => (
            <div key={row.staff_id || row.staff_name} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0">
              <span>{row.staff_name}</span>
              <span className="font-semibold">{formatHours(row.hours)}</span>
            </div>
          )) : <p className="p-3 text-sm text-muted-foreground">No linked time yet.</p>}
        </div>
      </div>

      {showReview ? (
        <div className="mt-5 overflow-hidden rounded-[10px] border border-border/55">
          <div className="grid gap-2 bg-white/55 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground xl:grid-cols-[92px_130px_1.2fr_150px_76px_76px_76px_1fr_180px]">
            <span>Date</span>
            <span>Staff</span>
            <span>Task / activity</span>
            <span>Category</span>
            <span>Start</span>
            <span>End</span>
            <span>Time</span>
            <span>Linked quote/job</span>
            <span className="text-right">Actions</span>
          </div>
          {reviewEntries.length ? reviewEntries.map((entry) => (
            <TimeEntryReviewRow
              key={entry.id}
              entry={entry}
              jobs={jobs}
              quoteId={quoteId}
              defaultJobId={defaultJobId}
              onUpdateTimeEntry={onUpdateTimeEntry}
            />
          )) : <p className="p-6 text-center text-sm text-muted-foreground">No time entries to review.</p>}
        </div>
      ) : null}
    </Card>
  );
}
