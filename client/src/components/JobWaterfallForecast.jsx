import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import StatusBadge from "./StatusBadge";
import { formatDate } from "../lib/helpers";
import { forecastJobWaterfall } from "../lib/jobWaterfallForecast";

function formatHours(hours) {
  return `${Number(hours || 0).toFixed(Number(hours || 0) % 1 === 0 ? 0 : 1)}h`;
}

export default function JobWaterfallForecast({ job, operations = [], allOperations = [], roleMappings = [] }) {
  const forecast = useMemo(() => (
    forecastJobWaterfall({ job, currentOperations: operations, allOperations, roleMappings })
  ), [job, operations, allOperations, roleMappings]);

  if (!operations.length) {
    return (
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-2">Delivery Forecast</h3>
        <p className="text-sm text-muted-foreground">Add operations or workflow tasks to generate a delivery forecast for this job.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="job-waterfall-view">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Projected Completion</p>
          <p className="text-lg font-semibold" data-testid="job-waterfall-completion">
            {formatDate(forecast.projectedCompletionDate)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Based on live workload, dependencies, and business capacity.</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tasks</p>
          <p className="text-lg font-semibold">{forecast.summary.totalTasks}</p>
          <p className="text-xs text-muted-foreground mt-1">{forecast.summary.completedTasks} complete</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Blocked</p>
          <p className="text-lg font-semibold">{forecast.summary.blockedTasks}</p>
          <p className="text-xs text-muted-foreground mt-1">Waiting on earlier phases or approvals.</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Capacity Constraints</p>
          <p className="text-lg font-semibold">{forecast.summary.constrainedTasks}</p>
          <p className="text-xs text-muted-foreground mt-1">Tasks pushed by current workload.</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/10 px-5 py-4">
          <h3 className="font-semibold text-sm">Delivery Forecast</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Forecast dates use workflow dependencies, scheduled work already in the business, role capacity, and normal working hours.
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[320px_minmax(560px,1fr)] border-b bg-muted/20">
              <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Task Forecast
              </div>
              <div
                className="grid gap-px bg-border/40"
                style={{ gridTemplateColumns: `repeat(${Math.max(forecast.days.length, 1)}, minmax(32px, 1fr))` }}
              >
                {forecast.days.map((day) => (
                  <div
                    key={day.dateKey}
                    className={`px-1 py-2 text-center text-[10px] ${day.isToday ? "bg-primary/10 text-foreground" : "bg-background text-muted-foreground"}`}
                  >
                    <div className="font-semibold">{day.shortLabel}</div>
                    <div>{day.weekLabel}</div>
                    <div>{day.monthLabel}</div>
                  </div>
                ))}
              </div>
            </div>

            {forecast.phases.map((phase) => (
              <div key={phase.phaseKey || phase.phaseLabel}>
                <div className="grid grid-cols-[320px_minmax(560px,1fr)] border-b bg-muted/10">
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={phase.phaseLabel} color={phase.phaseColor} />
                      <span className="text-xs text-muted-foreground">{phase.rows.length} task{phase.rows.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <div className="px-5 py-3 text-xs text-muted-foreground">
                    Dependencies and workload are calculated across the full business before these dates are shown.
                  </div>
                </div>

                {phase.rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[320px_minmax(560px,1fr)] border-b last:border-b-0"
                    data-testid={`job-waterfall-row-${row.id}`}
                  >
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{row.taskName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.roleLabel}
                            {row.assignee ? ` · ${row.assignee}` : ""}
                            {row.operationLabel ? ` · ${row.operationLabel}` : ""}
                          </p>
                        </div>
                        <StatusBadge label={row.statusLabel} color={row.status === "complete" ? "emerald" : row.status === "in_progress" ? "blue" : row.status === "ready" ? "amber" : "slate"} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge label={row.risk.label} color={row.risk.color} />
                        {row.isBlocked && <StatusBadge label="Blocked" color="slate" />}
                        {row.manualOverride && <StatusBadge label="Manual start" color="purple" />}
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>Duration: {formatHours(row.estimatedHours)}{row.actualHours > 0 ? ` · ${formatHours(row.actualHours)} actual` : ""}</p>
                        <p>Forecast: {formatDate(row.forecastStartDate)} → {formatDate(row.forecastFinishDate)}</p>
                        {row.baselineStartDate && (
                          <p>Baseline: {formatDate(row.baselineStartDate)} → {formatDate(row.baselineFinishDate || row.baselineStartDate)}</p>
                        )}
                        {row.dependencyNames.length > 0 && <p>Depends on: {row.dependencyNames.join(", ")}</p>}
                        <p>{row.reason}</p>
                      </div>
                    </div>

                    <div className="px-4 py-4">
                      <div
                        className="grid gap-px rounded-lg bg-border/40"
                        style={{ gridTemplateColumns: `repeat(${Math.max(forecast.days.length, 1)}, minmax(32px, 1fr))` }}
                      >
                        {forecast.days.map((day) => (
                          <div
                            key={`${row.id}-${day.dateKey}`}
                            className={`h-16 bg-background ${day.isToday ? "bg-primary/5" : ""}`}
                          />
                        ))}
                        <div
                          className="pointer-events-none row-start-1 flex items-center px-1"
                          style={{ gridColumn: `${row.startIndex + 1} / span ${Math.max(row.spanDays, 1)}` }}
                        >
                          <div className={`w-full rounded-lg border px-3 py-2 shadow-sm ${
                            row.risk.color === "red"
                              ? "border-red-300 bg-red-50"
                              : row.risk.color === "amber"
                                ? "border-amber-300 bg-amber-50"
                                : "border-emerald-300 bg-emerald-50"
                          }`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold">{row.taskName}</span>
                              <span className="text-[10px] text-muted-foreground">{formatHours(row.estimatedHours)}</span>
                            </div>
                            <div className="mt-1 truncate text-[10px] text-muted-foreground">
                              {formatDate(row.forecastStartDate)} → {formatDate(row.forecastFinishDate)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
