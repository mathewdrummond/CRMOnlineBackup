import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { UI_COMPONENT_CATALOG_CATEGORIES, uiComponentCatalog } from "./component-catalog";

const uiDirectory = dirname(fileURLToPath(import.meta.url));

function getUiPrimitiveFiles() {
  return readdirSync(uiDirectory)
    .filter((fileName) => fileName.endsWith(".jsx") && !fileName.endsWith(".test.jsx"))
    .map((fileName) => basename(fileName))
    .sort();
}

describe("UI component catalog", () => {
  test("documents every shared UI primitive file", () => {
    const primitiveFiles = getUiPrimitiveFiles();
    const catalogFiles = uiComponentCatalog.map((entry) => entry.file).sort();

    expect(catalogFiles).toEqual(primitiveFiles);
  });

  test("keeps catalog entries discoverable and uniquely addressable", () => {
    const ids = new Set();
    const files = new Set();
    const allowedCategories = new Set(UI_COMPONENT_CATALOG_CATEGORIES);
    const allowedOwners = new Set(["design-system", "timeclock"]);

    for (const entry of uiComponentCatalog) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);

      expect(entry.file).toMatch(/^[A-Za-z0-9-]+\.jsx$/);
      expect(files.has(entry.file)).toBe(false);
      files.add(entry.file);

      expect(allowedCategories.has(entry.category)).toBe(true);
      expect(entry.owner).toMatch(/^[a-z0-9-]+$/);
      expect(allowedOwners.has(entry.owner)).toBe(true);
      expect(entry.exports.length).toBeGreaterThan(0);
      expect(entry.purpose).toBe(entry.purpose.trim());
      expect(entry.purpose).toMatch(/^[A-Z].*\.$/);
      expect(entry.purpose.length).toBeGreaterThan(20);
    }
  });

  test("matches each primitive's documented public exports", async () => {
    const mismatches = [];

    for (const entry of uiComponentCatalog) {
      const moduleExports = await import(/* @vite-ignore */ `./${entry.file}`);
      const actualNamedExports = Object.keys(moduleExports)
        .filter((exportName) => exportName !== "default")
        .sort();
      const expectedNamedExports = [...entry.exports].sort();

      if (JSON.stringify(actualNamedExports) !== JSON.stringify(expectedNamedExports)) {
        mismatches.push({
          file: entry.file,
          expected: expectedNamedExports,
          actual: actualNamedExports,
        });
      }
    }

    expect(mismatches).toEqual([]);
  }, 15000);
});
