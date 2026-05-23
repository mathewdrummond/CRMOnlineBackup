import SearchResultsPanel from "./SearchResultsPanel";

export default function SearchOverlay({ id, ...props }) {
  if (!props.open) return null;

  return (
    <div
      id={id}
      className="absolute left-0 top-[calc(100%+0.65rem)] z-50 w-[min(44rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border/70 bg-popover shadow-jf-overlay"
      role="dialog"
      aria-modal="false"
      aria-label="Unified operational search"
    >
      <SearchResultsPanel {...props} />
    </div>
  );
}
