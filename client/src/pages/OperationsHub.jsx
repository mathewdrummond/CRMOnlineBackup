import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/PageHeader";
import GuidedWorkflow from "../components/GuidedWorkflow";
import { useModules } from "@/lib/ModuleContext";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { formatCurrency, formatDate } from "../lib/helpers";
import { ACTIVITY_WINDOW_OPTIONS, OWNER_OPTIONS, buildDashboardSummary } from "../lib/dashboardHelpers";
import { getJobOperationalSummary, getQuoteOperationalSummary, getUpcomingInstallJobs, isActiveJob, isOpenQuote } from "../lib/crmOpsInsights";
import { buildInstallationTimelineState } from "../lib/installSchedule";
import { getOperationsHubSnapshot, loadOperationsHubData } from "../lib/operationsData";
import { AlertTriangle, Briefcase, CalendarClock, Clock, FileText, Target, Users } from "lucide-react";

function MetricPanel({ label, value, hint, href, icon: Icon }) {
  const body = (
    <article className="jf-reference-metric min-h-[112px] p-4 transition-colors hover:bg-muted/25">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="font-heading text-3xl font-semibold text-foreground">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="rounded-md bg-muted/55 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
    </article>
  );

  if (!href) {
    return body;
  }

  return (
    <Link to={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  );
}

function SectionListCard({ title, subtitle, actionLabel, actionHref, emptyTitle, emptyDescription, emptyIcon: EmptyIcon, children }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="jf-reference-panel p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">What to do next</p>
          <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actionHref ? (
          <Link to={actionHref} className="jf-reference-link">
            {actionLabel || "Open"}
          </Link>
        ) : null}
      </div>
      {hasChildren ? children : (
        <EmptyState
          icon={EmptyIcon}
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </section>
  );
}

export default function OperationsHub() {
  const { isModuleEnabled } = useModules();
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const contactsEnabled = isModuleEnabled("contacts");
  const scheduleEnabled = isModuleEnabled("schedule");
  const dashboardEnabled = isModuleEnabled("dashboard");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [activityWindowDays, setActivityWindowDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const moduleFlags = {
    leadsEnabled,
    quotesEnabled,
    contactsEnabled,
  };
  const [data, setData] = useState(() => getOperationsHubSnapshot(moduleFlags));

  const loadData = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const result = await loadOperationsHubData(moduleFlags);
      setData(result.data);
      const failedLabels = Array.isArray(result.failedLabels) ? result.failedLabels : [];
      if (failedLabels.length > 0) {
        setLoadError(`Some operations data could not be loaded: ${failedLabels.join(", ")}.`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [contactsEnabled, leadsEnabled, quotesEnabled]);

  const summary = useMemo(
    () => buildDashboardSummary({ ...data, ownerFilter, activityWindowDays }),
    [activityWindowDays, data, ownerFilter]
  );

  const activeJobs = useMemo(() => data.jobs.filter((job) => isActiveJob(job)), [data.jobs]);
  const openQuotes = useMemo(() => data.quotes.filter((quote) => isOpenQuote(quote)), [data.quotes]);
  const contactMap = useMemo(() => new Map(data.contacts.map((contact) => [contact.id, contact])), [data.contacts]);

  const jobOperationalRows = useMemo(
    () =>
      activeJobs
        .map((job) => ({
          job,
          operational: getJobOperationalSummary(job, data.jobOperations),
        }))
        .sort((left, right) => left.operational.health.rank - right.operational.health.rank),
    [activeJobs, data.jobOperations]
  );

  const quoteOperationalRows = useMemo(
    () =>
      openQuotes
        .map((quote) => ({
          quote,
          operational: getQuoteOperationalSummary(quote),
        }))
        .sort((left, right) => left.operational.health.rank - right.operational.health.rank),
    [openQuotes]
  );

  const upcomingInstalls = useMemo(
    () => getUpcomingInstallJobs(activeJobs, data.jobOperations, new Date(), 21),
    [activeJobs, data.jobOperations]
  );
  const installPlannerState = useMemo(
    () => buildInstallationTimelineState(activeJobs, data.jobOperations, "all"),
    [activeJobs, data.jobOperations]
  );
  const installPlanningBacklog = useMemo(
    () => installPlannerState.unscheduledItems.slice(0, 10),
    [installPlannerState.unscheduledItems]
  );

  const overdueContactFollowUps = useMemo(
    () =>
      data.contacts
        .filter((contact) => {
          const dueTime = Date.parse(String(contact.next_follow_up_date || ""));
          return !Number.isNaN(dueTime) && dueTime < Date.now() && String(contact.status || "").toLowerCase() !== "archived";
        })
        .slice(0, 8),
    [data.contacts]
  );

  const overdueContactTasks = useMemo(
    () =>
      data.contactTasks
        .filter((task) => {
          if (String(task.status || "").toLowerCase() === "completed") {
            return false;
          }
          const dueTime = Date.parse(String(task.due_date || ""));
          return !Number.isNaN(dueTime) && dueTime < Date.now();
        })
        .slice(0, 8),
    [data.contactTasks]
  );

  const quoteUrgencyRows = quoteOperationalRows.filter(({ operational }) => operational.health.rank <= 2).slice(0, 8);
  const jobRiskRows = jobOperationalRows.filter(({ operational }) => operational.health.rank <= 4).slice(0, 8);
  const installRunwayRows = upcomingInstalls.slice(0, 8);
  const readyToActionLeads = summary.openEnquiries
    .filter((lead) => ["new_enquiry", "contacted", "site_visit_booked", "measuring", "quote_in_progress"].includes(String(lead.stage || "")))
    .slice(0, 8);
  const visibleRecentActivity = summary.recentActivity.filter((item) => {
    if (String(item.href || "").startsWith("/leads")) return leadsEnabled;
    if (String(item.href || "").startsWith("/quotes")) return quotesEnabled;
    if (String(item.href || "").startsWith("/contacts")) return contactsEnabled;
    if (String(item.href || "").startsWith("/schedule")) return scheduleEnabled;
    if (String(item.href || "").startsWith("/dashboard")) return dashboardEnabled;
    return true;
  });

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
        title="Operations"
        subtitle="A daily command view for sales handoff, production readiness, install planning, and customer follow-up."
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="inline-flex items-center gap-1 rounded-lg border border-border/55 bg-white/70 p-1 shadow-sm">
              {ACTIVITY_WINDOW_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={activityWindowDays === option.value ? "secondary" : "ghost"}
                  onClick={() => setActivityWindowDays(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        }
      />
      {loadError ? (
        <Alert className="mb-6 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadData()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <GuidedWorkflow
        className="jf-reference-panel p-5"
        title="Start here today"
        subtitle="A simple daily rhythm for the workshop and office: handle urgent items first, then keep quotes, installs, and follow-ups moving."
        steps={[
          { title: "Check pressure", detail: "Look at at-risk jobs and work needing attention." },
          { title: "Move quotes along", detail: "Review quotes ready to send or waiting on a decision." },
          { title: "Plan site work", detail: "Book installs that are ready but not scheduled." },
          { title: "Follow up", detail: "Clear customer reminders before they go stale." },
        ]}
      />

      <div className="jf-reference-panel p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Today&apos;s pressure</p>
            <h2 className="font-heading text-xl font-semibold text-foreground">Where the small team should focus</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep the day moving by clearing the work that blocks quoting, production, delivery, and follow-up.
          </p>
        </div>
        <div className={`grid gap-3 ${[
          "sm:grid-cols-2",
          scheduleEnabled ? "xl:grid-cols-6" : quotesEnabled || contactsEnabled || leadsEnabled ? "xl:grid-cols-5" : "xl:grid-cols-3",
        ].join(" ")}`}>
          {[
            <MetricPanel key="risk" label="At Risk Jobs" value={jobOperationalRows.filter(({ operational }) => operational.health.rank <= 4).length} hint="Delivery or readiness pressure" href="/jobs" icon={AlertTriangle} />,
            scheduleEnabled ? <MetricPanel key="installs" label="Installs 21 Days" value={upcomingInstalls.length} hint="Upcoming site commitments" href="/schedule" icon={CalendarClock} /> : null,
            scheduleEnabled ? <MetricPanel key="unscheduled" label="Needs Planning" value={installPlannerState.unscheduledItems.length} hint="Install-ready jobs still missing dates" href="/schedule" icon={Briefcase} /> : null,
            quotesEnabled ? <MetricPanel key="quotes" label="Quote Follow-Up" value={quoteUrgencyRows.length} hint="Commercial pressure" href="/quotes" icon={FileText} /> : null,
            contactsEnabled ? <MetricPanel key="contacts" label="Contact Follow-Ups" value={overdueContactFollowUps.length + overdueContactTasks.length} hint="Customer relationships needing action" href="/contacts" icon={Users} /> : null,
            leadsEnabled ? <MetricPanel key="leads" label="Open Enquiries" value={summary.openEnquiries.length} hint={formatCurrency(summary.openEnquiries.reduce((sum, lead) => sum + Number(lead.value || 0), 0))} href="/leads" icon={Target} /> : null,
          ].filter(Boolean)}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr] 2xl:grid-cols-[1.3fr_0.95fr]">
        <div className="space-y-4">
          <SectionListCard
            title="Production & Delivery"
            subtitle="Jobs that need scheduling, unblocking, or install readiness attention."
            actionHref="/jobs"
            actionLabel="Open jobs"
            emptyTitle="No production pressure"
            emptyDescription="Active jobs look healthy right now."
            emptyIcon={Briefcase}
          >
            <div className="space-y-3">
              {jobRiskRows.map(({ job, operational }) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="jf-reference-row block bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{job.job_number || job.title}</p>
                        <StatusBadge label={operational.health.label} color={operational.health.color} className="text-[10px]" />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground truncate">{job.title}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {[
                          operational.nextTaskName ? `Next: ${operational.nextTaskName}` : "",
                          operational.unscheduledCount > 0 ? `${operational.unscheduledCount} unscheduled` : "",
                          operational.blockedCount > 0 ? `${operational.blockedCount} blocked` : "",
                          operational.installDate ? `Install ${formatDate(operational.installDate)}` : "",
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{operational.progressPercent}%</p>
                      <p className="text-xs text-muted-foreground">{formatDate(job.due_date)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionListCard>

          {(quotesEnabled || leadsEnabled) ? (
            <SectionListCard
              title="Commercial Follow-Up"
              subtitle="Quotes and enquiries that need action to keep the pipeline moving."
              actionHref={quotesEnabled ? "/quotes" : leadsEnabled ? "/leads" : undefined}
              actionLabel={quotesEnabled ? "Open quotes" : "Open enquiries"}
              emptyTitle="No urgent commercial follow-up"
              emptyDescription="Quotes and enquiries are under control."
              emptyIcon={FileText}
            >
              <div className={`grid gap-3 ${quotesEnabled && leadsEnabled ? "lg:grid-cols-2" : ""}`}>
                {quotesEnabled ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quotes</p>
                    {quoteUrgencyRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No urgent quote follow-up.</p>
                    ) : quoteUrgencyRows.map(({ quote, operational }) => (
                      <Link key={quote.id} to={`/quotes/${quote.id}`} className="jf-reference-row block bg-muted/20 p-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{quote.quote_number || quote.title}</p>
                          <StatusBadge label={operational.health.label} color={operational.health.color} className="text-[10px]" />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground truncate">{[quote.title, quote.contact_name || quote.company_name].filter(Boolean).join(" · ")}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{quote.valid_until ? `Valid until ${formatDate(quote.valid_until)}` : `Created ${formatDate(quote.created_date)}`}</p>
                      </Link>
                    ))}
                  </div>
                ) : null}

                {leadsEnabled ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Enquiries</p>
                    {readyToActionLeads.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active enquiries in the current view.</p>
                    ) : readyToActionLeads.map((lead) => (
                      <Link key={lead.id} to={`/leads/${lead.id}`} className="jf-reference-row block bg-muted/20 p-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{lead.title}</p>
                          <StatusBadge label={String(lead.stage || "new_enquiry").replace(/_/g, " ")} color="blue" className="text-[10px]" />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground truncate">{[lead.contact_name, lead.company_name].filter(Boolean).join(" · ") || "Unlinked enquiry"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{lead.value ? formatCurrency(lead.value) : "No value assigned"}</p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </SectionListCard>
          ) : null}

          {scheduleEnabled ? (
            <SectionListCard
              title="Install Planner Backlog"
              subtitle="Install-ready jobs and install tasks that still need booked site dates."
              actionHref="/schedule"
              actionLabel="Open install planner"
              emptyTitle="Nothing waiting for install planning"
              emptyDescription="All install-ready jobs currently have booked dates."
              emptyIcon={CalendarClock}
            >
              <div className="space-y-3">
                {installPlanningBacklog.map((item) => (
                  <Link key={item.id} to={item.jobId ? `/jobs/${item.jobId}` : "/schedule"} className="jf-reference-row block bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.jobNumber || item.jobTitle}</p>
                        <p className="mt-1 text-sm text-muted-foreground truncate">{[item.jobTitle, item.clientSiteLabel, item.installLabel].filter(Boolean).join(" · ")}</p>
                      </div>
                      <StatusBadge label={item.installStatusLabel || "Needs planning"} color="amber" className="text-[10px]" />
                    </div>
                  </Link>
                ))}
              </div>
            </SectionListCard>
          ) : null}
        </div>

        <div className="space-y-4">
          <SectionListCard
            title="Install Runway"
            subtitle="Jobs approaching installation so workshop readiness stays visible."
            actionHref={scheduleEnabled ? "/schedule" : "/jobs"}
            actionLabel={scheduleEnabled ? "Open install planner" : "Open jobs"}
            emptyTitle="No upcoming installs"
            emptyDescription="There are no installs scheduled in the next three weeks."
            emptyIcon={CalendarClock}
          >
            <div className="space-y-3">
              {installRunwayRows.map(({ job, summary: install }) => (
                <Link key={job.id} to={`/jobs/${job.id}`} className="jf-reference-row block bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{job.job_number || job.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground truncate">{job.title}</p>
                    </div>
                    <StatusBadge label={install.health.label} color={install.health.color} className="text-[10px]" />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {[
                      `Install ${formatDate(install.installDate)}`,
                      install.manufacturingRemainingCount > 0 ? `${install.manufacturingRemainingCount} manufacturing tasks open` : "Manufacturing complete",
                    ].join(" · ")}
                  </p>
                </Link>
              ))}
            </div>
          </SectionListCard>

          {contactsEnabled ? (
            <SectionListCard
              title="Customer Follow-Up"
              subtitle="Overdue customer reminders and task commitments."
              actionHref="/contacts"
              actionLabel="Open contacts"
              emptyTitle="No overdue customer follow-up"
              emptyDescription="Contact follow-up and contact tasks are current."
              emptyIcon={Users}
            >
              <div className="space-y-3">
                {overdueContactFollowUps.map((contact) => (
                  <Link key={contact.id} to={`/contacts/${contact.id}`} className="jf-reference-row block bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact"}</p>
                      <StatusBadge label="follow up overdue" color="red" className="text-[10px]" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground truncate">{[contact.company_name, contact.owner].filter(Boolean).join(" · ")}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Due {formatDate(contact.next_follow_up_date)}</p>
                  </Link>
                ))}
                {overdueContactTasks.map((task) => {
                  const contact = contactMap.get(task.contact_id);
                  return (
                    <Link key={task.id} to={task.contact_id ? `/contacts/${task.contact_id}` : "/contacts"} className="jf-reference-row block bg-muted/20 p-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{task.title || "Contact task"}</p>
                        <StatusBadge label={task.priority || "pending"} color={task.priority === "urgent" || task.priority === "high" ? "red" : "amber"} className="text-[10px]" />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground truncate">{contact ? ([contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email) : "Contact task"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Due {formatDate(task.due_date)}</p>
                    </Link>
                  );
                })}
              </div>
            </SectionListCard>
          ) : null}

          <SectionListCard
            title="Recent Activity"
            subtitle={`Latest cross-app changes from the last ${activityWindowDays === 1 ? "day" : `${activityWindowDays} days`}.`}
            actionHref={dashboardEnabled ? "/dashboard" : undefined}
            actionLabel="Open insights"
            emptyTitle="No recent activity"
            emptyDescription="Nothing has changed in the current window."
            emptyIcon={Clock}
          >
            {visibleRecentActivity.length > 0 ? (
              <div className="space-y-3">
                {visibleRecentActivity.slice(0, 8).map((item) => (
                  <Link key={item.id} to={item.href} className="jf-reference-row block bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground truncate">{item.subtitle}</p>
                      </div>
                      <span className="rounded-full bg-[#efe0cf] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#794c2e]">{item.kind}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDate(item.date)}</p>
                  </Link>
                ))}
              </div>
            ) : null}
          </SectionListCard>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {leadsEnabled ? <Link to="/leads"><Button variant="outline" size="sm">Open Leads</Button></Link> : null}
        {quotesEnabled ? <Link to="/quotes"><Button variant="outline" size="sm">Open Quotes</Button></Link> : null}
        <Link to="/jobs"><Button variant="outline" size="sm">Open Jobs</Button></Link>
        {scheduleEnabled ? <Link to="/schedule"><Button variant="outline" size="sm">Open Install Planner</Button></Link> : null}
        {dashboardEnabled ? <Link to="/dashboard"><Button size="sm">Open Insights</Button></Link> : null}
      </div>
    </div>
  );
}
