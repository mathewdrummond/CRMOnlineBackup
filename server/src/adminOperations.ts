import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  backupDatabaseSnapshot,
  getActiveDatabasePath,
  getDatabaseDiagnostics,
  optimizeDatabase,
  restoreDatabaseSnapshot,
  verifyDatabaseSnapshot,
} from "./db";
import { LocalUser } from "./types";

const DEFAULT_BACKUP_DIRECTORY = path.resolve(__dirname, "..", "backups");
const DEFAULT_FILESYSTEM_DIRECTORY = path.resolve(__dirname, "..", "filesystem");
const DEFAULT_LOG_DIRECTORY = path.resolve(__dirname, "..", "logs");
const SNAPSHOT_MANIFEST_FILENAME = "manifest.json";
const SNAPSHOT_DATABASE_FILENAME = "database.sqlite";
const SNAPSHOT_FILESYSTEM_DIRECTORY = "filesystem";
const SNAPSHOT_LOG_DIRECTORY = "logs";
const FILESYSTEM_SUBDIRECTORIES = ["jobs", "quotes", "contacts", ".versions"];
const LOG_FILENAMES = ["app.jsonl", "security.jsonl"];

type BackupManifest = {
  id: string;
  label: string;
  note: string;
  source: "managed" | "imported";
  created_at: string;
  created_by: {
    id: string;
    name: string;
    email: string;
  };
  imported_at?: string;
  imported_by?: {
    id: string;
    name: string;
    email: string;
  };
  import_source_path?: string;
  database: {
    filename: string;
    live_path: string;
    size_bytes: number;
    integrity_check: string;
  };
  filesystem: {
    directory: string;
    root: string;
    file_count: number;
    directory_count: number;
    total_bytes: number;
  };
  logs: {
    directory: string;
    root: string;
    file_count: number;
    total_bytes: number;
    files: Array<{ name: string; size_bytes: number }>;
  };
};

function getBackupRoot() {
  return path.resolve(process.env.BACKUP_ROOT || DEFAULT_BACKUP_DIRECTORY);
}

function getFilesystemRoot() {
  return path.resolve(process.env.FILESYSTEM_ROOT || DEFAULT_FILESYSTEM_DIRECTORY);
}

function getLogRoot() {
  return path.resolve(process.env.LOG_DIRECTORY || DEFAULT_LOG_DIRECTORY);
}

function ensureBackupRoot() {
  fs.mkdirSync(getBackupRoot(), { recursive: true });
}

function ensureFilesystemLayout(root = getFilesystemRoot()) {
  fs.mkdirSync(root, { recursive: true });
  FILESYSTEM_SUBDIRECTORIES.forEach((name) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
  });
}

function createActorSummary(actor: LocalUser | null | undefined) {
  return {
    id: String(actor?.id || ""),
    name: String(actor?.full_name || ""),
    email: String(actor?.email || ""),
  };
}

function sanitiseBackupSlug(value: string) {
  const trimmed = String(value || "").trim().toLowerCase();
  const cleaned = trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 48);
}

