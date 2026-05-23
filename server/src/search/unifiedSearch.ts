import { createEntityRecord } from "../db";
import type { LocalUser } from "../types";
import { classifySearchIntent } from "./intentClassifier";
import { answerOperationalQuery } from "./operationalQueryEngine";
import { searchEntities } from "./entitySearch";
import { runSemanticSearch } from "./semanticSearchRouter";
import { groupSearchResults, rankSearchResults } from "./searchRanking";
import { buildSearchSuggestions } from "./searchSuggestions";
import { getEnabledModuleSet, type UnifiedSearchInput } from "./searchContext";

export async function runUnifiedSearch(input: UnifiedSearchInput, context: { user: LocalUser | null; requestId: string }) {
  const started = Date.now();
  const enabledModules = getEnabledModuleSet();
  const intent = classifySearchIntent(input.query);
  const directStarted = Date.now();
  const directItems = searchEntities(input, { user: context.user, enabledModules });
  const directMs = Date.now() - directStarted;

  const semantic = intent.requiresSemantic || input.include_ai
    ? await runSemanticSearch(input, { user: context.user, enabledModules, requestId: context.requestId })
    : { items: [], evidence: [], diagnostics: { semantic_ms: 0, knowledge_ms: 0, degraded: false, errors: [] as string[] } };

  const ranked = rankSearchResults([...directItems, ...semantic.items], input.limit || 16);
  const evidence = [
    ...semantic.evidence,
    ...directItems
      .filter((item) => item.snippet && item.score >= 0.55)
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        title: item.title,
        snippet: item.snippet || "",
        href: item.href,
        source_type: item.kind === "file" ? "file" as const : "entity" as const,
        score: item.score,
      })),
  ].slice(0, 8);

  const answer = await answerOperationalQuery(input, intent, evidence, {
    user: context.user,
    enabledModules,
    requestId: context.requestId,
  });

  const suggestions = buildSearchSuggestions(input, ranked);
  const diagnostics = {
    total_ms: Date.now() - started,
    direct_ms: directMs,
    semantic_ms: semantic.diagnostics.semantic_ms,
    degraded: semantic.diagnostics.degraded || answer.status === "unavailable",
    errors: semantic.diagnostics.errors,
    result_count: ranked.length,
    evidence_count: evidence.length,
    ai_latency_ms: answer.latency_ms,
  };

  recordSearchAnalytics(input, intent.primary, diagnostics, answer.status).catch(() => undefined);

  return {
    query: input.query,
    intent,
    groups: groupSearchResults(ranked),
    results: ranked,
    answer,
    suggestions,
    diagnostics,
  };
}

async function recordSearchAnalytics(
  input: UnifiedSearchInput,
  intent: string,
  diagnostics: Record<string, unknown>,
  answerStatus: string
) {
  try {
    createEntityRecord("UnifiedSearchDiagnostic", {
      query: input.query.slice(0, 300),
      intent,
      answer_status: answerStatus,
      diagnostics,
      pathname: input.context?.pathname || "",
      created_at: new Date().toISOString(),
    }, {
      skip_audit: true,
      request_source: "unified-search",
    });
  } catch {
    // Diagnostics must never block operational search.
  }
}
