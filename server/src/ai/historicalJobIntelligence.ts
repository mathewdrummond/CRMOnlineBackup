import { z } from "zod";
import { getEntityRecord, listEntityRecords } from "../db";
import { EntityRecord } from "../types";
import { findSimilarEntity } from "./embeddings/semanticSearch";

const MAX_SIMILAR_CANDIDATES = 36;

const similarHistoricalJobSchema = z.object({
  quote_id: z.string(),
  job_id: z.string(),
  title: z.string(),
  score: z.number().min(0).max(1),
  similarity: z.object({
    embedding: z.number().min(0).max(1),
    pricing: z.number().min(0).max(1),
    labour: z.number().min(0).max(1),
    install: z.number().min(0).max(1),
    materials: z.number().min(0).max(1),
    workflow: z.number().min(0).max(1),
  }),
  metrics: z.object({
    quote_total: z.number(),
    margin_percent: z.number(),
    labour_hours: z.number(),
    install_days: z.number(),
    line_items: z.number(),
  }),
  highlights: z.array(z.string()).max(8),
  href: z.string(),
}).strict();

export const similarHistoricalJobsResponseSchema = z.object({
  quote_id: z.string(),
  generated_at: z.string(),
  source: z.object({
    quote_total: z.number(),
    margin_percent: z.number(),
    labour_hours: z.number(),
    install_days: z.number(),
    line_items: z.number(),
  }),
  results: z.array(similarHistoricalJobSchema),
}).strict();

export const quoteInsightsResponseSchema = z.object({
  quote_id: z.string(),
  generated_at: z.string(),
  likely_labour_hours: z.object({
    min: z.number(),
    median: z.number(),
    max: z.number(),
    recommended: z.number(),
  }),
  likely_install_days: z.object({
    min: z.number(),
    median: z.number(),
    max: z.number(),
    recommended: z.number(),
  }),
  margin: z.object({
    current_percent: z.number(),
    historical_median_percent: z.number(),
    delta_percent: z.number(),
    risk_level: z.enum(["low", "medium", "high"]),
  }),
  risk_indicators: z.array(z.object({
    key: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    message: z.string(),
  }).strict()),
  missing_inclusions: z.array(z.string()).max(12),
  abnormal_supplier_pricing: z.array(z.object({
    item: z.string(),
    source_unit_cost: z.number(),
    historical_median_unit_cost: z.number(),
    delta_percent: z.number(),
  }).strict()).max(20),
  underquoted_operations: z.array(z.object({
    operation: z.string(),
    source_hours: z.number(),
    historical_median_hours: z.number(),
    delta_hours: z.number(),
  }).strict()).max(20),
  workflow_complexity: z.object({
    score: z.number().min(0).max(100),
    warnings: z.array(z.string()).max(8),
  }),
  recommendations: z.array(z.string()).max(16),
  similar_jobs: z.array(similarHistoricalJobSchema).max(12),
}).strict();

export const quoteRiskAnalysisResponseSchema = z.object({
  quote_id: z.string(),
  generated_at: z.string(),
  overall_risk: z.enum(["low", "medium", "high"]),
  margin_risk: z.enum(["low", "medium", "high"]),
  labour_risk: z.enum(["low", "medium", "high"]),
  install_risk: z.enum(["low", "medium", "high"]),
  workflow_risk: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string()).max(16),
  top_actions: z.array(z.string()).max(8),
  historical_sample_size: z.number().int().min(0),
}).strict();

type QuoteMetrics = {
  quoteTotal: number;
  marginPercent: number;
  lineItems: number;
  labourHours: number;
  installDays: number;
  categorySet: Set<string>;
  supplierSet: Set<string>;
  workflowSet: Set<string>;
  itemKeyToUnitCost: Map<string, number>;
};

type SimilarHistoricalJob = z.infer<typeof similarHistoricalJobSchema>;
type SimilarHistoricalJobsResponse = z.infer<typeof similarHistoricalJobsResponseSchema>;
type QuoteInsightsResponse = z.infer<typeof quoteInsightsResponseSchema>;
type QuoteRiskAnalysisResponse = z.infer<typeof quoteRiskAnalysisResponseSchema>;

type QuoteContext = {
  quote: EntityRecord;
  job: EntityRecord | null;
  quoteItems: EntityRecord[];
  jobOperations: EntityRecord[];
  timeEntries: EntityRecord[];
};

