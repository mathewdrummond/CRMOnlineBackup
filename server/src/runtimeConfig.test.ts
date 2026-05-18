import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadEnvFiles } from "./runtimeConfig";

describe("runtime config env loading", () => {
  let tempRoot = "";

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    tempRoot = "";
  });

  test("loads repo and server env files with local overrides while preserving shell env values", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-env-"));
    const repoRoot = path.join(tempRoot, "repo");
    const serverRoot = path.join(repoRoot, "server");
    fs.mkdirSync(serverRoot, { recursive: true });

    fs.writeFileSync(path.join(repoRoot, ".env"), "GOOGLE_CLIENT_ID=repo-base\nAUTH_SESSION_SECRET=repo-secret\n");
    fs.writeFileSync(path.join(repoRoot, ".env.local"), "GOOGLE_CLIENT_ID=repo-local\nAUTH_BOOTSTRAP_ADMIN_EMAILS=repo@example.com\n");
    fs.writeFileSync(path.join(serverRoot, ".env"), "GOOGLE_CLIENT_ID=server-base\nFILESYSTEM_ROOT=./server-files\n");
    fs.writeFileSync(path.join(serverRoot, ".env.local"), "GOOGLE_CLIENT_ID=server-local\nAUTH_SESSION_SECRET=server-secret\n");

    const env = {
      PORT: "4010",
      AUTH_BOOTSTRAP_ADMIN_EMAILS: "shell@example.com",
    } as NodeJS.ProcessEnv;
    const loaded = loadEnvFiles({
      env,
      initialEnvKeys: Object.keys(env),
      repoRoot,
      serverRoot,
    });

    expect(env.PORT).toBe("4010");
    expect(env.GOOGLE_CLIENT_ID).toBe("server-local");
    expect(env.AUTH_SESSION_SECRET).toBe("server-secret");
    expect(env.AUTH_BOOTSTRAP_ADMIN_EMAILS).toBe("shell@example.com");
    expect(env.FILESYSTEM_ROOT).toBe("./server-files");
    expect(loaded.map((entry) => path.basename(entry.path))).toEqual([".env", ".env", ".env.local", ".env.local"]);
  });
});
