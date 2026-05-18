import { describe, expect, test } from "vitest";
import { createDefaultModuleConfig, isModuleEnabled, normalizeModuleConfig } from "./moduleConfig";

describe("moduleConfig fail-safe behavior", () => {
  test("defaults core modules on and optional modules off", () => {
    const config = createDefaultModuleConfig();
    const pricingModule = config.modules.find((module) => module.key === "pricing");

    expect(isModuleEnabled(config, "operations")).toBe(true);
    expect(isModuleEnabled(config, "timeclock")).toBe(true);
    expect(isModuleEnabled(config, "dashboard")).toBe(false);
    expect(isModuleEnabled(config, "quotes")).toBe(false);
    expect(pricingModule?.entities).toContain("GlobalAutoInclusion");
    expect(pricingModule?.entities).toContain("GlobalAutoInclusionAudit");
    expect(config.summary.core).toBeGreaterThan(0);
    expect(config.summary.optional).toBeGreaterThan(0);
  });

  test("fails closed for optional modules when the config payload is missing", () => {
    const config = normalizeModuleConfig(null);

    expect(isModuleEnabled(config, "contacts")).toBe(false);
    expect(isModuleEnabled(config, "reports")).toBe(false);
    expect(isModuleEnabled(config, "jobs")).toBe(true);
  });

  test("fails closed for optional modules omitted from a partial config payload", () => {
    const config = normalizeModuleConfig({
      record_id: "partial-config",
      modules: [
        { key: "operations", group: "core", enabled: true },
        { key: "admin", group: "core", enabled: true },
        { key: "staff", group: "core", enabled: true },
        { key: "jobs", group: "core", enabled: true },
        { key: "activities", group: "core", enabled: true },
        { key: "timeclock", group: "core", enabled: true },
      ],
    });

    expect(isModuleEnabled(config, "dashboard")).toBe(false);
    expect(isModuleEnabled(config, "stock")).toBe(false);
    expect(isModuleEnabled(config, "purchasing")).toBe(false);
    expect(config.modules.some((module) => module.key === "stock" || module.key === "purchasing")).toBe(false);
    expect(isModuleEnabled(config, "manual_entry")).toBe(false);
    expect(isModuleEnabled(config, "jobs")).toBe(true);
  });
});