type QuoteContextCache = {
  quoteItemsByQuoteId: Map<string, EntityRecord[]>;
  jobsByQuoteId: Map<string, EntityRecord[]>;
  operationsByQuoteId: Map<string, EntityRecord[]>;
  operationsByJobId: Map<string, EntityRecord[]>;
  timeEntriesByJobId: Map<string, EntityRecord[]>;
};

export async function getSimilarHistoricalJobs(quoteId: string, limit = 8): Promise<SimilarHistoricalJobsResponse> {
  const sourceQuote = getEntityRecord("Quote", quoteId);
  if (!sourceQuote) {
    return {
      quote_id: quoteId,
      generated_at: new Date().toISOString(),
      source: {
        quote_total: 0,
        margin_percent: 0,
        labour_hours: 0,
        install_days: 0,
        line_items: 0,
      },
      results: [],
    };
  }

  const cache = createContextCache();
  const sourceContext = buildQuoteContext(sourceQuote, cache);
  const sourceMetrics = computeQuoteMetrics(sourceContext);
  const similar = await findSimilarEntity("Quote", quoteId, Math.max(limit * 4, MAX_SIMILAR_CANDIDATES));
  const candidates = similar.results
    .filter((result) => result.record_id !== quoteId)
    .slice(0, MAX_SIMILAR_CANDIDATES);

  const rows: SimilarHistoricalJob[] = [];
  for (const candidate of candidates) {
    const candidateQuote = getEntityRecord("Quote", candidate.record_id);
    if (!candidateQuote) continue;
    const candidateContext = buildQuoteContext(candidateQuote, cache);
    if (!candidateContext.job) continue;
    const candidateMetrics = computeQuoteMetrics(candidateContext);
    const similarity = {
      embedding: clamp01(Number(candidate.semantic_score || candidate.score || 0)),
      pricing: ratioSimilarity(sourceMetrics.quoteTotal, candidateMetrics.quoteTotal),
      labour: ratioSimilarity(sourceMetrics.labourHours, candidateMetrics.labourHours),
      install: ratioSimilarity(sourceMetrics.installDays, candidateMetrics.installDays),
      materials: jaccardScore(sourceMetrics.categorySet, candidateMetrics.categorySet) * 0.6
        + jaccardScore(sourceMetrics.supplierSet, candidateMetrics.supplierSet) * 0.4,
      workflow: jaccardScore(sourceMetrics.workflowSet, candidateMetrics.workflowSet),
    };
    const score = clamp01(
      (similarity.embedding * 0.34)
      + (similarity.pricing * 0.22)
      + (similarity.labour * 0.14)
      + (similarity.install * 0.10)
      + (similarity.materials * 0.11)
      + (similarity.workflow * 0.09)
    );

    rows.push({
      quote_id: candidateQuote.id,
      job_id: candidateContext.job.id,
      title: compactJoin([
        String(candidateContext.job.job_number || ""),
        String(candidateContext.job.title || candidateQuote.title || "Historical job"),
      ]),
      score,
      similarity,
      metrics: {
        quote_total: round2(candidateMetrics.quoteTotal),
        margin_percent: round2(candidateMetrics.marginPercent),
        labour_hours: round2(candidateMetrics.labourHours),
        install_days: round2(candidateMetrics.installDays),
        line_items: candidateMetrics.lineItems,
      },
      highlights: buildSimilarityHighlights(sourceMetrics, candidateMetrics),
      href: `/jobs/${candidateContext.job.id}`,
    });
  }

  const results = rows
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(12, limit)))
    .map((row) => similarHistoricalJobSchema.parse(row));

  return similarHistoricalJobsResponseSchema.parse({
    quote_id: quoteId,
    generated_at: new Date().toISOString(),
    source: {
      quote_total: round2(sourceMetrics.quoteTotal),
      margin_percent: round2(sourceMetrics.marginPercent),
      labour_hours: round2(sourceMetrics.labourHours),
      install_days: round2(sourceMetrics.installDays),
      line_items: sourceMetrics.lineItems,
    },
    results,
  });
}

