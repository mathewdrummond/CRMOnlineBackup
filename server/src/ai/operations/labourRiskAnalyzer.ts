import { EntityRecord } from "../../types";
import { isOpenStatus, label, OperationalRisk, riskId, severityFromScore } from "./operationTypes";

export function analyzeLabourRisks(jobs: EntityRecord[], timeEntries: EntityRecord[]): OperationalRisk[] {
  return jobs
    .filter((job) => isOpenStatus(job.status) && Number(job.budget_hours || 0) > 0)
    .map((job, index): OperationalRisk | null => {
      const budget = Number(job.budget_hours || 0);
      const actual = timeEntries
        .filter((entry) => String(entry.job_id || "") === String(job.id || ""))
        .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
      const variance = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
      if (variance <= 10) return null;
      return {
        id: riskId("labour", job, String(index)),
        type: "labour_overrun" as const,
        severity: severityFromScore(variance >= 35 ? 85 : variance >= 20 ? 65 : 50),
        title: `Labour overrun: ${label(job)}`,
        detail: `${actual.toFixed(1)} actual hours against ${budget.toFixed(1)} estimated hours (${variance.toFixed(1)}% variance).`,
        recommendation: "Review remaining scope, builder notes, and quote assumptions before further labour is committed.",
        related_entity: "Job",
        related_id: String(job.id || ""),
        reason_codes: ["actual_hours_above_estimate"],
      };
    })
    .filter((risk): risk is OperationalRisk => Boolean(risk))
    .slice(0, 20);
}
