import AIAnswerPanel from "./AIAnswerPanel";
import SearchContextPreview from "./SearchContextPreview";
import SearchResultGroup from "./SearchResultGroup";
import SuggestedActionCard from "./SuggestedActionCard";

export default function SearchResultsPanel({
  response,
  loading,
  query,
  activeId,
  onOpen,
  onHover,
  onSuggestion,
}) {
  const groups = response?.groups || {};
  const hasResults = Object.values(groups).some((items) => Array.isArray(items) && items.length > 0);

  return (
    <div className="max-h-[min(78vh,46rem)] overflow-y-auto" role="listbox" aria-label="Unified search results">
      <SearchContextPreview intent={response?.intent} diagnostics={response?.diagnostics} />
      <AIAnswerPanel answer={response?.answer} onOpen={onOpen} />

      {loading ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">Searching operational records, indexed files, and semantic evidence...</div>
      ) : hasResults ? (
        <div className="divide-y divide-border/70">
          <SearchResultGroup groupKey="entities" items={groups.entities || []} activeId={activeId} onOpen={onOpen} onHover={onHover} />
          <SearchResultGroup groupKey="files" items={groups.files || []} activeId={activeId} onOpen={onOpen} onHover={onHover} />
          <SearchResultGroup groupKey="insights" items={groups.insights || []} activeId={activeId} onOpen={onOpen} onHover={onHover} />
          <SearchResultGroup groupKey="actions" items={groups.actions || []} activeId={activeId} onOpen={onOpen} onHover={onHover} />
        </div>
      ) : query?.trim()?.length >= 2 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          No permission-visible records or indexed evidence matched this search.
        </div>
      ) : (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Search jobs, quotes, contacts, suppliers, files, workflow notes, or ask an operational question.
        </div>
      )}

      {Array.isArray(response?.suggestions) && response.suggestions.length > 0 ? (
        <div className="border-t bg-muted/20 px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Suggested operational prompts</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {response.suggestions.map((suggestion) => (
              <SuggestedActionCard key={suggestion.id} suggestion={suggestion} onSelect={onSuggestion} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
