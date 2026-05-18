import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Loader2 } from "lucide-react";
import OnScreenKeyboard from "../ui/OnScreenKeyboard";
import { format } from "date-fns";

const CHARGEABLE_ACTIVITIES = new Set([
  "Labour", "Sanding", "Supervision", "Quoting", "cleaning", "Rework",
  "Material handling", "Other Chargeable", "Van Mileage",
]);

const ACTIVITIES = [
  "Labour", "Sanding", "Supervision", "Quoting", "cleaning", "Rework",
  "Warranty Rework", "Material handling", "Other Chargeable", "Shop Work NC",
  "Annual Leave", "Sick Leave", "Statutory Holiday", "Bereavement Leave",
  "Staff meetings", "Staff Traning", "Van Mileage", "ACC", "Covid -19",
];

const emptyForm = {
  staff_id: "",
  job_id: "",
  date: format(new Date(), "yyyy-MM-dd"),
  activity: "Labour",
  description: "",
};

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ActiveTimerCard({ timer, staff, jobs, onStop }) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - timer.startTime) / 1000));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timer.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.startTime]);

  const handleStop = async () => {
    setSaving(true);
    await onStop(timer.id, elapsed);
    setSaving(false);
  };

  const hours = Math.round((elapsed / 3600) * 100) / 100;
  const s = staff.find((x) => x.id === timer.staff_id);
  const j = jobs.find((x) => x.id === timer.job_id);

  return (
    <Card className="border-2 border-emerald-500/40 bg-emerald-50/30">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base text-foreground">{s?.name || "—"}</p>
          <p className="text-sm text-muted-foreground truncate">
            {j ? `${j.job_number} — ${j.job_name}` : timer.activity}
            {j && ` · ${timer.activity}`}
          </p>
          {timer.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{timer.description}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-3xl font-mono font-bold tracking-widest text-foreground">
              {formatElapsed(elapsed)}
            </div>
            <div className="text-xs text-muted-foreground">{hours}h</div>
          </div>
          <Button
            onClick={handleStop}
            disabled={saving}
            className="h-12 px-5 text-base font-bold rounded-xl bg-destructive hover:bg-destructive/90 text-white"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5" />}
            <span className="ml-2">Stop</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TimeEntryForm({ staff, jobs, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeTimers, setActiveTimers] = useState(() => {
    try {
      const saved = localStorage.getItem("activeTimers");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("activeTimers", JSON.stringify(activeTimers));
  }, [activeTimers]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.setItem("activeTimers", JSON.stringify(activeTimers));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeTimers]);

  const activeStaff = staff.filter((s) => s.status === "active");
  const activeJobs = jobs
    .filter((j) => j.status === "active")
    .sort((a, b) => (a.client || "").localeCompare(b.client || ""));

  const isChargeable = CHARGEABLE_ACTIVITIES.has(form.activity);
  const canStart = form.staff_id && (!isChargeable || form.job_id) && form.description.trim();

  const handleStart = () => {
    const timer = {
      id: Date.now().toString(),
      startTime: Date.now(),
      staff_id: form.staff_id,
      job_id: form.job_id,
      date: form.date || format(new Date(), "yyyy-MM-dd"),
      activity: form.activity,
      description: form.description,
    };
    setActiveTimers((prev) => [...prev, timer]);
    setForm({ ...emptyForm, date: format(new Date(), "yyyy-MM-dd") });
  };

  const handleStop = async (timerId, elapsed) => {
    const timer = activeTimers.find((t) => t.id === timerId);
    if (!timer) return;
    const hours = Math.round((elapsed / 3600) * 100) / 100;
    if (hours <= 0) {
      setActiveTimers((prev) => prev.filter((t) => t.id !== timerId));
      return;
    }
    const s = staff.find((x) => x.id === timer.staff_id);
    const j = jobs.find((x) => x.id === timer.job_id);
    await onSubmit({
      staff_id: timer.staff_id,
      job_id: timer.job_id,
      date: timer.date,
      activity: timer.activity,
      description: timer.description,
      hours,
      staff_name: s?.name || "",
      employee_id: s?.employee_id || "",
      job_number: j?.job_number || "",
      job_name: j?.job_name || "",
      customer: j?.client || "",
      exported: false,
    });
    setActiveTimers((prev) => prev.filter((t) => t.id !== timerId));
  };

  return (
    <div className="space-y-4">
      {activeTimers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">Running Timers</h2>
          {activeTimers.map((timer) => (
            <ActiveTimerCard key={timer.id} timer={timer} staff={staff} jobs={jobs} onStop={handleStop} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New Time Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-base font-semibold">Staff Member</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {activeStaff.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setForm({ ...form, staff_id: s.id })}
                    className={`py-4 px-3 rounded-xl border-2 text-base font-medium transition-all active:scale-95 select-none
                      ${form.staff_id === s.id
                        ? "border-primary bg-primary text-primary-foreground shadow"
                        : "border-border bg-card text-foreground hover:border-primary hover:bg-muted"
                      }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">
                Job {!isChargeable && <span className="text-muted-foreground font-normal text-sm">(optional)</span>}
              </Label>
              <Select value={form.job_id} onValueChange={(v) => setForm({ ...form, job_id: v })}>
                <SelectTrigger className="h-14 text-base">
                  <SelectValue placeholder="Select job…" />
                </SelectTrigger>
                <SelectContent>
                  {activeJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id} className="text-base py-3">
                      {j.job_number} — {j.job_name}{j.client ? ` (${j.client})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">Activity</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {ACTIVITIES.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => setForm({ ...form, activity: a })}
                    className={`py-3 px-3 rounded-xl border-2 text-sm font-medium transition-all active:scale-95 select-none text-center
                      ${form.activity === a
                        ? "border-primary bg-primary text-primary-foreground shadow"
                        : "border-border bg-card text-foreground hover:border-primary hover:bg-muted"
                      }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Date <span className="text-muted-foreground font-normal text-sm">(defaults to today)</span></Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-14 text-base" />
              </div>
              <div className="space-y-2">
                <Label className="text-base font-semibold">Notes <span className="text-destructive">*</span></Label>
                <Textarea
                  placeholder="What work was performed?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  onFocus={() => setShowKeyboard(true)}
                  rows={2}
                  className="text-base"
                />
              </div>
            </div>

            {showKeyboard && (
              <OnScreenKeyboard
                value={form.description}
                onChange={(val) => setForm({ ...form, description: val })}
                onClose={() => setShowKeyboard(false)}
              />
            )}

            <Button
              type="button"
              disabled={!canStart}
              onClick={handleStart}
              className="w-full h-16 text-xl font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="h-6 w-6 mr-2" />
              Start Timer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}