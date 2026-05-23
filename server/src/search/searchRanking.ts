import type { UnifiedSearchItem } from "./searchContext";

const KIND_WEIGHT: Record<UnifiedSearchItem["kind"], number> = {
  entity: 0.16,
  file: 0.12,
  workflow: 0.1,
  semantic: 0.06,
  action: 0.04,
};

export function rankSearchResults(items: UnifiedSearchItem[], limit: number) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      ...item,
      score: Math.min(1, Number((Number(item.score || 0) + (KIND_WEIGHT[item.kind] || 0)).toFixed(4))),
    }))
    .sort((left, right) => right.score - left.score)
    .filter((item) => {
      const key = item.href || item.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function groupSearchResults(items: UnifiedSearchItem[]) {
  return {
    entities: items.filter((item) => item.kind === "entity"),
    files: items.filter((item) => item.kind === "file"),
    insights: items.filter((item) => item.kind === "semantic" || item.kind === "workflow"),
    actions: items.filter((item) => item.kind === "action"),
  };
}
