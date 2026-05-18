import { EntityRecord } from "../../types";
import { isOpenStatus, isPastDate, isWithinDays, label, OperationalRisk, riskId, severityFromScore } from "./operationTypes";

export function analyzeProcurementRisks(jobs: EntityRecord[], jobOperations: EntityRecord[]): OperationalRisk[] {
  const procurementOperations = jobOperations.filter((operation) => {
    const haystack = `${operation.task_name || ""} ${operation.operation || ""} ${operation.workflow_phase || ""}`.toLowerCase();
    return haystack.includes("procure") || haystack.includes("order") || haystack.includes("supplier") || haystack.includes("material");
  });

  return procurementOperations
    .filter((operation) => isOpenStatus(operation.status))
    .map((operation, index): OperationalRisk | null => {
      const job = jobs.find((candidate) => String(candidate.id || "") === String(operation.job_id || ""));
      const overdue = isPastDate(operation.end_date || operation.due_date);
      const installSoon = job ? isWithinDays(job.install_date, 21) : false;
      const score = (overdue ? 65 : 35) + (installSoon ? 25 : 0);
      if (score < 50) return null;
      return {
        id: riskId("procurement", operation, String(index)),
        type: "procurement_delay" as const,
        severity: severityFromScore(score),
        title: `Procurement risk: ${label(job || operation)}`,
        detail: `${label(operation)} is ${String(operation.status || "open")} with install date ${String(job?.install_date || "not supplied")}.`,
        recommendation: "Confirm supplier lead time, delivery ETA, and any substitution decision required for production.",
        related_entity: "JobOperation",
        related_id: String(operation.id || ""),
        reason_codes: [
          overdue ? "procurement_overdue" : "procurement_open",
          installSoon ? "install_within_21_days" : "",
        ].filter(Boolean),
      };
    })
    .filter((risk): risk is OperationalRisk => Boolean(risk))
    .slice(0, 20);
}
