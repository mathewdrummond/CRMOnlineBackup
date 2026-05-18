import { useState, useEffect, useRef } from "react";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import { formatDate } from "../../lib/helpers";

const ACTIVITIES = [
  "Joinery", "Framing", "Supervision", "Quoting",
  "Admin", "Rework", "Warranty Work", "Make to Assembly",
  "Other Chargeable", "Shop Activity", "Artistic Labour", "Sub Labour",
  "Consumable Items", "Disbursement Items", "Cartage Items", "Soft Charge",
  "Van Hire", "MOT", "Detail MT", "Craft Training",
];

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
};

const fmtElapsed = (s) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function ClockInTab({ staff, jobs }) {
  const [entries, setEntries] = useState([]);
  const [activeEntries, setActiveEntries] = useState([]);
  const [elapsed, setElapsed] = useState({});
  const [now, setNow] = useState(new Date());

  // Form state
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDropdown, setJobDropdown] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState("Joinery");
  const [employeeNo, setEmployeeNo] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const jobRef = useRef(null);

  useEffect(() => { loadEntries(); }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
      const e = {};
      activeEntries.forEach(entry => {
        e[entry.id] = Math.floor((Date.now() - new Date(entry.clock_in).getTime()) / 1000);
      });
      setElapsed(e);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeEntries]);

  const loadEntries = async () => {
    setLoading(true);
    const all = await crmApi.entities.TimeEntry.list("-date", 200);
    setActiveEntries(all.filter(e => e.status === "active"));
    setEntries(all.filter(e => e.status !== "active"));
    setLoading(false);
  };

  const isStaffActive = (s) => activeEntries.some(e => e.staff_name === s.name);

  const handleStaffSelect = (s) => {
    setSelectedStaff(s);
    setEmployeeNo(s.employee_id || "");
  };

  const filteredJobs = jobs.filter(j =>
    jobSearch.length > 1 &&
    (j.job_name?.toLowerCase().includes(jobSearch.toLowerCase()) ||
     j.job_number?.toLowerCase().includes(jobSearch.toLowerCase()))
  );

  const startTimer = async () => {
    if (!selectedStaff || !selectedJob) return;
    await crmApi.entities.TimeEntry.create({
      staff_name: selectedStaff.name,
      staff_email: selectedStaff.email || "",
      job_id: selectedJob.id,
      job_number: selectedJob.job_number || "",
      job_title: selectedJob.job_name || selectedJob.title || "",
      operation: selectedActivity.toLowerCase().replace(/\s+/g, "_"),
      clock_in: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
      status: "active",
      hourly_rate: selectedStaff.hourly_rate || 0,
      notes,
    });
    setSelectedStaff(null); setSelectedJob(null); setJobSearch(""); setNotes(""); setEmployeeNo("");
    loadEntries();
  };

  const clockOut = async (entry) => {
    const now = new Date();
    const hours = (now - new Date(entry.clock_in)) / 3600000;
    await crmApi.entities.TimeEntry.update(entry.id, {
      clock_out: now.toISOString(),
      hours: Math.round(hours * 100) / 100,
      total_cost: Math.round(hours * (entry.hourly_rate || 0) * 100) / 100,
      status: "completed",
    });
    loadEntries();
  };

  // Recent activity: last 10 non-active entries, grouped display
  const recentEntries = entries.slice(0, 20);

  const dateStr = now.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const timeStr = now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="space-y-5">
      {/* Clock In / Clock Out cards */}
      <div className="border rounded-xl p-4 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full border-2 border-emerald-500 flex items-center justify-center">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            </span>
            Check In / Check Out
          </h3>
          <span className="text-sm text-muted-foreground">{dateStr} &nbsp; <span className="font-mono font-semibold">{timeStr}</span></span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {staff.map(s => {
            const active = isStaffActive(s);
            const activeEntry = activeEntries.find(e => e.staff_name === s.name);
            return (
              <div
                key={s.id}
                className={`rounded-xl border-2 p-4 flex flex-col items-center cursor-pointer transition-all ${active ? "border-emerald-400 bg-emerald-50" : "border-border hover:border-emerald-300"}`}
                onClick={() => active ? clockOut(activeEntry) : handleStaffSelect(s)}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm mb-2 ${active ? "bg-emerald-500" : "bg-slate-400"}`}>
                  {getInitials(s.name)}
                </div>
                <p className="font-semibold text-sm text-center leading-tight">{s.name}</p>
                {active ? (
                  <p className="text-xs text-emerald-600 mt-1 font-medium">⏱ {fmtElapsed(elapsed[activeEntry?.id] || 0)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Click to clock in</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      {recentEntries.length > 0 && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b">
            <h3 className="font-semibold text-sm">Recent Activity</h3>
          </div>
          <div className="divide-y">
            {recentEntries.slice(0, 8).map(entry => (
              <div key={entry.id} className="flex items-center gap-4 px-5 py-2.5 text-sm hover:bg-muted/30">
                <span className="w-28 text-muted-foreground text-xs">{formatDate(entry.date)}</span>
                <span className="w-36 font-medium truncate">{entry.staff_name}</span>
                <span className="flex-1 text-muted-foreground truncate">{entry.job_title || entry.job_number}</span>
                <span className="font-mono text-xs">{entry.hours?.toFixed(2)}h</span>
                <span className="text-xs text-muted-foreground">{entry.operation}</span>
                <Badge className={`text-xs ${entry.exported ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-amber-100 text-amber-700 border-amber-200"}`} variant="outline">
                  {entry.exported ? "Exported" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Time Entry Form */}
      <div className="border rounded-xl bg-card p-5 space-y-5">
        <h3 className="font-semibold text-sm">New Time Entry</h3>

        {/* Staff selection */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Staff Member</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => handleStaffSelect(s)}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${selectedStaff?.id === s.id ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border hover:border-emerald-300 bg-background"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Job */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Job</Label>
          <div className="relative" ref={jobRef}>
            <Input
              value={selectedJob ? `${selectedJob.job_number} – ${selectedJob.job_name || selectedJob.title}` : jobSearch}
              onChange={e => { setJobSearch(e.target.value); setSelectedJob(null); setJobDropdown(true); }}
              onFocus={() => setJobDropdown(true)}
              placeholder="Select job..."
              className="bg-background"
            />
            {jobDropdown && filteredJobs.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredJobs.map(j => (
                  <button
                    key={j.id}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setSelectedJob(j); setJobSearch(""); setJobDropdown(false); }}
                  >
                    <span className="font-medium">{j.job_number}</span>
                    <span className="text-muted-foreground ml-2">{j.job_name || j.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Activity grid */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Activity</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ACTIVITIES.map(act => (
              <button
                key={act}
                onClick={() => setSelectedActivity(act)}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${selectedActivity === act ? "bg-emerald-500 text-white border-emerald-500" : "border-border hover:border-emerald-300 bg-background"}`}
              >
                {act}
              </button>
            ))}
          </div>
        </div>

        {/* Employee No + Notes */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Employee No. (optional)</Label>
            <Input value={employeeNo} onChange={e => setEmployeeNo(e.target.value)} placeholder="EMP001" className="font-mono bg-background" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Notes <span className="text-muted-foreground font-normal">(What work will be performed)</span></Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="" className="bg-background" />
          </div>
        </div>

        {/* Start Timer */}
        <button
          onClick={startTimer}
          disabled={!selectedStaff || !selectedJob}
          className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <ChevronRight className="w-4 h-4" /> Start Timer
        </button>
      </div>

      {/* Time Entries Table */}
      {entries.length > 0 && (
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b">
            <h3 className="font-semibold text-sm">Time Entries</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Staff</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Job</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Hours</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="w-8 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.slice(0, 30).map(entry => (
                  <tr key={entry.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3 font-medium">{entry.staff_name}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{entry.job_title || "—"}</div>
                      <div className="text-xs text-muted-foreground">{entry.job_number}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{entry.hours?.toFixed(2)}h</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{entry.operation}</td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`text-xs ${entry.exported ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
                        variant="outline"
                      >
                        {entry.exported ? "Exported" : "Pending"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}