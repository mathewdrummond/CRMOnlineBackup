import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { crmApi } from "@/api/localApiClient";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  ACTIVITY_OPTIONS,
  activityRequiresJob,
  calculateHoursBetween,
} from "@/lib/timeclock";

const emptyTimesheetForm = {
  staff_id: "",
  date: format(new Date(), "yyyy-MM-dd"),
  clock_in_time: "07:30",
  clock_out_time: "16:00",
  total_hours: "8",
};

const emptyTimeEntryForm = {
  staff_id: "",
  job_id: "",
  activity: "Labour",
  date: format(new Date(), "yyyy-MM-dd"),
  hours: "1",
  description: "",
  manual_reason: "",
};

function buildDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return "";
  }

  return `${dateValue}T${timeValue}:00`;
}

function normalizeHours(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) / 100 : 0;
}

export default function ManualEntry() {
  const [staff, setStaff] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [timesheetForm, setTimesheetForm] = useState(emptyTimesheetForm);
  const [timeEntryForm, setTimeEntryForm] = useState(emptyTimeEntryForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [staffRecords, jobRecords] = await Promise.all([
        crmApi.entities.Staff.list("name", 200),
        crmApi.entities.Job.list("-created_date", 500),
      ]);
      setStaff(Array.isArray(staffRecords) ? staffRecords : []);
      setJobs(Array.isArray(jobRecords) ? jobRecords : []);
    } catch (loadDataError) {
      setLoadError(loadDataError?.message || "Manual entry options could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSuccessMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const activeStaff = useMemo(
    () => staff.filter((member) => String(member.status || "active").toLowerCase() === "active"),
    [staff]
  );
  const activeJobs = useMemo(
    () =>
      jobs
        .filter((job) => !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").toLowerCase()))
        .sort((left, right) => `${left.job_number || ""} ${left.title || left.job_name || ""}`.localeCompare(`${right.job_number || ""} ${right.title || right.job_name || ""}`)),
    [jobs]
  );
  const handleCreateTimesheet = async () => {
    const startDateTime = buildDateTime(timesheetForm.date, timesheetForm.clock_in_time);
    const endDateTime = buildDateTime(timesheetForm.date, timesheetForm.clock_out_time);
    const totalHours = normalizeHours(timesheetForm.total_hours);
    const member = staff.find((record) => record.id === timesheetForm.staff_id);

    if (!timesheetForm.staff_id || !timesheetForm.date || !timesheetForm.clock_in_time || !timesheetForm.clock_out_time) {
      setError("Staff member, date, clock-in time, and clock-out time are required.");
      return;
    }

    if (!member) {
      setError("The selected staff member could not be found.");
      return;
    }

    if (!startDateTime || !endDateTime || totalHours <= 0) {
      setError("Enter a valid session with total hours greater than zero.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await crmApi.entities.ClockIn.create({
        staff_id: member.id,
        staff_name: member.name,
        date: timesheetForm.date,
        clock_in_time: new Date(startDateTime).toISOString(),
        clock_out_time: new Date(endDateTime).toISOString(),
        total_hours: totalHours,
      });
      setTimesheetForm(emptyTimesheetForm);
      setSuccessMessage("Manual timesheet entry saved.");
    } catch (saveError) {
      setError(saveError?.message || "The manual timesheet entry could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTimeEntry = async () => {
    const hours = normalizeHours(timeEntryForm.hours);

    if (!timeEntryForm.staff_id || !timeEntryForm.date || !timeEntryForm.description.trim() || hours <= 0) {
      setError("Staff member, date, hours, and notes are required.");
      return;
    }

    if (activityRequiresJob(timeEntryForm.activity) && !String(timeEntryForm.job_id || "").trim()) {
      setError("A job is required for this activity.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await crmApi.entities.TimeEntry.create({
        staff_id: timeEntryForm.staff_id,
        job_id: timeEntryForm.job_id,
        activity: timeEntryForm.activity,
        date: timeEntryForm.date,
        hours,
        description: timeEntryForm.description.trim(),
        notes: timeEntryForm.description.trim(),
        manual_reason: timeEntryForm.manual_reason.trim(),
        manual_override: true,
        status: "completed",
      });
      setTimeEntryForm(emptyTimeEntryForm);
      setSuccessMessage("Manual time entry saved.");
    } catch (saveError) {
      setError(saveError?.message || "The manual time entry could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
      <PageHeader
        title="Manual Entry"
        subtitle="Backdate attendance, add corrections, and create complete manual time records without leaving JoinerFlow."
      />

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Manual entry options unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadData()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Manual entry blocked</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="timesheet" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-muted/60 p-1.5">
          <TabsTrigger className="min-h-[44px] flex-1 px-4 sm:flex-none" value="timesheet">Timesheet Entry</TabsTrigger>
          <TabsTrigger className="min-h-[44px] flex-1 px-4 sm:flex-none" value="time-entry">Time Entry</TabsTrigger>
        </TabsList>

        <TabsContent value="timesheet">
          <Card>
            <CardHeader>
              <CardTitle>Manual Timesheet Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Staff Member</Label>
                {activeStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active staff are available for manual attendance entries yet.</p>
                ) : null}
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-4">
                  {activeStaff.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      onClick={() => setTimesheetForm((current) => ({ ...current, staff_id: member.id }))}
                      className={`min-h-[88px] rounded-2xl border px-4 py-4 text-left transition ${
                        timesheetForm.staff_id === member.id
                          ? "border-primary bg-primary text-primary-foreground shadow"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold">{member.name}</div>
                      <div className={`mt-1 text-xs ${timesheetForm.staff_id === member.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {member.employee_id || "MYOB linked staff"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="manual-timesheet-date">Date</Label>
                  <Input
                    className="min-h-[44px]"
                    id="manual-timesheet-date"
                    type="date"
                    value={timesheetForm.date}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, date: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-timesheet-start">Clock In</Label>
                  <Input
                    className="min-h-[44px]"
                    id="manual-timesheet-start"
                    type="time"
                    value={timesheetForm.clock_in_time}
                    onChange={(event) =>
                      setTimesheetForm((current) => ({
                        ...current,
                        clock_in_time: event.target.value,
                        total_hours: String(calculateHoursBetween(buildDateTime(current.date, event.target.value), buildDateTime(current.date, current.clock_out_time), 0) || current.total_hours),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-timesheet-end">Clock Out</Label>
                  <Input
                    className="min-h-[44px]"
                    id="manual-timesheet-end"
                    type="time"
                    value={timesheetForm.clock_out_time}
                    onChange={(event) =>
                      setTimesheetForm((current) => ({
                        ...current,
                        clock_out_time: event.target.value,
                        total_hours: String(calculateHoursBetween(buildDateTime(current.date, current.clock_in_time), buildDateTime(current.date, event.target.value), 0) || current.total_hours),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-timesheet-hours">Total Hours</Label>
                  <Input
                    className="min-h-[44px]"
                    id="manual-timesheet-hours"
                    type="number"
                    min="0"
                    step="0.25"
                    value={timesheetForm.total_hours}
                    onChange={(event) => setTimesheetForm((current) => ({ ...current, total_hours: event.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button className="min-h-[44px]" onClick={() => void handleCreateTimesheet()} disabled={saving}>
                  {saving ? "Saving..." : "Save Timesheet Entry"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time-entry">
          <Card>
            <CardHeader>
              <CardTitle>Manual Time Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Staff Member</Label>
                {activeStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active staff are available for manual time entries yet.</p>
                ) : null}
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-4">
                  {activeStaff.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      onClick={() => setTimeEntryForm((current) => ({ ...current, staff_id: member.id }))}
                      className={`min-h-[88px] rounded-2xl border px-4 py-4 text-left transition ${
                        timeEntryForm.staff_id === member.id
                          ? "border-primary bg-primary text-primary-foreground shadow"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold">{member.name}</div>
                      <div className={`mt-1 text-xs ${timeEntryForm.staff_id === member.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {member.employee_id || "MYOB linked staff"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manual-entry-job">Job <span className="text-muted-foreground text-sm font-normal">(optional)</span></Label>
                  {activeJobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active jobs are currently available. Non-job activities can still be entered without selecting a job.</p>
                  ) : null}
                  <Select
                    value={timeEntryForm.job_id || "__none"}
                    onValueChange={(value) =>
                      setTimeEntryForm((current) => ({
                        ...current,
                        job_id: value === "__none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="min-h-[44px]" id="manual-entry-job">
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
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">Activity</Label>
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-4">
                  {ACTIVITY_OPTIONS.map((activity) => (
                    <button
                      type="button"
                      key={activity.value}
                      onClick={() =>
                        setTimeEntryForm((current) => ({
                          ...current,
                          activity: activity.value,
                        }))
                      }
                      className={`min-h-[88px] rounded-2xl border px-3 py-3 text-left text-sm transition ${
                        timeEntryForm.activity === activity.value
                          ? "border-primary bg-primary text-primary-foreground shadow"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-medium">{activity.label}</div>
                      <div className={`mt-1 text-[11px] ${timeEntryForm.activity === activity.value ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {activity.type} · {activity.status}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(160px,0.8fr)_minmax(160px,0.8fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="manual-entry-date">Date</Label>
                  <Input
                    className="min-h-[44px]"
                    id="manual-entry-date"
                    type="date"
                    value={timeEntryForm.date}
                    onChange={(event) => setTimeEntryForm((current) => ({ ...current, date: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-entry-hours">Hours</Label>
                  <Input
                    className="min-h-[44px]"
                    id="manual-entry-hours"
                    type="number"
                    min="0"
                    step="0.25"
                    value={timeEntryForm.hours}
                    onChange={(event) => setTimeEntryForm((current) => ({ ...current, hours: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Benchmark Notes</Label>
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">Spec-aligned</Badge>
                    Most chargeable activities need a job, but Other Chargeable can be saved without one.
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual-entry-description">Notes</Label>
                <Textarea
                  className="min-h-[104px]"
                  id="manual-entry-description"
                  rows={3}
                  placeholder="What work was completed?"
                  value={timeEntryForm.description}
                  onChange={(event) => setTimeEntryForm((current) => ({ ...current, description: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual-entry-reason">Correction Reason</Label>
                <Textarea
                  className="min-h-[88px]"
                  id="manual-entry-reason"
                  rows={2}
                  placeholder="Optional reason for the manual entry"
                  value={timeEntryForm.manual_reason}
                  onChange={(event) => setTimeEntryForm((current) => ({ ...current, manual_reason: event.target.value }))}
                />
              </div>

              <div className="flex justify-end">
                <Button className="min-h-[44px]" onClick={() => void handleCreateTimeEntry()} disabled={saving}>
                  {saving ? "Saving..." : "Save Time Entry"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
