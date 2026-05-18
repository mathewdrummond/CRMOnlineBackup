import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

type LoadEnvFilesOptions = {
  env?: NodeJS.ProcessEnv;
  initialEnvKeys?: Iterable<string>;
  repoRoot?: string;
  serverRoot?: string;
  skipDotenv?: boolean;
};

export type LoadedEnvFile = {
  path: string;
  keys: string[];
};

export function getDefaultServerRoot() {
  return path.resolve(__dirname, "..");
}

export function getDefaultRepoRoot(serverRoot = getDefaultServerRoot()) {
  return path.resolve(serverRoot, "..");
}

export function loadEnvFiles(options: LoadEnvFilesOptions = {}) {
  const env = options.env ?? process.env;
  const skipDotenv = options.skipDotenv ?? String(env.SKIP_DOTENV || "").trim().toLowerCase() === "true";
  if (skipDotenv) {
    return [] as LoadedEnvFile[];
  }

  const serverRoot = options.serverRoot ?? getDefaultServerRoot();
  const repoRoot = options.repoRoot ?? getDefaultRepoRoot(serverRoot);
  const initialEnvKeys = new Set(options.initialEnvKeys ?? Object.keys(env));
  const candidatePaths = [
    path.resolve(repoRoot, ".env"),
    path.resolve(serverRoot, ".env"),
    path.resolve(repoRoot, ".env.local"),
    path.resolve(serverRoot, ".env.local"),
  ];

  const loadedFiles: LoadedEnvFile[] = [];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const parsed = dotenv.parse(fs.readFileSync(envPath));
    const loadedKeys: string[] = [];

    for (const [key, value] of Object.entries(parsed)) {
      if (initialEnvKeys.has(key)) {
        continue;
      }

      env[key] = value;
      loadedKeys.push(key);
    }

    loadedFiles.push({
      path: envPath,
      keys: loadedKeys,
    });
  }

  return loadedFiles;
}
