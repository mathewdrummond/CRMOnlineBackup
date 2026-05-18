import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Plus } from "lucide-react";
import {
  ACTIVITY_OPTIONS,
  activityRequiresJob,
  calculateHoursBetween,
  deriveLabourCategory,
  detectTimeEntryOverlap,
  requiresCommentWhenJobless,
} from "@/lib/timeclock";

const emptyForm = {
  staff_id: "",
  job_id: "",
  activity: "Labour",
  date: format(new Date(), "yyyy-MM-dd"),
  start_time: "07:30",
  end_time: "16:30",
  break_minutes: "30",
  description: "",
  manual_reason: "",
};

function buildDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return "";
  }

  return `${dateValue}T${timeValue}:00`;
}

export default function ManualTimeEntryDialog({
  open,
  onOpenChange,
  staff = [],
  jobs = [],
  entries = [],
  onSave,
  defaultStaffId = "",
  isAdmin = false,
}) {
  if (!isAdmin) {
    return null;
  }

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm((current) => ({
      ...emptyForm,
      staff_id: defaultStaffId || current.staff_id || "",
    }));
    setSaving(false);
    setError("");
  }, [defaultStaffId, open]);

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

  const startDateTime = buildDateTime(form.date, form.start_time);
  const endDateTime = buildDateTime(form.date, form.end_time);
  const breakMinutes = Number(form.break_minutes || 0);
  const calculatedHours = calculateHoursBetween(startDateTime, endDateTime, breakMinutes);
  const overlap = detectTimeEntryOverlap(
    {
      staff_id: form.staff_id,
      clock_in: startDateTime,
      clock_out: endDateTime,
    },
    entries
  );

  const handleSubmit = async () => {
    const trimmedStaffId = String(form.staff_id || "").trim();
    const trimmedActivity = String(form.activity || "").trim();
    const trimmedDate = String(form.date || "").trim();
    const trimmedDescription = String(form.description || "").trim();
    const parsedBreakMinutes = Number(form.break_minutes || 0);

    if (!trimmedStaffId || !trimmedActivity || !trimmedDate || !form.start_time || !form.end_time) {
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

    if (!calculatedHours || calculatedHours <= 0) {
      setError("Finish time must be after start time once break time is deducted.");
      return;
    }

    if (overlap) {
      setError("This correction overlaps another time entry for the selected staff member.");
      return;
    }

    if (!String(form.manual_reason || "").trim()) {
      setError("Manual corrections require a reason.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave({
        staff_id: trimmedStaffId,
        job_id: String(form.job_id || "").trim(),
        activity: trimmedActivity,
        date: trimmedDate,
        description: trimmedDescription,
        notes: trimmedDescription,
        clock_in: new Date(startDateTime).toISOString(),
        clock_out: new Date(endDateTime).toISOString(),
        hours: calculatedHours,
        break_minutes: parsedBreakMinutes,
        status: "completed",
        manual_override: true,
        manual_reason: String(form.manual_reason || "").trim(),
        labour_category: deriveLabourCategory({
          activity: trimmedActivity,
          description: trimmedDescription,
        }),
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError?.message || "The manual time entry could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manual Time Correction</DialogTitle>
          <DialogDescription>
            Add a completed time entry for missed clock-ins, late adjustments, or payroll corrections.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="manual-time-staff">Staff member</Label>
            <Select value={form.staff_id || "__none"} onValueChange={(value) => setForm((current) => ({ ...current, staff_id: value === "__none" ? "" : value }))}>
              <SelectTrigger className="min-h-[44px]" id="manual-time-staff">
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select staff member</SelectItem>
                {activeStaff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="manual-time-date">Date</Label>
            <Input
              className="min-h-[44px]"
              id="manual-time-date"
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="manual-time-job">Job</Label>
            <Select
              value={form.job_id || "__none"}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  job_id: value === "__none" ? "" : value,
                }))
              }
            >
              <SelectTrigger className="min-h-[44px]" id="manual-time-job">
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
            <Label htmlFor="manual-time-activity">Activity</Label>
            <Select value={form.activity} onValueChange={(value) => setForm((current) => ({ ...current, activity: value }))}>
              <SelectTrigger className="min-h-[44px]" id="manual-time-activity">
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
            <Label htmlFor="manual-time-start">Start time</Label>
            <Input
              className="min-h-[44px]"
              id="manual-time-start"
              type="time"
              value={form.start_time}
              onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="manual-time-end">Finish time</Label>
            <Input
              className="min-h-[44px]"
              id="manual-time-end"
              type="time"
              value={form.end_time}
              onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="manual-time-break">Unpaid break (minutes)</Label>
            <Input
              className="min-h-[44px]"
              id="manual-time-break"
              type="number"
              min="0"
              step="5"
              value={form.break_minutes}
              onChange={(event) => setForm((current) => ({ ...current, break_minutes: event.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="manual-time-hours">Calculated hours</Label>
            <Input className="min-h-[44px]" id="manual-time-hours" value={calculatedHours ? `${calculatedHours}h` : "—"} disabled readOnly />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-time-description">Notes</Label>
          <Textarea
            className="min-h-[104px]"
            id="manual-time-description"
            rows={3}
            placeholder="What work was completed?"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-time-reason">Correction reason</Label>
          <Textarea
            className="min-h-[88px]"
            id="manual-time-reason"
            rows={2}
            placeholder="Optional: note why this was entered manually"
            value={form.manual_reason}
            onChange={(event) => setForm((current) => ({ ...current, manual_reason: event.target.value }))}
          />
        </div>

        {overlap ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Overlapping entry detected</AlertTitle>
            <AlertDescription>
              This correction overlaps {overlap.job_number || overlap.job_name || overlap.activity || "another recorded session"} for the same staff member.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Manual correction blocked</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="min-h-[44px]" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-[44px]" onClick={() => void handleSubmit()} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save correction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
