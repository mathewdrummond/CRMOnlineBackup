import { getJobOperationalSummary, getQuoteOperationalSummary, isActiveJob } from "@/lib/crmOpsInsights";
import { formatDate, normalizeQuoteStatus } from "@/lib/helpers";
import { cloneReportFilters, dedupeSourceRecords, parseReportDateValue, prettifyReportValue } from "./reportingUtils";

export const REPORT_PACKS = [
  {
    key: "management",
    label: "Management",
    description: "Commercial performance, pipeline visibility, and delivery risk.",
  },
  {
    key: "operations",
    label: "Operations",
    description: "Production flow, scheduling pressure, and labour utilisation.",
  },
  {
    key: "finance_admin",
    label: "Finance & Admin",
    description: "Cost visibility and profitability oversight.",
  },
];

function sumBy(rows, key) {
  return (rows || []).reduce((sum, row) => sum + (Number(row?.[key] || 0)), 0);
}

function averageBy(rows, key) {
  const numericValues = (rows || []).map((row) => Number(row?.[key] || 0)).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function safePercent(numerator, denominator) {
  const normalizedNumerator = Number(numerator || 0);
  const normalizedDenominator = Number(denominator || 0);
  if (!Number.isFinite(normalizedNumerator) || !Number.isFinite(normalizedDenominator) || normalizedDenominator <= 0) {
    return 0;
  }

  return (normalizedNumerator / normalizedDenominator) * 100;
}

function groupBy(rows, getKey) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    const key = getKey(row);
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  });
  return groups;
}

function formatMonthLabel(value) {
  const date = parseReportDateValue(value);
  if (!date) {
    return "Unscheduled";
  }

  return date.toLocaleDateString("en-NZ", {
    month: "short",
    year: "numeric",
  });
}

