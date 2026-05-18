import { EntityRecord } from "../types";

export type LabourIntelligence = {
  generated_at: string;
  labour_prediction: {
    active_jobs: number;
    predicted_remaining_hours: number;
    predicted_total_hours: number;
    current_actual_hours: number;
  };
  install_duration_prediction: {
    upcoming_installs: number;
    median_install_days: number;
    predicted_install_days_next_14: number;
  };
  workflow_hour_prediction: Array<{
    workflow_phase: string;
    predicted_hours: number;
    actual_hours: number;
    estimated_hours: number;
    variance_percent: number;
  }>;
  estimate_accuracy: {
    jobs_with_budget: number;
    average_variance_percent: number;
    over_budget_jobs: number;
    under_budget_jobs: number;
  };
  recurring_overruns: Array<{
    key: string;
    label: string;
    occurrences: number;
    average_variance_percent: number;
    severity: "low" | "medium" | "high";
  }>;
  profitability: {
    quoted_value: number;
    labour_cost: number;
    labour_margin_value: number;
    labour_margin_percent: number;
    at_risk_jobs: number;
  };
  designer_builder_profitability: Array<{
    name: string;
    quoted_value: number;
    labour_cost: number;
    hours: number;
    labour_margin_percent: number;
  }>;
  warnings: Array<{
    severity: "low" | "medium" | "high";
    message: string;
    href?: string;
  }>;
  bottlenecks: Array<{
    workflow_phase: string;
    blocked_or_waiting: number;
    active_operations: number;
    severity: "low" | "medium" | "high";
  }>;
};

export function buildLabourIntelligence(input: {
  jobs: EntityRecord[];
  timeEntries: EntityRecord[];
  jobOperations: EntityRecord[];
  quotes?: EntityRecord[];
  clockIns?: EntityRecord[];
}): LabourIntelligence {
  const activeJobs = input.jobs.filter(isActiveJob);
  const timeByJob = groupSum(input.timeEntries, (entry) => String(entry.job_id || entry.job_number || ""), (entry) => Number(entry.hours || 0));
  const operationsByJob = groupRows(input.jobOperations, (operation) => String(operation.job_id || ""));
  const activeJobPredictions = activeJobs.map((job) => {
    const actualHours = timeByJob.get(String(job.id || "")) || timeByJob.get(String(job.job_number || "")) || 0;
    const operationEstimate = (operationsByJob.get(String(job.id || "")) || []).reduce((sum, operation) => sum + Number(operation.estimated_hours || 0), 0);
    const budgetHours = Number(job.budget_hours || 0);
    const predictedTotal = Math.max(actualHours, operationEstimate, budgetHours);
    return {
      job,
      actualHours,
      predictedTotal,
      remainingHours: Math.max(0, predictedTotal - actualHours),
    };
  });

  const installDurations = input.jobs.map(installDurationDays).filter((value) => value > 0);
  const medianInstallDays = median(installDurations) || 1;
  const upcomingInstalls = activeJobs.filter((job) => isWithinDays(job.install_date, 14));
  const workflowRows = buildWorkflowRows(input.jobOperations, input.timeEntries);
  const accuracy = buildEstimateAccuracy(activeJobPredictions);
  const recurringOverruns = buildRecurringOverruns(input.jobs, activeJobPredictions);
  const profitability = buildProfitability(activeJobs, input.timeEntries);
  const designerBuilderProfitability = buildDesignerBuilderProfitability(activeJobs, input.timeEntries);
  const bottlenecks = buildBottlenecks(input.jobOperations);

  return {
    generated_at: new Date().toISOString(),
    labour_prediction: {
      active_jobs: activeJobs.length,
      predicted_remaining_hours: round1(activeJobPredictions.reduce((sum, row) => sum + row.remainingHours, 0)),
      predicted_total_hours: round1(activeJobPredictions.reduce((sum, row) => sum + row.predictedTotal, 0)),
      current_actual_hours: round1(activeJobPredictions.reduce((sum, row) => sum + row.actualHours, 0)),
    },
    install_duration_prediction: {
      upcoming_installs: upcomingInstalls.length,
      median_install_days: round1(medianInstallDays),
      predicted_install_days_next_14: round1(upcomingInstalls.length * medianInstallDays),
    },
    workflow_hour_prediction: workflowRows,
    estimate_accuracy: accuracy,
    recurring_overruns: recurringOverruns,
    profitability,
    designer_builder_profitability: designerBuilderProfitability,
    warnings: buildWarnings(activeJobPredictions, accuracy, recurringOverruns, bottlenecks),
    bottlenecks,
  };
}

