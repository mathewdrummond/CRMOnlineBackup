import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/helpers";

export default function QuoteVersionCard({ version, active, onCompare, onMarkPrimary, onArchive }) {
  const summary = version.version_summary || {};
  const label = version.option_label || version.quote_option_name || `Version ${version.quote_version_number || 1}`;
  return (
    <div className={`rounded-lg border p-3 ${active ? "border-[#7e9272] bg-[#e6ece0]/60" : "border-border/60 bg-white/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/quotes/${version.id}`} className="font-heading text-sm font-semibold text-foreground hover:underline">{label}</Link>
            {version.is_primary_version ? <StatusBadge label="Primary" color="green" /> : null}
            {version.is_archived_version ? <StatusBadge label="Archived" color="slate" /> : null}
            {String(version.version_status || "") === "accepted" ? <StatusBadge label="Accepted" color="emerald" /> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{version.quote_number || "Quote"} · {version.title || "Untitled quote"}</p>
        </div>
        <p className="shrink-0 text-right text-sm font-semibold">{formatCurrency(summary.total || version.total || 0)}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span>Margin {Number(summary.gross_margin_percent || 0).toFixed(1)}%</span>
        <span>Lines {summary.line_item_count || 0}</span>
        <span>Labour {formatCurrency(summary.labour_total || 0)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!active ? <Button type="button" size="sm" variant="outline" onClick={() => onCompare?.(version)}>Compare</Button> : null}
        {!version.is_primary_version ? <Button type="button" size="sm" variant="outline" onClick={() => onMarkPrimary?.(version)}>Mark primary</Button> : null}
        {!version.is_archived_version && String(version.version_status || "") !== "accepted" ? <Button type="button" size="sm" variant="ghost" onClick={() => onArchive?.(version)}>Archive</Button> : null}
      </div>
    </div>
  );
}

