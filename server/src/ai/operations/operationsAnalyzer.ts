import { EntityRecord } from "../../types";
import { analyzeLabourRisks } from "./labourRiskAnalyzer";
import { OperationsInput, OperationalIntelligence, OperationalRisk, isOpenStatus, isPastDate, label, riskId, severityFromScore } from "./operationTypes";
import { analyzeProcurementRisks } from "./procurementRiskAnalyzer";
import { predictInstallRisks } from "./installRiskPredictor";
import { analyzeWorkflowRisks } from "./workflowRiskEngine";

export function analyzeOperations(input: OperationsInput): OperationalIntelligence {
  const risks = [
    ...analyzeWorkflowRisks(input.jobOperations),
    ...predictInstallRisks(input.jobs, input.jobOperations),
    ...analyzeLabourRisks(input.jobs, input.timeEntries),
    ...analyzeProcurementRisks(input.jobs, input.jobOperations),
    ...analyzeApprovalRisks(input.quotes),
    ...analyzeStalledJobs(input.jobs),
  ].sort(compareRisks).slice(0, 30);

  const briefing = buildBriefing(risks, input.staff || [], input.clockIns || []);
  return {
    generated_at: new Date().toISOString(),
    daily_briefing: briefing,
    risks,
    warnings: risks.filter((risk) => risk.severity !== "low").slice(0, 10),
    recommendations: buildRecommendations(risks),
    no_hidden_mutations: true,
  };
}

function analyzeApprovalRisks(quotes: EntityRecord[]): OperationalRisk[] {
  return quotes
    .filter((quote) => ["sent", "pending", "awaiting approval", "awaiting_approval"].includes(String(quote.status || "").toLowerCase()))
    .filter((quote) => isPastDate(quote.valid_until))
    .map((quote, index) => ({
      id: riskId("approval", quote, String(index)),
      type: "approval_missing" as const,
      severity: "medium" as const,
      title: `Approval missing: ${label(quote)}`,
      detail: `Quote approval is still outstanding and valid-until date is ${String(quote.valid_until || "not supplied")}.`,
      recommendation: "Follow up with the client or update the approval plan before scheduling dependent work.",
      related_entity: "Quote",
      related_id: String(quote.id || ""),
      reason_codes: ["quote_approval_overdue"],
    }));
}

function analyzeStalledJobs(jobs: EntityRecord[]): OperationalRisk[] {
  const now = Date.now();
  return jobs
    .filter((job) => isOpenStatus(job.status))
    .map((job, index): OperationalRisk | null => {
      const updated = job.updated_date ? new Date(String(job.updated_date)).getTime() : now;
      const daysStalled = Math.floor((now - updated) / 86_400_000);
      if (daysStalled < 10) return null;
      return {
        id: riskId("stalled", job, String(index)),
        type: "stalled_job" as const,
        severity: severityFromScore(daysStalled >= 21 ? 80 : 55),
        title: `Stalled job: ${label(job)}`,
        detail: `No recorded update for ${daysStalled} days.`,
        recommendation: "Review ownership, next workflow action, and client/supplier blockers.",
        related_entity: "Job",
        related_id: String(job.id || ""),
        reason_codes: ["job_not_updated"],
      };
    })
    .filter((risk): risk is OperationalRisk => Boolean(risk));
}

function buildBriefing(risks: OperationalRisk[], staff: EntityRecord[], clockIns: EntityRecord[]) {
  const staffingPressure = staff.filter((person) => String(person.status || "").toLowerCase() === "active").length > 0
    ? Math.max(0, risks.filter((risk) => risk.type === "install_pressure" || risk.type === "labour_overrun").length - activeClockIns(clockIns))
    : risks.filter((risk) => risk.type === "install_pressure" || risk.type === "labour_overrun").length;
  const jobsAtRisk = new Set(risks.filter((risk) => risk.related_entity === "Job").map((risk) => risk.related_id)).size;
  const overdueItems = risks.filter((risk) => risk.reason_codes.some((code) => code.includes("overdue"))).length;
  const installPressure = risks.filter((risk) => risk.type === "install_pressure").length;
  const workflowBlockers = risks.filter((risk) => risk.type === "workflow_blocker").length;
  const highRisks = risks.filter((risk) => risk.severity === "high").length;
  return {
    summary: `${highRisks} high-risk operational items, ${jobsAtRisk} jobs at risk, and ${workflowBlockers} workflow blockers require review.`,
    jobs_at_risk: jobsAtRisk,
    overdue_items: overdueItems,
    install_pressure: installPressure,
    workflow_blockers: workflowBlockers,
    staffing_pressure: staffingPressure,
  };
}

function activeClockIns(clockIns: EntityRecord[]) {
  return clockIns.filter((entry) => entry.clock_in_time && !entry.clock_out_time).length;
}

function buildRecommendations(risks: OperationalRisk[]) {
  return [...new Set(risks.map((risk) => risk.recommendation))].slice(0, 8);
}

function compareRisks(left: OperationalRisk, right: OperationalRisk) {
  const severity = severityRank(right.severity) - severityRank(left.severity);
  if (severity !== 0) return severity;
  return left.title.localeCompare(right.title);
}

function severityRank(severity: string) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}