function buildWorkflowRows(operations: EntityRecord[], timeEntries: EntityRecord[]) {
  const hoursByOperation = groupSum(timeEntries, (entry) => String(entry.job_operation_id || entry.operation || entry.workflow_phase || "Unassigned"), (entry) => Number(entry.hours || 0));
  const grouped = new Map<string, { actual: number; estimated: number; count: number }>();
  operations.forEach((operation) => {
    const phase = String(operation.workflow_phase || operation.operation || operation.task_name || "Unassigned");
    const current = grouped.get(phase) || { actual: 0, estimated: 0, count: 0 };
    current.estimated += Number(operation.estimated_hours || 0);
    current.actual += hoursByOperation.get(String(operation.id || "")) || 0;
    current.count += 1;
    grouped.set(phase, current);
  });
  timeEntries
    .filter((entry) => !entry.job_operation_id)
    .forEach((entry) => {
      const phase = String(entry.workflow_phase || entry.operation || entry.activity || "Unassigned");
      const current = grouped.get(phase) || { actual: 0, estimated: 0, count: 0 };
      current.actual += Number(entry.hours || 0);
      grouped.set(phase, current);
    });
  return [...grouped.entries()]
    .map(([phase, row]) => ({
      workflow_phase: phase,
      predicted_hours: round1(Math.max(row.actual, row.estimated)),
      actual_hours: round1(row.actual),
      estimated_hours: round1(row.estimated),
      variance_percent: row.estimated > 0 ? round1(((row.actual - row.estimated) / row.estimated) * 100) : 0,
    }))
    .sort((left, right) => right.predicted_hours - left.predicted_hours)
    .slice(0, 8);
}

function buildEstimateAccuracy(rows: Array<{ job: EntityRecord; actualHours: number; predictedTotal: number }>) {
  const withBudget = rows
    .map((row) => ({ ...row, budget: Number(row.job.budget_hours || 0) }))
    .filter((row) => row.budget > 0);
  const variances = withBudget.map((row) => ((row.actualHours - row.budget) / row.budget) * 100);
  return {
    jobs_with_budget: withBudget.length,
    average_variance_percent: round1(average(variances)),
    over_budget_jobs: variances.filter((value) => value > 10).length,
    under_budget_jobs: variances.filter((value) => value < -10).length,
  };
}

function buildRecurringOverruns(jobs: EntityRecord[], rows: Array<{ job: EntityRecord; actualHours: number }>) {
  const grouped = new Map<string, number[]>();
  rows.forEach((row) => {
    const budget = Number(row.job.budget_hours || 0);
    if (budget <= 0 || row.actualHours <= budget * 1.1) return;
    const key = String(row.job.job_type || row.job.workflow_template_key || "uncategorised");
    const current = grouped.get(key) || [];
    current.push(((row.actualHours - budget) / budget) * 100);
    grouped.set(key, current);
  });
  void jobs;
  return [...grouped.entries()]
    .filter(([, values]) => values.length >= 1)
    .map(([key, values]) => {
      const avg = average(values);
      return {
        key,
        label: labelize(key),
        occurrences: values.length,
        average_variance_percent: round1(avg),
        severity: avg >= 35 ? "high" as const : avg >= 18 ? "medium" as const : "low" as const,
      };
    })
    .sort((left, right) => right.average_variance_percent - left.average_variance_percent)
    .slice(0, 6);
}

function buildProfitability(jobs: EntityRecord[], timeEntries: EntityRecord[]) {
  const quotedValue = jobs.reduce((sum, job) => sum + Number(job.quoted_value || job.total || 0), 0);
  const labourCost = timeEntries
    .filter((entry) => jobs.some((job) => String(job.id) === String(entry.job_id)))
    .reduce((sum, entry) => sum + Number(entry.total_cost || Number(entry.hours || 0) * Number(entry.hourly_rate || 0)), 0);
  const marginValue = quotedValue - labourCost;
  return {
    quoted_value: round2(quotedValue),
    labour_cost: round2(labourCost),
    labour_margin_value: round2(marginValue),
    labour_margin_percent: quotedValue > 0 ? round1((marginValue / quotedValue) * 100) : 0,
    at_risk_jobs: jobs.filter((job) => {
      const budget = Number(job.budget_hours || 0);
      if (budget <= 0) return false;
      const actual = timeEntries.filter((entry) => String(entry.job_id || "") === String(job.id || "")).reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
      return actual > budget * 1.15;
    }).length,
  };
}

