import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  Download,
  FolderTree,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  ShieldAlert,
  Trash2,
  Wrench,
} from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/helpers";

function formatBytes(value) {
  const size = Number(value || 0);
  if (size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const scaled = size / (1024 ** exponent);
  return `${scaled.toFixed(scaled >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function downloadBlob(payload, fallbackFileName) {
  const blob = payload?.blob instanceof Blob ? payload.blob : null;
  if (!blob) {
    throw new Error("Download data was empty.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName || fallbackFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const INITIAL_BACKUP_FORM = {
  label: "",
  note: "",
  importSourcePath: "",
};

const INITIAL_RETENTION_FORM = {
  keepLatest: "10",
  appKeepEntries: "5000",
  securityKeepEntries: "5000",
};

export default function SystemHealth() {
  const [data, setData] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [aiError, setAiError] = useState("");
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [backupForm, setBackupForm] = useState(INITIAL_BACKUP_FORM);
  const [retentionForm, setRetentionForm] = useState(INITIAL_RETENTION_FORM);
  const [confirmAction, setConfirmAction] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const [nextDataResult, nextBackupsResult, nextAiResult] = await Promise.allSettled([
        crmApi.admin.getHealth(),
        crmApi.admin.listBackups(),
        crmApi.ai.health(),
      ]);
      if (nextDataResult.status === "rejected") {
        throw nextDataResult.reason;
      }
      setData(nextDataResult.value);
      setBackups(nextBackupsResult.status === "fulfilled" && Array.isArray(nextBackupsResult.value) ? nextBackupsResult.value : []);
      if (nextAiResult.status === "fulfilled") {
        setAiData(nextAiResult.value);
        setAiError("");
      } else {
        setAiData(null);
        setAiError(nextAiResult.reason instanceof Error ? nextAiResult.reason.message : "AI diagnostics unavailable.");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load system health.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summaryCards = useMemo(() => ([
    {
      key: "server",
      icon: Activity,
      label: "Server",
      value: data?.status || "unknown",
      detail: `v${data?.server_version || "unknown"} · up ${Math.round(Number(data?.uptime_seconds || 0) / 60)} min`,
    },
    {
      key: "database",
      icon: Database,
      label: "Database",
      value: formatBytes(data?.database?.size_bytes),
      detail: `WAL ${formatBytes(data?.database?.wal_size_bytes)} · ${data?.database?.journal_mode || "unknown"}`,
    },
    {
      key: "filesystem",
      icon: FolderTree,
      label: "Filesystem",
      value: String(Number(data?.filesystem?.file_count || 0)),
      detail: `${Number(data?.filesystem?.directory_count || 0)} folders · ${formatBytes(data?.filesystem?.total_bytes)}`,
    },
    {
      key: "backups",
      icon: Save,
      label: "Backups",
      value: String(backups.length),
      detail: backups[0] ? `Latest ${formatDate(backups[0].created_at)}` : "No managed snapshots yet",
    },
    {
      key: "audit",
      icon: ScrollText,
      label: "Audit Log",
      value: String(Number(data?.audit?.total_entries || 0)),
      detail: `${Array.isArray(data?.audit?.recent) ? data.audit.recent.length : 0} recent entries loaded`,
    },
  ]), [backups, data]);

  const runAction = async (key, runner, successMessage, options = {}) => {
    const shouldReload = options.reload !== false;
    setActionKey(key);

    try {
      const result = await runner();
      if (successMessage) {
        toast({
          title: successMessage,
        });
      }
      if (shouldReload) {
        await load();
      }
      return result;
    } catch (nextError) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: nextError instanceof Error ? nextError.message : "The requested admin action could not be completed.",
      });
      throw nextError;
    } finally {
      setActionKey("");
    }
  };

  const runDownload = async (key, runner, fallbackFileName, successMessage) => {
    setActionKey(key);

    try {
      const payload = await runner();
      downloadBlob(payload, fallbackFileName);
      toast({
        title: successMessage,
      });
    } catch (nextError) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: nextError instanceof Error ? nextError.message : "The file could not be downloaded.",
      });
    } finally {
      setActionKey("");
    }
  };

  const handleCreateBackup = async () => {
    await runAction(
      "create-backup",
      () => crmApi.admin.createBackup({
        label: backupForm.label,
        note: backupForm.note,
      }),
      "Backup snapshot created."
    );
    setBackupForm((current) => ({
      ...current,
      label: "",
      note: "",
    }));
  };

  const handleImportBackup = async () => {
    await runAction(
      "import-backup",
      () => crmApi.admin.importBackup({
        source_path: backupForm.importSourcePath,
      }),
      "Backup snapshot imported."
    );
    setBackupForm((current) => ({
      ...current,
      importSourcePath: "",
    }));
  };

  const handleApplyBackupRetention = async () => {
    await runAction(
      "backup-retention",
      () => crmApi.admin.setBackupRetention(Number(retentionForm.keepLatest || 0)),
      "Backup retention updated."
    );
  };

  const handleApplyLogRetention = async () => {
    await runAction(
      "log-retention",
      () => crmApi.admin.setLogRetention({
        app_keep_entries: Number(retentionForm.appKeepEntries || 0),
        security_keep_entries: Number(retentionForm.securityKeepEntries || 0),
      }),
      "Log retention applied."
    );
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }

    const snapshotId = confirmAction.snapshot?.id;
    if (!snapshotId) {
      setConfirmAction(null);
      return;
    }

    if (confirmAction.type === "restore") {
      await runAction(
        `restore-${snapshotId}`,
        () => crmApi.admin.restoreBackup(snapshotId),
        "Backup restored."
      );
    } else if (confirmAction.type === "delete") {
      await runAction(
        `delete-${snapshotId}`,
        () => crmApi.admin.deleteBackup(snapshotId),
        "Backup deleted."
      );
    }

    setConfirmAction(null);
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="System"
        subtitle="Backups, restore, diagnostics, repair tools, and server health for live admin support."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void runDownload(
                "download-diagnostics",
                () => crmApi.admin.downloadDiagnostics(),
                "joinerflow-diagnostics.json",
                "Diagnostics download started."
              )}
              disabled={Boolean(actionKey)}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Diagnostics
            </Button>
            <Button type="button" onClick={() => void load()} disabled={loading || Boolean(actionKey)}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        )}
      />

      {loading ? (
        <Card className="p-10 text-sm text-muted-foreground">Loading system health...</Card>
      ) : error ? (
        <Card className="p-6">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </Card>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.key} className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{card.label}</span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold capitalize">{card.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
                </Card>
              );
            })}
          </div>

          <Card className="mt-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">AI Diagnostics</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Health, queues, vector integrity, and local inference configuration.
                </p>
              </div>
              <Badge variant={aiData?.status === "ready" ? "secondary" : "outline"}>
                {aiData?.status || "offline"}
              </Badge>
            </div>
            {aiError ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {aiError}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Base URL", aiData?.diagnostics?.configuration?.base_url || "not loaded"],
                ["Timeout", `${aiData?.diagnostics?.configuration?.request_timeout_ms || 0} ms`],
                ["Embedding queue", `${aiData?.diagnostics?.queues?.embeddings?.pending || 0} pending`],
                ["Knowledge queue", `${aiData?.diagnostics?.queues?.knowledge?.pending || 0} pending`],
                ["Vector integrity", aiData?.diagnostics?.vector_index?.integrity?.healthy ? "healthy" : "review"],
                ["Heap used", `${aiData?.diagnostics?.runtime?.memory_heap_used_mb || 0} MB`],
                ["Startup config", aiData?.diagnostics?.startup?.ok ? "valid" : "warnings"],
                ["Auto commit", aiData?.diagnostics?.safety?.auto_commit === false ? "disabled" : "review"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 text-sm font-semibold break-words">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          {data.maintenance ? (
            <Card className="mt-6 border-amber-300/70 bg-amber-50/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-amber-900">Maintenance in progress</h2>
                  <p className="mt-1 text-sm text-amber-900/80">
                    {data.maintenance.note || data.maintenance.kind} started {formatDate(data.maintenance.started_at)}.
                  </p>
                </div>
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Maintenance</Badge>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] mt-6">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Backup Console</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create managed snapshots, import an existing snapshot folder from this PC, and restore or delete saved points.
                  </p>
                </div>
                <Badge variant="secondary">{backups.length} snapshot{backups.length === 1 ? "" : "s"}</Badge>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.2fr_auto]">
                <Input
                  value={backupForm.label}
                  onChange={(event) => setBackupForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Snapshot label, e.g. Pre-upgrade"
                />
                <Textarea
                  value={backupForm.note}
                  onChange={(event) => setBackupForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Optional note about why this snapshot was taken"
                  className="min-h-[44px]"
                />
                <Button type="button" onClick={() => void handleCreateBackup()} disabled={Boolean(actionKey)}>
                  <Save className="w-4 h-4 mr-1.5" />
                  Create snapshot
                </Button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={backupForm.importSourcePath}
                  onChange={(event) => setBackupForm((current) => ({ ...current, importSourcePath: event.target.value }))}
                  placeholder="Import an existing snapshot folder path from this computer"
                />
                <Button type="button" variant="outline" onClick={() => void handleImportBackup()} disabled={Boolean(actionKey)}>
                  <HardDriveDownload className="w-4 h-4 mr-1.5" />
                  Import folder
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {backups.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No backup snapshots are stored yet.
                  </div>
                ) : backups.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-xl border px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{snapshot.label || snapshot.id}</p>
                          <Badge variant={snapshot.source === "imported" ? "outline" : "secondary"}>
                            {snapshot.source === "imported" ? "Imported" : "Managed"}
                          </Badge>
                        </div>
                        {snapshot.note ? <p className="mt-1 text-sm text-muted-foreground">{snapshot.note}</p> : null}
                        <p className="mt-2 text-xs text-muted-foreground break-all">
                          {snapshot.id} · {formatDate(snapshot.created_at)} · {formatBytes(snapshot.total_bytes)}
                        </p>
                        {snapshot.import_source_path ? (
                          <p className="mt-1 text-xs text-muted-foreground break-all">Imported from {snapshot.import_source_path}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "restore", snapshot })}
                          disabled={Boolean(actionKey)}
                        >
                          <RotateCcw className="w-4 h-4 mr-1.5" />
                          Restore
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConfirmAction({ type: "delete", snapshot })}
                          disabled={Boolean(actionKey)}
                        >
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="font-semibold">Downloads</h2>
                <p className="mt-1 text-sm text-muted-foreground">Export diagnostics and the raw server logs used for support work.</p>
                <div className="mt-4 grid gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runDownload(
                      "download-app-log",
                      () => crmApi.admin.downloadLog("app"),
                      "app.jsonl",
                      "Application log download started."
                    )}
                    disabled={Boolean(actionKey)}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download app log
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runDownload(
                      "download-security-log",
                      () => crmApi.admin.downloadLog("security"),
                      "security.jsonl",
                      "Security log download started."
                    )}
                    disabled={Boolean(actionKey)}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download security log
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="font-semibold">Repair Actions</h2>
                <p className="mt-1 text-sm text-muted-foreground">Run corrective maintenance for database health, time tracking, and filesystem consistency.</p>
                <div className="mt-4 grid gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(
                      "optimize-database",
                      () => crmApi.admin.optimizeDatabase(),
                      "Database optimization completed."
                    )}
                    disabled={Boolean(actionKey)}
                  >
                    <Database className="w-4 h-4 mr-1.5" />
                    Optimize database
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(
                      "repair-time-tracking",
                      () => crmApi.admin.repairTimeTracking(),
                      "Time tracking repair completed."
                    )}
                    disabled={Boolean(actionKey)}
                  >
                    <Wrench className="w-4 h-4 mr-1.5" />
                    Repair time tracking
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(
                      "reconcile-filesystem",
                      () => crmApi.admin.reconcileFilesystem(),
                      "Filesystem reconciliation completed."
                    )}
                    disabled={Boolean(actionKey)}
                  >
                    <FolderTree className="w-4 h-4 mr-1.5" />
                    Reconcile filesystem
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="font-semibold">Retention Controls</h2>
                <p className="mt-1 text-sm text-muted-foreground">Keep backup growth and log sizes under control without leaving the admin area.</p>
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Input
                      type="number"
                      min="1"
                      value={retentionForm.keepLatest}
                      onChange={(event) => setRetentionForm((current) => ({ ...current, keepLatest: event.target.value }))}
                      placeholder="Keep latest snapshots"
                    />
                    <Button type="button" variant="outline" onClick={() => void handleApplyBackupRetention()} disabled={Boolean(actionKey)}>
                      Apply backup retention
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      type="number"
                      min="1"
                      value={retentionForm.appKeepEntries}
                      onChange={(event) => setRetentionForm((current) => ({ ...current, appKeepEntries: event.target.value }))}
                      placeholder="App log entries to keep"
                    />
                    <Input
                      type="number"
                      min="1"
                      value={retentionForm.securityKeepEntries}
                      onChange={(event) => setRetentionForm((current) => ({ ...current, securityKeepEntries: event.target.value }))}
                      placeholder="Security log entries to keep"
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => void handleApplyLogRetention()} disabled={Boolean(actionKey)}>
                    Apply log retention
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr] mt-6">
            <Card className="p-5">
              <h2 className="font-semibold">Entity Counts</h2>
              <p className="mt-1 text-sm text-muted-foreground">Current record totals by entity.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(data.entities || []).map((entry) => (
                  <div key={entry.entity} className="rounded-xl border px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{entry.entity}</p>
                    <p className="mt-2 text-2xl font-semibold">{entry.count}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold">Database Details</h2>
              <p className="mt-1 text-sm text-muted-foreground">Physical storage information for the live SQLite database.</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">DB path</span>
                  <span className="font-mono text-right break-all">{data.database?.path}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Integrity check</span>
                  <span>{data.database?.integrity_check || "unknown"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Page count</span>
                  <span>{data.database?.page_count}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Page size</span>
                  <span>{formatBytes(data.database?.page_size)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Freelist count</span>
                  <span>{data.database?.freelist_count}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Filesystem root</span>
                  <span className="font-mono text-right break-all">{data.filesystem?.root}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2 mt-6">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Recent App Events</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Structured application logs from the backend.</p>
                </div>
                <Badge variant="secondary">{Array.isArray(data.logs?.app) ? data.logs.app.length : 0}</Badge>
              </div>
              <div className="mt-4 space-y-3 max-h-[28rem] overflow-auto">
                {(data.logs?.app || []).map((entry, index) => (
                  <div key={`${entry.timestamp || "app"}-${index}`} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.category || "app"}</Badge>
                      <Badge variant="secondary">{entry.event || "event"}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(entry, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Recent Security Events</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Blocked hosts, origins, and rate-limit events.</p>
                </div>
                <Badge variant="secondary">{Array.isArray(data.logs?.security) ? data.logs.security.length : 0}</Badge>
              </div>
              <div className="mt-4 space-y-3 max-h-[28rem] overflow-auto">
                {(data.logs?.security || []).map((entry, index) => (
                  <div key={`${entry.timestamp || "security"}-${index}`} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.category || "security"}</Badge>
                      <Badge variant="secondary">{entry.event || "event"}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</span>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(entry, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="w-4 h-4" />
            Use restore carefully: it replaces the live database, files, and logs with the selected snapshot.
          </div>
        </>
      ) : null}

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "restore" ? "Restore backup snapshot?" : "Delete backup snapshot?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "restore"
                ? "This will replace the live database, filesystem, and logs with the selected snapshot."
                : "This removes the snapshot from managed storage. The live application data will not be changed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(actionKey)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              void handleConfirmAction();
            }}
            disabled={Boolean(actionKey)}
            >
              {confirmAction?.type === "restore" ? "Restore snapshot" : "Delete snapshot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
