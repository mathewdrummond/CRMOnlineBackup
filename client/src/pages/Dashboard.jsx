import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import PageHeader from "../components/PageHeader";
import { useModules } from "@/lib/ModuleContext";
import { formatCurrency, formatDate } from "../lib/helpers";
import {
  ACTIVITY_WINDOW_OPTIONS,
  OWNER_OPTIONS,
  buildDashboardSummary,
  getDashboardSubtitle,
  getUnexportedTimesheetRows,
} from "../lib/dashboardHelpers";
import {
  getJobOperationalSummary,
  getQuoteOperationalSummary,
  getUpcomingInstallJobs,
  isOpenQuote,
} from "../lib/crmOpsInsights";
import { buildInstallationTimelineState } from "../lib/installSchedule";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Clock,
  FileSpreadsheet,
  History,
  Plus,
  Target,
} from "lucide-react";

function renderEmptyCard(message) {
  return (
    <div className="rounded-lg bg-muted/20 px-4 py-7 text-center">
      <p className="text-sm font-medium text-foreground">No work waiting here.</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function getDashboardStatGridClass(count) {
  if (count <= 2) {
    return "sm:grid-cols-2";
  }
  if (count === 3) {
    return "sm:grid-cols-2 xl:grid-cols-3";
  }
  if (count === 4) {
    return "sm:grid-cols-2 xl:grid-cols-4";
  }
  if (count === 5) {
    return "sm:grid-cols-2 xl:grid-cols-5";
  }
  return "sm:grid-cols-2 xl:grid-cols-6";
}

function SectionHeading({ title, href, label }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">What to do next</p>
        <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">{title}</h2>
      </div>
      {href ? (
        <Link to={href} className="jf-reference-link">
          {label} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { isModuleEnabled } = useModules();
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const scheduleEnabled = isModuleEnabled("schedule");
  const exportEnabled = isModuleEnabled("myob_export");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [activityWindowDays, setActivityWindowDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dashboardData, setDashboardData] = useState({
    leads: [],
    jobs: [],
    quotes: [],
    leadTasks: [],
    jobOperations: [],
    staff: [],
    timeEntries: [],
    exportHistory: [],
    notes: [],
    labourIntelligence: null,
    operationalIntelligence: null,
  });

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const nextData = await crmApi.dashboard.getOverview();
      setDashboardData({
        leads: leadsEnabled ? (Array.isArray(nextData?.leads) ? nextData.leads : []) : [],
        jobs: Array.isArray(nextData?.jobs) ? nextData.jobs : [],
        quotes: quotesEnabled ? (Array.isArray(nextData?.quotes) ? nextData.quotes : []) : [],
        leadTasks: Array.isArray(nextData?.leadTasks) ? nextData.leadTasks : [],
        jobOperations: Array.isArray(nextData?.jobOperations) ? nextData.jobOperations : [],
        staff: Array.isArray(nextData?.staff) ? nextData.staff : [],
        timeEntries: Array.isArray(nextData?.timeEntries) ? nextData.timeEntries : [],
        exportHistory: Array.isArray(nextData?.exportHistory) ? nextData.exportHistory : [],
        notes: Array.isArray(nextData?.notes) ? nextData.notes : [],
        labourIntelligence: nextData?.labourIntelligence || null,
        operationalIntelligence: nextData?.operationalIntelligence || null,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Dashboard data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [leadsEnabled, quotesEnabled]);

  const summary = useMemo(
    () =>
      buildDashboardSummary({
        ...dashboardData,
        ownerFilter,
        activityWindowDays,
      }),
    [dashboardData, ownerFilter, activityWindowDays]
  );

  const unexportedRows = useMemo(
    () => getUnexportedTimesheetRows(summary.unexportedTimeEntries),
    [summary.unexportedTimeEntries]
  );
  const timeclockSummary = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyEntries = dashboardData.timeEntries.filter((entry) => {
      const entryDate = new Date(`${entry.date || ""}T00:00:00`);
      return !Number.isNaN(entryDate.getTime()) && entryDate >= startOfWeek;
    });

    const hoursByJob = new Map();
    weeklyEntries.forEach((entry) => {
      const key = String(entry.job_id || entry.job_number || entry.job_name || "unassigned");
      const current = hoursByJob.get(key) || {
        id: key,
        label: entry.job_number ? `${entry.job_number} · ${entry.job_name || entry.job_title || "Untitled Job"}` : entry.job_name || entry.job_title || "Unassigned work",
        actualHours: 0,
        budgetHours: Number(
          dashboardData.jobs.find((job) => job.id === entry.job_id)?.budget_hours
          || 0
        ),
      };
      current.actualHours += Number(entry.hours || 0);
      hoursByJob.set(key, current);
    });

    return {
      totalHoursThisWeek: weeklyEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
      activeStaff: dashboardData.staff.filter((member) => String(member.status || "").toLowerCase() === "active").length,
      activeJobs: dashboardData.jobs.filter((job) => !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").toLowerCase())).length,
      pendingExport: dashboardData.timeEntries.filter((entry) => String(entry.status || "").toLowerCase() === "completed" && entry.exported !== true).length,
      hoursByJob: [...hoursByJob.values()]
        .sort((left, right) => right.actualHours - left.actualHours)
        .slice(0, 8),
      recentEntries: dashboardData.timeEntries
        .slice()
        .sort((left, right) => String(right.date || right.updated_date || "").localeCompare(String(left.date || left.updated_date || "")))
        .slice(0, 8),
    };
  }, [dashboardData.jobs, dashboardData.staff, dashboardData.timeEntries]);
  const jobOperationalRows = useMemo(
    () =>
      summary.activeJobs
        .map((job) => ({
          job,
          operational: getJobOperationalSummary(job, dashboardData.jobOperations),
        }))
        .sort((left, right) => {
          const healthDifference = left.operational.health.rank - right.operational.health.rank;
          if (healthDifference !== 0) {
            return healthDifference;
          }
          return String(left.job.job_number || "").localeCompare(String(right.job.job_number || ""));
        }),
    [dashboardData.jobOperations, summary.activeJobs]
  );
  const quoteFollowUpRows = useMemo(
    () =>
      summary.openQuotes
        .filter((quote) => isOpenQuote(quote))
        .map((quote) => ({
          quote,
          operational: getQuoteOperationalSummary(quote),
        }))
        .filter(({ operational }) => operational.health.rank <= 5)
        .sort((left, right) => left.operational.health.rank - right.operational.health.rank)
        .slice(0, 8),
    [summary.openQuotes]
  );
  const upcomingInstalls = useMemo(
    () => getUpcomingInstallJobs(summary.activeJobs, dashboardData.jobOperations, new Date(), 14),
    [dashboardData.jobOperations, summary.activeJobs]
  );
  const installPlannerState = useMemo(
    () => buildInstallationTimelineState(summary.activeJobs, dashboardData.jobOperations, "all"),
    [dashboardData.jobOperations, summary.activeJobs]
  );
  const atRiskJobs = jobOperationalRows.filter(({ operational }) => operational.health.rank <= 4);
  const visibleAttentionItems = summary.needsAttention.filter((item) => {
    if (String(item.href || "").startsWith("/leads")) return leadsEnabled;
    if (String(item.href || "").startsWith("/quotes")) return quotesEnabled;
    if (String(item.href || "").startsWith("/schedule")) return scheduleEnabled;
    return true;
  });
  const visibleRecentActivity = summary.recentActivity.filter((item) => {
    if (String(item.href || "").startsWith("/leads")) return leadsEnabled;
    if (String(item.href || "").startsWith("/quotes")) return quotesEnabled;
    if (String(item.href || "").startsWith("/time-tracking")) return exportEnabled;
    return true;
  });
  const awaitingQuoteCount = summary.openQuotes.filter((quote) => {
    const insight = getQuoteOperationalSummary(quote);
    return ["Awaiting decision", "Follow up", "Expiring soon", "Expired"].includes(insight.health.label);
  }).length;
  const topStatCards = [
    leadsEnabled ? {
      title: "Open Enquiries",
      value: summary.openEnquiries.length,
      subtitle: `${summary.ownerLabel} pipeline`,
      icon: Target,
      href: "/leads",
      hrefLabel: "Open enquiries",
      iconHref: "/leads",
      iconLabel: "Open enquiries",
    } : null,
    {
      title: "Active Jobs",
      value: summary.activeJobs.length,
      subtitle: "Live work in progress",
      icon: Briefcase,
      href: "/jobs",
      hrefLabel: "Open jobs",
      iconHref: "/jobs",
      iconLabel: "Open jobs",
    },
    {
      title: "Installs 14 Days",
      value: upcomingInstalls.length,
      subtitle: "Upcoming site work",
      icon: Clock,
      href: "/jobs",
      hrefLabel: "Review install jobs",
      iconHref: "/jobs",
      iconLabel: "Review install jobs",
    },
    scheduleEnabled ? {
      title: "Needs Planning",
      value: installPlannerState.unscheduledItems.length,
      subtitle: "Install-ready jobs without booked dates",
      icon: AlertTriangle,
      href: "/schedule",
      hrefLabel: "Open install planner",
      iconHref: "/schedule",
      iconLabel: "Open install planner",
    } : null,
    quotesEnabled ? {
      title: "Quote Follow-Up",
      value: awaitingQuoteCount,
      subtitle: "Quotes awaiting action",
      icon: FileSpreadsheet,
      href: "/quotes",
      hrefLabel: "Review quotes",
      iconHref: "/quotes",
      iconLabel: "Review quotes",
    } : null,
    {
      title: "Needs Attention",
      value: atRiskJobs.length + visibleAttentionItems.length,
      subtitle: `${summary.pendingTasksTotal} pending tasks`,
      icon: AlertTriangle,
    },
  ].filter(Boolean);
  const topStatGridClass = getDashboardStatGridClass(topStatCards.length);
  const timeclockStatCards = [
    { label: "Total Hours This Week", value: `${timeclockSummary.totalHoursThisWeek.toFixed(1)}h`, subtitle: "Completed time entries this week" },
    { label: "Active Staff", value: timeclockSummary.activeStaff, subtitle: "Staff currently available for clock-in" },
    { label: "Active Jobs", value: timeclockSummary.activeJobs, subtitle: "Jobs open for time capture" },
    exportEnabled ? { label: "Pending Export", value: timeclockSummary.pendingExport, subtitle: "Completed entries awaiting MYOB export" } : null,
  ].filter(Boolean);
  const timeclockGridClass = getDashboardStatGridClass(timeclockStatCards.length);
  const labourIntelligence = dashboardData.labourIntelligence || {};
  const labourWarnings = Array.isArray(labourIntelligence.warnings) ? labourIntelligence.warnings : [];
  const labourBottlenecks = Array.isArray(labourIntelligence.bottlenecks) ? labourIntelligence.bottlenecks : [];
  const workflowPredictions = Array.isArray(labourIntelligence.workflow_hour_prediction) ? labourIntelligence.workflow_hour_prediction : [];
  const estimateAccuracy = labourIntelligence.estimate_accuracy || {};
  const labourPrediction = labourIntelligence.labour_prediction || {};
  const installPrediction = labourIntelligence.install_duration_prediction || {};
  const profitability = labourIntelligence.profitability || {};
  const operationalIntelligence = dashboardData.operationalIntelligence || {};
  const operationalBriefing = operationalIntelligence.daily_briefing || {};
  const operationalWarnings = Array.isArray(operationalIntelligence.warnings) ? operationalIntelligence.warnings : [];
  const operationalRecommendations = Array.isArray(operationalIntelligence.recommendations) ? operationalIntelligence.recommendations : [];
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="jf-reference-page">
      <PageHeader
        title="Dashboard"
        subtitle={`${getDashboardSubtitle(summary)} Start with attention items, then move quotes, jobs, installs, and time capture forward.`}
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                {OWNER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leadsEnabled ? <Link to="/leads"><Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />New Lead</Button></Link> : null}
            {quotesEnabled ? <Link to="/quotes"><Button size="sm"><Plus className="w-4 h-4 mr-1" />New Quote</Button></Link> : null}
          </div>
        }
      />

      {loadError ? (
        <Alert className="mb-6 border-amber-300 bg-amber-50/80 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Partial dashboard data</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadDashboard()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="jf-reference-panel p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Command view</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">Today&apos;s operating picture</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            What needs attention, what is waiting, and where the workshop should look next.
          </p>
        </div>
        <div className={`grid gap-3 ${topStatGridClass}`}>
          {topStatCards.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </div>
      </div>

      <div className="-mt-2 flex justify-end">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border/55 bg-white/70 p-1 shadow-sm">
          {ACTIVITY_WINDOW_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={activityWindowDays === option.value ? "secondary" : "ghost"}
              onClick={() => setActivityWindowDays(option.value)}
              aria-pressed={activityWindowDays === option.value}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <section className="space-y-4">
        <SectionHeading title="AI Operational Intelligence" href="/jobs" label="Review jobs" />
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="jf-reference-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Morning briefing</p>
                <h3 className="mt-1 font-heading text-xl font-semibold">{operationalBriefing.summary || "No operational risks detected from current records."}</h3>
              </div>
              <StatusBadge label="No auto changes" color="emerald" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                ["Jobs at risk", operationalBriefing.jobs_at_risk || 0],
                ["Overdue items", operationalBriefing.overdue_items || 0],
                ["Install pressure", operationalBriefing.install_pressure || 0],
                ["Workflow blockers", operationalBriefing.workflow_blockers || 0],
                ["Staffing pressure", operationalBriefing.staffing_pressure || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/50 bg-white/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                  <p className="mt-2 font-heading text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm">AI Warnings</h3>
              <StatusBadge label={`${operationalWarnings.length} active`} color={operationalWarnings.some((risk) => risk.severity === "high") ? "red" : "amber"} />
            </div>
            <div className="space-y-2">
              {operationalWarnings.length === 0 ? (
                renderEmptyCard("No AI operational warnings from the current dashboard data")
              ) : operationalWarnings.slice(0, 5).map((risk) => (
                <Link key={risk.id} to={risk.related_entity === "Quote" ? `/quotes/${risk.related_id}` : risk.related_entity === "Job" ? `/jobs/${risk.related_id}` : "/jobs"} className="jf-reference-row block p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{risk.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{risk.detail}</p>
                    </div>
                    <StatusBadge label={risk.severity} color={risk.severity === "high" ? "red" : risk.severity === "medium" ? "amber" : "blue"} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{risk.recommendation}</p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
        {operationalRecommendations.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {operationalRecommendations.slice(0, 4).map((recommendation) => (
              <div key={recommendation} className="rounded-lg border border-border/55 bg-white/70 p-3 text-sm text-muted-foreground">
                {recommendation}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionHeading title="Timeclock Snapshot" href="/log-time" label="Open log time" />
        <div className={`jf-reference-panel grid gap-3 p-3 ${timeclockGridClass}`}>
          {timeclockStatCards.map((metric) => (
            <article key={metric.label} className="jf-reference-metric min-h-[112px] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
              <p className="mt-2 font-heading text-3xl font-semibold">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.subtitle}</p>
            </article>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-sm">Hours by Job</h3>
              <Link to="/jobs" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Open jobs <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {timeclockSummary.hoursByJob.length === 0 ? (
                renderEmptyCard("No weekly time captured against jobs yet")
              ) : timeclockSummary.hoursByJob.map((row) => {
                const maxValue = Math.max(row.actualHours, row.budgetHours || 0, 1);
                return (
                  <div key={row.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground truncate">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.actualHours.toFixed(1)}h actual{row.budgetHours ? ` · ${row.budgetHours.toFixed(1)}h budget` : ""}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-millbrook-sage" style={{ width: `${(row.actualHours / maxValue) * 100}%` }} />
                      </div>
                      {row.budgetHours ? (
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-millbrook-bronze" style={{ width: `${(row.budgetHours / maxValue) * 100}%` }} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-semibold text-sm">Recent Time Entries</h3>
              <Link to="/log-time" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Open time clock <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {timeclockSummary.recentEntries.length === 0 ? (
                renderEmptyCard("No recent time entries recorded")
              ) : timeclockSummary.recentEntries.map((entry) => (
                <Link key={entry.id} to="/log-time" className="jf-reference-row flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{entry.staff_name || "Unknown staff"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {[entry.job_number, entry.job_name || entry.job_title, entry.activity].filter(Boolean).join(" · ") || "General work"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{Number(entry.hours || 0).toFixed(2)}h</p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.date || entry.updated_date)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Labour Intelligence" href="/reports" label="Open reports" />
        <div className="jf-reference-panel p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="jf-reference-metric min-h-[112px] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Forecast Remaining</p>
              <p className="mt-2 font-heading text-3xl font-semibold">{Number(labourPrediction.predicted_remaining_hours || 0).toFixed(1)}h</p>
              <p className="mt-1 text-xs text-muted-foreground">{Number(labourPrediction.current_actual_hours || 0).toFixed(1)}h already captured</p>
            </article>
            <article className="jf-reference-metric min-h-[112px] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Install Forecast</p>
              <p className="mt-2 font-heading text-3xl font-semibold">{Number(installPrediction.predicted_install_days_next_14 || 0).toFixed(1)}d</p>
              <p className="mt-1 text-xs text-muted-foreground">{installPrediction.upcoming_installs || 0} upcoming installs</p>
            </article>
            <article className="jf-reference-metric min-h-[112px] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Estimate Accuracy</p>
              <p className="mt-2 font-heading text-3xl font-semibold">{Number(estimateAccuracy.average_variance_percent || 0).toFixed(1)}%</p>
              <p className="mt-1 text-xs text-muted-foreground">{estimateAccuracy.over_budget_jobs || 0} jobs over estimate</p>
            </article>
            <article className="jf-reference-metric min-h-[112px] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Labour Margin</p>
              <p className="mt-2 font-heading text-3xl font-semibold">{Number(profitability.labour_margin_percent || 0).toFixed(1)}%</p>
              <p className="mt-1 text-xs text-muted-foreground">{profitability.at_risk_jobs || 0} jobs at risk</p>
            </article>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm">AI Labour Warnings</h3>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {labourWarnings.length === 0 ? (
                renderEmptyCard("No labour warnings from current operational data")
              ) : labourWarnings.slice(0, 6).map((warning, index) => (
                <Link key={`${warning.message}-${index}`} to={warning.href || "/jobs"} className="jf-reference-row flex items-start gap-3 p-3">
                  <div className={`mt-1.5 h-2 w-2 rounded-full ${warning.severity === "high" ? "bg-millbrook-red" : warning.severity === "medium" ? "bg-millbrook-amber" : "bg-millbrook-sage"}`} />
                  <p className="text-sm text-foreground">{warning.message}</p>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm">Workflow Bottlenecks</h3>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {labourBottlenecks.length === 0 ? (
                renderEmptyCard("No blocked workflow phases found")
              ) : labourBottlenecks.slice(0, 6).map((row) => (
                <Link key={row.workflow_phase} to="/jobs" className="jf-reference-row flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.workflow_phase}</p>
                    <p className="text-xs text-muted-foreground">{row.active_operations} active operations</p>
                  </div>
                  <StatusBadge label={`${row.blocked_or_waiting} waiting`} color={row.severity === "high" ? "red" : row.severity === "medium" ? "amber" : "green"} className="text-[10px]" />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm">Workflow Hour Forecast</h3>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-3">
              {workflowPredictions.length === 0 ? (
                renderEmptyCard("No workflow estimates available yet")
              ) : workflowPredictions.slice(0, 6).map((row) => {
                const maxValue = Math.max(row.predicted_hours || 0, row.estimated_hours || 0, 1);
                return (
                  <div key={row.workflow_phase} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{row.workflow_phase}</p>
                      <p className="text-xs text-muted-foreground">{Number(row.predicted_hours || 0).toFixed(1)}h forecast</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-millbrook-sage" style={{ width: `${((row.predicted_hours || 0) / maxValue) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{Number(row.variance_percent || 0).toFixed(1)}% variance</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="jf-reference-panel p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-sm">Jobs by Status</h2>
            <Link to="/jobs" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View jobs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {summary.jobStatusSummary.length === 0 && renderEmptyCard("No active jobs")}
            {summary.jobStatusSummary.map((status) => (
              <Link
                key={status.value}
                to={`/jobs?status=${encodeURIComponent(status.value)}`}
                aria-label={`Open ${status.label} jobs`}
                className="jf-reference-row block border border-border/45 bg-white/45 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <StatusBadge label={status.label} color={status.color} className="mb-2 text-[10px]" />
                <p className="text-2xl font-bold">{status.count}</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="jf-reference-panel p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-sm">Needs Attention</h2>
            <span className="text-xs text-muted-foreground">{summary.ownerLabel}</span>
          </div>
          <div className="space-y-2">
            {visibleAttentionItems.length === 0 ? (
              renderEmptyCard("No overdue or missing-information items")
            ) : visibleAttentionItems.map((item) => (
              <Link key={item.id} to={item.href} className="jf-reference-row flex items-start gap-3 p-3">
                <div className={`mt-1.5 h-2 w-2 rounded-full ${item.badgeColor === "red" ? "bg-millbrook-red" : "bg-millbrook-amber"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <StatusBadge label={item.badge} color={item.badgeColor} className="text-[10px]" />
                  </div>
                  <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(item.date)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="jf-reference-panel p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-sm">Production Readiness</h2>
            <Link to="/jobs" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Open jobs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {jobOperationalRows.slice(0, 8).length === 0 ? (
              renderEmptyCard("No active jobs to review")
            ) : jobOperationalRows.slice(0, 8).map(({ job, operational }) => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="jf-reference-row flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{job.job_number || job.title}</p>
                    <StatusBadge label={operational.health.label} color={operational.health.color} className="text-[10px]" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {[
                      job.title,
                      operational.nextTaskName ? `Next: ${operational.nextTaskName}` : "",
                      operational.unscheduledCount > 0 ? `${operational.unscheduledCount} unscheduled` : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{operational.progressPercent}%</p>
                  <p className="text-xs text-muted-foreground">
                    {operational.installDate ? `Install ${formatDate(operational.installDate)}` : formatDate(job.due_date)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {quotesEnabled ? (
          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold text-sm">Quote Follow-Up</h2>
              <Link to="/quotes" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Review quotes <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {quoteFollowUpRows.length === 0 ? (
                renderEmptyCard("No quotes currently need commercial follow-up")
              ) : quoteFollowUpRows.map(({ quote, operational }) => (
                <Link key={quote.id} to={`/quotes/${quote.id}`} className="jf-reference-row flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{quote.quote_number || quote.title}</p>
                      <StatusBadge label={operational.health.label} color={operational.health.color} className="text-[10px]" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {[quote.title, quote.contact_name || quote.company_name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{quote.total ? formatCurrency(quote.total) : "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {quote.valid_until ? `Valid ${formatDate(quote.valid_until)}` : formatDate(quote.created_date)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="jf-reference-panel p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-sm">Recent Activity</h2>
            <span className="text-xs text-muted-foreground">{`Last ${activityWindowDays === 1 ? "day" : `${activityWindowDays} days`}`}</span>
          </div>
          <div className="space-y-2">
            {visibleRecentActivity.length === 0 ? (
              renderEmptyCard("No recent activity in this period")
            ) : visibleRecentActivity.map((item) => (
              <Link key={item.id} to={item.href} className="jf-reference-row flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.kind}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">{item.subtitle}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.date)}</span>
              </Link>
            ))}
          </div>
        </Card>

        {exportEnabled ? (
          <Card className="jf-reference-panel p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold text-sm">Unexported Timesheets</h2>
              <Link to="/time-tracking" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Open time clock <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {unexportedRows.length === 0 ? (
                renderEmptyCard("No pending completed timesheets")
              ) : unexportedRows.map((row) => (
                <Link key={row.id} to={row.href} className="jf-reference-row flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1">{row.subtitle || "Completed time entry"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{row.hours}h</p>
                    <p className="text-xs text-muted-foreground">{formatDate(row.date)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}

        {exportEnabled ? (
          <Card className="jf-reference-panel p-5 xl:col-span-2">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-sm">MYOB Export History</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">{`Last ${activityWindowDays === 1 ? "day" : `${activityWindowDays} days`}`}</span>
                <Link to="/time-tracking" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Open exports <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <div className="space-y-2">
              {summary.exportHistory.length === 0 ? (
                renderEmptyCard("No exports recorded in this period")
              ) : summary.exportHistory.map((entry) => (
                <Link key={entry.id} to="/time-tracking" className="jf-reference-row flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium truncate">{String(entry.export_type || "export").replace(/_/g, " ")}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {[entry.staff_name, entry.job_number, entry.exported_by].filter(Boolean).join(" · ") || "Export record"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(entry.exported_at || entry.created_date)}</span>
                </Link>
              ))}
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
