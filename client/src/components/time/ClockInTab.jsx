import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { AlertCircle, Clock3, Coffee, RotateCcw, Square, Timer, Users } from "lucide-react";
import ClockInWidget from "./ClockInWidget";
import TimeEntryForm from "./TimeEntryForm";
import TimeEntryTable from "./TimeEntryTable";
import {
  buildShiftSummary,
  buildTimeclockOverview,
  formatElapsedSeconds,
  getClosedTrackedMinutes,
  getLastSegment,
  getLiveTrackedSeconds,
  isBreakEntry,
  normalizeTimeEntryStatus,
  sortTimeEntries,
} from "@/lib/timeclock";
import { formatDateForInput } from "@/lib/helpers";

const IS_TIMECLOCK_APP = import.meta.env.VITE_APP_KIND === "timeclock";

function buildSessionGroupId(staffId) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${staffId || "session"}-${Date.now()}`;
}

function getEntryContext(entry, jobs, jobOperations) {
  const selectedJob = jobs.find((job) => job.id === entry.job_id);
  const selectedOperation = jobOperations.find((operation) => operation.id === entry.job_operation_id);

  return {
    ...entry,
    job_number: selectedJob?.job_number || entry.job_number || "",
    job_name: selectedJob?.title || selectedJob?.job_name || entry.job_name || "",
    job_title: selectedJob?.title || selectedJob?.job_name || entry.job_title || "",
    company_name: selectedJob?.company_name || entry.company_name || "",
    customer: selectedJob?.contact_name || selectedJob?.company_name || entry.customer || "",
    job_operation_label: selectedOperation?.name || selectedOperation?.title || selectedOperation?.operation || entry.job_operation_label || "",
    workflow_phase: selectedOperation?.workflow_phase || entry.workflow_phase || "",
    operation: selectedOperation?.operation || entry.operation || "",
  };
}

function summarizeLiveAllocation(activeEntries) {
  return activeEntries.map((entry) => {
    const summary = buildShiftSummary(entry);
    return {
      id: entry.id,
      staff_name: entry.staff_name || "Unknown",
      status: isBreakEntry(entry) ? "On break" : "Working",
      detail: summary.jobLabel,
      stage: summary.operationLabel,
    };
  });
}

function replaceEntry(records, nextEntry) {
  if (!nextEntry?.id) {
    return records;
  }

  const existingIndex = records.findIndex((record) => record.id === nextEntry.id);
  if (existingIndex === -1) {
    return sortTimeEntries([...records, nextEntry]);
  }

  const nextRecords = [...records];
  nextRecords[existingIndex] = nextEntry;
  return sortTimeEntries(nextRecords);
}

function ActiveTimerCard({ timer, staff, jobs, onPause, onComplete, onStartBreak, onResumeBreak }) {
  const runningSegment = getLastSegment(timer);
  const timerStart = runningSegment?.started_at || timer.clock_in || timer.startTime;
  const [elapsed, setElapsed] = useState(getLiveTrackedSeconds(timer));
  const [saving, setSaving] = useState(false);
  const breakTimer = isBreakEntry(timer);
  const member = staff.find((record) => record.id === timer.staff_id);
  const job = jobs.find((record) => record.id === timer.job_id);
  const summary = buildShiftSummary({
    ...timer,
    job_name: job?.title || job?.job_name || timer.job_name,
    job_title: job?.title || job?.job_name || timer.job_title,
    job_number: job?.job_number || timer.job_number,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed(getLiveTrackedSeconds(timer));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timer, timerStart]);

  const handleAction = async (handler) => {
    setSaving(true);
    try {
      await handler(timer, elapsed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={breakTimer ? "jf-workshop-timer-break" : "jf-workshop-timer-active"}>
      <CardContent className="flex flex-col gap-4 p-4 md:p-5 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold text-foreground">{member?.name || timer.staff_name || "Unknown staff"}</p>
            <Badge variant="outline" className={breakTimer ? "border-amber-300 text-amber-700" : "border-emerald-300 text-emerald-700"}>
              {breakTimer ? "On break" : "Active shift"}
            </Badge>
            <Badge variant="secondary">{summary.activityLabel}</Badge>
          </div>
          <p className="mt-2 text-2xl font-bold leading-tight text-foreground">{summary.jobLabel}</p>
          <p className="text-base text-muted-foreground">{summary.operationLabel}</p>
          {timer.description ? <p className="mt-1 text-xs text-muted-foreground">{timer.description}</p> : null}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-[190px] rounded-[10px] border border-border/55 bg-white/75 px-5 py-4 text-center">
            <div className="font-mono text-4xl font-bold tracking-widest text-foreground tabular-nums">{formatElapsedSeconds(elapsed)}</div>
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Since {format(new Date(timerStart), "HH:mm")}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-3">
            {breakTimer ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="jf-workshop-action border-[#dfc38e] bg-white px-4 text-[#7a5621] hover:bg-[#f2e2c6]"
                  disabled={saving}
                  onClick={() => void handleAction(onResumeBreak)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Resume Work
                </Button>
                <Button
                  type="button"
                  className="jf-workshop-action bg-[#b85d3d] px-4 text-white hover:bg-[#9e4d33] sm:col-span-2 lg:col-span-1"
                  disabled={saving}
                  onClick={() => void handleAction(onComplete)}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Complete
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="jf-workshop-action border-[#d5c7b7] bg-white px-4 text-[#4f4137] hover:bg-[#e7ded2]"
                  disabled={saving}
                  onClick={() => void handleAction(onPause)}
                >
                  Pause
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="jf-workshop-action border-[#c9d7be] bg-white px-4 text-[#4f6540] hover:bg-[#e6ece0]"
                  disabled={saving}
                  onClick={() => void handleAction(onStartBreak)}
                >
                  <Coffee className="mr-2 h-4 w-4" />
                  Break
                </Button>
                <Button
                  type="button"
                  className="jf-workshop-action bg-[#b85d3d] px-4 text-white hover:bg-[#9e4d33] sm:col-span-2 lg:col-span-1"
                  disabled={saving}
                  onClick={() => void handleAction(onComplete)}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Complete
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PausedTimerCard({ timer, staff, jobs, onResume, onComplete }) {
  const [saving, setSaving] = useState(false);
  const member = staff.find((record) => record.id === timer.staff_id);
  const job = jobs.find((record) => record.id === timer.job_id);
  const summary = buildShiftSummary({
    ...timer,
    job_name: job?.title || job?.job_name || timer.job_name,
    job_title: job?.title || job?.job_name || timer.job_title,
    job_number: job?.job_number || timer.job_number,
  });
  const trackedHours = (getClosedTrackedMinutes(timer) / 60).toFixed(2);
  const pausedAt = timer.paused_at || getLastSegment(timer)?.ended_at || timer.updated_date || "";

  const handleAction = async (handler) => {
    setSaving(true);
    try {
      await handler(timer);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="jf-workshop-timer-paused">
      <CardContent className="flex flex-col gap-4 p-4 md:p-5 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold text-foreground">{member?.name || timer.staff_name || "Unknown staff"}</p>
            <Badge variant="outline" className="border-slate-300 text-slate-700">Paused</Badge>
            <Badge variant="secondary">{summary.activityLabel}</Badge>
          </div>
          <p className="mt-2 text-2xl font-bold leading-tight text-foreground">{summary.jobLabel}</p>
          <p className="text-base text-muted-foreground">{summary.operationLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {trackedHours}h tracked{pausedAt ? ` · Paused ${format(new Date(pausedAt), "HH:mm")}` : ""}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[280px]">
          <Button
            type="button"
            variant="outline"
            className="jf-workshop-action border-[#c9d7be] bg-white px-4 text-[#4f6540] hover:bg-[#e6ece0]"
            disabled={saving}
            onClick={() => void handleAction(onResume)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Resume
          </Button>
          <Button
            type="button"
            className="jf-workshop-action bg-[#b85d3d] px-4 text-white hover:bg-[#9e4d33]"
            disabled={saving}
            onClick={() => void handleAction(onComplete)}
          >
            <Square className="mr-2 h-4 w-4" />
            Complete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClockInTab({ user, staff, jobs, jobOperations = [] }) {
  const [entries, setEntries] = useState([]);
  const [clockIns, setClockIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadEntries();
  }, []);

  const loadEntries = async () => {
    setLoading(true);
    setError("");

    try {
      const clockInList = typeof crmApi.entities.ClockIn?.list === "function"
        ? crmApi.entities.ClockIn.list("-created_date", 1000)
        : Promise.resolve([]);
      const [all, allClockIns] = await Promise.all([
        crmApi.entities.TimeEntry.list("-created_date", 1000),
        clockInList,
      ]);
      setEntries(sortTimeEntries(Array.isArray(all) ? all : []));
      setClockIns(Array.isArray(allClockIns) ? allClockIns : []);
    } catch (loadError) {
      setError(loadError?.message || "Time entries could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const enrichedEntries = useMemo(
    () => sortTimeEntries(entries.map((entry) => getEntryContext(entry, jobs, jobOperations))),
    [entries, jobs, jobOperations]
  );
  const activeEntries = useMemo(
    () => enrichedEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) === "active"),
    [enrichedEntries]
  );
  const pausedEntries = useMemo(
    () => enrichedEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) === "paused"),
    [enrichedEntries]
  );
  const completedEntries = useMemo(
    () => enrichedEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) === "completed" && (!IS_TIMECLOCK_APP || entry.exported !== true)),
    [enrichedEntries]
  );

  const overview = useMemo(
    () => buildTimeclockOverview({ activeEntries, completedEntries: [...pausedEntries, ...completedEntries], staff }),
    [activeEntries, completedEntries, pausedEntries, staff]
  );

  const liveAllocation = useMemo(
    () => summarizeLiveAllocation(activeEntries),
    [activeEntries]
  );

  const handleStartEntry = async (entry) => {
    setError("");

    try {
      const existingActiveEntry = activeEntries.find((record) => record.staff_id === entry.staff_id) || null;
      if (existingActiveEntry && isBreakEntry(existingActiveEntry)) {
        await crmApi.entities.TimeEntry.update(existingActiveEntry.id, { status: "completed" });
      }
      await crmApi.entities.TimeEntry.create({
        ...entry,
        session_group_id: existingActiveEntry?.session_group_id || buildSessionGroupId(entry.staff_id),
        entry_kind: isBreakEntry(entry) ? "break" : "work",
      });
      await loadEntries();
      if (existingActiveEntry) {
        toast({
          title: "Timer switched",
          description: "Previous timer paused. New timer started.",
        });
      }
    } catch (actionError) {
      setError(actionError?.message || "The timer could not be started.");
      throw actionError;
    }
  };

  const handlePauseEntry = async (entry) => {
    setError("");

    try {
      await crmApi.entities.TimeEntry.update(entry.id, { status: "paused" });
      await loadEntries();
      toast({
        title: "Timer paused",
        description: `${entry.staff_name || "Timer"} can be resumed at any time.`,
      });
    } catch (actionError) {
      setError(actionError?.message || "The timer could not be paused.");
      throw actionError;
    }
  };

  const handleCompleteEntry = async (entry) => {
    setError("");

    try {
      const updated = await crmApi.entities.TimeEntry.update(entry.id, { status: "completed" });
      setEntries((current) => replaceEntry(current, updated));
    } catch (actionError) {
      setError(actionError?.message || "The timer could not be completed.");
      throw actionError;
    }
  };

  const handleStartBreak = async (entry) => {
    setError("");

    try {
      await crmApi.entities.TimeEntry.update(entry.id, { status: "paused" });
      await crmApi.entities.TimeEntry.create({
        staff_id: entry.staff_id,
        date: entry.date || formatDateForInput(new Date()),
        activity: "Break",
        description: "Unpaid break",
        notes: "Unpaid break",
        status: "active",
        is_break: true,
        entry_kind: "break",
        session_group_id: entry.session_group_id || buildSessionGroupId(entry.staff_id),
        resume_context: {
          entry_id: entry.id,
        },
      });
      await loadEntries();
    } catch (actionError) {
      setError(actionError?.message || "The break could not be started.");
      throw actionError;
    }
  };

  const handleResumeBreak = async (entry) => {
    setError("");

    try {
      const resumeContext = entry.resume_context && typeof entry.resume_context === "object" ? entry.resume_context : null;
      await crmApi.entities.TimeEntry.update(entry.id, { status: "completed" });

      if (resumeContext?.entry_id) {
        await crmApi.entities.TimeEntry.update(String(resumeContext.entry_id), { status: "active" });
      }

      await loadEntries();
    } catch (actionError) {
      setError(actionError?.message || "The break could not be resumed.");
      throw actionError;
    }
  };

  const handleManualEntry = async (payload) => {
    setError("");

    try {
      await crmApi.entities.TimeEntry.create({
        ...payload,
        session_group_id: payload.session_group_id || buildSessionGroupId(payload.staff_id),
      });
      await loadEntries();
    } catch (actionError) {
      setError(actionError?.message || "The manual correction could not be saved.");
      throw actionError;
    }
  };

  const handleVoidEntry = async (id, reason = "") => {
    setError("");
    try {
      const updated = await crmApi.entities.TimeEntry.update(id, {
        voided: true,
        void_reason: reason || "Voided from time review",
      });
      setEntries((current) => replaceEntry(current, updated));
    } catch (actionError) {
      setError(actionError?.message || "The time entry could not be voided.");
    }
  };

  const handleUpdateEntry = async (id, updates) => {
    setError("");

    try {
      const existingEntry = [...activeEntries, ...completedEntries].find((entry) => entry.id === id);
      const effectiveExistingEntry = existingEntry || pausedEntries.find((entry) => entry.id === id);
      if (!effectiveExistingEntry) {
        throw new Error("The selected time entry could not be found.");
      }

      if ((Array.isArray(effectiveExistingEntry.segments) ? effectiveExistingEntry.segments.length : 0) > 1) {
        throw new Error("Multi-segment timers are preserved as-is. Complete or review them instead of editing them as a single block.");
      }

      const entryContext = getEntryContext(
        {
          ...effectiveExistingEntry,
          ...updates,
        },
        jobs,
        jobOperations
      );

      const updated = await crmApi.entities.TimeEntry.update(id, {
        ...updates,
        ...entryContext,
      });
      setEntries((current) => replaceEntry(current, updated));
    } catch (actionError) {
      setError(actionError?.message || "The time entry could not be updated.");
      throw actionError;
    }
  };

  const handleResumeEntry = async (entry) => {
    setError("");

    try {
      const existingActiveEntry = activeEntries.find((record) => record.staff_id === entry.staff_id && record.id !== entry.id) || null;
      await crmApi.entities.TimeEntry.update(entry.id, { status: "active" });
      await loadEntries();
      if (existingActiveEntry) {
        toast({
          title: "Timer switched",
          description: "Previous timer paused. New timer started.",
        });
      }
    } catch (actionError) {
      setError(actionError?.message || "The timer could not be resumed.");
      throw actionError;
    }
  };

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Clock data problem</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void loadEntries()}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ClockInWidget staff={staff} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Right Now</h2>
            <p className="text-sm text-muted-foreground">Who is working, what job they are on, and what needs action.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{activeEntries.length} live</Badge>
            {pausedEntries.length > 0 ? <Badge variant="outline">{pausedEntries.length} paused</Badge> : null}
          </div>
        </div>

        {!IS_TIMECLOCK_APP ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="jf-workshop-status-panel">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Timer className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Active Now</p>
                  <p className="text-2xl font-semibold text-foreground">{overview.activeNow}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="jf-workshop-status-panel">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><Coffee className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">On Break</p>
                  <p className="text-2xl font-semibold text-foreground">{overview.onBreak}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="jf-workshop-status-panel">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-blue-100 p-2 text-blue-700"><Clock3 className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tracked Today</p>
                  <p className="text-2xl font-semibold text-foreground">{overview.trackedTodayHours}h</p>
                </div>
              </CardContent>
            </Card>

            <Card className="jf-workshop-status-panel">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-700"><Users className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Available Staff</p>
                  <p className="text-2xl font-semibold text-foreground">{overview.availableStaff}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeEntries.length === 0 && pausedEntries.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-xl font-semibold text-foreground">No live shifts</p>
                <p className="text-sm text-muted-foreground">Use Quick Start below to begin the next workshop task.</p>
              </div>
              <Timer className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeEntries.map((timer) => (
              <ActiveTimerCard
                key={timer.id}
                timer={timer}
                staff={staff}
                jobs={jobs}
                onPause={handlePauseEntry}
                onComplete={handleCompleteEntry}
                onStartBreak={handleStartBreak}
                onResumeBreak={handleResumeBreak}
              />
            ))}

            {pausedEntries.map((timer) => (
              <PausedTimerCard
                key={timer.id}
                timer={timer}
                staff={staff}
                jobs={jobs}
                onResume={handleResumeEntry}
                onComplete={handleCompleteEntry}
              />
            ))}
          </div>
        )}

        {!IS_TIMECLOCK_APP && liveAllocation.length > 0 ? (
          <Card className="jf-workshop-status-panel">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Live Allocation</CardTitle>
                  <p className="text-xs text-muted-foreground">Quick manager view of who is on what right now.</p>
                </div>
                <Badge variant="secondary">{liveAllocation.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {liveAllocation.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-foreground">{item.staff_name}</p>
                    <Badge variant={item.status === "On break" ? "secondary" : "outline"}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{item.detail}</p>
                  <p className="text-xs text-muted-foreground">{item.stage}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </section>

      <TimeEntryForm
        staff={staff}
        jobs={jobs}
        jobOperations={jobOperations}
        entries={[...activeEntries, ...pausedEntries, ...completedEntries]}
        activeTimers={activeEntries}
        clockIns={clockIns}
        timersLoaded={!loading}
        onStart={handleStartEntry}
        onAddManual={handleManualEntry}
        isAdmin={String(user?.role || "").toLowerCase() === "admin"}
      />

      {!loading ? (
        <TimeEntryTable
          entries={completedEntries}
          onVoid={handleVoidEntry}
          onEdit={handleUpdateEntry}
          staff={staff}
          jobs={jobs}
          isAdmin={String(user?.role || "").toLowerCase() === "admin"}
        />
      ) : (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      )}
    </div>
  );
}
