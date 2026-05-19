import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { browseKnowledgeFolders, listKnowledgeBrowserRoots, resolveAllowedFolder } from "./folderBrowser";

const originalAllowedRoots = process.env.AI_KNOWLEDGE_ALLOWED_ROOTS;
const originalSynologyVolumeRoots = process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS;
let testRoot = "";

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-folder-browser-"));
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = testRoot;
  delete process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS;
});

afterEach(() => {
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = originalAllowedRoots;
  process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS = originalSynologyVolumeRoots;
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("knowledge folder browser security", () => {
  test("lists only visible folders below configured roots", () => {
    fs.mkdirSync(path.join(testRoot, "Jobs", "Active"), { recursive: true });
    fs.mkdirSync(path.join(testRoot, ".git"), { recursive: true });
    fs.mkdirSync(path.join(testRoot, "@eaDir"), { recursive: true });
    fs.writeFileSync(path.join(testRoot, "readme.txt"), "file entry");

    expect(listKnowledgeBrowserRoots()).toEqual([
      expect.objectContaining({ path: fs.realpathSync.native(testRoot), selectable: true }),
    ]);

    const browse = browseKnowledgeFolders({ path: testRoot });
    expect(browse.entries.map((entry) => entry.name)).toEqual(["Jobs"]);
    expect(browse.entries[0]).toEqual(expect.objectContaining({
      selectable: true,
      has_children: true,
    }));
  });

  test("rejects traversal outside the allowlist", () => {
    expect(() => resolveAllowedFolder(path.join(testRoot, ".."))).toThrow(/outside the configured NAS allowlist/i);
  });

  test("does not expose symlink escapes", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-outside-"));
    try {
      fs.symlinkSync(outside, path.join(testRoot, "escaped"), "dir");
      const browse = browseKnowledgeFolders({ path: testRoot });
      expect(browse.entries.map((entry) => entry.name)).not.toContain("escaped");
      expect(() => resolveAllowedFolder(path.join(testRoot, "escaped"))).toThrow(/does not exist/i);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test("expands Synology volume roots to readable shared folders only", () => {
    const volumeRoot = path.join(testRoot, "volume1");
    fs.mkdirSync(path.join(volumeRoot, "clients", "A"), { recursive: true });
    fs.mkdirSync(path.join(volumeRoot, "engineering"), { recursive: true });
    fs.mkdirSync(path.join(volumeRoot, "docker"), { recursive: true });
    fs.mkdirSync(path.join(volumeRoot, "@appstore"), { recursive: true });
    process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = volumeRoot;
    process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS = volumeRoot;

    const roots = listKnowledgeBrowserRoots();
    expect(roots.map((root) => root.path)).toEqual([
      fs.realpathSync.native(path.join(volumeRoot, "clients")),
      fs.realpathSync.native(path.join(volumeRoot, "engineering")),
    ]);

    expect(browseKnowledgeFolders({ path: path.join(volumeRoot, "clients") }).entries.map((entry) => entry.name)).toEqual(["A"]);
    expect(() => resolveAllowedFolder(volumeRoot)).toThrow(/outside the configured NAS allowlist/i);
    expect(() => resolveAllowedFolder(path.join(volumeRoot, "docker"))).toThrow(/outside the configured NAS allowlist/i);
  });

  test("blocks traversal and symlink shared-folder escapes from Synology volumes", () => {
    const volumeRoot = path.join(testRoot, "volume1");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-volume-outside-"));
    try {
      fs.mkdirSync(volumeRoot, { recursive: true });
      fs.mkdirSync(path.join(volumeRoot, "projects"), { recursive: true });
      fs.symlinkSync(outside, path.join(volumeRoot, "escaped"), "dir");
      process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = volumeRoot;
      process.env.AI_KNOWLEDGE_SYNOLOGY_VOLUME_ROOTS = volumeRoot;

      expect(listKnowledgeBrowserRoots().map((root) => root.path)).toEqual([
        fs.realpathSync.native(path.join(volumeRoot, "projects")),
      ]);
      expect(() => resolveAllowedFolder(path.join(volumeRoot, "escaped"))).toThrow(/does not exist/i);
      expect(() => resolveAllowedFolder(path.join(volumeRoot, "projects", "..", ".."))).toThrow(/outside the configured NAS allowlist/i);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
