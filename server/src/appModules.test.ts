import { beforeEach, describe, expect, test } from "vitest";
import {
  canDisable,
  canEnable,
  getDependentModules,
  getEntityModuleKey,
  getMissingDependencies,
  getModuleConfig,
  getModuleDefinitions,
  getModuleDependencyMatrix,
  resolveDependenciesOnEnable,
  updateModuleConfig,
  validateModuleState,
} from "./appModules";
import { resetDatabaseForTests, updateEntityRecord } from "./db";

const ACTOR = {
  id: "user-admin",
  full_name: "Admin User",
  role: "admin",
  email: "admin@example.test",
};

describe("app module configuration", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  test("defines a complete dependency matrix with required and optional relationships", () => {
    const definitions = getModuleDefinitions();
    const matrix = getModuleDependencyMatrix();
    const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const matrixByKey = new Map(matrix.map((definition) => [definition.key, definition]));
    const config = getModuleConfig();

    expect(definitionByKey.get("activities")).toMatchObject({
      group: "core",
      required_dependencies: ["jobs", "staff"],
      optional_dependencies: ["schedule", "dashboard", "reports"],
    });
    expect(definitionByKey.get("timeclock")).toMatchObject({
      group: "core",
      required_dependencies: ["staff", "jobs", "activities"],
      optional_dependencies: ["myob_export", "export_history", "manual_entry"],
    });
    expect(definitionByKey.get("dashboard")).toMatchObject({
      group: "optional",
      required_dependencies: ["jobs", "activities", "timeclock"],
      optional_dependencies: ["leads", "quotes", "pricing", "schedule", "myob_export"],
    });
    expect(definitionByKey.get("schedule")).toMatchObject({
      group: "optional",
      required_dependencies: ["jobs", "activities"],
      optional_dependencies: [],
    });
    expect(definitionByKey.get("pricing")?.entities).toContain("GlobalAutoInclusion");
    expect(definitionByKey.get("pricing")?.entities).toContain("GlobalAutoInclusionAudit");
    expect(definitionByKey.has("purchasing")).toBe(false);
    expect(definitionByKey.has("stock")).toBe(false);
    expect(matrixByKey.get("myob_export")?.all_dependencies).toEqual(["timeclock", "staff", "jobs", "activities"]);

    expect(config.enabled.operations).toBe(true);
    expect(config.enabled.admin).toBe(true);
    expect(config.enabled.staff).toBe(true);
    expect(config.enabled.jobs).toBe(true);
    expect(config.enabled.activities).toBe(true);
    expect(config.enabled.timeclock).toBe(true);
    expect(config.summary.core).toBe(6);
    expect(config.summary.optional).toBe(definitions.length - 6);
    expect(config.validation.valid).toBe(true);
  });

  test("derives entity module ownership from the module registry", () => {
    expect(getEntityModuleKey("AppModuleConfig")).toBe("admin");
    expect(getEntityModuleKey("ReportView")).toBe("reports");
    expect(getEntityModuleKey("GlobalAutoInclusion")).toBe("pricing");
    expect(getEntityModuleKey("GlobalAutoInclusionAudit")).toBe("pricing");
    expect(getEntityModuleKey("UnregisteredEntity")).toBeNull();
  });

  test("auto-enables required dependencies when the pricing module is switched back on", () => {
    updateModuleConfig({
      contacts: false,
      quotes: false,
      pricing: false,
    }, {
      actor: ACTOR,
      requestSource: "test",
    });

    const updated = updateModuleConfig({
      pricing: true,
    }, {
      actor: ACTOR,
      requestSource: "test",
    });

    expect(updated.enabled.contacts).toBe(true);
    expect(updated.enabled.quotes).toBe(true);
    expect(updated.enabled.pricing).toBe(true);
    expect(updated.last_change?.auto_enabled).toEqual(["contacts", "quotes"]);
  });

  test("disabling a dependency automatically disables all dependent modules", () => {
    const updated = updateModuleConfig({
      contacts: false,
    }, {
      actor: ACTOR,
      requestSource: "test",
    });

    expect(updated.enabled.contacts).toBe(false);
    expect(updated.enabled.leads).toBe(false);
    expect(updated.enabled.quotes).toBe(false);
    expect(updated.enabled.pricing).toBe(false);
    expect(updated.last_change?.auto_disabled.sort()).toEqual(["leads", "pricing", "quotes"]);

    const leads = updated.modules.find((module) => module.key === "leads");
    const quotes = updated.modules.find((module) => module.key === "quotes");
    const pricing = updated.modules.find((module) => module.key === "pricing");

    expect(leads?.stored_enabled).toBe(false);
    expect(quotes?.stored_enabled).toBe(false);
    expect(pricing?.stored_enabled).toBe(false);
  });

  test("rejects conflicting change sets that disable a required dependency while enabling a dependent module", () => {
    expect(() => updateModuleConfig({
      contacts: false,
      quotes: true,
    }, {
      actor: ACTOR,
      requestSource: "test",
    })).toThrowError(/cannot be enabled while Contacts & Companies is being disabled/i);
  });

  test("exposes centralized rules helpers for admin-safe behaviour", () => {
    const storedModules = {
      suppliers: false,
      contacts: false,
      quotes: false,
    };

    expect(resolveDependenciesOnEnable("pricing", storedModules)).toEqual(["contacts", "quotes"]);
    expect(canEnable("pricing", storedModules)).toMatchObject({
      allowed: true,
      auto_enable: ["contacts", "quotes"],
    });
    expect(canDisable("contacts", {})).toMatchObject({
      allowed: true,
      auto_disable: ["leads", "quotes", "pricing"],
    });
    expect(getDependentModules("contacts")).toEqual(["leads", "quotes"]);
    expect(getDependentModules("contacts", { recursive: true })).toEqual(["leads", "quotes", "pricing"]);
    expect(getDependentModules("suppliers")).toEqual([]);
    expect(getDependentModules("suppliers", { optional: true })).toEqual(["pricing"]);
    expect(getMissingDependencies("quotes", storedModules)).toEqual(["contacts"]);
  });

  test("validates and reports invalid legacy states without allowing effective breakage", () => {
    const invalidState = {
      contacts: false,
      leads: true,
      quotes: true,
      pricing: true,
    };

    const validation = validateModuleState(invalidState);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({
        module_key: "leads",
        missing_dependencies: ["contacts"],
      }),
      expect.objectContaining({
        module_key: "quotes",
        missing_dependencies: ["contacts"],
      }),
      expect.objectContaining({
        module_key: "pricing",
        missing_dependencies: ["quotes"],
      }),
    ]);
  });

  test("rejects unknown or malformed module update keys instead of silently dropping them", () => {
    expect(() => updateModuleConfig({
      quotes: true,
      purchasing: true,
    } as unknown as Partial<Record<"quotes", boolean>>, {
      actor: ACTOR,
      requestSource: "test",
    })).toThrowError(/not a registered application module/i);

    expect(() => updateModuleConfig({
      quotes: "true",
    } as unknown as Partial<Record<"quotes", boolean>>, {
      actor: ACTOR,
      requestSource: "test",
    })).toThrowError(/must be stored as a boolean module flag/i);
  });

  test("surfaces corrupt persisted module flags without coercing effective state", () => {
    getModuleConfig();
    updateEntityRecord("AppModuleConfig", "app-modules", {
      modules: {
        contacts: "false",
        quotes: true,
        purchasing: true,
      },
    }, {
      actor: ACTOR,
      request_source: "test",
    });

    const config = getModuleConfig();

    expect(config.enabled.contacts).toBe(true);
    expect(config.enabled.quotes).toBe(true);
    expect(config.summary.storage_issues).toBe(2);
    expect(config.validation.valid).toBe(false);
    expect(config.validation.storage_issues).toEqual([
      expect.objectContaining({
        module_key: "contacts",
        code: "module_config_invalid_value",
        stored_value_type: "string",
      }),
      expect.objectContaining({
        module_key: "purchasing",
        code: "module_config_unknown_key",
      }),
    ]);
  });
});
