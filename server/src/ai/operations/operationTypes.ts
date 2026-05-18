import { EntityRecord } from "../../types";

export type OperationSeverity = "low" | "medium" | "high";

export type OperationalRisk = {
  id: string;
  type: "job_risk" | "workflow_blocker" | "install_pressure" | "labour_overrun" | "procurement_delay" | "approval_missing" | "stalled_job";
  severity: OperationSeverity;
  title: string;
  detail: string;
  recommendation: string;
  related_entity: string;
  related_id: string;
  reason_codes: string[];
};

export type OperationalIntelligence = {
  generated_at: string;
  daily_briefing: {
    summary: string;
    jobs_at_risk: number;
    overdue_items: number;
    install_pressure: number;
    workflow_blockers: number;
    staffing_pressure: number;
  };
  risks: OperationalRisk[];
  recommendations: string[];
  warnings: OperationalRisk[];
  no_hidden_mutations: true;
};

export type OperationsInput = {
  jobs: EntityRecord[];
  quotes: EntityRecord[];
  jobOperations: EntityRecord[];
  timeEntries: EntityRecord[];
  clockIns?: EntityRecord[];
  staff?: EntityRecord[];
  notes?: EntityRecord[];
};

export function severityFromScore(score: number): OperationSeverity {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function riskId(prefix: string, record: EntityRecord, fallback: string) {
  return `${prefix}:${String(record.id || record.job_id || record.quote_id || fallback)}`;
}

export function isOpenStatus(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase();
  return !["complete", "completed", "done", "cancelled", "canceled", "closed", "approved"].includes(normalized);
}

export function isWithinDays(value: unknown, days: number) {
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  const diffDays = (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000;
  return diffDays >= 0 && diffDays <= days;
}

export function isPastDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return false;
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

export function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function label(record: EntityRecord) {
  return String(record.job_number || record.quote_number || record.title || record.task_name || record.id || "Record");
}

