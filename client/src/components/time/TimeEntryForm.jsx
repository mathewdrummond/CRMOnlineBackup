import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Play, TimerReset, TriangleAlert } from "lucide-react";
import ManualTimeEntryDialog from "./ManualTimeEntryDialog";
import {
  ACTIVITY_OPTIONS,
  activityRequiresJob,
  deriveLabourCategory,
  getActiveEntryForStaff,
  getActivityMeta,
  hasOpenAttendance,
  requiresCommentWhenJobless,
  getRecentSuggestions,
  isBreakEntry,
} from "@/lib/timeclock";

const emptyForm = {
  staff_id: "",
  job_id: "",
  date: format(new Date(), "yyyy-MM-dd"),
  activity: "Labour",
  description: "",
};

function readLegacyActiveTimers() {
  if (
    typeof window === "undefined"
    || typeof window.localStorage === "undefined"
    || typeof window.localStorage?.getItem !== "function"
  ) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem("activeTimers");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLegacyActiveTimers() {
  if (
    typeof window === "undefined"
    || typeof window.localStorage === "undefined"
    || typeof window.localStorage?.removeItem !== "function"
  ) {
    return;
  }

  try {
    window.localStorage.removeItem("activeTimers");
  } catch {
    // Ignore storage cleanup failures in restricted browser modes.
  }
}

export default function TimeEntryForm({
  staff,
  jobs,
  entries = [],
  activeTimers = [],
  clockIns = [],
  timersLoaded = false,
  onStart,
  onAddManual,
  isAdmin = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const migratedLegacyTimers = useRef(false);

  const activeStaff = useMemo(
    () => staff.filter((person) => String(person.status || "active").toLowerCase() === "active"),
    [staff]
  );
  const activeJobs = useMemo(
    () => jobs
      .filter((job) => !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").toLowerCase()))
      .sort((left, right) => `${left.job_number || ""} ${left.title || left.job_name || ""}`.localeCompare(`${right.job_number || ""} ${right.title || right.job_name || ""}`)),
    [jobs]
  );
  const selectedStaff = useMemo(() => staff.find((member) => member.id === form.staff_id) || null, [form.staff_id, staff]);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === form.job_id) || null, [form.job_id, jobs]);
  const selectedActivity = useMemo(() => getActivityMeta(form.activity), [form.activity]);
  const selectedActiveEntry = useMemo(
    () => getActiveEntryForStaff(activeTimers, form.staff_id),
    [activeTimers, form.staff_id]
  );
  const recentSuggestions = useMemo(
    () => getRecentSuggestions(entries, form.staff_id),
    [entries, form.staff_id]
  );

  useEffect(() => {
    if (!timersLoaded || migratedLegacyTimers.current) {
      return;
    }

    migratedLegacyTimers.current = true;
    const savedTimers = readLegacyActiveTimers();
    if (!Array.isArray(savedTimers) || savedTimers.length === 0) {
      return;
    }

    const existingKeys = new Set(
      activeTimers.map((timer) => `${timer.staff_id}|${timer.job_id}|${timer.clock_in}|${timer.activity}|${timer.description || ""}`)
    );

    const migrate = async () => {
      for (const timer of savedTimers) {
        const clockIn = timer.clock_in || new Date(timer.startTime || Date.now()).toISOString();
        const key = `${timer.staff_id}|${timer.job_id}|${clockIn}|${timer.activity}|${timer.description || ""}`;
        if (existingKeys.has(key)) {
          continue;
        }

        await onStart({
          staff_id: timer.staff_id,
          job_id: timer.job_id,
          date: timer.date || format(new Date(clockIn), "yyyy-MM-dd"),
          activity: timer.activity || "Labour",
          description: timer.description || "",
          notes: timer.description || "",
          status: "active",
          clock_in: clockIn,
        });
      }

      clearLegacyActiveTimers();
    };

    void migrate();
  }, [activeTimers, onStart, timersLoaded]);

  const requiresJob = activityRequiresJob(form.activity);
  const needsComment = !form.job_id && requiresCommentWhenJobless(form.activity);
  const attendanceOpen = hasOpenAttendance(clockIns, form.staff_id);
  const canStart = form.staff_id && attendanceOpen && (!requiresJob || form.job_id) && (!needsComment || form.description.trim());
  const duplicateActiveSelection = Boolean(
    selectedActiveEntry
    && !isBreakEntry(selectedActiveEntry)
    && selectedActiveEntry.job_id === form.job_id
    && String(selectedActiveEntry.activity || "") === String(form.activity || "")
  );

  const handleStart = async () => {
    if (!canStart || duplicateActiveSelection) {
      return;
    }

    await onStart({
      staff_id: form.staff_id,
      job_id: form.job_id,
      date: form.date || format(new Date(), "yyyy-MM-dd"),
      activity: form.activity,
      description: form.description.trim(),
      notes: form.description.trim(),
      labour_category: deriveLabourCategory({
        activity: form.activity,
        description: form.description.trim(),
      }),
      job_operation_id: "",
      job_operation_label: "",
      workflow_phase: "",
      status: "active",
      clock_in: new Date().toISOString(),
      entry_kind: form.activity === "Break" ? "break" : "work",
    });

    setForm((current) => ({
      ...current,
      job_id: "",
      description: "",
      activity: current.activity,
      date: format(new Date(), "yyyy-MM-dd"),
    }));
  };

  const startLabel = !selectedActiveEntry
    ? "Start Timer"
    : isBreakEntry(selectedActiveEntry)
      ? "Resume Work"
      : "Switch Timer";

  return (
    <>
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-white/55">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">Start Work</CardTitle>
                <p className="text-sm text-muted-foreground">Pick the staff member, choose the job, then start the timer.</p>
              </div>
              {isAdmin ? (
                <Button type="button" variant="outline" className="jf-workshop-touch" onClick={() => setManualDialogOpen(true)}>
                  <TimerReset className="mr-2 h-4 w-4" />
                  Manual correction
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-4 lg:p-5">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Staff Member</Label>
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-4">
                  {activeStaff.map((member) => {
                    const currentEntry = getActiveEntryForStaff(activeTimers, member.id);
                    const active = form.staff_id === member.id;
                    return (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => setForm((current) => ({ ...current, staff_id: member.id }))}
                      className={`min-h-[104px] rounded-[10px] border px-4 py-4 text-left transition-all ${
                          active
                            ? "border-[#4f5148] bg-[#4f5148] text-white shadow"
                            : "border-border/60 bg-white/70 hover:border-primary/40 hover:bg-muted/35"
                        }`}
                      >
                        <div className="font-semibold">{member.name}</div>
                      <div className={`mt-1 text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {currentEntry ? (isBreakEntry(currentEntry) ? "Currently on break" : `Clocked on ${currentEntry.job_number || currentEntry.activity}`) : "Ready to clock on"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {recentSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">Recent for {selectedStaff?.name}</Label>
                  <div className="flex flex-wrap gap-2">
                    {recentSuggestions.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            job_id: entry.job_id || "",
                            activity: entry.activity || current.activity,
                            description: current.description || entry.description || "",
                          }))
                        }
                        className="min-h-[44px] rounded-[10px] border border-border/60 bg-white/70 px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-muted/35"
                      >
                        {entry.job_number || "No job"} · {entry.activity || "Work"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedActiveEntry ? (
                <Alert className="border-amber-300 bg-amber-50/70 text-amber-900">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>
                    {selectedStaff?.name || "This staff member"} already has a live session
                  </AlertTitle>
                  <AlertDescription>
                    {isBreakEntry(selectedActiveEntry)
                      ? "Starting a new timer will end the break and resume the selected work."
                      : "Starting a new timer will pause the current session and switch them onto the new job or activity cleanly."}
                  </AlertDescription>
                </Alert>
              ) : null}

              {duplicateActiveSelection ? (
                <Alert variant="destructive">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>This timer is already running</AlertTitle>
                  <AlertDescription>Select a different job or activity before starting again.</AlertDescription>
                </Alert>
              ) : null}

              {form.staff_id && !attendanceOpen ? (
                <Alert variant="destructive">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>Attendance clock-in required</AlertTitle>
                  <AlertDescription>Clock in for attendance before starting any job timer.</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(180px,0.8fr)]">
                <div className="space-y-2">
                  <Label htmlFor="time-entry-job" className="text-base font-semibold">
                    Job {requiresJob ? <span className="text-destructive">*</span> : <span className="text-muted-foreground text-sm font-normal">(optional)</span>}
                  </Label>
                  <Select
                    value={form.job_id || "__none"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        job_id: value === "__none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="time-entry-job" className="jf-workshop-touch">
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
                <div className="space-y-2">
                  <Label htmlFor="time-entry-date" className="text-base font-semibold">Date</Label>
                  <Input
                    id="time-entry-date"
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                    className="jf-workshop-touch"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Activity</Label>
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-4">
                  {ACTIVITY_OPTIONS.map((activity) => (
                    <button
                      type="button"
                      key={activity.value}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          activity: activity.value,
                        }))
                      }
                      className={`min-h-[104px] rounded-[10px] border px-4 py-4 text-left text-sm transition ${
                        form.activity === activity.value
                          ? "border-[#4f5148] bg-[#4f5148] text-white shadow"
                          : "border-border/60 bg-white/70 hover:border-primary/40 hover:bg-muted/35"
                      }`}
                    >
                      <div className="font-medium">{activity.label}</div>
                      <div className={`mt-1 text-[11px] ${form.activity === activity.value ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {activity.type} · {activity.status}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="time-entry-description" className="text-base font-semibold">Notes</Label>
                  <Textarea
                    id="time-entry-description"
                    rows={2}
                    placeholder={needsComment ? "Required for non-chargeable time without a job" : "What work is being done?"}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    className="min-h-[116px] resize-y text-base"
                  />
                </div>
              </div>

              {selectedJob ? (
                <div className="rounded-[10px] border border-border/55 bg-white/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selected Job</p>
                      <p className="mt-1 text-base font-semibold text-foreground">{selectedJob.job_number} · {selectedJob.title || selectedJob.job_name || "Untitled Job"}</p>
                      {selectedJob.contact_name || selectedJob.company_name ? (
                        <p className="mt-1 text-sm text-muted-foreground">{selectedJob.contact_name || selectedJob.company_name}</p>
                      ) : null}
                    </div>
                    <div className="rounded-[10px] border border-border/55 bg-white/75 px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">{form.activity}</p>
                      <p className="text-muted-foreground">{selectedActivity?.status || (requiresJob ? "Chargeable" : "Non-Chargeable")} activity</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <Button
                type="button"
                disabled={!canStart || duplicateActiveSelection}
                onClick={() => void handleStart()}
                className="jf-workshop-action h-16 w-full bg-[#4f6540] text-lg text-white hover:bg-[#425837]"
              >
                <Play className="mr-2 h-5 w-5" />
                {startLabel}
              </Button>
            </CardContent>
          </Card>
      </div>

      <ManualTimeEntryDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        staff={staff}
        jobs={jobs}
        entries={entries}
        defaultStaffId={form.staff_id}
        onSave={onAddManual}
        isAdmin={isAdmin}
      />
    </>
  );
}
