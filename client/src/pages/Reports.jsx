import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { useModules } from "@/lib/ModuleContext";
import { useAuth } from "@/lib/AuthContext";
import ReportDrilldownDrawer from "@/components/reports/ReportDrilldownDrawer";
import ReportFilters from "@/components/reports/ReportFilters";
import ReportKpiGrid from "@/components/reports/ReportKpiGrid";
import ReportResultsTable from "@/components/reports/ReportResultsTable";
import ReportViewsBar from "@/components/reports/ReportViewsBar";
import { getReportingDatasetSnapshot, loadReportingDatasets } from "@/lib/reporting/reportingData";
import {
  getAvailablePacks,
  getDefaultReportState,
  getPackReports,
  getReportDefinition,
} from "@/lib/reporting/reportDefinitions";
import {
  buildActiveFilterBadges,
  buildFilterOptions,
  cloneReportFilters,
  groupReportRows,
  paginateRows,
  sortReportRows,
  applyReportFilters,
} from "@/lib/reporting/reportingUtils";
import {
  buildReportViewPayload,
  createReportView,
  deleteReportView,
  extractReportViewState,
  listReportViews,
  normalizeReportViewRecord,
  renameReportView,
  setDefaultReportView,
  updateReportView,
} from "@/lib/reporting/reportingPersistence";

const ReportChartPanel = lazy(() => import("@/components/reports/ReportChartPanel"));

function buildModuleFlags(isModuleEnabled) {
  return {
    leadsEnabled: isModuleEnabled("leads"),
    quotesEnabled: isModuleEnabled("quotes"),
    contactsEnabled: isModuleEnabled("contacts"),
    suppliersEnabled: isModuleEnabled("suppliers"),
  };
}

function serializeState(state) {
  return JSON.stringify({
    packKey: state.packKey,
    reportKey: state.reportKey,
    filters: state.filters,
    grouping: state.grouping,
    sort: state.sort,
    visibleColumns: [...(state.visibleColumns || [])].sort(),
  });
}

function getInitialReportState(moduleFlags) {
  const availablePacks = getAvailablePacks(moduleFlags);
  const firstPack = availablePacks[0];
  const firstReport = firstPack ? getPackReports(firstPack.key, moduleFlags)[0] : getReportDefinition();
  return getDefaultReportState(firstReport.key);
}

function normalizeVisibleColumns(definition, nextVisibleColumns = []) {
  const allowedColumns = new Set((definition?.columns || []).map((column) => column.key));
  const filtered = nextVisibleColumns.filter((key) => allowedColumns.has(key));
  if (filtered.length > 0) {
    return filtered;
  }

  return definition?.columns?.slice(0, 7).map((column) => column.key) || [];
}

function buildCurrentReportState({ packKey, reportKey, filters, grouping, sort, visibleColumns }) {
  return {
    packKey,
    reportKey,
    filters: cloneReportFilters(filters),
    grouping,
    sort: {
      column: String(sort?.column || "").trim(),
      direction: sort?.direction === "asc" ? "asc" : "desc",
    },
    visibleColumns: [...(visibleColumns || [])],
  };
}

