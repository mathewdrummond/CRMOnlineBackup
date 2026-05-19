import fs from "node:fs";
import path from "node:path";

const DEFAULT_VOLUME_ROOTS = ["/volume1"];

const BLOCKED_SHARED_FOLDER_NAMES = new Set([
  "#recycle",
  "$recycle.bin",
  "@appstore",
  "@database",
  "@docker",
  "@eadir",
  "@tmp",
  "bin",
  "containerd",
  "dev",
  "docker",
  "etc",
  "lib",
  "lost+found",
  "opt",
  "proc",
  "root",
  "run",
  "sbin",
  "sys",
  "tmp",
  "usr",
  "var",
  "volumeusb1",
  "volumeusb2",
  "volumeusb3",
]);

export function listSynologySharedFolderRoots() {
  const discovered = readSynologyVolumeRoots()
    .flatMap((volumeRoot) => discoverSharedFoldersForVolume(volumeRoot));
  return dedupe(discovered);
}

export function isSynologyVolumeRoot(candidatePath: string) {
  const real = safeDirectoryRealpath(candidatePath);
  if (!real) return false;
  return readSynologyVolumeRoots().some((volumeRoot) => {
    const volumeReal = safeDirectoryRealpath(volumeRoot);
    return Boolean(volumeReal && path.resolve(real) === path.resolve(volumeReal));
  });
}

export function isApprovedSynologySharedFolder(candidatePath: string) {
  const real = safeDirectoryRealpath(candidatePath);
  if (!real) return false;
  return readSynologyVolumeRoots().some((volumeRoot) => {
    const volumeReal = safeDirectoryRealpath(volumeRoot);
    if (!volumeReal) return false;
    return validateSharedFolderRoot(real, volumeReal);
  });
}

export function readSynologyVolumeRoots() {
  const configured = String(process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return dedupe(configured.length > 0 ? configured : DEFAULT_VOLUME_ROOTS)
    .map((volumeRoot) => path.resolve(volumeRoot))
    .filter((volumeRoot) => isValidVolumeRoot(volumeRoot));
}

function discoverSharedFoldersForVolume(volumeRoot: string) {
  const volumeReal = safeDirectoryRealpath(volumeRoot);
  if (!volumeReal) return [];

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(volumeReal, { withFileTypes: true });
  } catch {
    return [];
  }

  return dirents
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(volumeReal, entry.name))
    .map((entryPath) => safeDirectoryRealpath(entryPath))
    .filter((entryPath): entryPath is string => Boolean(entryPath))
    .filter((entryPath) => validateSharedFolderRoot(entryPath, volumeReal))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, { sensitivity: "base" }));
}

function validateSharedFolderRoot(candidatePath: string, volumeRoot: string) {
  const candidate = path.resolve(candidatePath);
  const volume = path.resolve(volumeRoot);
  if (candidate === volume) return false;
  if (path.dirname(candidate) !== volume) return false;
  if (!isWithinPath(candidate, volume)) return false;

  const name = path.basename(candidate);
  if (!isVisibleSharedFolderName(name)) return false;
  if (!isReadableDirectory(candidate)) return false;

  return true;
}

function isValidVolumeRoot(volumeRoot: string) {
  if (process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS) {
    return path.isAbsolute(volumeRoot);
  }
  return /^\/volume\d+$/.test(volumeRoot);
}

function isVisibleSharedFolderName(name: string) {
  const normalized = String(name || "").trim();
  if (!normalized || normalized === "." || normalized === "..") return false;
  if (normalized.startsWith(".")) return false;
  if (normalized.startsWith("@")) return false;
  return !BLOCKED_SHARED_FOLDER_NAMES.has(normalized.toLowerCase());
}

function isReadableDirectory(folderPath: string) {
  try {
    const stat = fs.statSync(folderPath, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory()) return false;
    fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function safeDirectoryRealpath(targetPath: string) {
  try {
    const resolved = path.resolve(String(targetPath || "").trim());
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return "";
    return fs.realpathSync.native(resolved);
  } catch {
    return "";
  }
}

function isWithinPath(candidate: string, root: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  if (normalizedCandidate === normalizedRoot) return true;
  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => path.resolve(value)).filter(Boolean)));
}
