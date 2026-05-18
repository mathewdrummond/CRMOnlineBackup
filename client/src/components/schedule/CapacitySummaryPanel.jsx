import React from "react";
import { Card } from "@/components/ui/card";
import StatusBadge from "../StatusBadge";

function getTone(utilisationPercent) {
  if (utilisationPercent >= 110) {
    return { label: "Overbooked", color: "red" };
  }
  if (utilisationPercent >= 90) {
    return { label: "Tight", color: "amber" };
  }
  return { label: "Healthy", color: "emerald" };
}

export default function CapacitySummaryPanel({ rows = [] }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Lane Pressure</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Tightest visible lanes so workshop and install bottlenecks are easy to spot quickly.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">
          No lane capacity data is available for this view.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const tone = getTone(row.utilisationPercent);
            return (
              <div key={row.lane.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{row.lane.label}</p>
                      <StatusBadge label={tone.label} color={tone.color} className="text-[10px]" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[row.lane.lane_type || "staff", row.lane.workstation_name, row.lane.staff_name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{row.utilisationPercent}% utilised</p>
                    <p className="text-xs text-muted-foreground">{row.bookedHours.toFixed(1)}h booked / {row.capacityHours.toFixed(1)}h capacity</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`${row.utilisationPercent >= 110 ? "bg-red-500" : row.utilisationPercent >= 90 ? "bg-amber-500" : "bg-emerald-500"} h-full rounded-full`}
                    style={{ width: `${Math.min(row.utilisationPercent, 150)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{row.overloadDays} overload day{row.overloadDays === 1 ? "" : "s"}</span>
                  <span>{row.overloadHours.toFixed(1)}h overloaded</span>
                  {row.peakDay ? <span>Peak {row.peakDay.dateKey}: {row.peakDay.utilisationPercent}%</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