export async function getQuoteInsights(quoteId: string): Promise<QuoteInsightsResponse> {
  const similar = await getSimilarHistoricalJobs(quoteId, 10);
  const sourceQuote = getEntityRecord("Quote", quoteId);
  if (!sourceQuote) {
    return quoteInsightsResponseSchema.parse({
      quote_id: quoteId,
      generated_at: new Date().toISOString(),
      likely_labour_hours: { min: 0, median: 0, max: 0, recommended: 0 },
      likely_install_days: { min: 0, median: 0, max: 0, recommended: 0 },
      margin: { current_percent: 0, historical_median_percent: 0, delta_percent: 0, risk_level: "low" },
      risk_indicators: [],
      missing_inclusions: [],
      abnormal_supplier_pricing: [],
      underquoted_operations: [],
      workflow_complexity: { score: 0, warnings: [] },
      recommendations: [],
      similar_jobs: [],
    });
  }

  const cache = createContextCache();
  const sourceContext = buildQuoteContext(sourceQuote, cache);
  const sourceMetrics = computeQuoteMetrics(sourceContext);
  const historicalContexts = similar.results
    .map((row) => getEntityRecord("Quote", row.quote_id))
    .filter((quote): quote is EntityRecord => Boolean(quote))
    .map((quote) => buildQuoteContext(quote, cache));
  const historicalMetrics = historicalContexts.map((context) => computeQuoteMetrics(context));

  const labourSeries = historicalMetrics.map((metric) => metric.labourHours).filter((value) => value > 0);
  const installSeries = historicalMetrics.map((metric) => metric.installDays).filter((value) => value > 0);
  const marginSeries = historicalMetrics.map((metric) => metric.marginPercent).filter((value) => Number.isFinite(value));

  const likelyLabour = percentileRange(labourSeries);
  const likelyInstall = percentileRange(installSeries);
  const historicalMarginMedian = median(marginSeries);
  const marginDelta = round2(sourceMetrics.marginPercent - historicalMarginMedian);
  const marginRisk = marginDelta < -8 || sourceMetrics.marginPercent < 35 ? "high"
    : marginDelta < -3 || sourceMetrics.marginPercent < 40 ? "medium"
      : "low";

  const missingInclusions = detectMissingInclusions(sourceMetrics, historicalMetrics);
  const abnormalSupplierPricing = detectAbnormalSupplierPricing(sourceContext, historicalContexts);
  const underquotedOperations = detectUnderquotedOperations(sourceContext, historicalContexts);
  const workflowComplexity = buildWorkflowComplexity(sourceMetrics, likelyInstall.recommended);

  const riskIndicators = [
    marginRisk !== "low" ? {
      key: "margin_risk",
      severity: marginRisk,
      message: marginRisk === "high"
        ? "Margin is materially below historical outcomes for similar jobs."
        : "Margin is slightly below historical outcomes for similar jobs.",
    } : null,
    sourceMetrics.labourHours > 0 && likelyLabour.max > 0 && sourceMetrics.labourHours < likelyLabour.median * 0.8 ? {
      key: "labour_risk",
      severity: "high" as const,
      message: "Estimated labour appears below historical median for similar work.",
    } : null,
    sourceMetrics.installDays > 0 && likelyInstall.max > 0 && sourceMetrics.installDays < likelyInstall.median * 0.75 ? {
      key: "install_risk",
      severity: "medium" as const,
      message: "Install duration appears shorter than historical patterns.",
    } : null,
    missingInclusions.length > 0 ? {
      key: "inclusion_gap",
      severity: "medium" as const,
      message: "Common historical inclusions are missing from this quote.",
    } : null,
    abnormalSupplierPricing.length > 0 ? {
      key: "supplier_variance",
      severity: "medium" as const,
      message: "Supplier pricing deviates from historical medians.",
    } : null,
    underquotedOperations.length > 0 ? {
      key: "operation_underquote",
      severity: "high" as const,
      message: "One or more workflow operations appear under-allowed.",
    } : null,
    workflowComplexity.score >= 70 ? {
      key: "workflow_complexity",
      severity: "medium" as const,
      message: "Workflow complexity is high compared with typical quotes.",
    } : null,
  ].filter((item): item is { key: string; severity: "low" | "medium" | "high"; message: string } => Boolean(item));

  const recommendations = buildRecommendations({
    likelyLabour,
    likelyInstall,
    marginRisk,
    missingInclusions,
    abnormalSupplierPricing,
    underquotedOperations,
    workflowComplexityWarnings: workflowComplexity.warnings,
  });

  return quoteInsightsResponseSchema.parse({
    quote_id: quoteId,
    generated_at: new Date().toISOString(),
    likely_labour_hours: likelyLabour,
    likely_install_days: likelyInstall,
    margin: {
      current_percent: round2(sourceMetrics.marginPercent),
      historical_median_percent: round2(historicalMarginMedian),
      delta_percent: marginDelta,
      risk_level: marginRisk,
    },
    risk_indicators: riskIndicators,
    missing_inclusions: missingInclusions.slice(0, 12),
    abnormal_supplier_pricing: abnormalSupplierPricing.slice(0, 20),
    underquoted_operations: underquotedOperations.slice(0, 20),
    workflow_complexity: workflowComplexity,
    recommendations,
    similar_jobs: similar.results,
  });
}

