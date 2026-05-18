import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Pencil, ShieldAlert } from "lucide-react";
import { useSortableRows } from "@/lib/tableSorting";
import {
  ACTIVITY_OPTIONS,
  activityRequiresJob,
  calculateHoursBetween,
  deriveLabourCategory,
  getTimeEntrySegments,
  getLiveTrackedMinutes,
  isBreakEntry,
  normalizeTimeEntryStatus,
  requiresCommentWhenJobless,
} from "@/lib/timeclock";

function formatEntryDate(entry) {
  if (!entry.date && !entry.clock_in) {
    return "—";
  }

  return format(new Date(entry.date || entry.clock_in), "MMM d, yyyy");
}

function formatEntryTime(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return format(parsed, "HH:mm");
}

function getJobName(entry) {
  return entry.job_name || entry.job_title || "Unassigned work";
}

function buildFormDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return format(parsed, "yyyy-MM-dd");
}

function buildFormTime(value, fallback = "") {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return format(parsed, "HH:mm");
}

function buildInitialForm(entry) {
  const fallbackStart = entry.date ? `${entry.date}T07:30:00` : "";
  const fallbackEnd = entry.date ? `${entry.date}T${String(7 + Math.floor(Number(entry.hours || 0))).padStart(2, "0")}:30:00` : "";

  return {
    staff_id: entry.staff_id || "",
    job_id: entry.job_id || "",
    date: buildFormDate(entry.date || entry.clock_in || entry.clock_out),
    start_time: buildFormTime(entry.clock_in, buildFormTime(fallbackStart, "07:30")),
    end_time: buildFormTime(entry.clock_out, buildFormTime(fallbackEnd, "16:30")),
    break_minutes: String(entry.break_minutes ?? 0),
    activity: entry.activity || "Labour",
    description: entry.description || entry.notes || "",
    manual_reason: entry.manual_reason || "",
  };
}

function buildDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return "";
  }

  return `${dateValue}T${timeValue}:00`;
}

function formatStatusLabel(entry) {
  const status = normalizeTimeEntryStatus(entry.status);
  if (status === "paused") {
    return "Paused";
  }
  if (status === "completed") {
    return "Completed";
  }
  return isBreakEntry(entry) ? "On break" : "Active";
}

function getStatusBadgeClass(entry) {
  const status = normalizeTimeEntryStatus(entry.status);
  if (status === "paused") {
    return "border-[#d5c7b7] bg-[#e7ded2] text-[#4f4137]";
  }
  if (status === "completed") {
    return "border-[#d5c7b7] bg-[#e7ded2] text-[#4f4137]";
  }
  if (isBreakEntry(entry)) {
    return "border-[#dfc38e] bg-[#f2e2c6] text-[#7a5621]";
  }
  return "border-[#c9d7be] bg-[#e6ece0] text-[#4f6540]";
}

function formatTrackedHours(entry) {
  return `${(getLiveTrackedMinutes(entry) / 60).toFixed(2)}h`;
}

function formatSegmentDurationMinutes(segment) {
  if (segment.ended_at) {
    return Number(segment.duration_minutes || 0);
  }

  return Math.max(0, Math.round((Date.now() - new Date(segment.started_at).getTime()) / (1000 * 60)));
}

const TIME_ENTRY_SORT_COLUMNS = {
  date: { accessor: (entry) => entry.date || entry.clock_in || entry.clock_out, type: "date" },
  staff: { accessor: (entry) => entry.staff_name, type: "text" },
  job: { accessor: (entry) => getJobName(entry), type: "text" },
  time: { accessor: (entry) => entry.clock_in, type: "date" },
  hours: { accessor: (entry) => getLiveTrackedMinutes(entry) / 60, type: "number" },
  notes: { accessor: (entry) => entry.description || entry.notes, type: "text" },
  status: { accessor: (entry) => `${entry.activity || ""} ${formatStatusLabel(entry)} ${entry.exported ? "Exported" : "Pending"}`, type: "status" },
};

