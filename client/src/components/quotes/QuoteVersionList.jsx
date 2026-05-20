import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import QuoteVersionCard from "./QuoteVersionCard";

export default function QuoteVersionList({ quote, family, loading, onCreate, onCompare, onMarkPrimary, onArchive }) {
  const versions = Array.isArray(family?.versions) ? family.versions : [];
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quote options</p>
          <h2 className="font-heading text-lg font-semibold">Version family</h2>
          <p className="mt-1 text-sm text-muted-foreground">Linked options recalculate, approve, and generate documents independently.</p>
        </div>
        <Button type="button" onClick={onCreate}>Create option</Button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {loading ? <p className="text-sm text-muted-foreground">Loading quote versions...</p> : versions.length === 0 ? (
          <QuoteVersionCard version={{ ...quote, option_label: "Primary", version_summary: { total: quote?.total || 0 } }} active />
        ) : versions.map((version) => (
          <QuoteVersionCard key={version.id} version={version} active={String(version.id) === String(quote?.id)} onCompare={onCompare} onMarkPrimary={onMarkPrimary} onArchive={onArchive} />
        ))}
      </div>
    </Card>
  );
}

