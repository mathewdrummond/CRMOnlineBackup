import { JOB_STATUSES, QUOTE_STATUSES, getStageConfig, normalizeQuoteStatus } from "./helpers";

export const OWNER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "bruce", label: "Bruce" },
  { value: "mathew", label: "Mathew" },
];

export const ACTIVITY_WINDOW_OPTIONS = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

const OWNER_MATCHERS = {
  bruce: ["bruce"],
  mathew: ["mathew", "matthew"],
};

export function matchesOwner(value, owner) {
  if (owner === "all") {
    return true;
  }

  const normalized = String(value || "").toLowerCase();
  return (OWNER_MATCHERS[owner] || []).some((token) => normalized.includes(token));
}

export function isPendingJobOperation(operation) {
  return !["completed"].includes(String(operation.status || "").toLowerCase());
}

export function isPendingLeadTask(task) {
  return String(task.status || "").toLowerCase() !== "completed";
}

function isActiveLead(lead) {
  return !["won", "lost"].includes(String(lead.stage || "").toLowerCase());
}

function isActiveJob(job) {
  return !["complete", "completed", "cancelled"].includes(String(job.status || "").toLowerCase());
}

function isUnexportedCompletedTimeEntry(entry) {
  return String(entry.status || "").toLowerCase() === "completed" && !entry.exported;
}

function getDateValue(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normaliseNoteContent(content) {
  return String(content || "").trim().replace(/\s+/g, " ");
}

function startOfDayStamp(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getActivityWindowStart(days, today) {
  const date = new Date(today || "");
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, Number(days || 1) - 1));
  return date.getTime();
}

function titleForNote(note, lookups) {
  const relatedType = String(note.related_type || "").toLowerCase();
  if (relatedType === "job") {
    const job = lookups.jobsById.get(note.related_id);
    return job?.job_number || job?.title || "Job note";
  }

  if (relatedType === "lead") {
    return lookups.leadsById.get(note.related_id)?.title || "Enquiry note";
  }

  if (relatedType === "quote") {
    const quote = lookups.quotesById.get(note.related_id);
    return quote?.quote_number || quote?.title || "Quote note";
  }

  return "Record note";
}

function hrefForRelatedRecord(relatedType, relatedId) {
  if (!relatedId) {
    return "/";
  }

  if (relatedType === "job") {
    return `/jobs/${relatedId}`;
  }

  if (relatedType === "lead") {
    return `/leads/${relatedId}`;
  }

  if (relatedType === "quote") {
    return `/quotes/${relatedId}`;
  }

  if (relatedType === "contact") {
    return `/contacts/${relatedId}`;
  }

  if (relatedType === "company") {
    return `/companies/${relatedId}`;
  }

  return "/";
}

function buildRecentActivityItems({ notes, jobs, leads, quotes, exportHistory, leadsById, jobsById, quotesById }) {
  const noteItems = notes.map((note) => ({
    id: `note-${note.id}`,
    title: titleForNote(note, { leadsById, jobsById, quotesById }),
    subtitle: normaliseNoteContent(note.content).slice(0, 100) || "Note added",
    date: note.created_date,
    href: hrefForRelatedRecord(String(note.related_type || "").toLowerCase(), note.related_id),
    kind: "Note",
    priority: 0,
    groupKey: `${String(note.related_type || "").toLowerCase()}:${note.related_id || note.id}`,
    dayKey: startOfDayStamp(note.created_date),
  }));

  const noteGroups = new Set(noteItems.map((item) => `${item.groupKey}:${item.dayKey}`));

  const recordUpdateItems = [
    ...jobs.map((job) => ({
      id: `job-${job.id}`,
      title: job.job_number || "Job",
      subtitle: `Job updated · ${job.title || "Untitled job"}`,
      date: job.updated_date || job.created_date,
      href: `/jobs/${job.id}`,
      kind: "Job",
      priority: 2,
      groupKey: `job:${job.id}`,
      dayKey: startOfDayStamp(job.updated_date || job.created_date),
    })),
    ...leads.map((lead) => ({
      id: `lead-${lead.id}`,
      title: lead.title || "Enquiry",
      subtitle: `Enquiry updated${lead.contact_name ? ` · ${lead.contact_name}` : ""}`,
      date: lead.updated_date || lead.created_date,
      href: `/leads/${lead.id}`,
      kind: "Enquiry",
      priority: 2,
      groupKey: `lead:${lead.id}`,
      dayKey: startOfDayStamp(lead.updated_date || lead.created_date),
    })),
    ...quotes.map((quote) => ({
      id: `quote-${quote.id}`,
      title: quote.quote_number || quote.title || "Quote",
      subtitle: `Quote ${getStageConfig(QUOTE_STATUSES, normalizeQuoteStatus(quote.status)).label.toLowerCase()}`,
      date: quote.updated_date || quote.created_date,
      href: `/quotes/${quote.id}`,
      kind: "Quote",
      priority: 2,
      groupKey: `quote:${quote.id}`,
      dayKey: startOfDayStamp(quote.updated_date || quote.created_date),
    })),
  ].filter((item) => !noteGroups.has(`${item.groupKey}:${item.dayKey}`));

  const exportItems = exportHistory.map((entry) => ({
    id: `export-${entry.id}`,
    title: `MYOB ${String(entry.export_type || "export").replace(/_/g, " ")}`,
    subtitle: [entry.staff_name, entry.job_number, entry.exported_by].filter(Boolean).join(" · ") || "Export recorded",
    date: entry.exported_at || entry.created_date,
    href: "/time-tracking",
    kind: "Export",
    priority: 1,
    groupKey: `export:${entry.id}`,
    dayKey: startOfDayStamp(entry.exported_at || entry.created_date),
  }));

  const kindCaps = {
    Note: 3,
    Export: 2,
    Job: 2,
    Enquiry: 2,
    Quote: 2,
  };
  const kindCounts = new Map();
  const seenGroups = new Set();

  return [...noteItems, ...exportItems, ...recordUpdateItems]
    .sort((left, right) => {
      const dateComparison = getDateValue(right.date) - getDateValue(left.date);
      if (dateComparison !== 0) {
        return dateComparison;
      }

      const priorityComparison = left.priority - right.priority;
      if (priorityComparison !== 0) {
        return priorityComparison;
      }

      return String(left.title || "").localeCompare(String(right.title || ""));
    })
    .filter((item) => {
      const groupMarker = `${item.groupKey}:${item.dayKey}`;
      if (seenGroups.has(groupMarker)) {
        return false;
      }

      const nextCount = (kindCounts.get(item.kind) || 0) + 1;
      if (nextCount > (kindCaps[item.kind] || 2)) {
        return false;
      }

      seenGroups.add(groupMarker);
      kindCounts.set(item.kind, nextCount);
      return true;
    })
    .slice(0, 8)
    .map(({ priority, groupKey, dayKey, ...item }) => item);
}

