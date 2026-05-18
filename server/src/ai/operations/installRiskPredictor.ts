import { EntityRecord } from "../../types";
import { isOpenStatus, isPastDate, isWithinDays, label, OperationalRisk, riskId, severityFromScore } from "./operationTypes";

export function predictInstallRisks(jobs: EntityRecord[], jobOperations: EntityRecord[]): OperationalRisk[] {
  return jobs
    .filter((job) => isOpenStatus(job.status) && isWithinDays(job.install_date, 14))
    .map((job, index) => {
      const relatedOperations = jobOperations.filter((operation) => String(operation.job_id || "") === String(job.id || ""));
      const openOperations = relatedOperations.filter((operation) => isOpenStatus(operation.status));
      const overdueOperations = openOperations.filter((operation) => isPastDate(operation.end_date || operation.due_date));
      const hasEndDate = Boolean(job.install_end_date);
      const score = 45 + Math.min(30, openOperations.length * 5) + Math.min(30, overdueOperations.length * 10) + (hasEndDate ? 0 : 10);
      return {
        id: riskId("install", job, String(index)),
        type: "install_pressure" as const,
        severity: severityFromScore(score),
        title: `Install pressure: ${label(job)}`,
        detail: `${openOperations.length} open workflow items remain before install date ${String(job.install_date || "not supplied")}.`,
        recommendation: "Review site readiness, material availability, open workflow tasks, and staffing before confirming the install plan.",
        related_entity: "Job",
        related_id: String(job.id || ""),
        reason_codes: [
          "install_within_14_days",
          openOperations.length > 0 ? "open_operations" : "",
          overdueOperations.length > 0 ? "overdue_operations" : "",
          hasEndDate ? "" : "missing_install_end_date",
        ].filter(Boolean),
      };
    })
    .sort((left, right) => severityOrder(right.severity) - severityOrder(left.severity))
    .slice(0, 20);
}

function severityOrder(severity: string) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