function buildBackupId(label = "") {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const slug = sanitiseBackupSlug(label) || "snapshot";
  return `${timestamp}-${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

function summarizeDirectory(directoryPath: string) {
  if (!fs.existsSync(directoryPath)) {
    return {
      file_count: 0,
      directory_count: 0,
      total_bytes: 0,
    };
  }

  let fileCount = 0;
  let directoryCount = 0;
  let totalBytes = 0;

  const walk = (currentPath: string) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        directoryCount += 1;
        walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        fileCount += 1;
        totalBytes += fs.statSync(absolutePath).size;
      }
    }
  };

  walk(directoryPath);

  return {
    file_count: fileCount,
    directory_count: directoryCount,
    total_bytes: totalBytes,
  };
}

function copyDirectoryContents(sourcePath: string, targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  if (fs.existsSync(sourcePath)) {
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      preserveTimestamps: true,
    });
    return;
  }

  fs.mkdirSync(targetPath, { recursive: true });
}

function getSnapshotDirectory(snapshotId: string) {
  return path.join(getBackupRoot(), snapshotId);
}

function getManifestPath(snapshotId: string) {
  return path.join(getSnapshotDirectory(snapshotId), SNAPSHOT_MANIFEST_FILENAME);
}

function readBackupManifest(snapshotId: string) {
  const manifestPath = getManifestPath(snapshotId);
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Backup snapshot not found.");
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest;
}

function buildSnapshotSummary(snapshotId: string, manifest: BackupManifest) {
  const snapshotDirectory = getSnapshotDirectory(snapshotId);
  const total = summarizeDirectory(snapshotDirectory);
  return {
    id: manifest.id,
    label: manifest.label,
    note: manifest.note,
    source: manifest.source,
    path: snapshotDirectory,
    created_at: manifest.created_at,
    created_by: manifest.created_by,
    imported_at: manifest.imported_at || "",
    imported_by: manifest.imported_by || null,
    import_source_path: manifest.import_source_path || "",
    total_bytes: total.total_bytes,
    database: {
      ...manifest.database,
      path: path.join(snapshotDirectory, manifest.database.filename),
    },
    filesystem: manifest.filesystem,
    logs: manifest.logs,
  };
}

function writeBackupManifest(snapshotId: string, manifest: BackupManifest) {
  fs.writeFileSync(getManifestPath(snapshotId), JSON.stringify(manifest, null, 2));
}

export function listBackupSnapshots() {
  ensureBackupRoot();
  return fs.readdirSync(getBackupRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return buildSnapshotSummary(entry.name, readBackupManifest(entry.name));
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
}

export function getBackupSnapshot(snapshotId: string) {
  return buildSnapshotSummary(snapshotId, readBackupManifest(snapshotId));
}

export function createBackupSnapshot(input: {
  actor: LocalUser | null;
  label?: string;
  note?: string;
}) {
  ensureBackupRoot();
  ensureFilesystemLayout();

  const createdAt = new Date().toISOString();
  const label = String(input.label || "").trim() || "System snapshot";
  const note = String(input.note || "").trim();
  const snapshotId = buildBackupId(label);
  const snapshotDirectory = getSnapshotDirectory(snapshotId);
  const databaseTargetPath = path.join(snapshotDirectory, SNAPSHOT_DATABASE_FILENAME);
  const filesystemTargetPath = path.join(snapshotDirectory, SNAPSHOT_FILESYSTEM_DIRECTORY);
  const logsTargetPath = path.join(snapshotDirectory, SNAPSHOT_LOG_DIRECTORY);

  fs.mkdirSync(snapshotDirectory, { recursive: true });

  const databaseSnapshot = backupDatabaseSnapshot(databaseTargetPath);
  copyDirectoryContents(getFilesystemRoot(), filesystemTargetPath);
  fs.mkdirSync(logsTargetPath, { recursive: true });

  const logFiles = LOG_FILENAMES
    .map((fileName) => {
      const sourcePath = path.join(getLogRoot(), fileName);
      const targetPath = path.join(logsTargetPath, fileName);
      if (!fs.existsSync(sourcePath)) {
        return null;
      }

      fs.copyFileSync(sourcePath, targetPath);
      return {
        name: fileName,
        size_bytes: fs.statSync(targetPath).size,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const filesystemSummary = summarizeDirectory(filesystemTargetPath);
  const logsSummary = summarizeDirectory(logsTargetPath);
  const integrity = verifyDatabaseSnapshot(databaseTargetPath);
  const manifest: BackupManifest = {
    id: snapshotId,
    label,
    note,
    source: "managed",
    created_at: createdAt,
    created_by: createActorSummary(input.actor),
    database: {
      filename: SNAPSHOT_DATABASE_FILENAME,
      live_path: getActiveDatabasePath(),
      size_bytes: databaseSnapshot.size_bytes,
      integrity_check: integrity.integrity_check,
    },
    filesystem: {
      directory: SNAPSHOT_FILESYSTEM_DIRECTORY,
      root: getFilesystemRoot(),
      ...filesystemSummary,
    },
    logs: {
      directory: SNAPSHOT_LOG_DIRECTORY,
      root: getLogRoot(),
      file_count: logsSummary.file_count,
      total_bytes: logsSummary.total_bytes,
      files: logFiles,
    },
  };

  writeBackupManifest(snapshotId, manifest);
  return getBackupSnapshot(snapshotId);
}

export function importBackupSnapshot(input: {
  actor: LocalUser | null;
  sourcePath: string;
}) {
  ensureBackupRoot();

  const sourcePath = path.resolve(String(input.sourcePath || "").trim());
  const manifestPath = path.join(sourcePath, SNAPSHOT_MANIFEST_FILENAME);
  const databasePath = path.join(sourcePath, SNAPSHOT_DATABASE_FILENAME);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error("Backup import path was not found.");
  }

  if (!fs.existsSync(manifestPath) || !fs.existsSync(databasePath)) {
    throw new Error("Backup import path must contain manifest.json and database.sqlite.");
  }

  const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BackupManifest;
  const snapshotId = buildBackupId(sourceManifest.label || path.basename(sourcePath));
  const targetDirectory = getSnapshotDirectory(snapshotId);

  copyDirectoryContents(sourcePath, targetDirectory);

  const importedManifest: BackupManifest = {
    ...sourceManifest,
    id: snapshotId,
    source: "imported",
    imported_at: new Date().toISOString(),
    imported_by: createActorSummary(input.actor),
    import_source_path: sourcePath,
  };

  writeBackupManifest(snapshotId, importedManifest);
  return getBackupSnapshot(snapshotId);
}

export function deleteBackupSnapshot(snapshotId: string) {
  const snapshot = getBackupSnapshot(snapshotId);
  fs.rmSync(getSnapshotDirectory(snapshotId), { recursive: true, force: true });
  return snapshot;
}

type DirectoryRestorePlan = {
  apply: () => void;
  rollback: () => void;
  finalize: () => void;
};

function buildDirectoryRestorePlan(sourcePath: string, targetPath: string): DirectoryRestorePlan {
  const token = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const stagedTargetPath = `${targetPath}.restore-${token}`;
  const previousTargetPath = `${targetPath}.previous-${token}`;
  copyDirectoryContents(sourcePath, stagedTargetPath);

  return {
    apply() {
      if (fs.existsSync(targetPath)) {
        fs.renameSync(targetPath, previousTargetPath);
      }
      fs.renameSync(stagedTargetPath, targetPath);
    },
    rollback() {
      fs.rmSync(targetPath, { recursive: true, force: true });
      if (fs.existsSync(previousTargetPath)) {
        fs.renameSync(previousTargetPath, targetPath);
      }
      fs.rmSync(stagedTargetPath, { recursive: true, force: true });
    },
    finalize() {
      fs.rmSync(previousTargetPath, { recursive: true, force: true });
      fs.rmSync(stagedTargetPath, { recursive: true, force: true });
    },
  };
}

export async function restoreBackupSnapshotById(snapshotId: string) {
  const snapshot = getBackupSnapshot(snapshotId);
  const snapshotDirectory = getSnapshotDirectory(snapshotId);
  const databaseSnapshotPath = path.join(snapshotDirectory, SNAPSHOT_DATABASE_FILENAME);
  const filesystemSnapshotPath = path.join(snapshotDirectory, SNAPSHOT_FILESYSTEM_DIRECTORY);
  const logsSnapshotPath = path.join(snapshotDirectory, SNAPSHOT_LOG_DIRECTORY);
  const filesystemPlan = buildDirectoryRestorePlan(filesystemSnapshotPath, getFilesystemRoot());
  const logPlan = buildDirectoryRestorePlan(logsSnapshotPath, getLogRoot());
  const appliedPlans: DirectoryRestorePlan[] = [];

  try {
    filesystemPlan.apply();
    appliedPlans.push(filesystemPlan);
    logPlan.apply();
    appliedPlans.push(logPlan);

    await restoreDatabaseSnapshot(databaseSnapshotPath);
    ensureFilesystemLayout();
    appliedPlans.forEach((plan) => plan.finalize());

    return {
      snapshot,
      database: getDatabaseDiagnostics(),
      filesystem: summarizeDirectory(getFilesystemRoot()),
      logs: summarizeDirectory(getLogRoot()),
    };
  } catch (error) {
    appliedPlans.reverse().forEach((plan) => plan.rollback());
    throw error;
  }
}

export function applyBackupRetention(keepLatest: number) {
  const snapshots = listBackupSnapshots();
  const removed = snapshots.slice(Math.max(0, keepLatest)).map((snapshot) => {
    fs.rmSync(snapshot.path, { recursive: true, force: true });
    return snapshot;
  });

  return {
    keep_latest: keepLatest,
    removed,
    remaining: listBackupSnapshots(),
  };
}

function trimLogFile(filePath: string, keepEntries: number) {
  if (!fs.existsSync(filePath)) {
    return {
      file: path.basename(filePath),
      previous_entries: 0,
      retained_entries: 0,
      removed_entries: 0,
    };
  }

  const lines = fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const retained = lines.slice(-keepEntries);
  const output = retained.length > 0 ? `${retained.join("\n")}\n` : "";
  fs.writeFileSync(filePath, output);

  return {
    file: path.basename(filePath),
    previous_entries: lines.length,
    retained_entries: retained.length,
    removed_entries: Math.max(0, lines.length - retained.length),
  };
}

export function applyLogRetention(input: {
  appKeepEntries: number;
  securityKeepEntries: number;
}) {
  fs.mkdirSync(getLogRoot(), { recursive: true });
  return {
    app: trimLogFile(path.join(getLogRoot(), "app.jsonl"), input.appKeepEntries),
    security: trimLogFile(path.join(getLogRoot(), "security.jsonl"), input.securityKeepEntries),
  };
}

export function getLogFileDescriptor(kind: "app" | "security") {
  const fileName = kind === "security" ? "security.jsonl" : "app.jsonl";
  const filePath = path.join(getLogRoot(), fileName);
  return {
    kind,
    file_name: fileName,
    file_path: filePath,
    exists: fs.existsSync(filePath),
    size_bytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
  };
}

export function readLogFile(kind: "app" | "security") {
  const descriptor = getLogFileDescriptor(kind);
  return {
    ...descriptor,
    content: descriptor.exists ? fs.readFileSync(descriptor.file_path, "utf8") : "",
  };
}

export function buildDiagnosticsSnapshot(payload: {
  generatedAt: string;
  health: Record<string, unknown>;
  auditPreview: unknown[];
}) {
  return {
    generated_at: payload.generatedAt,
    health: payload.health,
    audit_preview: payload.auditPreview,
    backups: listBackupSnapshots(),
    database: getDatabaseDiagnostics(),
    runtime: {
      node_version: process.version,
      platform: process.platform,
      backup_root: getBackupRoot(),
      filesystem_root: getFilesystemRoot(),
      log_root: getLogRoot(),
    },
  };
}

export function runDatabaseMaintenance() {
  return optimizeDatabase();
}