export async function getQuoteRiskAnalysis(quoteId: string): Promise<QuoteRiskAnalysisResponse> {
  const insights = await getQuoteInsights(quoteId);

  const labourRisk = insights.underquoted_operations.length > 0
    || insights.likely_labour_hours.recommended > 0
      && insights.likely_labour_hours.recommended > insights.likely_labour_hours.median * 1.2
    ? "high"
    : insights.likely_labour_hours.median > 0 && insights.likely_labour_hours.recommended < insights.likely_labour_hours.median
      ? "medium"
      : "low";

  const installRisk = insights.workflow_complexity.score >= 75
    || insights.likely_install_days.max >= 7 && insights.likely_install_days.recommended <= 2
    ? "high"
    : insights.likely_install_days.median > 0 && insights.likely_install_days.recommended < insights.likely_install_days.median
      ? "medium"
      : "low";

  const workflowRisk = insights.workflow_complexity.score >= 75 ? "high"
    : insights.workflow_complexity.score >= 60 ? "medium"
      : "low";

  const marginRisk = insights.margin.risk_level;
  const overallRisk = highestRisk([marginRisk, labourRisk, installRisk, workflowRisk]);
  const warnings = insights.risk_indicators.map((item) => item.message);

  const topActions = insights.recommendations.slice(0, 8);
  return quoteRiskAnalysisResponseSchema.parse({
    quote_id: quoteId,
    generated_at: insights.generated_at,
    overall_risk: overallRisk,
    margin_risk: marginRisk,
    labour_risk: labourRisk,
    install_risk: installRisk,
    workflow_risk: workflowRisk,
    warnings,
    top_actions: topActions,
    historical_sample_size: insights.similar_jobs.length,
  });
}

function createContextCache(): QuoteContextCache {
  return {
    quoteItemsByQuoteId: new Map(),
    jobsByQuoteId: new Map(),
    operationsByQuoteId: new Map(),
    operationsByJobId: new Map(),
    timeEntriesByJobId: new Map(),
  };
}

function buildQuoteContext(quote: EntityRecord, cache: QuoteContextCache): QuoteContext {
  const quoteId = String(quote.id || "");
  const quoteItems = readCached(cache.quoteItemsByQuoteId, quoteId, () =>
    listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 3000 })
  );
  const quoteJobs = readCached(cache.jobsByQuoteId, quoteId, () =>
    listEntityRecords("Job", { filters: { quote_id: quoteId }, sort: "-updated_date", limit: 4 })
  );
  const job = quoteJobs[0] || null;
  const quoteOperations = readCached(cache.operationsByQuoteId, quoteId, () =>
    listEntityRecords("JobOperation", { filters: { quote_id: quoteId }, limit: 2000 })
  );
  const jobOperations = job
    ? readCached(cache.operationsByJobId, String(job.id || ""), () =>
        listEntityRecords("JobOperation", { filters: { job_id: String(job.id || "") }, limit: 2000 })
      )
    : [];
  const mergedOperations = dedupeById([...quoteOperations, ...jobOperations]);
  const timeEntries = job
    ? readCached(cache.timeEntriesByJobId, String(job.id || ""), () =>
        listEntityRecords("TimeEntry", { filters: { job_id: String(job.id || "") }, limit: 3000 })
      )
    : [];

  return {
    quote,
    job,
    quoteItems,
    jobOperations: mergedOperations,
    timeEntries,
  };
}

