export type SearchIntent =
  | "entity_search"
  | "direct_lookup"
  | "file_search"
  | "semantic_retrieval"
  | "operational_question"
  | "workflow_lookup"
  | "ai_business_query"
  | "navigation";

export type ClassifiedSearchIntent = {
  primary: SearchIntent;
  intents: SearchIntent[];
  confidence: number;
  reasons: string[];
  requiresAi: boolean;
  requiresSemantic: boolean;
  requiresKnowledge: boolean;
};

const QUESTION_PREFIXES = /^(what|which|who|when|where|why|how|show me|find|list|summari[sz]e|explain|compare)\b/i;
const DIRECT_LOOKUP = /\b(job|quote|po|invoice)\s*#?\s*[a-z]*-?\d{2,}\b/i;
const FILE_TERMS = /\b(file|files|pdf|docx|document|attachment|drawing|plans?|install notes?|site measure|email)\b/i;
const WORKFLOW_TERMS = /\b(workflow|handover|install|procurement|approval|variation|change order|task|schedule|labou?r|overrun|delay|risk|issue)\b/i;
const AI_TERMS = /\b(similar|why|issues?|had|caused|summar(?:y|ise|ize)|overruns?|delays?|patterns?|compare|knowledge|discussions?)\b/i;
const NAV_TERMS = /^(open|go to|take me to|navigate to)\b/i;

export function classifySearchIntent(rawQuery: string): ClassifiedSearchIntent {
  const query = String(rawQuery || "").trim();
  const lower = query.toLowerCase();
  const intents = new Set<SearchIntent>();
  const reasons: string[] = [];

  if (!query) {
    return {
      primary: "entity_search",
      intents: ["entity_search"],
      confidence: 0.2,
      reasons: ["empty_query"],
      requiresAi: false,
      requiresSemantic: false,
      requiresKnowledge: false,
    };
  }

  intents.add("entity_search");
  reasons.push("entity_search_default");

  if (DIRECT_LOOKUP.test(query)) {
    intents.add("direct_lookup");
    reasons.push("direct_lookup_pattern");
  }

  if (NAV_TERMS.test(query)) {
    intents.add("navigation");
    reasons.push("navigation_verb");
  }

  if (FILE_TERMS.test(query)) {
    intents.add("file_search");
    intents.add("semantic_retrieval");
    reasons.push("file_terms");
  }

  if (WORKFLOW_TERMS.test(query)) {
    intents.add("workflow_lookup");
    intents.add("semantic_retrieval");
    reasons.push("workflow_terms");
  }

  if (QUESTION_PREFIXES.test(query) || query.includes("?")) {
    intents.add("operational_question");
    intents.add("ai_business_query");
    intents.add("semantic_retrieval");
    reasons.push("question_shape");
  }

  if (AI_TERMS.test(lower) && query.split(/\s+/).length >= 3) {
    intents.add("ai_business_query");
    intents.add("semantic_retrieval");
    reasons.push("business_analysis_terms");
  }

  const ordered = orderIntents([...intents]);
  const primary = pickPrimary(ordered);
  const requiresAi = ordered.includes("ai_business_query") || ordered.includes("operational_question");
  const requiresKnowledge = ordered.includes("file_search") || ordered.includes("operational_question") || ordered.includes("ai_business_query");
  const requiresSemantic = ordered.includes("semantic_retrieval") || requiresKnowledge;

  return {
    primary,
    intents: ordered,
    confidence: scoreIntentConfidence(primary, reasons),
    reasons,
    requiresAi,
    requiresSemantic,
    requiresKnowledge,
  };
}

function orderIntents(intents: SearchIntent[]) {
  const priority: SearchIntent[] = [
    "direct_lookup",
    "navigation",
    "operational_question",
    "ai_business_query",
    "workflow_lookup",
    "file_search",
    "semantic_retrieval",
    "entity_search",
  ];
  return priority.filter((intent) => intents.includes(intent));
}

function pickPrimary(intents: SearchIntent[]): SearchIntent {
  if (intents.includes("direct_lookup")) return "direct_lookup";
  if (intents.includes("navigation")) return "navigation";
  if (intents.includes("operational_question")) return "operational_question";
  if (intents.includes("ai_business_query")) return "ai_business_query";
  if (intents.includes("workflow_lookup")) return "workflow_lookup";
  if (intents.includes("file_search")) return "file_search";
  if (intents.includes("semantic_retrieval")) return "semantic_retrieval";
  return "entity_search";
}

function scoreIntentConfidence(primary: SearchIntent, reasons: string[]) {
  let score = primary === "entity_search" ? 0.58 : 0.68;
  score += Math.min(0.22, reasons.length * 0.05);
  if (reasons.includes("direct_lookup_pattern")) score += 0.15;
  if (reasons.includes("question_shape")) score += 0.1;
  return Math.min(0.96, Number(score.toFixed(2)));
}
