import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function getSourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return getSourceFiles(path);
    }
    return /\.(jsx|js|tsx|ts)$/.test(entry) && !entry.endsWith(".test.jsx") && !entry.endsWith(".test.js") ? [path] : [];
  });
}

describe("dialog accessibility contracts", () => {
  test("keeps modal and sheet content paired with accessible descriptions", () => {
    const missingDescriptions = getSourceFiles(sourceRoot)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        const hasModalContent = /<(DialogContent|AlertDialogContent|SheetContent|DrawerContent)\b/.test(source);
        const hasDescription = /(DialogDescription|AlertDialogDescription|SheetDescription|DrawerDescription)\b/.test(source);
        return hasModalContent && !hasDescription;
      })
      .map((path) => relative(sourceRoot, path))
      .sort();

    expect(missingDescriptions).toEqual([]);
  });
});