function computeQuoteMetrics(context: QuoteContext): QuoteMetrics {
  const activeItems = context.quoteItems.filter((item) => !isInactiveQuoteItem(item));
  const quoteTotalFromRecord = numeric(context.quote.total);
  const quoteTotalFromItems = activeItems.reduce((sum, item) => sum + numeric(item.total), 0);
  const quoteTotal = quoteTotalFromRecord > 0 ? quoteTotalFromRecord : quoteTotalFromItems;
  const costTotal = activeItems.reduce((sum, item) => sum + (numeric(item.unit_cost) * numeric(item.quantity || 1)), 0);
  const marginPercent = quoteTotal > 0 ? ((quoteTotal - costTotal) / quoteTotal) * 100 : 0;

  const operationHours = context.jobOperations.reduce(
    (sum, operation) => sum + Math.max(numeric(operation.actual_hours), numeric(operation.estimated_hours)),
    0
  );
  const timeEntryHours = context.timeEntries.reduce((sum, entry) => sum + Math.max(numeric(entry.hours), numeric(entry.total_hours)), 0);
  const labourHours = round2(Math.max(operationHours, timeEntryHours, numeric(context.quote.labour_hours)));
  const installDays = round2(Math.max(
    0,
    installDaysFromJob(context.job),
    installDaysFromOperations(context.jobOperations),
    numeric(context.quote.install_days)
  ));

  const categorySet = new Set<string>();
  const supplierSet = new Set<string>();
  const workflowSet = new Set<string>();
  const itemKeyToUnitCost = new Map<string, number>();

  for (const item of activeItems) {
    const category = normalizeToken(item.category || item.section);
    if (category) categorySet.add(category);
    const supplier = normalizeToken(item.supplier_name || item.supplier || item.vendor);
    if (supplier) supplierSet.add(supplier);
    const key = normalizeItemKey(item);
    if (key) itemKeyToUnitCost.set(key, numeric(item.unit_cost));
  }

  for (const operation of context.jobOperations) {
    const phase = normalizeToken(operation.workflow_phase || operation.operation || operation.task_name);
    if (phase) workflowSet.add(phase);
  }

  return {
    quoteTotal: round2(quoteTotal),
    marginPercent: round2(marginPercent),
    lineItems: activeItems.length,
    labourHours,
    installDays,
    categorySet,
    supplierSet,
    workflowSet,
    itemKeyToUnitCost,
  };
}

function detectMissingInclusions(sourceMetrics: QuoteMetrics, historicalMetrics: QuoteMetrics[]) {
  const frequency = new Map<string, number>();
  for (const metric of historicalMetrics) {
    for (const category of metric.categorySet) {
      frequency.set(category, (frequency.get(category) || 0) + 1);
    }
  }

  const threshold = Math.max(2, Math.floor(historicalMetrics.length * 0.55));
  return Array.from(frequency.entries())
    .filter(([category, count]) => count >= threshold && !sourceMetrics.categorySet.has(category))
    .sort((left, right) => right[1] - left[1])
    .map(([category]) => category.replace(/_/g, " "));
}

function detectAbnormalSupplierPricing(sourceContext: QuoteContext, historicalContexts: QuoteContext[]) {
  const historicalByKey = new Map<string, number[]>();
  for (const context of historicalContexts) {
    for (const item of context.quoteItems.filter((row) => !isInactiveQuoteItem(row))) {
      const key = normalizeItemKey(item);
      if (!key) continue;
      const unitCost = numeric(item.unit_cost);
      if (unitCost <= 0) continue;
      const list = historicalByKey.get(key) || [];
      list.push(unitCost);
      historicalByKey.set(key, list);
    }
  }

  const flags: Array<{ item: string; source_unit_cost: number; historical_median_unit_cost: number; delta_percent: number }> = [];
  for (const item of sourceContext.quoteItems.filter((row) => !isInactiveQuoteItem(row))) {
    const key = normalizeItemKey(item);
    if (!key) continue;
    const historical = historicalByKey.get(key);
    if (!historical || historical.length < 2) continue;
    const medianCost = median(historical);
    const sourceCost = numeric(item.unit_cost);
    if (sourceCost <= 0 || medianCost <= 0) continue;
    const deltaPercent = ((sourceCost - medianCost) / medianCost) * 100;
    if (Math.abs(deltaPercent) >= 22) {
      flags.push({
        item: String(item.description || item.name || item.product_number || "Quote item"),
        source_unit_cost: round2(sourceCost),
        historical_median_unit_cost: round2(medianCost),
        delta_percent: round2(deltaPercent),
      });
    }
  }

  return flags.sort((left, right) => Math.abs(right.delta_percent) - Math.abs(left.delta_percent));
}

