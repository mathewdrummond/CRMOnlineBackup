import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/helpers";
import { formatHours, formatPercent } from "@/lib/reporting/reportingUtils";
import { cn } from "@/lib/utils";

function formatValue(value, type) {
  if (type === "currency") {
    return formatCurrency(value);
  }
  if (type === "hours") {
    return formatHours(value);
  }
  if (type === "percent") {
    return formatPercent(value);
  }
  if (type === "number") {
    return Number(value || 0).toLocaleString("en-NZ");
  }

  return String(value ?? "—");
}

export default function ReportKpiGrid({ items = [], onOpenDrilldown }) {
  if (!items.length) {
    return null;
  }

  const gridClass = items.length <= 3 ? "xl:grid-cols-3" : "xl:grid-cols-4";

  return (
    <div className={cn("grid gap-4 md:grid-cols-2", gridClass)}>
      {items.map((item) => {
        const interactive = typeof onOpenDrilldown === "function" && Array.isArray(item?.source_records) && item.source_records.length > 0;
        const content = (
          <Card className={cn("rounded-2xl border-border/80 p-5 shadow-sm", interactive && "cursor-pointer transition hover:border-primary/50 hover:shadow-md")}>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {item.title}
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {formatValue(item.value, item.type)}
            </div>
            {item.subtitle ? (
              <p className="mt-2 text-sm text-muted-foreground">{item.subtitle}</p>
            ) : null}
          </Card>
        );

        if (!interactive) {
          return <div key={item.key}>{content}</div>;
        }

        return (
          <button
            key={item.key}
            type="button"
            className="text-left"
            onClick={() => onOpenDrilldown({
              title: item.title,
              records: item.source_records,
            })}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