function buildDesignerBuilderProfitability(jobs: EntityRecord[], timeEntries: EntityRecord[]) {
  const grouped = new Map<string, { quoted: number; cost: number; hours: number }>();
  jobs.forEach((job) => {
    const names = [job.prepared_by, job.salesperson, job.project_manager].map((value) => String(value || "").trim()).filter(Boolean);
    const name = names[0] || "Unassigned";
    const current = grouped.get(name) || { quoted: 0, cost: 0, hours: 0 };
    current.quoted += Number(job.quoted_value || job.total || 0);
    const jobEntries = timeEntries.filter((entry) => String(entry.job_id || "") === String(job.id || ""));
    current.hours += jobEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    current.cost += jobEntries.reduce((sum, entry) => sum + Number(entry.total_cost || Number(entry.hours || 0) * Number(entry.hourly_rate || 0)), 0);
    grouped.set(name, current);
  });
  return [...grouped.entries()]
    .map(([name, row]) => ({
      name,
      quoted_value: round2(row.quoted),
      labour_cost: round2(row.cost),
      hours: round1(row.hours),
      labour_margin_percent: row.quoted > 0 ? round1(((row.quoted - row.cost) / row.quoted) * 100) : 0,
    }))
    .sort((left, right) => right.quoted_value - left.quoted_value)
    .slice(0, 6);
}

function buildBottlenecks(operations: EntityRecord[]) {
  const grouped = new Map<string, { blocked: number; active: number }>();
  operations.forEach((operation) => {
    const phase = String(operation.workflow_phase || operation.operation || "Unassigned");
    const status = String(operation.status || "").toLowerCase();
    const current = grouped.get(phase) || { blocked: 0, active: 0 };
    if (/blocked|waiting|hold|pending/.test(status)) current.blocked += 1;
    if (!/done|complete|cancel|archiv/.test(status)) current.active += 1;
    grouped.set(phase, current);
  });
  return [...grouped.entries()]
    .filter(([, row]) => row.blocked > 0 || row.active >= 3)
    .map(([phase, row]) => ({
      workflow_phase: phase,
      blocked_or_waiting: row.blocked,
      active_operations: row.active,
      severity: row.blocked >= 3 ? "high" as const : row.blocked >= 1 ? "medium" as const : "low" as const,
    }))
    .sort((left, right) => right.blocked_or_waiting - left.blocked_or_waiting)
    .slice(0, 6);
}

function buildWarnings(
  rows: Array<{ job: EntityRecord; actualHours: number; predictedTotal: number; remainingHours: number }>,
  accuracy: LabourIntelligence["estimate_accuracy"],
  overruns: LabourIntelligence["recurring_overruns"],
  bottlenecks: LabourIntelligence["bottlenecks"]
) {
  const warnings: LabourIntelligence["warnings"] = [];
  rows
    .filter((row) => Number(row.job.budget_hours || 0) > 0 && row.actualHours > Number(row.job.budget_hours) * 1.15)
    .slice(0, 6)
    .forEach((row) => warnings.push({
      severity: row.actualHours > Number(row.job.budget_hours) * 1.35 ? "high" : "medium",
      message: `${row.job.job_number || row.job.title || "Job"} is over labour estimate.`,
      href: row.job.id ? `/jobs/${row.job.id}` : undefined,
    }));
  if (accuracy.average_variance_percent > 15) {
    warnings.push({ severity: "medium", message: `Average labour variance is ${accuracy.average_variance_percent}% over estimate.` });
  }
  overruns.filter((row) => row.severity !== "low").forEach((row) => warnings.push({
    severity: row.severity,
    message: `${row.label} work is repeatedly exceeding labour estimates.`,
  }));
  bottlenecks.filter((row) => row.severity !== "low").forEach((row) => warnings.push({
    severity: row.severity,
    message: `${row.workflow_phase} has ${row.blocked_or_waiting} blocked or waiting operation(s).`,
  }));
  return warnings.slice(0, 10);
}

function isActiveJob(job: EntityRecord) {
  return !["complete", "completed", "cancelled", "inactive", "archived"].includes(String(job.status || "").toLowerCase());
}

function installDurationDays(job: EntityRecord) {
  const start = parseDate(job.install_date);
  const end = parseDate(job.install_end_date || job.install_date);
  if (!start || !end) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function isWithinDays(value: unknown, days: number) {
  const date = parseDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (date.getTime() - today.getTime()) / 86400000;
  return diff >= 0 && diff <= days;
}

function parseDate(value: unknown) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function groupSum<T>(rows: T[], keyFn: (row: T) => string, valueFn: (row: T) => number) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    grouped.set(key, (grouped.get(key) || 0) + valueFn(row));
  });
  return grouped;
}

function groupRows<T>(rows: T[], keyFn: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  });
  return grouped;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function labelize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