function detectUnderquotedOperations(sourceContext: QuoteContext, historicalContexts: QuoteContext[]) {
  const sourceByOperation = new Map<string, number>();
  for (const operation of sourceContext.jobOperations) {
    const key = normalizeToken(operation.workflow_phase || operation.operation || operation.task_name);
    if (!key) continue;
    const hours = Math.max(numeric(operation.estimated_hours), numeric(operation.actual_hours));
    if (hours <= 0) continue;
    sourceByOperation.set(key, (sourceByOperation.get(key) || 0) + hours);
  }

  const historicalByOperation = new Map<string, number[]>();
  for (const context of historicalContexts) {
    const perContext = new Map<string, number>();
    for (const operation of context.jobOperations) {
      const key = normalizeToken(operation.workflow_phase || operation.operation || operation.task_name);
      if (!key) continue;
      const hours = Math.max(numeric(operation.actual_hours), numeric(operation.estimated_hours));
      if (hours <= 0) continue;
      perContext.set(key, (perContext.get(key) || 0) + hours);
    }
    for (const [key, value] of perContext.entries()) {
      const bucket = historicalByOperation.get(key) || [];
      bucket.push(value);
      historicalByOperation.set(key, bucket);
    }
  }

  const risks: Array<{ operation: string; source_hours: number; historical_median_hours: number; delta_hours: number }> = [];
  for (const [operation, sourceHours] of sourceByOperation.entries()) {
    const historical = historicalByOperation.get(operation);
    if (!historical || historical.length < 2) continue;
    const historicalMedian = median(historical);
    if (historicalMedian <= 0) continue;
    if (sourceHours < historicalMedian * 0.75) {
      risks.push({
        operation: operation.replace(/_/g, " "),
        source_hours: round2(sourceHours),
        historical_median_hours: round2(historicalMedian),
        delta_hours: round2(sourceHours - historicalMedian),
      });
    }
  }

  return risks.sort((left, right) => left.delta_hours - right.delta_hours);
}

function buildWorkflowComplexity(sourceMetrics: QuoteMetrics, recommendedInstallDays: number) {
  const score = clamp(
    (sourceMetrics.lineItems * 2.2)
    + (sourceMetrics.categorySet.size * 8)
    + (sourceMetrics.workflowSet.size * 7)
    + (Math.max(0, sourceMetrics.installDays || recommendedInstallDays) * 6),
    0,
    100
  );

  const warnings: string[] = [];
  if (sourceMetrics.workflowSet.size >= 5) warnings.push("Multiple workflow phases are involved.");
  if (sourceMetrics.lineItems >= 18) warnings.push("High line-item count increases coordination risk.");
  if (sourceMetrics.installDays >= 4) warnings.push("Long install window may need staging checks.");
  if (sourceMetrics.categorySet.size >= 6) warnings.push("Broad material mix may need supplier lead-time checks.");

  return {
    score: round2(score),
    warnings,
  };
}

function buildRecommendations(input: {
  likelyLabour: { min: number; median: number; max: number; recommended: number };
  likelyInstall: { min: number; median: number; max: number; recommended: number };
  marginRisk: "low" | "medium" | "high";
  missingInclusions: string[];
  abnormalSupplierPricing: Array<{ item: string; source_unit_cost: number; historical_median_unit_cost: number; delta_percent: number }>;
  underquotedOperations: Array<{ operation: string; source_hours: number; historical_median_hours: number; delta_hours: number }>;
  workflowComplexityWarnings: string[];
}) {
  const recommendations: string[] = [];

  if (input.marginRisk === "high") {
    recommendations.push("Review margin immediately before client issue.");
  } else if (input.marginRisk === "medium") {
    recommendations.push("Check margin against target band before approval.");
  }

  if (input.likelyLabour.recommended > 0) {
    recommendations.push(`Set labour allowance close to ${round2(input.likelyLabour.recommended)} hours unless scope is reduced.`);
  }
  if (input.likelyInstall.recommended > 0) {
    recommendations.push(`Plan install duration around ${round2(input.likelyInstall.recommended)} day(s).`);
  }
  if (input.missingInclusions.length > 0) {
    recommendations.push(`Review likely missing inclusions: ${input.missingInclusions.slice(0, 3).join(", ")}.`);
  }
  if (input.abnormalSupplierPricing.length > 0) {
    recommendations.push("Validate supplier unit costs against recent history.");
  }
  if (input.underquotedOperations.length > 0) {
    recommendations.push("Increase hours for underquoted operations before release.");
  }
  if (input.workflowComplexityWarnings.length > 0) {
    recommendations.push("Run an internal complexity check before final signoff.");
  }

  return Array.from(new Set(recommendations));
}

