import { EntityRecord } from "../../types";
import { isOpenStatus, isPastDate, label, OperationalRisk, riskId, severityFromScore } from "./operationTypes";

export function analyzeWorkflowRisks(jobOperations: EntityRecord[]): OperationalRisk[] {
  return jobOperations
    .filter((operation) => isOpenStatus(operation.status))
    .map((operation, index): OperationalRisk | null => {
      const overdue = isPastDate(operation.end_date || operation.due_date);
      const dependencyBlocked = String(operation.dependency_task_ids || "").trim().length > 0
        && ["blocked", "waiting", "on hold", "on_hold"].includes(String(operation.status || "").toLowerCase());
      const score = (overdue ? 60 : 0) + (dependencyBlocked ? 35 : 0);
      if (score < 50) return null;
      const codes = [
        overdue ? "operation_overdue" : "",
        dependencyBlocked ? "dependency_blocked" : "",
      ].filter(Boolean);
      return {
        id: riskId("workflow", operation, String(index)),
        type: "workflow_blocker" as const,
        severity: severityFromScore(score),
        title: `Workflow risk: ${label(operation)}`,
        detail: `Status is ${String(operation.status || "open")} and target date is ${String(operation.end_date || operation.due_date || "not supplied")}.`,
        recommendation: "Confirm dependency owner, update target date, or unblock the operation before the next schedule review.",
        related_entity: "JobOperation",
        related_id: String(operation.id || ""),
        reason_codes: codes,
      };
    })
    .filter((risk): risk is OperationalRisk => Boolean(risk))
    .slice(0, 20);
}
