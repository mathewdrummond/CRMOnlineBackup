import type { UnifiedSearchInput, UnifiedSearchItem } from "./searchContext";

export type SearchSuggestion = {
  id: string;
  label: string;
  query: string;
  reason: string;
};

export function buildSearchSuggestions(input: UnifiedSearchInput, items: UnifiedSearchItem[]): SearchSuggestion[] {
  const pathname = String(input.context?.pathname || "");
  const suggestions: SearchSuggestion[] = [];

  if (pathname.startsWith("/quotes/")) {
    suggestions.push(
      { id: "similar-quotes", label: "Find similar historical jobs", query: "Find similar historical jobs for this quote", reason: "quote_context" },
      { id: "supplier-pricing", label: "Show supplier pricing changes", query: "Show supplier pricing changes for this quote", reason: "quote_context" },
      { id: "quote-summary", label: "Generate AI quote summary", query: "Summarise this quote with source references", reason: "quote_context" }
    );
  } else if (pathname.startsWith("/jobs/")) {
    suggestions.push(
      { id: "install-issues", label: "Find install issues", query: "Find install issues and delays for this job", reason: "job_context" },
      { id: "labour-overruns", label: "Show labour overruns", query: "Show labour overruns and supporting time entries", reason: "job_context" },
      { id: "supplier-discussions", label: "Retrieve supplier discussions", query: "Retrieve supplier discussions for this job", reason: "job_context" }
    );
  }

  if (items.length === 0) {
    suggestions.push(
      { id: "files", label: "Search indexed files", query: input.query ? `Files mentioning ${input.query}` : "Search indexed files", reason: "no_results" },
      { id: "issues", label: "Ask operational question", query: input.query ? `What records mention ${input.query}?` : "What operational issues need attention?", reason: "no_results" }
    );
  }

  suggestions.push(
    { id: "plumbing-delays", label: "Plumbing delays", query: "What jobs had plumbing delays?", reason: "operational_prompt" },
    { id: "curved-islands", label: "Curved island notes", query: "Show me install notes mentioning curved islands", reason: "operational_prompt" }
  );

  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.id)) return false;
    seen.add(suggestion.id);
    return true;
  }).slice(0, 6);
}