function buildSimilarityHighlights(source: QuoteMetrics, candidate: QuoteMetrics) {
  const highlights: string[] = [];
  if (Math.abs(source.marginPercent - candidate.marginPercent) <= 5) {
    highlights.push("Margin profile is close to this historical job.");
  }
  if (Math.abs(source.installDays - candidate.installDays) <= 1 && candidate.installDays > 0) {
    highlights.push("Install duration pattern is similar.");
  }
  if (Math.abs(source.labourHours - candidate.labourHours) <= Math.max(2, candidate.labourHours * 0.2) && candidate.labourHours > 0) {
    highlights.push("Labour demand is in a similar range.");
  }
  if (candidate.categorySet.size > 0 && jaccardScore(source.categorySet, candidate.categorySet) >= 0.45) {
    highlights.push("Material/category mix overlaps strongly.");
  }
  if (highlights.length === 0) {
    highlights.push("Overall structure is broadly comparable.");
  }
  return highlights.slice(0, 4);
}

function installDaysFromJob(job: EntityRecord | null) {
  if (!job) return 0;
  const start = dateValue(job.install_date || job.start_date);
  const end = dateValue(job.install_end_date || job.end_date || job.install_date);
  if (!start || !end) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function installDaysFromOperations(operations: EntityRecord[]) {
  const installOps = operations.filter((operation) => normalizeToken(operation.workflow_phase).includes("install")
    || normalizeToken(operation.operation).includes("install")
    || normalizeToken(operation.task_name).includes("install"));
  if (installOps.length === 0) return 0;

  const dates = installOps
    .flatMap((operation) => [operation.start_date, operation.end_date, operation.due_date, operation.date])
    .map((value) => dateValue(value))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime());

  if (dates.length < 2) return 1;
  return Math.max(1, Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / 86400000) + 1);
}

function normalizeItemKey(item: EntityRecord) {
  const supplier = normalizeToken(item.supplier_name || item.supplier || item.vendor);
  const sku = normalizeToken(item.product_number || item.supplier_sku || item.sku || item.original_sku);
  if (supplier && sku) return `${supplier}|${sku}`;
  const description = normalizeToken(item.description || item.name);
  if (supplier && description) return `${supplier}|${description}`;
  return "";
}

function isInactiveQuoteItem(item: EntityRecord) {
  const reviewState = String(item.review_state || "").trim().toLowerCase();
  return Boolean(item.is_optional) || reviewState === "deleted" || reviewState === "excluded";
}

function percentileRange(values: number[]) {
  if (values.length === 0) return { min: 0, median: 0, max: 0, recommended: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const min = percentile(sorted, 0.2);
  const med = percentile(sorted, 0.5);
  const max = percentile(sorted, 0.85);
  return {
    min: round2(min),
    median: round2(med),
    max: round2(max),
    recommended: round2((med * 0.7) + (max * 0.3)),
  };
}

function highestRisk(levels: Array<"low" | "medium" | "high">): "low" | "medium" | "high" {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

function jaccardScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function ratioSimilarity(left: number, right: number) {
  if (left <= 0 || right <= 0) return 0;
  const ratio = Math.min(left, right) / Math.max(left, right);
  return clamp01(ratio);
}

function dedupeById(records: EntityRecord[]) {
  const ids = new Set<string>();
  const deduped: EntityRecord[] = [];
  for (const record of records) {
    const id = String(record.id || "");
    if (!id || ids.has(id)) continue;
    ids.add(id);
    deduped.push(record);
  }
  return deduped;
}

function readCached<T>(cache: Map<string, T>, key: string, load: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = load();
  cache.set(key, value);
  return value;
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function percentile(sortedValues: number[], point: number) {
  if (sortedValues.length === 0) return 0;
  const position = clamp(point, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return percentile(sorted, 0.5);
}

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function compactJoin(values: string[]) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(" - ");
}

function dateValue(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}
