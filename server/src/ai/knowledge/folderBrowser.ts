import fs from "node:fs";
import path from "node:path";
import { RouteRequestError } from "../../routeError";
import { readConfiguredKnowledgeAllowedRoots } from "./knowledgePermissions";

const MAX_DIRECTORY_LIMIT = 200;
const DEFAULT_DIRECTORY_LIMIT = 100;
const SYSTEM_DIRECTORY_NAMES = new Set([
  ".git",
  ".svn",
  ".hg",
  "@eadir",
  "#recycle",
  "$recycle.bin",
  "node_modules",
  "proc",
  "sys",
  "dev",
  "run",
  "var",
  "etc",
  "docker",
  "containerd",
]);

export type FolderBrowserEntry = {
  name: string;
  path: string;
  selectable: boolean;
  has_children: boolean;
  access: "allowed" | "denied";
};

export type FolderBrowserRoot = {
  label: string;
  path: string;
  selectable: boolean;
};

export function listKnowledgeBrowserRoots(): FolderBrowserRoot[] {
  return readConfiguredKnowledgeAllowedRoots()
    .filter((root) => isReadableDirectory(root))
    .map((root) => ({
      label: buildRootLabel(root),
      path: root,
      selectable: true,
    }));
}

export function browseKnowledgeFolders(input: {
  path: string;
  query?: string;
  offset?: number;
  limit?: number;
}) {
  const root = resolveAllowedFolder(input.path);
  const limit = Math.max(1, Math.min(MAX_DIRECTORY_LIMIT, Number(input.limit || DEFAULT_DIRECTORY_LIMIT)));
  const offset = Math.max(0, Number(input.offset || 0));
  const query = String(input.query || "").trim().toLowerCase();

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new RouteRequestError(403, "knowledge_browse_access_denied", "This folder cannot be read by JoinerFlow.");
  }

  const folders = dirents
    .filter((entry) => entry.isDirectory())
    .filter((entry) => isVisibleDirectoryName(entry.name))
    .filter((entry) => !query || entry.name.toLowerCase().includes(query))
    .map((entry) => toFolderEntry(root, entry.name))
    .filter((entry): entry is FolderBrowserEntry => Boolean(entry))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

  return {
    path: root,
    breadcrumbs: buildBreadcrumbs(root),
    entries: folders.slice(offset, offset + limit),
    offset,
    limit,
    total: folders.length,
    has_more: offset + limit < folders.length,
  };
}

export function resolveAllowedFolder(candidatePath: string) {
  const requested = String(candidatePath || "").trim();
  if (!requested) {
    throw new RouteRequestError(400, "knowledge_browse_path_required", "Select a folder to browse.");
  }
  if (requested.includes("\0")) {
    throw new RouteRequestError(400, "knowledge_browse_path_invalid", "The selected folder path is invalid.");
  }

  const resolved = path.resolve(requested);
  const real = safeRealpathNoSymlinkLeaf(resolved);
  if (!real) {
    throw new RouteRequestError(404, "knowledge_browse_path_missing", "The selected folder does not exist.");
  }

  const roots = readConfiguredKnowledgeAllowedRoots();
  if (!roots.some((allowedRoot) => isWithinPath(real, allowedRoot))) {
    throw new RouteRequestError(403, "knowledge_browse_path_forbidden", "This folder is outside the configured NAS allowlist.");
  }

  if (!isReadableDirectory(real)) {
    throw new RouteRequestError(403, "knowledge_browse_access_denied", "This folder cannot be read by JoinerFlow.");
  }

  return real;
}

function toFolderEntry(parent: string, name: string): FolderBrowserEntry | null {
  const absolutePath = path.join(parent, name);
  const real = safeRealpathNoSymlinkLeaf(absolutePath);
  if (!real) return null;
  const roots = readConfiguredKnowledgeAllowedRoots();
  if (!roots.some((allowedRoot) => isWithinPath(real, allowedRoot))) return null;

  return {
    name,
    path: real,
    selectable: true,
    has_children: hasVisibleChildDirectories(real),
    access: "allowed",
  };
}

function hasVisibleChildDirectories(folderPath: string) {
  try {
    return fs.readdirSync(folderPath, { withFileTypes: true }).some((entry) => {
      if (!entry.isDirectory() || !isVisibleDirectoryName(entry.name)) return false;
      return Boolean(safeRealpathNoSymlinkLeaf(path.join(folderPath, entry.name)));
    });
  } catch {
    return false;
  }
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

function safeRealpathNoSymlinkLeaf(targetPath: string) {
  try {
    const stat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink()) return "";
    if (!stat.isDirectory()) return "";
    return fs.realpathSync.native(targetPath);
  } catch {
    return "";
  }
}

function isVisibleDirectoryName(name: string) {
  const normalized = String(name || "").trim();
  if (!normalized || normalized === "." || normalized === "..") return false;
  if (normalized.startsWith(".")) return false;
  return !SYSTEM_DIRECTORY_NAMES.has(normalized.toLowerCase());
}

function isWithinPath(candidate: string, root: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  if (normalizedCandidate === normalizedRoot) return true;
  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function buildRootLabel(root: string) {
  const base = path.basename(root);
  return base ? `/${base}` : root;
}

function buildBreadcrumbs(folderPath: string) {
  const roots = readConfiguredKnowledgeAllowedRoots()
    .filter((root) => isWithinPath(folderPath, root))
    .sort((left, right) => right.length - left.length);
  const root = roots[0] || folderPath;
  const relative = path.relative(root, folderPath);
  const crumbs = [{ label: buildRootLabel(root), path: root }];
  if (!relative) return crumbs;
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    crumbs.push({ label: segment, path: current });
  }
  return crumbs;
}
