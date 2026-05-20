import React from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/helpers";

function signedCurrency(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? "+" : ""}${formatCurrency(amount)}`;
}

export default function QuoteComparisonView({ comparison }) {
  if (!comparison) return <Card className="p-4"><p className="text-sm text-muted-foreground">Select another option to compare totals, margins, and changed line items.</p></Card>;
  const changedItems = Array.isArray(comparison.changed_items) ? comparison.changed_items.slice(0, 12) : [];
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Version comparison</p>
          <h3 className="font-heading text-lg font-semibold">{comparison.base_quote?.option_name || "Base"} vs {comparison.compare_quote?.option_name || "Option"}</h3>
        </div>
        <p className="text-sm font-semibold">{signedCurrency(comparison.deltas?.total || 0)}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Total" value={signedCurrency(comparison.deltas?.total)} />
        <Metric label="Margin" value={`${Number(comparison.deltas?.gross_margin_percent || 0).toFixed(1)}%`} />
        <Metric label="Labour" value={signedCurrency(comparison.deltas?.labour_total)} />
        <Metric label="Line count" value={comparison.deltas?.line_item_count > 0 ? `+${comparison.deltas.line_item_count}` : String(comparison.deltas?.line_item_count || 0)} />
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Changed item</th><th className="px-3 py-2 text-left">Change</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Option</th><th className="px-3 py-2 text-right">Delta</th></tr>
          </thead>
          <tbody>
            {changedItems.length === 0 ? <tr><td className="px-3 py-3 text-muted-foreground" colSpan={5}>No pricing line differences detected.</td></tr> : changedItems.map((item) => (
              <tr key={`${item.change_type}-${item.key}`} className="border-t">
                <td className="px-3 py-2">{item.description}</td><td className="px-3 py-2 capitalize text-muted-foreground">{String(item.change_type || "").replace(/_/g, " ")}</td><td className="px-3 py-2 text-right">{formatCurrency(item.base_total || 0)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.compare_total || 0)}</td><td className="px-3 py-2 text-right font-semibold">{signedCurrency(item.delta_total || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-lg border bg-white/65 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

