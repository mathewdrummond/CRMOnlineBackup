import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { browseKnowledgeFolders, listKnowledgeBrowserRoots, resolveAllowedFolder } from "./folderBrowser";

const originalAllowedRoots = process.env.AI_KNOWLEDGE_ALLOWED_ROOTS;
let testRoot = "";

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-folder-browser-"));
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = testRoot;
});

afterEach(() => {
  process.env.AI_KNOWLEDGE_ALLOWED_ROOTS = originalAllowedRoots;
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
});