export function buildDashboardSummary({
  leads = [],
  jobs = [],
  quotes = [],
  leadTasks = [],
  jobOperations = [],
  timeEntries = [],
  exportHistory = [],
  notes = [],
  ownerFilter = "all",
  activityWindowDays = 7,
  today = new Date(),
}) {
  const ownerLabel = OWNER_OPTIONS.find((option) => option.value === ownerFilter)?.label || "All";
  const activeOperationJobIds = new Set(
    jobOperations
      .filter((operation) => isPendingJobOperation(operation) && matchesOwner(operation.assigned_to, ownerFilter))
      .map((operation) => operation.job_id)
  );

  const filteredLeads = leads.filter((lead) => matchesOwner(lead.assigned_to, ownerFilter));
  const filteredJobs = jobs.filter((job) => {
    if (ownerFilter === "all") {
      return true;
    }

    return (
      matchesOwner(job.project_manager, ownerFilter) ||
      matchesOwner(job.salesperson, ownerFilter) ||
      activeOperationJobIds.has(job.id)
    );
  });
  const filteredQuotes = quotes.filter((quote) => {
    const normalizedStatus = normalizeQuoteStatus(quote.status);
    if (ownerFilter === "all") {
      return true;
    }

    return (
      normalizedStatus === `awaiting_${ownerFilter}` ||
      matchesOwner(quote.prepared_by, ownerFilter) ||
      matchesOwner(quote.salesperson, ownerFilter)
    );
  });

  const openEnquiries = filteredLeads.filter(isActiveLead);
  const activeJobs = filteredJobs.filter(isActiveJob);
  const openQuotes = filteredQuotes.filter((quote) => normalizeQuoteStatus(quote.status) !== "won");
  const unexportedTimeEntries = timeEntries.filter((entry) => isUnexportedCompletedTimeEntry(entry));
  const pendingLeadTasks = leadTasks.filter((task) => isPendingLeadTask(task) && matchesOwner(task.assigned_to, ownerFilter));
  const pendingJobOperations = jobOperations.filter((operation) => isPendingJobOperation(operation) && matchesOwner(operation.assigned_to, ownerFilter));
  const activityWindowStart = getActivityWindowStart(activityWindowDays, today);
  const isWithinActivityWindow = (value) => {
    const timestamp = getDateValue(value);
    return timestamp >= activityWindowStart;
  };

  const jobStatusSummary = JOB_STATUSES.map((status) => ({
    ...status,
    count: activeJobs.filter((job) => String(job.status || "").toLowerCase() === status.value).length,
  })).filter((item) => item.count > 0);

  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const quotesById = new Map(quotes.map((quote) => [quote.id, quote]));

  const recentActivity = buildRecentActivityItems({
    notes: notes.filter((note) => isWithinActivityWindow(note.created_date)),
    jobs: jobs.filter((job) => isWithinActivityWindow(job.updated_date || job.created_date)),
    leads: leads.filter((lead) => isWithinActivityWindow(lead.updated_date || lead.created_date)),
    quotes: quotes.filter((quote) => isWithinActivityWindow(quote.updated_date || quote.created_date)),
    exportHistory: exportHistory.filter((entry) => isWithinActivityWindow(entry.exported_at || entry.created_date)),
    leadsById,
    jobsById,
    quotesById,
  });

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStamp = startOfToday.getTime();

  const needsAttention = [
    ...openEnquiries
      .filter((lead) => {
        const expectedClose = getDateValue(lead.expected_close);
        return expectedClose > 0 && expectedClose < todayStamp;
      })
      .map((lead) => ({
        id: `overdue-lead-${lead.id}`,
        title: lead.title || "Enquiry",
        subtitle: "Overdue expected close date",
        date: lead.expected_close,
        href: `/leads/${lead.id}`,
        badge: "Overdue",
        badgeColor: "red",
      })),
    ...activeJobs
      .filter((job) => {
        const dueDate = getDateValue(job.due_date);
        return dueDate > 0 && dueDate < todayStamp;
      })
      .map((job) => ({
        id: `overdue-job-${job.id}`,
        title: job.job_number || job.title || "Job",
        subtitle: "Job due date has passed",
        date: job.due_date,
        href: `/jobs/${job.id}`,
        badge: "Overdue",
        badgeColor: "red",
      })),
    ...activeJobs
      .filter((job) => !String(job.site_address || "").trim() || !String(job.contact_name || job.company_name || "").trim())
      .map((job) => ({
        id: `missing-job-${job.id}`,
        title: job.job_number || job.title || "Job",
        subtitle: !String(job.site_address || "").trim() ? "Missing site address" : "Missing client details",
        date: job.updated_date || job.created_date,
        href: `/jobs/${job.id}`,
        badge: "Missing info",
        badgeColor: "amber",
      })),
    ...openEnquiries
      .filter((lead) => !String(lead.contact_name || lead.company_name || "").trim() || !String(lead.site_address || "").trim())
      .map((lead) => ({
        id: `missing-lead-${lead.id}`,
        title: lead.title || "Enquiry",
        subtitle: !String(lead.contact_name || lead.company_name || "").trim() ? "Missing customer details" : "Missing site address",
        date: lead.updated_date || lead.created_date,
        href: `/leads/${lead.id}`,
        badge: "Missing info",
        badgeColor: "amber",
      })),
    ...openQuotes
      .filter((quote) => !String(quote.contact_name || quote.company_name || "").trim() || !String(quote.site_address || "").trim())
      .map((quote) => ({
        id: `missing-quote-${quote.id}`,
        title: quote.quote_number || quote.title || "Quote",
        subtitle: !String(quote.contact_name || quote.company_name || "").trim() ? "Missing customer details" : "Missing site address",
        date: quote.updated_date || quote.created_date,
        href: `/quotes/${quote.id}`,
        badge: "Missing info",
        badgeColor: "amber",
      })),
  ]
    .sort((left, right) => {
      const severityOrder = { red: 0, amber: 1 };
      const severityComparison = (severityOrder[left.badgeColor] ?? 9) - (severityOrder[right.badgeColor] ?? 9);
      if (severityComparison !== 0) {
        return severityComparison;
      }

      return getDateValue(left.date) - getDateValue(right.date);
    })
    .slice(0, 8);

  const pendingTasksTotal = pendingLeadTasks.length + pendingJobOperations.length + openQuotes.filter((quote) => ownerFilter === "all" || normalizeQuoteStatus(quote.status) === `awaiting_${ownerFilter}`).length;
  const unexportedHours = unexportedTimeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

  return {
    ownerLabel,
    openEnquiries,
    activeJobs,
    openQuotes,
    unexportedTimeEntries,
    pendingTasksTotal,
    unexportedHours,
    jobStatusSummary,
    recentActivity,
    exportHistory: exportHistory
      .filter((entry) => isWithinActivityWindow(entry.exported_at || entry.created_date))
      .slice()
      .sort((left, right) => getDateValue(right.exported_at || right.created_date) - getDateValue(left.exported_at || left.created_date))
      .slice(0, 6),
    needsAttention,
  };
}

export function getDashboardSubtitle(summary) {
  return `${summary.openEnquiries.length} open enquiries · ${summary.activeJobs.length} active jobs`;
}

export function getUnexportedTimesheetRows(entries = []) {
  return entries
    .slice()
    .sort((left, right) => getDateValue(left.date || left.created_date) - getDateValue(right.date || right.created_date))
    .slice(0, 6)
    .map((entry) => ({
      id: entry.id,
      title: entry.staff_name || "Timesheet row",
      subtitle: [entry.job_number, entry.activity || entry.operation].filter(Boolean).join(" · "),
      date: entry.date || entry.created_date,
      hours: Number(entry.hours || 0),
      href: "/time-tracking",
    }));
}