export default function TimeEntryTable({ entries, onVoid, onEdit, staff = [], jobs = [], isAdmin = false }) {
  const [editingEntry, setEditingEntry] = useState(null);
  const [detailEntry, setDetailEntry] = useState(null);
  const [form, setForm] = useState(buildInitialForm({}));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeStaff = useMemo(
    () => staff.filter((member) => String(member.status || "active").toLowerCase() === "active"),
    [staff]
  );
  const activeJobs = useMemo(
    () => jobs
      .filter((job) => !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").toLowerCase()))
      .sort((left, right) => `${left.job_number || ""} ${left.title || left.job_name || ""}`.localeCompare(`${right.job_number || ""} ${right.title || right.job_name || ""}`)),
    [jobs]
  );

  const detailSegments = useMemo(
    () => (detailEntry ? getTimeEntrySegments(detailEntry) : []),
    [detailEntry]
  );
  const { sortedRows: sortedEntries, sortState, requestSort } = useSortableRows(entries || [], TIME_ENTRY_SORT_COLUMNS);

  if (!entries || entries.length === 0) {
    return null;
  }

  const openEdit = (entry) => {
    setEditingEntry(entry);
    setForm(buildInitialForm(entry));
    setError("");
  };

  const closeEdit = () => {
    setEditingEntry(null);
    setForm(buildInitialForm({}));
    setError("");
    setSaving(false);
  };

  const saveEdit = async () => {
    const trimmedDate = String(form.date || "").trim();
    const trimmedStaffId = String(form.staff_id || "").trim();
    const trimmedActivity = String(form.activity || "").trim();
    const trimmedDescription = String(form.description || "").trim();
    const parsedBreakMinutes = Number(form.break_minutes || 0);

    if (!trimmedStaffId || !trimmedDate || !trimmedActivity || !form.start_time || !form.end_time) {
      setError("Staff member, date, start time, finish time, and activity are required.");
      return;
    }

    if (activityRequiresJob(trimmedActivity) && !String(form.job_id || "").trim()) {
      setError("A job is required for this activity.");
      return;
    }

    if (!String(form.job_id || "").trim() && requiresCommentWhenJobless(trimmedActivity) && !trimmedDescription) {
      setError("A comment is required for non-chargeable time without a job.");
      return;
    }

    if (Number.isNaN(parsedBreakMinutes) || parsedBreakMinutes < 0) {
      setError("Break minutes must be zero or more.");
      return;
    }

    const startDateTime = buildDateTime(trimmedDate, form.start_time);
    const endDateTime = buildDateTime(trimmedDate, form.end_time);
    const hours = calculateHoursBetween(startDateTime, endDateTime, parsedBreakMinutes);

    if (hours <= 0) {
      setError("Finish time must be after start time once break time is deducted.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onEdit(editingEntry.id, {
        staff_id: trimmedStaffId,
        job_id: String(form.job_id || "").trim(),
        date: trimmedDate,
        activity: trimmedActivity,
        description: trimmedDescription,
        notes: trimmedDescription,
        clock_in: new Date(startDateTime).toISOString(),
        clock_out: new Date(endDateTime).toISOString(),
        hours,
        break_minutes: parsedBreakMinutes,
        manual_reason: String(form.manual_reason || "").trim(),
        labour_category: deriveLabourCategory({
          activity: trimmedActivity,
          description: trimmedDescription,
        }),
        status: "completed",
      });
      closeEdit();
    } catch (saveError) {
      setError(saveError?.message || "The time entry could not be saved.");
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-white/55">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl">Recent Time Entries</CardTitle>
            <p className="text-sm text-muted-foreground">Completed entries stay visible for review. Office/Admin can correct them, and entries are voided instead of deleted.</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader as={TableHead} columnKey="date" sortState={sortState} onSort={requestSort}>Date</SortableHeader>
                  <SortableHeader as={TableHead} columnKey="staff" sortState={sortState} onSort={requestSort}>Staff</SortableHeader>
                  <SortableHeader as={TableHead} columnKey="job" sortState={sortState} onSort={requestSort}>Job / Task</SortableHeader>
                  <SortableHeader as={TableHead} columnKey="time" sortState={sortState} onSort={requestSort}>Time</SortableHeader>
                  <SortableHeader as={TableHead} columnKey="hours" sortState={sortState} onSort={requestSort}>Hours</SortableHeader>
                  <SortableHeader as={TableHead} columnKey="notes" sortState={sortState} onSort={requestSort} className="hidden xl:table-cell">Notes</SortableHeader>
                  <SortableHeader as={TableHead} columnKey="status" sortState={sortState} onSort={requestSort}>Status</SortableHeader>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="py-4 text-base whitespace-nowrap">{formatEntryDate(entry)}</TableCell>
                    <TableCell className="py-4">
                      <div className="font-medium text-foreground">{entry.staff_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{entry.employee_id || "No card ID"}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="font-medium text-foreground">{getJobName(entry)}</div>
                      <div className="text-sm text-muted-foreground">
                        {[entry.job_number, entry.activity].filter(Boolean).join(" · ") || "General"}
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatEntryTime(entry.clock_in)} - {formatEntryTime(entry.clock_out)}
                    </TableCell>
                    <TableCell className="py-4 font-mono text-base tabular-nums whitespace-nowrap">{formatTrackedHours(entry)}</TableCell>
                    <TableCell className="hidden max-w-[260px] py-4 text-sm text-muted-foreground xl:table-cell">
                      <div className="truncate">{entry.description || entry.notes || "—"}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col items-start gap-2">
                        <Badge variant="outline">{isBreakEntry(entry) ? "Break" : entry.activity || "Work"}</Badge>
                        <Badge variant="outline" className={getStatusBadgeClass(entry)}>{formatStatusLabel(entry)}</Badge>
                        {Array.isArray(entry.segments) && entry.segments.length > 1 ? (
                          <Badge variant="secondary">{entry.segments.length} segments</Badge>
                        ) : null}
                        {entry.exported ? (
                          <Badge variant="secondary">Exported</Badge>
                        ) : (
                          <Badge variant="outline" className="border-[#dfc38e] bg-[#f2e2c6] text-[#7a5621]">Pending</Badge>
                        )}
                        {entry.voided ? (
                          <Badge variant="secondary">Voided</Badge>
                        ) : null}
                        {entry.review_required ? (
                          <Badge variant="outline">Needs review</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-muted-foreground hover:text-foreground"
                          onClick={() => setDetailEntry(entry)}
                          aria-label={`View time entry details for ${entry.staff_name}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && !entry.exported && !entry.voided && onEdit && (!Array.isArray(entry.segments) || entry.segments.length <= 1) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(entry)}
                            aria-label={`Edit time entry for ${entry.staff_name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {isAdmin && !entry.exported && !entry.voided && onVoid ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-muted-foreground hover:text-amber-700"
                            onClick={() => onVoid(entry.id)}
                            aria-label={`Void time entry for ${entry.staff_name}`}
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingEntry)} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>
              Update the completed time entry and keep payroll, job costing, and activity mapping in sync.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="time-entry-staff">Staff Member</Label>
              <Select value={form.staff_id || "__none"} onValueChange={(value) => setForm((current) => ({ ...current, staff_id: value === "__none" ? "" : value }))}>
                <SelectTrigger id="time-entry-staff" className="min-h-[44px]">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No staff selected</SelectItem>
                  {activeStaff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="time-entry-date">Date</Label>
              <Input className="min-h-[44px]" id="time-entry-date" type="date" value={form.date || ""} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </div>

            <div>
              <Label htmlFor="time-entry-job">Job</Label>
              <Select
                value={form.job_id || "__none"}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  job_id: value === "__none" ? "" : value,
                }))
              }
            >
                <SelectTrigger className="min-h-[44px]" id="time-entry-job">
                  <SelectValue placeholder="Select job" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No linked job</SelectItem>
                  {activeJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number} — {job.title || job.job_name || "Untitled Job"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="time-entry-activity">Activity</Label>
              <Select value={form.activity || "Labour"} onValueChange={(value) => setForm((current) => ({ ...current, activity: value }))}>
                <SelectTrigger className="min-h-[44px]" id="time-entry-activity">
                  <SelectValue placeholder="Select activity" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((activity) => (
                    <SelectItem key={activity.value} value={activity.value}>{activity.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="time-entry-start">Start Time</Label>
              <Input className="min-h-[44px]" id="time-entry-start" type="time" value={form.start_time || ""} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} />
            </div>

            <div>
              <Label htmlFor="time-entry-end">Finish Time</Label>
              <Input className="min-h-[44px]" id="time-entry-end" type="time" value={form.end_time || ""} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} />
            </div>

            <div>
              <Label htmlFor="time-entry-break">Break Minutes</Label>
              <Input className="min-h-[44px]" id="time-entry-break" type="number" min="0" step="5" value={form.break_minutes || "0"} onChange={(event) => setForm((current) => ({ ...current, break_minutes: event.target.value }))} />
            </div>

            <div>
              <Label htmlFor="time-entry-hours">Calculated Hours</Label>
              <Input
                className="min-h-[44px]"
                id="time-entry-hours"
                value={calculateHoursBetween(buildDateTime(form.date, form.start_time), buildDateTime(form.date, form.end_time), Number(form.break_minutes || 0)) || ""}
                disabled
                readOnly
              />
            </div>
          </div>

          <div>
            <Label htmlFor="time-entry-description">Notes</Label>
            <Textarea className="min-h-[104px]" id="time-entry-description" value={form.description || ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
          </div>

          <div>
            <Label htmlFor="time-entry-reason">Correction Reason</Label>
            <Textarea className="min-h-[88px]" id="time-entry-reason" value={form.manual_reason || ""} onChange={(event) => setForm((current) => ({ ...current, manual_reason: event.target.value }))} rows={2} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="min-h-[44px]" variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button className="min-h-[44px]" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailEntry)} onOpenChange={(open) => { if (!open) setDetailEntry(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Time Entry Details</DialogTitle>
            <DialogDescription>
              Review the full timer history, including every pause-and-resume segment recorded for this entry.
            </DialogDescription>
          </DialogHeader>

          {detailEntry ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Staff</p>
                  <p className="mt-1 font-medium text-foreground">{detailEntry.staff_name || "—"}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Job</p>
                  <p className="mt-1 font-medium text-foreground">{getJobName(detailEntry)}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tracked</p>
                  <p className="mt-1 font-medium text-foreground">{formatTrackedHours(detailEntry)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{isBreakEntry(detailEntry) ? "Break" : detailEntry.activity || "Work"}</Badge>
                <Badge variant="outline" className={getStatusBadgeClass(detailEntry)}>{formatStatusLabel(detailEntry)}</Badge>
                <Badge variant="secondary">{detailSegments.length || 1} segment{detailSegments.length === 1 ? "" : "s"}</Badge>
                {detailEntry.voided ? <Badge variant="secondary">Voided</Badge> : null}
                {detailEntry.review_required ? <Badge variant="outline">Needs review</Badge> : null}
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Segment</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ended</TableHead>
                      <TableHead>Minutes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailSegments.map((segment, index) => (
                      <TableRow key={`${segment.started_at}-${index}`}>
                        <TableCell className="font-medium text-foreground">#{index + 1}</TableCell>
                        <TableCell>{format(new Date(segment.started_at), "MMM d, yyyy HH:mm")}</TableCell>
                        <TableCell>{segment.ended_at ? format(new Date(segment.ended_at), "MMM d, yyyy HH:mm") : "Live"}</TableCell>
                        <TableCell>{formatSegmentDurationMinutes(segment)} min</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
