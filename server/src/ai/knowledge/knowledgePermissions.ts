import fs from "node:fs";
import path from "node:path";
import { RouteRequestError } from "../../routeError";
import { LocalUser } from "../../types";

const DEFAULT_ALLOWED_NAS_ROOTS = [
  process.env.FILESYSTEM_ROOT || "",
  "/volume1/joinerflow",
  "/volume1",
  "/mnt",
  "/srv",
].map((value) => String(value || "").trim()).filter(Boolean);

export function readConfiguredKnowledgeAllowedRoots() {
  const fromEnv = String(process.env.AI_KNOWLEDGE_ALLOWED_ROOTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const roots = fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_NAS_ROOTS;
  return roots
    .map((value) => safeRealpath(value))
    .filter(Boolean);
}

export function ensureKnowledgePathAllowed(candidatePath: string) {
  const resolved = safeRealpath(candidatePath);
  if (!resolved) {
    throw new RouteRequestError(400, "knowledge_path_missing", "The selected folder does not exist.");
  }

  const allowedRoots = readConfiguredKnowledgeAllowedRoots();
  const allowed = allowedRoots.some((root) => isWithinPath(resolved, root));
  if (!allowed) {
    throw new RouteRequestError(
      400,
      "knowledge_path_not_allowed",
      "The selected folder is outside the configured AI knowledge allowlist."
    );
  }

  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) {
    throw new RouteRequestError(400, "knowledge_path_invalid", "The selected path must be a directory.");
  }

  return resolved;
}

export function ensureKnowledgeChildPath(rootPath: string, absolutePath: string) {
  const normalizedRoot = safeRealpath(rootPath);
  const normalizedTarget = safeRealpath(absolutePath);
  if (!normalizedRoot || !normalizedTarget) {
    throw new RouteRequestError(404, "knowledge_path_missing", "Knowledge file path could not be resolved.");
  }
  if (!isWithinPath(normalizedTarget, normalizedRoot)) {
    throw new RouteRequestError(403, "knowledge_path_forbidden", "Path traversal was blocked.");
  }
  return normalizedTarget;
}

export function shouldExcludePath(relativePath: string, patterns: string[]) {
  const normalized = normalizePath(relativePath);
  if (!normalized) return true;
  const tokens = normalized.split("/");
  if (tokens.some((token) => token === "..")) return true;

  return patterns.some((pattern) => {
    const normalizedPattern = normalizePath(pattern);
    if (!normalizedPattern) return false;
    if (normalizedPattern.endsWith("/")) {
      return normalized.startsWith(normalizedPattern);
    }
    if (normalizedPattern.includes("*")) {
      return wildcardMatch(normalized, normalizedPattern);
    }
    return normalized === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`);
  });
}

export function normalizePath(value: string) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

export function isKnowledgeResultVisibleToUser(
  user: LocalUser | null,
  metadata: Record<string, unknown>
) {
  const role = String(user?.role || "").toLowerCase();
  const isAdmin = role === "admin";
  if (isAdmin) {
    return true;
  }

  const visibility = String(metadata.production_visibility || metadata.visibility || "production")
    .toLowerCase()
    .trim();
  const managementOnly = metadata.management_only === true;
  const internalOnly = metadata.internal_only === true;
  const visibleToProduction = metadata.visible_to_production !== false;

  if (managementOnly || internalOnly) {
    return false;
  }

  if (!visibleToProduction) {
    return false;
  }

  return !["management", "internal", "management_only", "internal_only"].includes(visibility);
}

function safeRealpath(targetPath: string) {
  const resolved = path.resolve(String(targetPath || "").trim());
  if (!resolved) return "";
  try {
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (!stat) return "";
    if (stat.isSymbolicLink()) {
      // Reject symlink root targets to avoid escaping the approved root.
      return "";
    }
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

function wildcardMatch(value: string, pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}