function ReportChartFallback() {
  return (
    <Card className="rounded-2xl border-border/80 p-5 shadow-sm">
      <div className="mb-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="h-[320px] animate-pulse rounded-xl bg-muted/20" />
    </Card>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const { isModuleEnabled } = useModules();
  const moduleFlags = useMemo(() => buildModuleFlags(isModuleEnabled), [isModuleEnabled]);
  const initialStateRef = useRef(getInitialReportState(moduleFlags));
  const [reportState, setReportState] = useState(initialStateRef.current);
  const [datasets, setDatasets] = useState(() => getReportingDatasetSnapshot(moduleFlags));
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");
  const [savedViews, setSavedViews] = useState([]);
  const [loadingViews, setLoadingViews] = useState(true);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [page, setPage] = useState(1);
  const [drilldown, setDrilldown] = useState({ open: false, title: "", records: [] });
  const [viewDialog, setViewDialog] = useState({
    open: false,
    mode: "create",
    name: "",
    description: "",
    setDefault: false,
  });
  const [exporting, setExporting] = useState(false);
  const didApplyInitialView = useRef(false);

  const availablePacks = useMemo(() => getAvailablePacks(moduleFlags), [moduleFlags]);
  const availablePackKey = availablePacks.some((pack) => pack.key === reportState.packKey)
    ? reportState.packKey
    : availablePacks[0]?.key || initialStateRef.current.packKey;
  const availableReports = useMemo(() => getPackReports(availablePackKey, moduleFlags), [availablePackKey, moduleFlags]);
  const activeReportKey = availableReports.some((report) => report.key === reportState.reportKey)
    ? reportState.reportKey
    : availableReports[0]?.key || initialStateRef.current.reportKey;
  const definition = useMemo(() => getReportDefinition(activeReportKey), [activeReportKey]);

  const reloadDatasets = async () => {
    setLoadingData(true);
    setDataError("");
    try {
      const nextDatasets = await loadReportingDatasets(moduleFlags);
      setDatasets(nextDatasets);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Reporting datasets could not be loaded.");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    setDatasets(getReportingDatasetSnapshot(moduleFlags));
    let cancelled = false;
    void (async () => {
      setLoadingData(true);
      setDataError("");
      try {
        const nextDatasets = await loadReportingDatasets(moduleFlags);
        if (!cancelled) {
          setDatasets(nextDatasets);
        }
      } catch (error) {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : "Reporting datasets could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [moduleFlags]);

  useEffect(() => {
    if (!user?.id) {
      setSavedViews([]);
      setLoadingViews(false);
      return;
    }

    let cancelled = false;
    setLoadingViews(true);
    listReportViews(user.id)
      .then((views) => {
        if (!cancelled) {
          setSavedViews(views);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingViews(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (didApplyInitialView.current || loadingViews) {
      return;
    }

    didApplyInitialView.current = true;
    const defaultView = savedViews.find((view) => view.is_default);
    if (defaultView) {
      const viewState = extractReportViewState(defaultView);
      if (viewState) {
        const nextDefinition = getReportDefinition(viewState.reportKey || defaultView.report_key);
        setReportState({
          packKey: viewState.packKey || nextDefinition.packKey,
          reportKey: viewState.reportKey || nextDefinition.key,
          filters: cloneReportFilters(viewState.filters || {}),
          grouping: viewState.grouping || nextDefinition.defaultGrouping || "none",
          sort: viewState.sort || { column: nextDefinition.columns[0]?.key || "label", direction: "desc" },
          visibleColumns: normalizeVisibleColumns(nextDefinition, viewState.visibleColumns),
        });
        setSelectedViewId(defaultView.id);
      }
    }
  }, [loadingViews, savedViews]);

  useEffect(() => {
    const nextDefinition = getReportDefinition(activeReportKey);
    setReportState((current) => ({
      ...current,
      packKey: availablePackKey,
      reportKey: activeReportKey,
      visibleColumns: normalizeVisibleColumns(nextDefinition, current.visibleColumns),
      sort: current.sort?.column && nextDefinition.columns.some((column) => column.key === current.sort.column)
        ? current.sort
        : {
            column: nextDefinition.columns[0]?.key || "label",
            direction: nextDefinition.defaultSort?.direction || "desc",
          },
    }));
  }, [activeReportKey, availablePackKey]);

  const baseRows = useMemo(
    () => definition.buildRows(datasets, { today: new Date(), modules: moduleFlags }),
    [datasets, definition, moduleFlags]
  );
  const filterOptions = useMemo(() => buildFilterOptions(baseRows, definition), [baseRows, definition]);
  const filteredRows = useMemo(() => applyReportFilters(baseRows, reportState.filters), [baseRows, reportState.filters]);
  const groupedRows = useMemo(
    () => groupReportRows(filteredRows, definition, reportState.grouping),
    [definition, filteredRows, reportState.grouping]
  );
  const sortedRows = useMemo(
    () => sortReportRows(groupedRows, definition, reportState.sort),
    [definition, groupedRows, reportState.sort]
  );
  const pagination = useMemo(
    () => paginateRows(sortedRows, page, 25),
    [page, sortedRows]
  );
  const visibleColumns = useMemo(
    () => normalizeVisibleColumns(definition, reportState.visibleColumns),
    [definition, reportState.visibleColumns]
  );
  const kpis = useMemo(() => definition.buildKpis(filteredRows, datasets), [datasets, definition, filteredRows]);
  const chart = useMemo(() => definition.buildChart(filteredRows, datasets), [datasets, definition, filteredRows]);
  const selectedView = useMemo(() => savedViews.find((view) => view.id === selectedViewId) || null, [savedViews, selectedViewId]);
  const currentState = useMemo(
    () => buildCurrentReportState({
      packKey: availablePackKey,
      reportKey: activeReportKey,
      filters: reportState.filters,
      grouping: reportState.grouping,
      sort: reportState.sort,
      visibleColumns,
    }),
    [activeReportKey, availablePackKey, reportState.filters, reportState.grouping, reportState.sort, visibleColumns]
  );
  const selectedViewState = useMemo(() => (selectedView ? extractReportViewState(selectedView) : null), [selectedView]);
  const hasUnsavedChanges = useMemo(
    () => (selectedViewState ? serializeState(selectedViewState) !== serializeState(currentState) : false),
    [currentState, selectedViewState]
  );
  const filterBadges = useMemo(() => buildActiveFilterBadges(reportState.filters, filterOptions), [filterOptions, reportState.filters]);

  useEffect(() => {
    setPage(1);
  }, [activeReportKey, availablePackKey, reportState.filters, reportState.grouping, reportState.sort]);

  const handlePackChange = (packKey) => {
    const packReports = getPackReports(packKey, moduleFlags);
    const nextReport = packReports[0];
    if (!nextReport) {
      return;
    }

    const nextState = getDefaultReportState(nextReport.key);
    setReportState(nextState);
    setSelectedViewId("");
  };

  const handleReportChange = (reportKey) => {
    const nextState = getDefaultReportState(reportKey);
    setReportState(nextState);
    setSelectedViewId("");
  };

  const handleFilterChange = (key, value) => {
    setReportState((current) => ({
      ...current,
      filters: {
        ...current.filters,
        [key]: value,
      },
    }));
  };

  const handleToggleColumn = (columnKey) => {
    setReportState((current) => {
      const nextColumns = current.visibleColumns.includes(columnKey)
        ? current.visibleColumns.filter((key) => key !== columnKey)
        : [...current.visibleColumns, columnKey];

      return {
        ...current,
        visibleColumns: normalizeVisibleColumns(definition, nextColumns),
      };
    });
  };

  const handleSortChange = (columnKey) => {
    setReportState((current) => ({
      ...current,
      sort: {
        column: columnKey,
        direction: current.sort.column === columnKey && current.sort.direction === "asc" ? "desc" : "asc",
      },
    }));
  };

  const handleReset = () => {
    const nextState = getDefaultReportState(activeReportKey);
    setReportState(nextState);
  };

  const handleOpenDrilldown = ({ title, records }) => {
    setDrilldown({
      open: true,
      title,
      records: Array.isArray(records) ? records : [],
    });
  };

  const refreshSavedViews = async () => {
    if (!user?.id) {
      return;
    }

    const nextViews = await listReportViews(user.id);
    setSavedViews(nextViews);
  };

  const openCreateDialog = () => {
    setViewDialog({
      open: true,
      mode: "create",
      name: `${definition.title}`,
      description: "",
      setDefault: false,
    });
  };

  const openRenameDialog = () => {
    if (!selectedView) {
      return;
    }

    setViewDialog({
      open: true,
      mode: "rename",
      name: selectedView.name,
      description: selectedView.description || "",
      setDefault: Boolean(selectedView.is_default),
    });
  };

  const closeViewDialog = () => {
    setViewDialog((current) => ({ ...current, open: false }));
  };

  const handleSubmitViewDialog = async () => {
    if (!user?.id || !viewDialog.name.trim()) {
      return;
    }

    try {
      if (viewDialog.mode === "rename" && selectedView) {
        const updated = await renameReportView(selectedView, viewDialog.name.trim());
        setSavedViews((current) => current.map((view) => (view.id === updated.id ? normalizeReportViewRecord(updated) : view)));
        toast({
          title: "Saved view renamed",
          description: `Updated "${updated.name}".`,
        });
        closeViewDialog();
        return;
      }

      const payload = buildReportViewPayload({
        name: viewDialog.name.trim(),
        description: viewDialog.description.trim(),
        reportState: {
          ...currentState,
          isDefault: viewDialog.setDefault,
        },
      });
      const created = await createReportView(payload);
      let nextViews = [...savedViews, created];
      if (viewDialog.setDefault) {
        await setDefaultReportView(created, nextViews);
        nextViews = await listReportViews(user.id);
      }
      setSavedViews(nextViews.map(normalizeReportViewRecord).filter(Boolean));
      setSelectedViewId(created.id);
      toast({
        title: "Saved view created",
        description: `Saved "${created.name}" for quick reuse.`,
      });
      closeViewDialog();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save view",
        description: error?.message || "The report view could not be saved.",
      });
    }
  };

  const handleSelectView = (viewId) => {
    if (!viewId) {
      setSelectedViewId("");
      return;
    }

    const nextView = savedViews.find((view) => view.id === viewId);
    if (!nextView) {
      return;
    }

    const nextState = extractReportViewState(nextView);
    const nextDefinition = getReportDefinition(nextState?.reportKey || nextView.report_key);
    setReportState({
      packKey: nextState?.packKey || nextDefinition.packKey,
      reportKey: nextState?.reportKey || nextDefinition.key,
      filters: cloneReportFilters(nextState?.filters || {}),
      grouping: nextState?.grouping || nextDefinition.defaultGrouping || "none",
      sort: nextState?.sort || { column: nextDefinition.columns[0]?.key || "label", direction: "desc" },
      visibleColumns: normalizeVisibleColumns(nextDefinition, nextState?.visibleColumns || []),
    });
    setSelectedViewId(nextView.id);
  };

  const handleUpdateSelectedView = async () => {
    if (!selectedView) {
      return;
    }

    try {
      const updated = await updateReportView(selectedView.id, buildReportViewPayload({
        name: selectedView.name,
        description: selectedView.description || "",
        reportState: {
          ...currentState,
          isDefault: Boolean(selectedView.is_default),
        },
      }));
      setSavedViews((current) => current.map((view) => (view.id === updated.id ? updated : view)));
      toast({
        title: "Saved view updated",
        description: `Updated "${updated.name}" with the current report state.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update view",
        description: error?.message || "The saved view could not be updated.",
      });
    }
  };

  const handleDeleteSelectedView = async () => {
    if (!selectedView) {
      return;
    }

    const confirmed = window.confirm(`Delete the saved view "${selectedView.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteReportView(selectedView.id);
      setSavedViews((current) => current.filter((view) => view.id !== selectedView.id));
      setSelectedViewId("");
      toast({
        title: "Saved view deleted",
        description: `Removed "${selectedView.name}".`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not delete view",
        description: error?.message || "The saved view could not be deleted.",
      });
    }
  };

  const handleSetDefaultSelectedView = async () => {
    if (!selectedView || !user?.id) {
      return;
    }

    try {
      await setDefaultReportView(selectedView, savedViews);
      await refreshSavedViews();
      toast({
        title: "Default saved view updated",
        description: `"${selectedView.name}" is now your default reporting view.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not set default view",
        description: error?.message || "The default saved view could not be updated.",
      });
    }
  };

  const handleExport = async (format) => {
    const visibleColumnDefinitions = definition.columns.filter((column) => visibleColumns.includes(column.key));
    const exportConfig = {
      title: `${definition.title}`,
      filtersSummary: filterBadges.map((badge) => badge.label).join(" · "),
      exportedAt: new Date().toLocaleString("en-NZ"),
      columns: visibleColumnDefinitions,
      rows: sortedRows,
      filename: `${definition.key}_${new Date().toISOString().slice(0, 10)}.${format === "xlsx" ? "xlsx" : format === "csv" ? "csv" : "html"}`,
    };

    setExporting(true);
    try {
      const { exportReportCsv, exportReportExcel, exportReportPdf } = await import("@/lib/reporting/reportingExports");
      if (format === "xlsx") {
        await exportReportExcel(exportConfig);
      } else if (format === "pdf") {
        await exportReportPdf(exportConfig);
      } else {
        await exportReportCsv(exportConfig);
      }
      toast({
        title: "Export started",
        description: `${definition.title} is being exported as ${format.toUpperCase()}.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "The report could not be exported.",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Reporting"
        subtitle="Operational, financial, and management reporting with saved views, drill-down, and export."
      />

      <div className="mx-auto max-w-[1600px] space-y-6">
        {dataError ? (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{dataError}</span>
              <Button type="button" variant="outline" onClick={() => void reloadDatasets()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <Tabs value={availablePackKey} onValueChange={handlePackChange}>
          <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl bg-muted/50 p-2">
            {availablePacks.map((pack) => (
              <TabsTrigger key={pack.key} value={pack.key} className="rounded-xl px-4 py-2">
                {pack.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid gap-4 xl:grid-cols-3">
          {availableReports.map((report) => (
            <button
              key={report.key}
              type="button"
              className={`rounded-2xl border p-5 text-left shadow-sm transition ${
                report.key === activeReportKey
                  ? "border-primary bg-primary/5"
                  : "border-border/80 bg-card hover:border-primary/40"
              }`}
              onClick={() => handleReportChange(report.key)}
            >
              <div className="text-sm font-semibold text-foreground">{report.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
            </button>
          ))}
        </div>

        <ReportViewsBar
          views={savedViews}
          selectedViewId={selectedViewId}
          selectedView={selectedView}
          hasUnsavedChanges={hasUnsavedChanges}
          onSelectView={handleSelectView}
          onSaveNew={openCreateDialog}
          onUpdateSelected={handleUpdateSelectedView}
          onRenameSelected={openRenameDialog}
          onDeleteSelected={handleDeleteSelectedView}
          onSetDefaultSelected={handleSetDefaultSelectedView}
          onExport={handleExport}
          exporting={exporting}
        />

        <ReportFilters
          definition={definition}
          filters={reportState.filters}
          filterOptions={filterOptions}
          grouping={reportState.grouping}
          sort={reportState.sort}
          visibleColumns={visibleColumns}
          onFilterChange={handleFilterChange}
          onGroupingChange={(value) => setReportState((current) => ({ ...current, grouping: value }))}
          onSortFieldChange={(value) => setReportState((current) => ({ ...current, sort: { ...current.sort, column: value } }))}
          onSortDirectionToggle={() => setReportState((current) => ({
            ...current,
            sort: {
              ...current.sort,
              direction: current.sort.direction === "asc" ? "desc" : "asc",
            },
          }))}
          onToggleColumn={handleToggleColumn}
          onReset={handleReset}
        />

        {loadingData && baseRows.length === 0 ? (
          <div className="grid gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Card key={index} className="rounded-2xl border-border/80 p-5 shadow-sm">
                <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
              </Card>
            ))}
          </div>
        ) : (
          <ReportKpiGrid items={kpis} onOpenDrilldown={handleOpenDrilldown} />
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Suspense fallback={<ReportChartFallback />}>
            <ReportChartPanel chart={chart} onOpenDrilldown={handleOpenDrilldown} />
          </Suspense>
          <Card className="rounded-2xl border-border/80 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-foreground">Current Report Context</h3>
            <p className="mt-2 text-sm text-muted-foreground">{definition.description}</p>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Pack:</span> {availablePacks.find((pack) => pack.key === availablePackKey)?.label}
              </div>
              <div>
                <span className="font-medium text-foreground">Saved View:</span> {selectedView ? selectedView.name : "Current report state"}
              </div>
              <div>
                <span className="font-medium text-foreground">Rows:</span> {sortedRows.length.toLocaleString("en-NZ")}
              </div>
              <div>
                <span className="font-medium text-foreground">Active Filters:</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {filterBadges.map((badge) => (
                    <span key={badge.key} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {loadingViews ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading saved views…</p>
            ) : null}
          </Card>
        </div>

        <ReportResultsTable
          definition={definition}
          rows={pagination.rows}
          visibleColumns={visibleColumns}
          sort={reportState.sort}
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalRows={pagination.totalRows}
          onSortChange={handleSortChange}
          onPageChange={setPage}
          onOpenDrilldown={handleOpenDrilldown}
        />
      </div>

      <ReportDrilldownDrawer
        open={drilldown.open}
        onOpenChange={(open) => setDrilldown((current) => ({ ...current, open }))}
        drilldown={drilldown}
      />

      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog((current) => ({ ...current, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewDialog.mode === "rename" ? "Rename Saved View" : "Save Report View"}</DialogTitle>
            <DialogDescription>
              Save the current report type, filters, grouping, sorting, and visible columns for fast reuse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-view-name">View Name</Label>
              <Input
                id="report-view-name"
                value={viewDialog.name}
                onChange={(event) => setViewDialog((current) => ({ ...current, name: event.target.value }))}
                placeholder="Example: Weekly install readiness"
              />
            </div>
            {viewDialog.mode !== "rename" ? (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="report-view-default"
                  checked={viewDialog.setDefault}
                  onCheckedChange={(checked) => setViewDialog((current) => ({ ...current, setDefault: Boolean(checked) }))}
                />
                <Label htmlFor="report-view-default">Set as my default saved view</Label>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeViewDialog}>Cancel</Button>
            <Button type="button" onClick={handleSubmitViewDialog} disabled={!viewDialog.name.trim()}>
              {viewDialog.mode === "rename" ? "Rename" : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
