import { z } from "zod";
import { generateStructured } from "../ai/aiClient";
import { buildJsonOnlyPrompt } from "../ai/promptTemplates";
import { AiServiceError } from "../ai/aiTypes";
import type { ClassifiedSearchIntent } from "./intentClassifier";
import type { SearchEvidence, UnifiedSearchContext, UnifiedSearchInput } from "./searchContext";

const groundedAnswerSchema = z.object({
  answer: z.string().max(1200),
  confidence: z.enum(["high", "medium", "low"]),
  unsupported: z.boolean(),
  follow_up_queries: z.array(z.string().max(140)).max(4).optional(),
}).strict();

export type GroundedAiAnswer = {
  status: "ready" | "insufficient_evidence" | "unavailable" | "skipped";
  answer: string;
  confidence: "high" | "medium" | "low";
  sources: SearchEvidence[];
  latency_ms: number;
  model?: string;
  follow_up_queries: string[];
};

export async function answerOperationalQuery(
  input: UnifiedSearchInput,
  intent: ClassifiedSearchIntent,
  evidence: SearchEvidence[],
  context: UnifiedSearchContext
): Promise<GroundedAiAnswer> {
  const started = Date.now();

  if (!input.include_ai && !intent.requiresAi) {
    return skipped("AI answer not required for this query.", evidence, started);
  }

  const usableEvidence = evidence
    .filter((source) => source.snippet.trim().length > 20 && source.score >= 0.25)
    .slice(0, 6);

  if (usableEvidence.length < 2 && intent.requiresAi) {
    return {
      status: "insufficient_evidence",
      answer: "I could not find enough indexed evidence to answer that operational question reliably.",
      confidence: "low",
      sources: usableEvidence,
      latency_ms: Date.now() - started,
      follow_up_queries: ["Search indexed files", "Try a narrower job, supplier, or material name"],
    };
  }

  if (usableEvidence.length === 0) {
    return skipped("No retrieval evidence was available for a grounded answer.", [], started);
  }

  try {
    const response = await generateStructured({
      modelRole: "fast",
      requestId: context.requestId,
      timeoutMs: 90_000,
      retries: 0,
      temperature: 0,
      prompt: buildJsonOnlyPrompt(
        [
          "Answer the JoinerFlow operational search query using only the supplied evidence.",
          "Do not invent job, quote, supplier, labour, pricing, or file facts.",
          "If the evidence is weak or partial, state that clearly.",
          "Keep the answer concise and operational. Mention only facts supported by evidence.",
        ].join("\n"),
        "{ answer: string, confidence: 'high' | 'medium' | 'low', unsupported: boolean, follow_up_queries?: string[] }",
        {
          query: input.query,
          intent: intent.primary,
          evidence: usableEvidence.map((source, index) => ({
            ref: index + 1,
            title: source.title,
            snippet: source.snippet,
            type: source.source_type,
            score: source.score,
          })),
        }
      ),
      schema: groundedAnswerSchema,
      schemaName: "GroundedOperationalAnswer",
    });

    return {
      status: response.data.unsupported ? "insufficient_evidence" : "ready",
      answer: response.data.answer,
      confidence: response.data.unsupported ? "low" : response.data.confidence,
      sources: usableEvidence,
      latency_ms: Date.now() - started,
      model: response.model,
      follow_up_queries: response.data.follow_up_queries || [],
    };
  } catch (error) {
    const normalized = error instanceof AiServiceError ? error.code : "ai_unavailable";
    if (usableEvidence.length > 0) {
      return {
        status: "insufficient_evidence",
        answer: buildEvidenceFallbackAnswer(normalized, usableEvidence),
        confidence: "low",
        sources: usableEvidence,
        latency_ms: Date.now() - started,
        follow_up_queries: ["Try a narrower job, customer, file, or supplier name"],
      };
    }
    return {
      status: "unavailable",
      answer: `AI answer generation is unavailable (${normalized}). Search results and source evidence are still shown.`,
      confidence: "low",
      sources: usableEvidence,
      latency_ms: Date.now() - started,
      follow_up_queries: [],
    };
  }
}

function buildEvidenceFallbackAnswer(reason: string, evidence: SearchEvidence[]) {
  const topMatches = evidence
    .slice(0, 3)
    .map((source) => source.title)
    .filter(Boolean);
  if (topMatches.length === 0) {
    return `The answer model could not return a structured response (${reason}), but indexed evidence was found.`;
  }
  return [
    `The answer model could not return a structured response (${reason}), but indexed evidence was found.`,
    `Top matches: ${topMatches.join("; ")}.`,
    "Open the listed sources to verify the operational answer before relying on it.",
  ].join(" ");
}

function skipped(answer: string, sources: SearchEvidence[], started: number): GroundedAiAnswer {
  return {
    status: "skipped",
    answer,
    confidence: sources.length > 0 ? "medium" : "low",
    sources,
    latency_ms: Date.now() - started,
    follow_up_queries: [],
  };
}