function getMonthKey(value) {
  const date = parseReportDateValue(value);
  if (!date) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function compareDatesAscending(leftValue, rightValue) {
  const left = parseReportDateValue(leftValue);
  const right = parseReportDateValue(rightValue);
  return (left?.getTime() || 0) - (right?.getTime() || 0);
}

function getCustomerLabel(record) {
  return String(record?.company_name || record?.contact_name || record?.customer || "").trim();
}

function getJobLabel(job) {
  const parts = [job?.job_number, job?.title].filter(Boolean);
  return parts.join(" · ") || "Untitled job";
}

function getQuoteLabel(quote) {
  const parts = [quote?.quote_number, quote?.title].filter(Boolean);
  return parts.join(" · ") || "Untitled quote";
}

function getLeadLabel(lead) {
  const parts = [lead?.title, lead?.company_name || lead?.contact_name].filter(Boolean);
  return parts.join(" · ") || "Untitled lead";
}

function getRecordHref(entity, record) {
  if (!record?.id) {
    return "";
  }

  if (entity === "Job") {
    return `/jobs/${record.id}`;
  }
  if (entity === "Quote") {
    return `/quotes/${record.id}`;
  }
  if (entity === "Lead") {
    return `/leads/${record.id}`;
  }
  if (entity === "Company") {
    return `/companies/${record.id}`;
  }
  if (entity === "Contact") {
    return `/contacts/${record.id}`;
  }
  if (entity === "JobOperation") {
    return record.job_id ? `/jobs/${record.job_id}` : "/jobs";
  }
  if (entity === "TimeEntry") {
    return "/time-tracking";
  }

  return "";
}

function makeSourceRecord(entity, record, overrides = {}) {
  const title =
    overrides.title
    || (entity === "Job" ? getJobLabel(record) : "")
    || (entity === "Quote" ? getQuoteLabel(record) : "")
    || (entity === "Lead" ? getLeadLabel(record) : "")
    || String(record?.name || record?.title || record?.task_name || record?.description || entity).trim();

  return {
    entity,
    id: record?.id || overrides.id || "",
    href: overrides.href || getRecordHref(entity, record),
    title,
    subtitle: overrides.subtitle || "",
    label: overrides.label || title,
    status: overrides.status || String(record?.status || record?.stage || record?.health_status || "").trim(),
    date: overrides.date || String(record?.date || record?.created_date || record?.order_date || record?.due_date || "").trim(),
    customer: overrides.customer || getCustomerLabel(record),
    job_label: overrides.job_label || (record?.job_number || record?.job_title ? getJobLabel(record) : ""),
    amount: Number(overrides.amount ?? record?.total ?? record?.quoted_value ?? record?.value ?? 0),
    cost: Number(overrides.cost ?? record?.total_cost ?? 0),
    hours: Number(overrides.hours ?? record?.hours ?? 0),
  };
}

function buildSourceRecordSet(...records) {
  return dedupeSourceRecords(records.flat().filter(Boolean));
}

function buildJobContext(data, today = new Date()) {
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const jobOperations = Array.isArray(data?.jobOperations) ? data.jobOperations : [];
  const timeEntries = Array.isArray(data?.timeEntries) ? data.timeEntries : [];
  const operationsByJob = groupBy(jobOperations, (operation) => String(operation?.job_id || ""));
  const entriesByJob = groupBy(
    timeEntries.filter((entry) => !entry?.is_break && Number(entry?.hours || 0) > 0),
    (entry) => String(entry?.job_id || "")
  );
  const entriesByOperation = groupBy(
    timeEntries.filter((entry) => !entry?.is_break && Number(entry?.hours || 0) > 0),
    (entry) => String(entry?.job_operation_id || "")
  );
  const companyById = new Map((data?.companies || []).map((company) => [String(company.id), company]));
  const contactById = new Map((data?.contacts || []).map((contact) => [String(contact.id), contact]));

  return jobs.map((job) => {
    const jobId = String(job?.id || "");
    const operations = operationsByJob.get(jobId) || [];
    const entries = entriesByJob.get(jobId) || [];
    const operational = getJobOperationalSummary(job, operations, today);
    const estimatedHours = sumBy(operations, "estimated_hours");
    const actualHours = sumBy(entries, "hours");
    const labourCost = sumBy(entries, "total_cost");
    const materialCost = Number(job?.material_cost || job?.materials_cost || 0);
    const quotedValue = Number(job?.quoted_value || 0);
    const totalCost = labourCost + materialCost;
    const grossProfit = quotedValue - totalCost;
    const grossMarginPct = safePercent(grossProfit, quotedValue);
    const dueDate = String(job?.due_date || "").trim();
    const installDate = String(operational.installDate || job?.install_date || "").trim();
    const dueDateValue = parseReportDateValue(dueDate);
    const daysOverdue = dueDateValue && isActiveJob(job)
      ? Math.max(0, Math.ceil((today.getTime() - dueDateValue.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const linkedCompany = companyById.get(String(job?.company_id || ""));
    const linkedContact = contactById.get(String(job?.contact_id || ""));
    const customerLabel =
      String(job?.company_name || linkedCompany?.name || job?.contact_name || linkedContact?.full_name || "").trim();

    return {
      id: jobId,
      job_id: jobId,
      job_label: getJobLabel(job),
      label: getJobLabel(job),
      customer: customerLabel,
      customer_key: String(job?.company_id || job?.contact_id || customerLabel),
      status: String(job?.status || "").trim(),
      category: String(job?.job_type || "").trim(),
      source: String(job?.job_source || "").trim(),
      filter_date: String(job?.created_date || dueDate || installDate).trim(),
      created_date: String(job?.created_date || "").trim(),
      due_date: dueDate,
      install_date: installDate,
      quoted_value: quotedValue,
      labour_cost: labourCost,
      material_cost: materialCost,
      total_cost: totalCost,
      gross_profit: grossProfit,
      gross_margin_pct: grossMarginPct,
      hours: actualHours,
      estimated_hours: estimatedHours,
      variance_hours: actualHours - estimatedHours,
      progress_percent: Number(operational.progressPercent || 0),
      next_scheduled_date: String(operational.nextScheduledDate || "").trim(),
      blocked_count: Number(operational.blockedCount || 0),
      unscheduled_count: Number(operational.unscheduledCount || 0),
      incomplete_count: Number(operational.incompleteCount || 0),
      incomplete_install_count: Number(operational.incompleteInstallCount || 0),
      install_task_count: Number(operational.installTaskCount || 0),
      manufacturing_remaining_count: Number(operational.manufacturingRemainingCount || 0),
      days_until_install: Number(operational.daysUntilInstall ?? 9999),
      days_overdue: daysOverdue,
      health_status: operational.health.label,
      next_task_name: String(operational.nextTaskName || "").trim(),
      source_records: buildSourceRecordSet(
        makeSourceRecord("Job", job, {
          customer: customerLabel,
          amount: quotedValue,
        }),
        entries.map((entry) => makeSourceRecord("TimeEntry", entry, {
          title: `${entry.staff_name || "Staff"} · ${entry.activity || entry.operation || "Time entry"}`,
          subtitle: `${getJobLabel(job)}${entry.date ? ` · ${formatDate(entry.date)}` : ""}`,
          customer: customerLabel,
          job_label: getJobLabel(job),
          hours: entry.hours,
          cost: entry.total_cost,
          date: entry.date,
        })),
      ),
      _job: job,
      _operations: operations,
      _entries: entries,
      _entriesByOperation: entriesByOperation,
    };
  });
}

function buildQuoteRows(data, today = new Date()) {
  return (data?.quotes || [])
    .filter((quote) => quote?.is_primary_version || String(quote?.version_status || "") === "accepted" || !quote?.quote_family_id)
    .map((quote) => {
    const operational = getQuoteOperationalSummary(quote, today);
    const normalizedStatus = normalizeQuoteStatus(quote?.status);
    const customerLabel = String(quote?.company_name || quote?.contact_name || "").trim();

    return {
      id: String(quote?.id || ""),
      label: getQuoteLabel(quote),
      quote_label: getQuoteLabel(quote),
      quote_family_id: String(quote?.quote_family_id || quote?.id || ""),
      quote_option_name: String(quote?.quote_option_name || "").trim(),
      quote_version_number: Number(quote?.quote_version_number || 1),
      version_status: String(quote?.version_status || "active"),
      customer: customerLabel,
      customer_key: String(quote?.company_id || quote?.contact_id || customerLabel),
      status: normalizedStatus,
      category: operational.health.label,
      source: String(quote?.assigned_to || "").trim(),
      filter_date: String(quote?.created_date || quote?.valid_until || "").trim(),
      created_date: String(quote?.created_date || "").trim(),
      valid_until: String(quote?.valid_until || "").trim(),
      amount: Number(quote?.total || 0),
      age_days: Number(operational.ageDays || 0),
      days_until_valid: operational.daysUntilValid == null ? 9999 : Number(operational.daysUntilValid),
      health_rank: Number(operational.health.rank || 0),
      health_label: operational.health.label,
      assigned_to: String(quote?.assigned_to || "").trim(),
      source_records: buildSourceRecordSet(
        makeSourceRecord("Quote", quote, {
          customer: customerLabel,
          amount: quote.total,
          date: quote.created_date,
          status: normalizedStatus,
        })
      ),
      _quote: quote,
    };
  });
}

function buildLeadRows(data) {
  return (data?.leads || []).map((lead) => {
    const customerLabel = String(lead?.company_name || lead?.contact_name || "").trim();
    return {
      id: String(lead?.id || ""),
      label: getLeadLabel(lead),
      customer: customerLabel,
      customer_key: String(lead?.company_id || lead?.contact_id || customerLabel),
      status: String(lead?.stage || "").trim(),
      category: String(lead?.category_id || "").trim(),
      source: String(lead?.source || "").trim(),
      filter_date: String(lead?.created_date || "").trim(),
      created_date: String(lead?.created_date || "").trim(),
      amount: Number(lead?.value || 0),
      probability: Number(lead?.probability || 0),
      source_records: buildSourceRecordSet(
        makeSourceRecord("Lead", lead, {
          customer: customerLabel,
          amount: lead.value,
          status: lead.stage,
          date: lead.created_date,
        })
      ),
      _lead: lead,
    };
  });
}

function buildOperationRows(data, today = new Date()) {
  const activeJobs = new Map(buildJobContext(data, today).map((row) => [String(row.job_id), row]));

  return (data?.jobOperations || [])
    .filter((operation) => {
      const jobRow = activeJobs.get(String(operation?.job_id || ""));
      return Boolean(jobRow) && String(operation?.status || "").trim().toLowerCase() !== "complete";
    })
    .map((operation) => {
      const jobRow = activeJobs.get(String(operation?.job_id || ""));
      const entries = jobRow?._entriesByOperation?.get(String(operation?.id || "")) || [];
      const scheduledDate = String(operation?.start_date || jobRow?.due_date || "").trim();
      const scheduledValue = parseReportDateValue(scheduledDate);
      const overdueDays = scheduledValue
        ? Math.max(0, Math.ceil((today.getTime() - scheduledValue.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      const assignedStaffNames = Array.isArray(operation?.assigned_staff_ids) && operation.assigned_staff_ids.length > 0
        ? String(operation?.assigned_staff_display || operation?.assigned_staff_names || "").trim()
        : "";

      return {
        id: String(operation?.id || ""),
        label: String(operation?.task_name || operation?.operation || "Task").trim(),
        job_id: String(operation?.job_id || ""),
        job_label: jobRow?.job_label || "",
        customer: jobRow?.customer || "",
        customer_key: jobRow?.customer_key || "",
        staff_id: String(operation?.assigned_staff_ids?.[0] || "").trim(),
        staff_name: assignedStaffNames,
        status: String(operation?.status || "").trim(),
        category: String(operation?.workflow_phase || "").trim(),
        source: String(operation?.schedule_category || operation?.operation || "").trim(),
        filter_date: scheduledDate || jobRow?.filter_date || "",
        due_date: scheduledDate,
        estimated_hours: Number(operation?.estimated_hours || 0),
        hours: sumBy(entries, "hours"),
        variance_hours: sumBy(entries, "hours") - Number(operation?.estimated_hours || 0),
        blocked_count: Number(jobRow?._operations ? 0 : 0),
        days_overdue: overdueDays,
        source_records: buildSourceRecordSet(
          makeSourceRecord("JobOperation", operation, {
            title: String(operation?.task_name || operation?.operation || "Task").trim(),
            subtitle: jobRow?.job_label || "",
            customer: jobRow?.customer || "",
            job_label: jobRow?.job_label || "",
            date: scheduledDate,
            hours: sumBy(entries, "hours"),
          }),
          makeSourceRecord("Job", jobRow?._job, {
            customer: jobRow?.customer || "",
            amount: jobRow?.quoted_value || 0,
          }),
          entries.map((entry) => makeSourceRecord("TimeEntry", entry, {
            title: `${entry.staff_name || "Staff"} · ${entry.activity || entry.operation || "Time entry"}`,
            subtitle: jobRow?.job_label || "",
            customer: jobRow?.customer || "",
            job_label: jobRow?.job_label || "",
            hours: entry.hours,
            cost: entry.total_cost,
            date: entry.date,
          }))
        ),
      };
    });
}

function buildStaffWorkloadRows(data) {
  const staff = Array.isArray(data?.staff) ? data.staff : [];
  const timeEntries = Array.isArray(data?.timeEntries) ? data.timeEntries.filter((entry) => !entry?.is_break) : [];
  const jobOperations = Array.isArray(data?.jobOperations) ? data.jobOperations : [];
  const jobsById = new Map((data?.jobs || []).map((job) => [String(job.id), job]));
  const entriesByStaff = groupBy(timeEntries, (entry) => String(entry?.staff_id || entry?.staff_name || ""));
  const openOperationsByStaff = new Map();

  jobOperations
    .filter((operation) => String(operation?.status || "").trim().toLowerCase() !== "complete")
    .forEach((operation) => {
      const assignedIds = Array.isArray(operation?.assigned_staff_ids)
        ? operation.assigned_staff_ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [];

      assignedIds.forEach((staffId) => {
        const current = openOperationsByStaff.get(staffId) || [];
        current.push(operation);
        openOperationsByStaff.set(staffId, current);
      });
    });

  return staff.map((member) => {
    const staffKey = String(member?.id || member?.name || "");
    const entries = entriesByStaff.get(staffKey) || [];
    const openOperations = openOperationsByStaff.get(staffKey) || [];
    const activeJobIds = new Set([
      ...entries.map((entry) => String(entry?.job_id || "")).filter(Boolean),
      ...openOperations.map((operation) => String(operation?.job_id || "")).filter(Boolean),
    ]);
    const latestEntryDate = entries
      .map((entry) => String(entry?.date || entry?.created_date || "").trim())
      .filter(Boolean)
      .sort(compareDatesAscending)
      .at(-1) || "";

    return {
      id: staffKey,
      label: String(member?.name || "Staff").trim(),
      staff_id: String(member?.id || "").trim(),
      staff_name: String(member?.name || "Staff").trim(),
      status: String(member?.status || "active").trim(),
      category: String(member?.staff_type || "").trim(),
      source: "labour",
      filter_date: latestEntryDate || String(member?.updated_date || member?.created_date || "").trim(),
      hours: sumBy(entries, "hours"),
      labour_cost: sumBy(entries, "total_cost"),
      estimated_hours: sumBy(openOperations, "estimated_hours"),
      variance_hours: sumBy(entries, "hours") - sumBy(openOperations, "estimated_hours"),
      open_task_count: openOperations.length,
      active_job_count: activeJobIds.size,
      latest_entry_date: latestEntryDate,
      source_records: buildSourceRecordSet(
        makeSourceRecord("Company", { id: member?.id, name: member?.name }, {
          id: member?.id,
          href: "",
          title: String(member?.name || "Staff").trim(),
          label: String(member?.name || "Staff").trim(),
          date: latestEntryDate,
        }),
        entries.map((entry) => makeSourceRecord("TimeEntry", entry, {
          title: `${entry.activity || entry.operation || "Time"} · ${entry.staff_name || member?.name || "Staff"}`,
          subtitle: entry.job_number || entry.job_name || "",
          customer: entry.customer || entry.company_name || "",
          job_label: [entry.job_number, entry.job_name || entry.job_title].filter(Boolean).join(" · "),
          hours: entry.hours,
          cost: entry.total_cost,
          date: entry.date,
        })),
        openOperations.map((operation) => makeSourceRecord("JobOperation", operation, {
          title: String(operation?.task_name || operation?.operation || "Task").trim(),
          subtitle: jobsById.get(String(operation?.job_id || "")) ? getJobLabel(jobsById.get(String(operation?.job_id || ""))) : "",
          date: operation?.start_date,
        }))
      ),
    };
  });
}

function buildTimeCostRows(data) {
  const groupedEntries = new Map();

  (data?.timeEntries || [])
    .filter((entry) => !entry?.is_break && Number(entry?.hours || 0) > 0)
    .forEach((entry) => {
      const key = [
        entry?.staff_id || entry?.staff_name || "staff",
        entry?.job_id || entry?.job_number || "job",
        entry?.activity || entry?.operation || "activity",
      ].join("|");

      const current = groupedEntries.get(key) || {
        id: key,
        label: `${entry?.staff_name || "Staff"} · ${entry?.activity || entry?.operation || "Time"}`,
        staff_id: String(entry?.staff_id || "").trim(),
        staff_name: String(entry?.staff_name || "").trim(),
        job_id: String(entry?.job_id || "").trim(),
        job_label: [entry?.job_number, entry?.job_name || entry?.job_title].filter(Boolean).join(" · "),
        customer: String(entry?.customer || entry?.company_name || "").trim(),
        customer_key: String(entry?.job_id || entry?.job_number || entry?.customer || "").trim(),
        status: String(entry?.status || "").trim(),
        category: String(entry?.activity || entry?.operation || "").trim(),
        source: String(entry?.location_type || "").trim(),
        filter_date: String(entry?.date || entry?.created_date || "").trim(),
        hours: 0,
        labour_cost: 0,
        source_records: [],
      };

      current.hours += Number(entry?.hours || 0);
      current.labour_cost += Number(entry?.total_cost || 0);
      current.source_records.push(makeSourceRecord("TimeEntry", entry, {
        title: `${entry?.staff_name || "Staff"} · ${entry?.activity || entry?.operation || "Time"}`,
        subtitle: current.job_label,
        customer: current.customer,
        job_label: current.job_label,
        hours: entry.hours,
        cost: entry.total_cost,
        date: entry.date,
      }));
      groupedEntries.set(key, current);
    });

  return [...groupedEntries.values()].map((row) => ({
    ...row,
    source_records: buildSourceRecordSet(row.source_records),
  }));
}

function flattenSourceRecords(rows) {
  return dedupeSourceRecords((rows || []).flatMap((row) => row?.source_records || []));
}

function buildChartByField(rows, fieldKey, valueKey, limit = 8) {
  const groups = groupBy(rows, (row) => String(row?.[fieldKey] || "").trim() || "__empty__");
  return [...groups.entries()]
    .map(([groupKey, groupedRows]) => ({
      key: groupKey,
      label: groupKey === "__empty__" ? "Unspecified" : prettifyReportValue(groupKey),
      value: sumBy(groupedRows, valueKey),
      source_records: flattenSourceRecords(groupedRows),
    }))
    .sort((left, right) => Number(right.value || 0) - Number(left.value || 0))
    .slice(0, limit);
}

function buildChartByMonth(rows, valueKey) {
  const groups = groupBy(rows, (row) => getMonthKey(row?.filter_date));
  return [...groups.entries()]
    .filter(([groupKey]) => groupKey)
    .map(([groupKey, groupedRows]) => ({
      key: groupKey,
      label: formatMonthLabel(groupedRows[0]?.filter_date),
      value: sumBy(groupedRows, valueKey),
      source_records: flattenSourceRecords(groupedRows),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function withDefaults(definition) {
  return {
    ...definition,
    supportedFilters: definition.supportedFilters || {},
    groupings: [
      { key: "none", label: "No Grouping", getValue: () => "" },
      ...(definition.groupings || []),
    ],
  };
}

export const REPORT_DEFINITIONS = [
  withDefaults({
    key: "revenue_summary",
    packKey: "management",
    title: "Revenue Summary",
    description: "Quoted value, labour cost, material cost, and gross profit by job.",
    defaultFilters: { datePreset: "this_month" },
    defaultGrouping: "none",
    defaultSort: { column: "quoted_value", direction: "desc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    groupings: [
      { key: "customer", label: "Customer", getValue: (row) => row.customer_key, getLabel: (row) => row.customer || "Unspecified" },
      { key: "status", label: "Job Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "month", label: "Created Month", getValue: (row) => getMonthKey(row.filter_date), getLabel: (row) => formatMonthLabel(row.filter_date) },
    ],
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "quoted_value", label: "Quoted", type: "currency", aggregate: "sum" },
      { key: "labour_cost", label: "Labour", type: "currency", aggregate: "sum" },
      { key: "material_cost", label: "Materials", type: "currency", aggregate: "sum" },
      { key: "total_cost", label: "Total Cost", type: "currency", aggregate: "sum" },
      { key: "gross_profit", label: "Gross Profit", type: "currency", aggregate: "sum" },
      { key: "gross_margin_pct", label: "Margin", type: "percent", aggregate: { type: "weightedPercent", numerator: "gross_profit", denominator: "quoted_value" } },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today),
    buildKpis: (rows) => {
      const quotedValue = sumBy(rows, "quoted_value");
      const grossProfit = sumBy(rows, "gross_profit");
      return [
        { key: "quoted", title: "Quoted Value", value: quotedValue, type: "currency", source_records: flattenSourceRecords(rows) },
        { key: "labour", title: "Labour Cost", value: sumBy(rows, "labour_cost"), type: "currency", source_records: flattenSourceRecords(rows) },
        { key: "materials", title: "Material Cost", value: sumBy(rows, "material_cost"), type: "currency", source_records: flattenSourceRecords(rows) },
        { key: "profit", title: "Gross Profit", value: grossProfit, type: "currency", source_records: flattenSourceRecords(rows) },
        { key: "margin", title: "Gross Margin", value: safePercent(grossProfit, quotedValue), type: "percent", source_records: flattenSourceRecords(rows) },
        { key: "jobs", title: "Jobs", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      ];
    },
    buildChart: (rows) => ({
      type: "bar",
      title: "Gross Profit by Created Month",
      description: "Trend of gross profit across the filtered jobs.",
      data: buildChartByMonth(rows, "gross_profit"),
    }),
  }),
  withDefaults({
    key: "quote_conversion",
    packKey: "management",
    title: "Quote Conversion",
    description: "Quote progress, commercial pressure, and win performance.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "none",
    defaultSort: { column: "amount", direction: "desc" },
    supportedFilters: { customer: true, status: true, category: true, source: true },
    isAvailable: (modules) => Boolean(modules?.quotesEnabled),
    groupings: [
      { key: "status", label: "Quote Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "category", label: "Quote Health", getValue: (row) => row.category, getLabel: (row) => row.category || "Unspecified" },
      { key: "source", label: "Assigned To", getValue: (row) => row.source, getLabel: (row) => row.source || "Unassigned" },
    ],
    columns: [
      { key: "label", label: "Quote", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "category", label: "Health", type: "text", aggregate: "distinct" },
      { key: "assigned_to", label: "Owner", type: "text", aggregate: "distinct" },
      { key: "amount", label: "Value", type: "currency", aggregate: "sum" },
      { key: "valid_until", label: "Valid Until", type: "date", aggregate: "maxDate" },
      { key: "days_until_valid", label: "Days to Decision", type: "number", aggregate: "avg" },
    ],
    buildRows: (data, context) => buildQuoteRows(data, context.today),
    buildKpis: (rows) => {
      const wonRows = rows.filter((row) => row.status === "won");
      const openRows = rows.filter((row) => row.status !== "won");
      const closedRows = rows.filter((row) => ["won", "declined", "expired"].includes(row.status));
      return [
        { key: "value", title: "Quoted Value", value: sumBy(rows, "amount"), type: "currency", source_records: flattenSourceRecords(rows) },
        { key: "open", title: "Open Quotes", value: openRows.length, type: "number", source_records: flattenSourceRecords(openRows) },
        { key: "won", title: "Won Quotes", value: wonRows.length, type: "number", source_records: flattenSourceRecords(wonRows) },
        { key: "win_rate", title: "Win Rate", value: safePercent(wonRows.length, closedRows.length), type: "percent", source_records: flattenSourceRecords(closedRows) },
      ];
    },
    buildChart: (rows) => ({
      type: "bar",
      title: "Quotes by Health",
      description: "Where quote attention is currently required.",
      data: buildChartByField(rows, "category", "amount", 8),
    }),
  }),
  withDefaults({
    key: "pipeline_value",
    packKey: "management",
    title: "Pipeline Value",
    description: "Lead pipeline by stage, source, and commercial value.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "status",
    defaultSort: { column: "amount", direction: "desc" },
    supportedFilters: { customer: true, status: true, category: true, source: true },
    isAvailable: (modules) => Boolean(modules?.leadsEnabled),
    groupings: [
      { key: "status", label: "Lead Stage", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "source", label: "Lead Source", getValue: (row) => row.source, getLabel: (row) => prettifyReportValue(row.source) },
      { key: "category", label: "Lead Category", getValue: (row) => row.category, getLabel: (row) => prettifyReportValue(row.category) },
    ],
    columns: [
      { key: "label", label: "Lead", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Stage", type: "status", aggregate: "distinct" },
      { key: "source", label: "Source", type: "text", aggregate: "distinct" },
      { key: "amount", label: "Value", type: "currency", aggregate: "sum" },
      { key: "probability", label: "Probability", type: "percent", aggregate: "avg" },
      { key: "created_date", label: "Created", type: "date", aggregate: "maxDate" },
    ],
    buildRows: (data) => buildLeadRows(data),
    buildKpis: (rows) => {
      const activeRows = rows.filter((row) => !["won", "lost"].includes(row.status));
      const wonRows = rows.filter((row) => row.status === "won");
      return [
        { key: "pipeline", title: "Pipeline Value", value: sumBy(activeRows, "amount"), type: "currency", source_records: flattenSourceRecords(activeRows) },
        { key: "active", title: "Active Leads", value: activeRows.length, type: "number", source_records: flattenSourceRecords(activeRows) },
        { key: "won", title: "Won Leads", value: wonRows.length, type: "number", source_records: flattenSourceRecords(wonRows) },
        { key: "avg", title: "Average Lead Value", value: rows.length > 0 ? sumBy(rows, "amount") / rows.length : 0, type: "currency", source_records: flattenSourceRecords(rows) },
      ];
    },
    buildChart: (rows) => ({
      type: "bar",
      title: "Pipeline by Stage",
      description: "Value distribution across lead stages.",
      data: buildChartByField(rows, "status", "amount", 10),
    }),
  }),
  withDefaults({
    key: "overdue_jobs",
    packKey: "management",
    title: "Overdue Jobs",
    description: "Active jobs with passed due dates or high delivery pressure.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "status",
    defaultSort: { column: "days_overdue", direction: "desc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    groupings: [
      { key: "status", label: "Job Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "health_status", label: "Health", getValue: (row) => row.health_status, getLabel: (row) => row.health_status || "Unspecified" },
    ],
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "due_date", label: "Due", type: "date", aggregate: "minDate" },
      { key: "days_overdue", label: "Days Overdue", type: "number", aggregate: "sum" },
      { key: "unscheduled_count", label: "Unscheduled", type: "number", aggregate: "sum" },
      { key: "blocked_count", label: "Blocked", type: "number", aggregate: "sum" },
      { key: "progress_percent", label: "Progress", type: "percent", aggregate: "avg" },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today)
      .filter((row) => row.days_overdue > 0 || row.health_status === "Install risk" || row.unscheduled_count > 0),
    buildKpis: (rows) => [
      { key: "jobs", title: "Overdue Jobs", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "days", title: "Total Days Overdue", value: sumBy(rows, "days_overdue"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "unscheduled", title: "Unscheduled Tasks", value: sumBy(rows, "unscheduled_count"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "blocked", title: "Blocked Tasks", value: sumBy(rows, "blocked_count"), type: "number", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Overdue Jobs by Health",
      description: "Which delivery issues are driving the backlog.",
      data: buildChartByField(rows, "health_status", "days_overdue", 8),
    }),
  }),
  withDefaults({
    key: "gross_performance_trends",
    packKey: "management",
    title: "Gross Performance Trends",
    description: "Trend view of quoted value, cost, and gross profit over time.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "month",
    defaultSort: { column: "filter_date", direction: "asc" },
    supportedFilters: { customer: true, status: true, category: true, source: true },
    groupings: [
      { key: "month", label: "Created Month", getValue: (row) => getMonthKey(row.filter_date), getLabel: (row) => formatMonthLabel(row.filter_date) },
      { key: "customer", label: "Customer", getValue: (row) => row.customer_key, getLabel: (row) => row.customer || "Unspecified" },
    ],
    columns: [
      { key: "label", label: "Period", type: "text", aggregate: "groupLabel" },
      { key: "quoted_value", label: "Quoted", type: "currency", aggregate: "sum" },
      { key: "labour_cost", label: "Labour", type: "currency", aggregate: "sum" },
      { key: "material_cost", label: "Materials", type: "currency", aggregate: "sum" },
      { key: "gross_profit", label: "Gross Profit", type: "currency", aggregate: "sum" },
      { key: "gross_margin_pct", label: "Margin", type: "percent", aggregate: { type: "weightedPercent", numerator: "gross_profit", denominator: "quoted_value" } },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today),
    buildKpis: (rows) => [
      { key: "quoted", title: "Quoted", value: sumBy(rows, "quoted_value"), type: "currency", source_records: flattenSourceRecords(rows) },
      { key: "profit", title: "Gross Profit", value: sumBy(rows, "gross_profit"), type: "currency", source_records: flattenSourceRecords(rows) },
      { key: "margin", title: "Margin", value: safePercent(sumBy(rows, "gross_profit"), sumBy(rows, "quoted_value")), type: "percent", source_records: flattenSourceRecords(rows) },
      { key: "avg_profit", title: "Average Profit / Job", value: rows.length > 0 ? sumBy(rows, "gross_profit") / rows.length : 0, type: "currency", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "line",
      title: "Gross Profit Trend",
      description: "Gross profit across the filtered period.",
      data: buildChartByMonth(rows, "gross_profit"),
    }),
  }),
  withDefaults({
    key: "installation_completion_status",
    packKey: "management",
    title: "Installation Completion Status",
    description: "Installation readiness, remaining work, and upcoming completion pressure.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "status",
    defaultSort: { column: "install_date", direction: "asc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    groupings: [
      { key: "status", label: "Job Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "health_status", label: "Health", getValue: (row) => row.health_status, getLabel: (row) => row.health_status || "Unspecified" },
    ],
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "install_date", label: "Install Date", type: "date", aggregate: "minDate" },
      { key: "days_until_install", label: "Days Until Install", type: "number", aggregate: "avg" },
      { key: "incomplete_install_count", label: "Install Tasks Open", type: "number", aggregate: "sum" },
      { key: "manufacturing_remaining_count", label: "Manufacturing Open", type: "number", aggregate: "sum" },
      { key: "progress_percent", label: "Progress", type: "percent", aggregate: "avg" },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today)
      .filter((row) => row.install_date || row.install_task_count > 0),
    buildKpis: (rows) => [
      { key: "jobs", title: "Installation Jobs", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "next30", title: "Installs in 30 Days", value: rows.filter((row) => row.days_until_install >= 0 && row.days_until_install <= 30).length, type: "number", source_records: flattenSourceRecords(rows.filter((row) => row.days_until_install >= 0 && row.days_until_install <= 30)) },
      { key: "open", title: "Open Install Tasks", value: sumBy(rows, "incomplete_install_count"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "progress", title: "Average Progress", value: averageBy(rows, "progress_percent"), type: "percent", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Installation Load by Status",
      description: "Install workload distribution across active jobs.",
      data: buildChartByField(rows, "status", "incomplete_install_count", 8),
    }),
  }),
  withDefaults({
    key: "jobs_in_production",
    packKey: "operations",
    title: "Jobs in Production",
    description: "Live production jobs with schedule pressure and hours tracking.",
    defaultFilters: { datePreset: "this_month" },
    defaultGrouping: "status",
    defaultSort: { column: "progress_percent", direction: "asc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    groupings: [
      { key: "status", label: "Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "category", label: "Job Type", getValue: (row) => row.category, getLabel: (row) => prettifyReportValue(row.category) },
    ],
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "progress_percent", label: "Progress", type: "percent", aggregate: "avg" },
      { key: "estimated_hours", label: "Estimated", type: "hours", aggregate: "sum" },
      { key: "hours", label: "Logged", type: "hours", aggregate: "sum" },
      { key: "variance_hours", label: "Variance", type: "hours", aggregate: "sum" },
      { key: "next_scheduled_date", label: "Next Scheduled", type: "date", aggregate: "minDate" },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today)
      .filter((row) => ["production", "ready_to_install", "installed"].includes(row.status)),
    buildKpis: (rows) => [
      { key: "jobs", title: "Production Jobs", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "hours", title: "Hours Logged", value: sumBy(rows, "hours"), type: "hours", source_records: flattenSourceRecords(rows) },
      { key: "open", title: "Open Tasks", value: sumBy(rows, "incomplete_count"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "unscheduled", title: "Unscheduled Tasks", value: sumBy(rows, "unscheduled_count"), type: "number", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Hours Logged by Job Status",
      description: "Where production effort is currently landing.",
      data: buildChartByField(rows, "status", "hours", 8),
    }),
  }),
  withDefaults({
    key: "jobs_by_stage",
    packKey: "operations",
    title: "Jobs by Stage",
    description: "Active workload grouped by delivery stage.",
    defaultFilters: { datePreset: "this_month" },
    defaultGrouping: "status",
    defaultSort: { column: "quoted_value", direction: "desc" },
    supportedFilters: { customer: true, status: true, category: true, source: true },
    groupings: [
      { key: "status", label: "Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "health_status", label: "Health", getValue: (row) => row.health_status, getLabel: (row) => row.health_status || "Unspecified" },
    ],
    columns: [
      { key: "label", label: "Stage", type: "text", aggregate: "groupLabel" },
      { key: "quoted_value", label: "Quoted", type: "currency", aggregate: "sum" },
      { key: "hours", label: "Hours Logged", type: "hours", aggregate: "sum" },
      { key: "estimated_hours", label: "Estimated", type: "hours", aggregate: "sum" },
      { key: "blocked_count", label: "Blocked", type: "number", aggregate: "sum" },
      { key: "group_count", label: "Jobs", type: "number", aggregate: "count", sortable: false },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today)
      .filter((row) => row.status !== "complete" && row.status !== "cancelled"),
    buildKpis: (rows) => [
      { key: "jobs", title: "Active Jobs", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "quoted", title: "Quoted Value", value: sumBy(rows, "quoted_value"), type: "currency", source_records: flattenSourceRecords(rows) },
      { key: "blocked", title: "Blocked Tasks", value: sumBy(rows, "blocked_count"), type: "number", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "pie",
      title: "Jobs by Stage",
      description: "Distribution of active jobs across delivery stages.",
      data: buildChartByField(rows, "status", "quoted_value", 8),
    }),
  }),
  withDefaults({
    key: "workload_by_staff_member",
    packKey: "operations",
    title: "Workload by Staff Member",
    description: "Actual logged time against open planned workload.",
    defaultFilters: { datePreset: "this_month" },
    defaultGrouping: "none",
    defaultSort: { column: "hours", direction: "desc" },
    supportedFilters: { staff: true, status: true, category: true },
    groupings: [
      { key: "status", label: "Staff Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "category", label: "Staff Type", getValue: (row) => row.category, getLabel: (row) => prettifyReportValue(row.category) },
    ],
    columns: [
      { key: "label", label: "Staff", type: "text", aggregate: "groupLabel" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "category", label: "Type", type: "text", aggregate: "distinct" },
      { key: "hours", label: "Logged", type: "hours", aggregate: "sum" },
      { key: "estimated_hours", label: "Planned", type: "hours", aggregate: "sum" },
      { key: "variance_hours", label: "Variance", type: "hours", aggregate: "sum" },
      { key: "open_task_count", label: "Open Tasks", type: "number", aggregate: "sum" },
      { key: "active_job_count", label: "Active Jobs", type: "number", aggregate: "sum" },
    ],
    buildRows: (data) => buildStaffWorkloadRows(data),
    buildKpis: (rows) => [
      { key: "staff", title: "Staff", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "hours", title: "Logged Hours", value: sumBy(rows, "hours"), type: "hours", source_records: flattenSourceRecords(rows) },
      { key: "planned", title: "Planned Hours", value: sumBy(rows, "estimated_hours"), type: "hours", source_records: flattenSourceRecords(rows) },
      { key: "tasks", title: "Open Tasks", value: sumBy(rows, "open_task_count"), type: "number", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Logged Hours by Staff",
      description: "Current labour distribution across team members.",
      data: rows
        .map((row) => ({
          key: row.id,
          label: row.label,
          value: Number(row.hours || 0),
          source_records: row.source_records || [],
        }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 10),
    }),
  }),
  withDefaults({
    key: "upcoming_installations",
    packKey: "operations",
    title: "Upcoming Installations",
    description: "Installation jobs approaching in the next 45 days.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "none",
    defaultSort: { column: "install_date", direction: "asc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "install_date", label: "Install Date", type: "date", aggregate: "minDate" },
      { key: "days_until_install", label: "Days Out", type: "number", aggregate: "avg" },
      { key: "manufacturing_remaining_count", label: "Manufacturing Open", type: "number", aggregate: "sum" },
      { key: "blocked_count", label: "Blocked", type: "number", aggregate: "sum" },
      { key: "unscheduled_count", label: "Unscheduled", type: "number", aggregate: "sum" },
      { key: "progress_percent", label: "Progress", type: "percent", aggregate: "avg" },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today)
      .filter((row) => row.days_until_install >= 0 && row.days_until_install <= 45),
    buildKpis: (rows) => [
      { key: "jobs", title: "Upcoming Installs", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "manufacturing", title: "Manufacturing Tasks Open", value: sumBy(rows, "manufacturing_remaining_count"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "blocked", title: "Blocked Tasks", value: sumBy(rows, "blocked_count"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "progress", title: "Average Progress", value: averageBy(rows, "progress_percent"), type: "percent", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "line",
      title: "Upcoming Installs by Date",
      description: "Install load scheduled over the next 45 days.",
      data: rows
        .slice()
        .sort((left, right) => compareDatesAscending(left.install_date, right.install_date))
        .map((row) => ({
          key: row.id,
          label: formatDate(row.install_date),
          value: 1,
          source_records: row.source_records || [],
        })),
    }),
  }),
  withDefaults({
    key: "bottlenecks_and_overdue_tasks",
    packKey: "operations",
    title: "Bottlenecks and Overdue Tasks",
    description: "Operational tasks that are blocked, late, or at risk.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "category",
    defaultSort: { column: "days_overdue", direction: "desc" },
    supportedFilters: { customer: true, job: true, staff: true, status: true, category: true, source: true },
    groupings: [
      { key: "category", label: "Workflow Phase", getValue: (row) => row.category, getLabel: (row) => prettifyReportValue(row.category) },
      { key: "status", label: "Task Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
      { key: "source", label: "Operation", getValue: (row) => row.source, getLabel: (row) => prettifyReportValue(row.source) },
    ],
    columns: [
      { key: "label", label: "Task", type: "text", aggregate: "groupLabel" },
      { key: "job_label", label: "Job", type: "text", aggregate: "distinct" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "category", label: "Phase", type: "text", aggregate: "distinct" },
      { key: "due_date", label: "Scheduled", type: "date", aggregate: "minDate" },
      { key: "days_overdue", label: "Days Late", type: "number", aggregate: "sum" },
      { key: "variance_hours", label: "Hour Variance", type: "hours", aggregate: "sum" },
    ],
    buildRows: (data, context) => buildOperationRows(data, context.today)
      .filter((row) => row.days_overdue > 0 || row.variance_hours > 2),
    buildKpis: (rows) => [
      { key: "tasks", title: "At-Risk Tasks", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
      { key: "late", title: "Days Late", value: sumBy(rows, "days_overdue"), type: "number", source_records: flattenSourceRecords(rows) },
      { key: "variance", title: "Hours Over Estimate", value: sumBy(rows.filter((row) => row.variance_hours > 0), "variance_hours"), type: "hours", source_records: flattenSourceRecords(rows.filter((row) => row.variance_hours > 0)) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Bottlenecks by Workflow Phase",
      description: "Where operational drag is currently concentrated.",
      data: buildChartByField(rows, "category", "days_overdue", 10),
    }),
  }),
  withDefaults({
    key: "time_logged_vs_estimated",
    packKey: "operations",
    title: "Time Logged vs Estimated",
    description: "Compare actual labour against estimated hours by job.",
    defaultFilters: { datePreset: "this_month" },
    defaultGrouping: "none",
    defaultSort: { column: "variance_hours", direction: "desc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "status", label: "Status", type: "status", aggregate: "distinct" },
      { key: "estimated_hours", label: "Estimated", type: "hours", aggregate: "sum" },
      { key: "hours", label: "Logged", type: "hours", aggregate: "sum" },
      { key: "variance_hours", label: "Variance", type: "hours", aggregate: "sum" },
      { key: "progress_percent", label: "Progress", type: "percent", aggregate: "avg" },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today),
    buildKpis: (rows) => [
      { key: "estimated", title: "Estimated Hours", value: sumBy(rows, "estimated_hours"), type: "hours", source_records: flattenSourceRecords(rows) },
      { key: "logged", title: "Logged Hours", value: sumBy(rows, "hours"), type: "hours", source_records: flattenSourceRecords(rows) },
      { key: "variance", title: "Variance", value: sumBy(rows, "variance_hours"), type: "hours", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Top Hour Variances",
      description: "Jobs with the largest gap between actual and estimated hours.",
      data: rows
        .slice()
        .sort((left, right) => Math.abs(Number(right.variance_hours || 0)) - Math.abs(Number(left.variance_hours || 0)))
        .slice(0, 10)
        .map((row) => ({
          key: row.id,
          label: row.label,
          value: Number(row.variance_hours || 0),
          source_records: row.source_records || [],
        })),
    }),
  }),
  withDefaults({
    key: "labour_cost_summary",
    packKey: "finance_admin",
    title: "Labour / Time Cost Summary",
    description: "Logged labour hours and cost by staff, job, and activity.",
    defaultFilters: { datePreset: "this_month" },
    defaultGrouping: "staff",
    defaultSort: { column: "labour_cost", direction: "desc" },
    supportedFilters: { customer: true, job: true, staff: true, status: true, category: true, source: true },
    groupings: [
      { key: "staff", label: "Staff", getValue: (row) => row.staff_id || row.staff_name, getLabel: (row) => row.staff_name || "Unspecified" },
      { key: "job", label: "Job", getValue: (row) => row.job_id || row.job_label, getLabel: (row) => row.job_label || "Unspecified" },
      { key: "category", label: "Activity", getValue: (row) => row.category, getLabel: (row) => prettifyReportValue(row.category) },
    ],
    columns: [
      { key: "label", label: "Line", type: "text", aggregate: "groupLabel" },
      { key: "staff_name", label: "Staff", type: "text", aggregate: "distinct" },
      { key: "job_label", label: "Job", type: "text", aggregate: "distinct" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "category", label: "Activity", type: "text", aggregate: "distinct" },
      { key: "hours", label: "Hours", type: "hours", aggregate: "sum" },
      { key: "labour_cost", label: "Cost", type: "currency", aggregate: "sum" },
    ],
    buildRows: (data) => buildTimeCostRows(data),
    buildKpis: (rows) => [
      { key: "hours", title: "Hours Logged", value: sumBy(rows, "hours"), type: "hours", source_records: flattenSourceRecords(rows) },
      { key: "cost", title: "Labour Cost", value: sumBy(rows, "labour_cost"), type: "currency", source_records: flattenSourceRecords(rows) },
      { key: "lines", title: "Cost Lines", value: rows.length, type: "number", source_records: flattenSourceRecords(rows) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Labour Cost by Staff",
      description: "Where labour cost is currently concentrated.",
      data: buildChartByField(rows, "staff_name", "labour_cost", 10),
    }),
  }),
  withDefaults({
    key: "job_profitability",
    packKey: "finance_admin",
    title: "Job Profitability",
    description: "Profitability view by job using labour and pricing material cost fields.",
    defaultFilters: { datePreset: "last_90_days" },
    defaultGrouping: "none",
    defaultSort: { column: "gross_profit", direction: "asc" },
    supportedFilters: { customer: true, job: true, status: true, category: true, source: true },
    groupings: [
      { key: "customer", label: "Customer", getValue: (row) => row.customer_key, getLabel: (row) => row.customer || "Unspecified" },
      { key: "status", label: "Status", getValue: (row) => row.status, getLabel: (row) => prettifyReportValue(row.status) },
    ],
    columns: [
      { key: "label", label: "Job", type: "text", aggregate: "groupLabel" },
      { key: "customer", label: "Customer", type: "text", aggregate: "distinct" },
      { key: "quoted_value", label: "Revenue", type: "currency", aggregate: "sum" },
      { key: "labour_cost", label: "Labour", type: "currency", aggregate: "sum" },
      { key: "material_cost", label: "Materials", type: "currency", aggregate: "sum" },
      { key: "gross_profit", label: "Profit", type: "currency", aggregate: "sum" },
      { key: "gross_margin_pct", label: "Margin", type: "percent", aggregate: { type: "weightedPercent", numerator: "gross_profit", denominator: "quoted_value" } },
    ],
    buildRows: (data, context) => buildJobContext(data, context.today),
    buildKpis: (rows) => [
      { key: "profit", title: "Gross Profit", value: sumBy(rows, "gross_profit"), type: "currency", source_records: flattenSourceRecords(rows) },
      { key: "margin", title: "Gross Margin", value: safePercent(sumBy(rows, "gross_profit"), sumBy(rows, "quoted_value")), type: "percent", source_records: flattenSourceRecords(rows) },
      { key: "loss_jobs", title: "Negative Margin Jobs", value: rows.filter((row) => Number(row.gross_profit || 0) < 0).length, type: "number", source_records: flattenSourceRecords(rows.filter((row) => Number(row.gross_profit || 0) < 0)) },
    ],
    buildChart: (rows) => ({
      type: "bar",
      title: "Lowest Margin Jobs",
      description: "Jobs needing commercial review.",
      data: rows
        .slice()
        .sort((left, right) => Number(left.gross_margin_pct || 0) - Number(right.gross_margin_pct || 0))
        .slice(0, 10)
        .map((row) => ({
          key: row.id,
          label: row.label,
          value: Number(row.gross_margin_pct || 0),
          source_records: row.source_records || [],
        })),
    }),
  }),
];

export const REPORT_DEFINITION_MAP = new Map(REPORT_DEFINITIONS.map((definition) => [definition.key, definition]));

export function getReportDefinition(reportKey) {
  return REPORT_DEFINITION_MAP.get(reportKey) || REPORT_DEFINITIONS[0];
}

export function getPackReports(packKey, modules = {}) {
  return REPORT_DEFINITIONS.filter((definition) => {
    if (definition.packKey !== packKey) {
      return false;
    }

    return typeof definition.isAvailable === "function" ? definition.isAvailable(modules) : true;
  });
}

export function getAvailablePacks(modules = {}) {
  return REPORT_PACKS.filter((pack) => getPackReports(pack.key, modules).length > 0);
}

export function getDefaultReportState(reportKey) {
  const definition = getReportDefinition(reportKey);
  return {
    packKey: definition.packKey,
    reportKey: definition.key,
    filters: cloneReportFilters({
      datePreset: definition.defaultFilters?.datePreset || "this_month",
    }),
    grouping: definition.defaultGrouping || "none",
    sort: {
      column: String(definition.defaultSort?.column || definition.columns?.[0]?.key || "label"),
      direction: String(definition.defaultSort?.direction || "desc") === "asc" ? "asc" : "desc",
    },
    visibleColumns: definition.columns
      .filter((column, index) => index < 7)
      .map((column) => column.key),
  };
}
