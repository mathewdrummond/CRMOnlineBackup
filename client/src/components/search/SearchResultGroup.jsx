import { FileText, FolderSearch, Lightbulb, Navigation, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const GROUP_META = {
  entities: { label: "Entities", icon: Search },
  files: { label: "Files", icon: FileText },
  insights: { label: "AI Insights", icon: Lightbulb },
  actions: { label: "Quick Actions", icon: Navigation },
  all: { label: "Results", icon: FolderSearch },
};

export default function SearchResultGroup({ groupKey = "all", items = [], activeId, onOpen, onHover }) {
  if (!items.length) return null;
  const meta = GROUP_META[groupKey] || GROUP_META.all;
  const Icon = meta.icon;

  return (
    <section className="py-2" aria-label={meta.label}>
      <div className="flex items-center gap-2 px-4 pb-1 pt-1 text-[11px] font-semibold uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{meta.label}</span>
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-search-result-id={item.id}
          onMouseEnter={() => onHover?.(item.id)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => item.href && onOpen?.(item.href)}
          className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
            activeId === item.id ? "bg-primary/8" : "hover:bg-muted/55"
          }`}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
            {item.subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
            {item.snippet ? <span className="mt-1 block line-clamp-2 text-xs leading-4 text-muted-foreground">{item.snippet}</span> : null}
          </span>
          <Badge variant="secondary" className="shrink-0 rounded-md text-[10px] uppercase">
            {item.type}
          </Badge>
        </button>
      ))}
    </section>
  );
}
