import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { KNOWN_ENTITY_NAMES } from "./db";

const entityDefinitionsDirectory = path.resolve(process.cwd(), "server/src/__fixtures__/base44/entities");

function stripJsonComments(source: string) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inString) {
      output += current;
      escaped = current === "\\" && !escaped;
      if (current === "\"" && !escaped) {
        inString = false;
      } else if (current !== "\\") {
        escaped = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      output += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function readBase44EntityDefinitions() {
  return fs.readdirSync(entityDefinitionsDirectory)
    .filter((fileName) => fileName.endsWith(".jsonc"))
    .sort()
    .map((fileName) => {
      const definitionPath = path.join(entityDefinitionsDirectory, fileName);
      const definition = JSON.parse(stripJsonComments(fs.readFileSync(definitionPath, "utf8"))) as {
        name?: unknown;
      };

      return {
        fileName,
        fileEntityName: path.basename(fileName, ".jsonc"),
        declaredName: definition.name,
      };
    });
}

describe("Base44 entity contract parity", () => {
  test("every documented Base44 entity is registered by the local server", () => {
    const definitions = readBase44EntityDefinitions();

    expect(definitions.map((definition) => definition.fileEntityName)).toEqual([
      "AppAlert",
      "Company",
      "Contact",
      "ExportHistory",
      "Invoice",
      "Job",
      "JobOperation",
      "Lead",
      "LeadTask",
      "Note",
      "POItem",
      "PurchaseOrder",
      "Quote",
      "QuoteItem",
      "Staff",
      "Supplier",
      "TimeEntry",
    ]);

    for (const definition of definitions) {
      expect(definition.declaredName, `${definition.fileName} name should match file name`).toBe(definition.fileEntityName);
      expect(KNOWN_ENTITY_NAMES.has(definition.fileEntityName), `${definition.fileEntityName} must be registered in server/src/db.ts`).toBe(true);
    }
  });
});
