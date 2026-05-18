import { createEntityRecord, getEntityRecord, updateEntityRecord } from "./db";
import { RouteRequestError } from "./routeError";
import { LocalUser } from "./types";
import moduleDefinitions from "../../shared/moduleDefinitions.json";

const APP_MODULE_KEYS = [
  "operations",
  "admin",
  "staff",
  "jobs",
  "activities",
  "timeclock",
  "dashboard",
  "leads",
  "contacts",
  "quotes",
  "pricing",
  "schedule",
  "suppliers",
  "myob_export",
  "export_history",
  "manual_entry",
  "reports",
] as const;

export type AppModuleKey = typeof APP_MODULE_KEYS[number];

type AppModuleDefinition = {
  key: AppModuleKey;
  label: string;
  description: string;
  group: "core" | "optional";
  requiredDependencies: AppModuleKey[];
  optionalDependencies?: AppModuleKey[];
  entities?: string[];
};

type AppModuleConfigRecord = {
  id: string;
  modules?: Record<string, boolean>;
  schema_version?: number;
  created_date?: string;
  updated_date?: string;
};

type MutationContext = {
  actor: LocalUser;
  requestSource: string;
};

type ModuleActionPreview = {
  allowed: boolean;
  reason_code: string | null;
  reason: string;
  missing_dependencies: AppModuleKey[];
  auto_enable: AppModuleKey[];
  auto_disable: AppModuleKey[];
  impacted_optional_modules: AppModuleKey[];
};

type ModuleValidationIssue = {
  module_key: AppModuleKey;
  code: string;
  message: string;
  missing_dependencies: AppModuleKey[];
};

type ModuleConfigStorageIssue = {
  module_key: string | null;
  code: string;
  message: string;
  stored_value_type: string;
};

type ModuleConfigChangeSummary = {
  requested: Partial<Record<AppModuleKey, boolean>>;
  auto_enabled: AppModuleKey[];
  auto_disabled: AppModuleKey[];
  impacted_optional_modules: AppModuleKey[];
  normalized_modules: AppModuleKey[];
  message: string;
};

const MODULE_CONFIG_RECORD_ID = "app-modules";
const MODULE_CONFIG_SCHEMA_VERSION = 3;
const RULES_ENGINE_VERSION = 1;
const KNOWN_MODULE_KEYS = new Set<string>(APP_MODULE_KEYS);

function describeRegistryValue(value: unknown) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function requireRegistryString(
  definition: Record<string, unknown>,
  property: string,
  context: string
) {
  const value = definition[property];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}.${property} must be a non-empty string.`);
  }
  return value;
}

function requireRegistryStringArray(
  value: unknown,
  context: string
) {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array of strings.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${context}[${index}] must be a non-empty string.`);
    }
    return item;
  });
}

function requireModuleKey(value: string, context: string): AppModuleKey {
  if (!KNOWN_MODULE_KEYS.has(value)) {
    throw new Error(`${context} references unknown module key "${value}".`);
  }
  return value as AppModuleKey;
}

function requireModuleKeyArray(value: unknown, context: string) {
  return requireRegistryStringArray(value, context).map((moduleKey, index) => (
    requireModuleKey(moduleKey, `${context}[${index}]`)
  ));
}

function parseModuleDefinitions(value: unknown): AppModuleDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`Shared module registry must be an array, received ${describeRegistryValue(value)}.`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Module definition at index ${index} must be an object.`);
    }

    const definition = item as Record<string, unknown>;
    const context = `Module definition ${index}`;
    const key = requireModuleKey(requireRegistryString(definition, "key", context), `${context}.key`);
    const group = definition.group;
    if (group !== "core" && group !== "optional") {
      throw new Error(`${context}.group must be "core" or "optional".`);
    }

    return {
      key,
      label: requireRegistryString(definition, "label", context),
      description: requireRegistryString(definition, "description", context),
      group,
      requiredDependencies: requireModuleKeyArray(definition.requiredDependencies, `${context}.requiredDependencies`),
      optionalDependencies: definition.optionalDependencies === undefined
        ? []
        : requireModuleKeyArray(definition.optionalDependencies, `${context}.optionalDependencies`),
      entities: definition.entities === undefined
        ? []
        : requireRegistryStringArray(definition.entities, `${context}.entities`),
    };
  });
}

const MODULE_DEFINITIONS = parseModuleDefinitions(moduleDefinitions);

const MODULE_DEFINITION_MAP = new Map<AppModuleKey, AppModuleDefinition>(
  MODULE_DEFINITIONS.map((definition) => [definition.key, definition])
);
const MODULE_KEYS = new Set<string>(MODULE_DEFINITIONS.map((definition) => definition.key));

function assertModuleRegistryIntegrity() {
  const seenKeys = new Set<AppModuleKey>();
  const entityOwners = new Map<string, AppModuleKey>();

  const visitRequiredChain = (moduleKey: AppModuleKey, path: AppModuleKey[] = []) => {
    const definition = MODULE_DEFINITION_MAP.get(moduleKey);
    if (!definition) {
      throw new Error(`Unknown module definition "${moduleKey}".`);
    }

    if (path.includes(moduleKey)) {
      throw new Error(`Circular required module dependency detected: ${[...path, moduleKey].join(" -> ")}`);
    }

    definition.requiredDependencies.forEach((dependencyKey) => {
      visitRequiredChain(dependencyKey, [...path, moduleKey]);
    });
  };

  MODULE_DEFINITIONS.forEach((definition) => {
    if (seenKeys.has(definition.key)) {
      throw new Error(`Duplicate module definition "${definition.key}".`);
    }
    seenKeys.add(definition.key);

    [...definition.requiredDependencies, ...(definition.optionalDependencies || [])].forEach((dependencyKey) => {
      if (!MODULE_DEFINITION_MAP.has(dependencyKey)) {
        throw new Error(`${definition.key} references unknown dependency "${dependencyKey}".`);
      }
      if (dependencyKey === definition.key) {
        throw new Error(`${definition.key} cannot depend on itself.`);
      }
    });

    (definition.entities || []).forEach((entityName) => {
      const previousOwner = entityOwners.get(entityName);
      if (previousOwner) {
        throw new Error(`${entityName} is owned by both ${previousOwner} and ${definition.key}.`);
      }
      entityOwners.set(entityName, definition.key);
    });

    visitRequiredChain(definition.key);
  });

  APP_MODULE_KEYS.forEach((moduleKey) => {
    if (!seenKeys.has(moduleKey)) {
      throw new Error(`Missing module definition "${moduleKey}" in shared module registry.`);
    }
  });
}

assertModuleRegistryIntegrity();

const ENTITY_MODULE_MAP = new Map<string, AppModuleKey>(
  MODULE_DEFINITIONS.flatMap((definition) => (
    (definition.entities || []).map((entityName) => [entityName, definition.key] as const)
  ))
);

function buildReverseDependencyMap(getDependencies: (definition: AppModuleDefinition) => AppModuleKey[]) {
  return new Map<AppModuleKey, AppModuleKey[]>(
    MODULE_DEFINITIONS.map((definition) => [
      definition.key,
      MODULE_DEFINITIONS
        .filter((candidate) => getDependencies(candidate).includes(definition.key))
        .map((candidate) => candidate.key),
    ])
  );
}

const REQUIRED_DEPENDENTS_MAP = buildReverseDependencyMap((definition) => definition.requiredDependencies);
const OPTIONAL_DEPENDENTS_MAP = buildReverseDependencyMap((definition) => definition.optionalDependencies || []);

function uniqueModuleKeys(values: AppModuleKey[]) {
  return [...new Set(values)];
}

function isAppModuleKey(value: string): value is AppModuleKey {
  return MODULE_KEYS.has(value);
}

function describeStoredValueType(value: unknown) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function collectModuleMapIssues(value: unknown): ModuleConfigStorageIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (value === undefined) {
      return [];
    }

    return [{
      module_key: null,
      code: "module_config_invalid_shape",
      message: "AppModuleConfig.modules must be an object keyed by registered module names.",
      stored_value_type: describeStoredValueType(value),
    }];
  }

  const issues: ModuleConfigStorageIssue[] = [];
  Object.entries(value as Record<string, unknown>).forEach(([moduleKey, storedValue]) => {
    if (!isAppModuleKey(moduleKey)) {
      issues.push({
        module_key: moduleKey,
        code: "module_config_unknown_key",
        message: `${moduleKey} is not a registered application module.`,
        stored_value_type: describeStoredValueType(storedValue),
      });
      return;
    }

    if (typeof storedValue !== "boolean") {
      issues.push({
        module_key: moduleKey,
        code: "module_config_invalid_value",
        message: `${MODULE_DEFINITION_MAP.get(moduleKey)?.label || moduleKey} must be stored as a boolean module flag.`,
        stored_value_type: describeStoredValueType(storedValue),
      });
    }
  });

  return issues;
}

function normaliseBooleanMap(value: unknown): Partial<Record<AppModuleKey, boolean>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const next: Partial<Record<AppModuleKey, boolean>> = {};
  for (const definition of MODULE_DEFINITIONS) {
    if (Object.prototype.hasOwnProperty.call(value, definition.key)) {
      const storedValue = (value as Record<string, unknown>)[definition.key];
      if (typeof storedValue === "boolean") {
        next[definition.key] = storedValue;
      }
    }
  }

  return next;
}

function parseStoredModuleConfig(value: unknown) {
  return {
    modules: normaliseBooleanMap(value),
    storageIssues: collectModuleMapIssues(value),
  };
}

function parseModulePatch(value: unknown) {
  const issues = collectModuleMapIssues(value);
  if (issues.length > 0) {
    const firstIssue = issues[0];
    throw new RouteRequestError(
      400,
      firstIssue.code,
      firstIssue.message
    );
  }

  return normaliseBooleanMap(value);
}

function ensureModuleConfigRecord(): AppModuleConfigRecord {
  const existing = getEntityRecord("AppModuleConfig", MODULE_CONFIG_RECORD_ID) as AppModuleConfigRecord | null;
  if (existing) {
    return existing;
  }

  return createEntityRecord("AppModuleConfig", {
    id: MODULE_CONFIG_RECORD_ID,
    modules: {},
    schema_version: MODULE_CONFIG_SCHEMA_VERSION,
  }, {
    skip_audit: true,
    request_source: "system",
  }) as AppModuleConfigRecord;
}

function buildRequestedEnabledMap(storedModules: Partial<Record<AppModuleKey, boolean>>) {
  const enabled = {} as Record<AppModuleKey, boolean>;

  MODULE_DEFINITIONS.forEach((definition) => {
    enabled[definition.key] = definition.group === "core"
      ? true
      : storedModules[definition.key] !== false;
  });

  return enabled;
}

function buildEffectiveEnabledMap(storedModules: Partial<Record<AppModuleKey, boolean>>) {
  const enabled = buildRequestedEnabledMap(storedModules);

  let changed = true;
  while (changed) {
    changed = false;
    MODULE_DEFINITIONS.forEach((definition) => {
      if (!enabled[definition.key]) {
        return;
      }

      if (definition.requiredDependencies.some((dependency) => enabled[dependency] !== true)) {
        enabled[definition.key] = false;
        changed = true;
      }
    });
  }

  return enabled;
}

function resolveDependencyClosure(moduleKey: AppModuleKey) {
  const visited = new Set<AppModuleKey>();

  const visit = (targetKey: AppModuleKey) => {
    const definition = MODULE_DEFINITION_MAP.get(targetKey);
    if (!definition) {
      return;
    }

    definition.requiredDependencies.forEach((dependencyKey) => {
      if (visited.has(dependencyKey)) {
        return;
      }
      visited.add(dependencyKey);
      visit(dependencyKey);
    });
  };

  visit(moduleKey);
  return [...visited];
}

function resolveDependentClosure(moduleKey: AppModuleKey) {
  const dependents = new Set<AppModuleKey>();

  const visit = (targetKey: AppModuleKey) => {
    (REQUIRED_DEPENDENTS_MAP.get(targetKey) || []).forEach((dependentKey) => {
      if (dependents.has(dependentKey)) {
        return;
      }
      dependents.add(dependentKey);
      visit(dependentKey);
    });
  };

  visit(moduleKey);
  return [...dependents];
}

function getMissingDependenciesForMap(moduleKey: AppModuleKey, enabledMap: Record<AppModuleKey, boolean>) {
  return (MODULE_DEFINITION_MAP.get(moduleKey)?.requiredDependencies || []).filter((dependency) => enabledMap[dependency] !== true);
}

function getInactiveOptionalDependenciesForMap(moduleKey: AppModuleKey, enabledMap: Record<AppModuleKey, boolean>) {
  return (MODULE_DEFINITION_MAP.get(moduleKey)?.optionalDependencies || []).filter((dependency) => enabledMap[dependency] !== true);
}

function buildModuleStateDescription(moduleKeys: AppModuleKey[]) {
  return moduleKeys
    .map((moduleKey) => MODULE_DEFINITION_MAP.get(moduleKey)?.label || moduleKey)
    .join(", ");
}

function resolveDependenciesForEnable(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>>,
  explicitlyDisabled = new Set<AppModuleKey>()
) {
  const requestedEnabled = buildRequestedEnabledMap(storedModules);
  const autoEnable = new Set<AppModuleKey>();

  const visit = (targetKey: AppModuleKey) => {
    const definition = MODULE_DEFINITION_MAP.get(targetKey);
    if (!definition) {
      return;
    }

    definition.requiredDependencies.forEach((dependencyKey) => {
      if (explicitlyDisabled.has(dependencyKey)) {
        throw new RouteRequestError(
          400,
          "module_dependency_conflict",
          `${definition.label} cannot be enabled while ${MODULE_DEFINITION_MAP.get(dependencyKey)?.label || dependencyKey} is being disabled in the same change.`
        );
      }

      visit(dependencyKey);

      if (MODULE_DEFINITION_MAP.get(dependencyKey)?.group !== "core" && requestedEnabled[dependencyKey] !== true) {
        autoEnable.add(dependencyKey);
      }
    });
  };

  visit(moduleKey);
  return [...autoEnable];
}

function buildEnableActionPreview(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>>
): ModuleActionPreview {
  const definition = MODULE_DEFINITION_MAP.get(moduleKey);
  if (!definition) {
    return {
      allowed: false,
      reason_code: "module_unknown",
      reason: "This module is not registered.",
      missing_dependencies: [],
      auto_enable: [],
      auto_disable: [],
      impacted_optional_modules: [],
    };
  }

  if (definition.group === "core") {
    return {
      allowed: false,
      reason_code: "module_locked",
      reason: `${definition.label} is a core module and is always enabled.`,
      missing_dependencies: [],
      auto_enable: [],
      auto_disable: [],
      impacted_optional_modules: [],
    };
  }

  const effectiveEnabled = buildEffectiveEnabledMap(storedModules);
  const missingDependencies = getMissingDependenciesForMap(moduleKey, effectiveEnabled);
  const autoEnable = resolveDependenciesForEnable(moduleKey, storedModules);
  const reason = autoEnable.length > 0
    ? `Enabling ${definition.label} will also enable ${buildModuleStateDescription(autoEnable)}.`
    : `${definition.label} can be enabled safely.`;

  return {
    allowed: true,
    reason_code: null,
    reason,
    missing_dependencies: missingDependencies,
    auto_enable: autoEnable,
    auto_disable: [],
    impacted_optional_modules: [],
  };
}

function buildDisableActionPreview(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>>
): ModuleActionPreview {
  const definition = MODULE_DEFINITION_MAP.get(moduleKey);
  if (!definition) {
    return {
      allowed: false,
      reason_code: "module_unknown",
      reason: "This module is not registered.",
      missing_dependencies: [],
      auto_enable: [],
      auto_disable: [],
      impacted_optional_modules: [],
    };
  }

  if (definition.group === "core") {
    return {
      allowed: false,
      reason_code: "module_locked",
      reason: `${definition.label} is a core module and cannot be disabled.`,
      missing_dependencies: [],
      auto_enable: [],
      auto_disable: [],
      impacted_optional_modules: [],
    };
  }

  const effectiveEnabled = buildEffectiveEnabledMap(storedModules);
  const autoDisable = resolveDependentClosure(moduleKey).filter((dependentKey) => effectiveEnabled[dependentKey] === true);
  const impactedOptionalModules = (OPTIONAL_DEPENDENTS_MAP.get(moduleKey) || []).filter((dependentKey) => effectiveEnabled[dependentKey] === true);

  let reason = `${definition.label} can be disabled safely.`;
  if (autoDisable.length > 0) {
    reason = `Disabling ${definition.label} will also disable ${buildModuleStateDescription(autoDisable)}.`;
  } else if (impactedOptionalModules.length > 0) {
    reason = `Disabling ${definition.label} will reduce related behaviour in ${buildModuleStateDescription(impactedOptionalModules)}.`;
  }

  return {
    allowed: true,
    reason_code: null,
    reason,
    missing_dependencies: [],
    auto_enable: [],
    auto_disable: autoDisable,
    impacted_optional_modules: impactedOptionalModules,
  };
}

function normaliseStoredModulesToValidState(storedModules: Partial<Record<AppModuleKey, boolean>>) {
  const nextStored = { ...storedModules };
  const normalizedModules = new Set<AppModuleKey>();

  let changed = true;
  while (changed) {
    changed = false;
    const effectiveEnabled = buildEffectiveEnabledMap(nextStored);
    const requestedEnabled = buildRequestedEnabledMap(nextStored);

    MODULE_DEFINITIONS.forEach((definition) => {
      if (definition.group === "core") {
        nextStored[definition.key] = true;
        return;
      }

      if (requestedEnabled[definition.key] !== true || effectiveEnabled[definition.key] === true) {
        return;
      }

      nextStored[definition.key] = false;
      normalizedModules.add(definition.key);
      changed = true;
    });
  }

  return {
    storedModules: nextStored,
    normalizedModules: [...normalizedModules],
  };
}

function validateState(storedModules: Partial<Record<AppModuleKey, boolean>>) {
  const requestedEnabled = buildRequestedEnabledMap(storedModules);
  const effectiveEnabled = buildEffectiveEnabledMap(storedModules);
  const issues: ModuleValidationIssue[] = [];

  MODULE_DEFINITIONS.forEach((definition) => {
    if (requestedEnabled[definition.key] !== true || effectiveEnabled[definition.key] === true) {
      return;
    }

    const missingDependencies = getMissingDependenciesForMap(definition.key, effectiveEnabled);
    issues.push({
      module_key: definition.key,
      code: "module_missing_required_dependencies",
      message: `${definition.label} is requested on but cannot run until ${buildModuleStateDescription(missingDependencies)} is enabled.`,
      missing_dependencies: missingDependencies,
    });
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

function buildChangeSummary(
  currentStored: Partial<Record<AppModuleKey, boolean>>,
  nextStored: Partial<Record<AppModuleKey, boolean>>,
  patch: Partial<Record<AppModuleKey, boolean>>,
  normalizedModules: AppModuleKey[]
): ModuleConfigChangeSummary {
  const beforeEffective = buildEffectiveEnabledMap(currentStored);
  const afterEffective = buildEffectiveEnabledMap(nextStored);
  const requestedKeys = Object.keys(patch) as AppModuleKey[];
  const explicitlyEnabled = new Set(requestedKeys.filter((moduleKey) => patch[moduleKey] === true));
  const explicitlyDisabled = new Set(requestedKeys.filter((moduleKey) => patch[moduleKey] === false));

  const autoEnabled = MODULE_DEFINITIONS
    .map((definition) => definition.key)
    .filter((moduleKey) => !explicitlyEnabled.has(moduleKey) && beforeEffective[moduleKey] !== true && afterEffective[moduleKey] === true);

  const autoDisabled = MODULE_DEFINITIONS
    .map((definition) => definition.key)
    .filter((moduleKey) => !explicitlyDisabled.has(moduleKey) && beforeEffective[moduleKey] === true && afterEffective[moduleKey] !== true);

  const impactedOptionalModules = uniqueModuleKeys(
    requestedKeys.flatMap((moduleKey) => patch[moduleKey] === false ? (OPTIONAL_DEPENDENTS_MAP.get(moduleKey) || []) : [])
  ).filter((moduleKey) => buildEffectiveEnabledMap(currentStored)[moduleKey] === true);

  let message = "Module configuration updated.";
  if (explicitlyEnabled.size > 0 && autoEnabled.length > 0) {
    message = `Enabled ${buildModuleStateDescription([...explicitlyEnabled])} and automatically enabled ${buildModuleStateDescription(autoEnabled)}.`;
  } else if (explicitlyDisabled.size > 0 && autoDisabled.length > 0) {
    message = `Disabled ${buildModuleStateDescription([...explicitlyDisabled])} and also disabled ${buildModuleStateDescription(autoDisabled)}.`;
  } else if (explicitlyEnabled.size > 0) {
    message = `Enabled ${buildModuleStateDescription([...explicitlyEnabled])}.`;
  } else if (explicitlyDisabled.size > 0) {
    message = `Disabled ${buildModuleStateDescription([...explicitlyDisabled])}.`;
  }

  return {
    requested: patch,
    auto_enabled: autoEnabled,
    auto_disabled: autoDisabled,
    impacted_optional_modules: impactedOptionalModules,
    normalized_modules: normalizedModules,
    message,
  };
}

function resolveModuleConfig(
  storedModules: Partial<Record<AppModuleKey, boolean>>,
  record: AppModuleConfigRecord,
  lastChange: ModuleConfigChangeSummary | null = null,
  storageIssues: ModuleConfigStorageIssue[] = []
) {
  const requestedEnabled = buildRequestedEnabledMap(storedModules);
  const effectiveEnabled = buildEffectiveEnabledMap(storedModules);
  const validation = validateState(storedModules);

  const modules = MODULE_DEFINITIONS.map((definition) => {
    const directDependents = REQUIRED_DEPENDENTS_MAP.get(definition.key) || [];
    const allDependents = resolveDependentClosure(definition.key);
    const missingDependencies = getMissingDependenciesForMap(definition.key, effectiveEnabled);
    const optionalDependencies = definition.optionalDependencies || [];

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      group: definition.group,
      isCore: definition.group === "core",
      dependencies: [...definition.requiredDependencies],
      required_dependencies: [...definition.requiredDependencies],
      all_dependencies: resolveDependencyClosure(definition.key),
      optional_dependencies: [...optionalDependencies],
      dependents: [...directDependents],
      all_dependents: allDependents,
      optional_dependents: [...(OPTIONAL_DEPENDENTS_MAP.get(definition.key) || [])],
      entities: [...(definition.entities || [])],
      enabled: effectiveEnabled[definition.key],
      stored_enabled: requestedEnabled[definition.key],
      locked: definition.group === "core",
      state: effectiveEnabled[definition.key]
        ? "enabled"
        : requestedEnabled[definition.key] && missingDependencies.length > 0
          ? "blocked"
          : "disabled",
      disabled_by: missingDependencies[0] || null,
      blocking_dependencies: missingDependencies,
      inactive_optional_dependencies: getInactiveOptionalDependenciesForMap(definition.key, effectiveEnabled),
      enable_action: buildEnableActionPreview(definition.key, storedModules),
      disable_action: buildDisableActionPreview(definition.key, storedModules),
    };
  });

  const coreCount = modules.filter((module) => module.group === "core").length;
  const optionalModules = modules.filter((module) => module.group === "optional");

  return {
    record_id: record.id,
    updated_date: record.updated_date || record.created_date || "",
    schema_version: Number(record.schema_version || MODULE_CONFIG_SCHEMA_VERSION),
    rules_engine_version: RULES_ENGINE_VERSION,
    enabled: effectiveEnabled,
    summary: {
      total: modules.length,
      core: coreCount,
      optional: optionalModules.length,
      enabled_optional: optionalModules.filter((module) => module.enabled).length,
      disabled_optional: optionalModules.filter((module) => !module.enabled).length,
      invalid_requested_states: validation.issues.length,
      storage_issues: storageIssues.length,
    },
    validation: {
      ...validation,
      valid: validation.valid && storageIssues.length === 0,
      storage_issues: storageIssues,
    },
    last_change: lastChange,
    modules,
  };
}

function buildNextStoredModules(
  currentStored: Partial<Record<AppModuleKey, boolean>>,
  patch: Partial<Record<AppModuleKey, boolean>>
) {
  const explicitlyDisabled = new Set<AppModuleKey>();
  const explicitlyEnabled = new Set<AppModuleKey>();

  MODULE_DEFINITIONS.forEach((definition) => {
    if (patch[definition.key] === false) {
      explicitlyDisabled.add(definition.key);
    }
    if (patch[definition.key] === true) {
      explicitlyEnabled.add(definition.key);
    }
  });

  explicitlyDisabled.forEach((moduleKey) => {
    if (MODULE_DEFINITION_MAP.get(moduleKey)?.group === "core") {
      throw new RouteRequestError(
        400,
        "module_locked",
        `${MODULE_DEFINITION_MAP.get(moduleKey)?.label || moduleKey} is a core module and cannot be disabled.`
      );
    }
  });

  explicitlyEnabled.forEach((moduleKey) => {
    resolveDependenciesForEnable(moduleKey, currentStored, explicitlyDisabled);
  });

  const nextStored: Partial<Record<AppModuleKey, boolean>> = {
    ...currentStored,
    ...patch,
  };

  MODULE_DEFINITIONS.forEach((definition) => {
    if (definition.group === "core") {
      nextStored[definition.key] = true;
    }
  });

  explicitlyDisabled.forEach((moduleKey) => {
    nextStored[moduleKey] = false;
    resolveDependentClosure(moduleKey).forEach((dependentKey) => {
      nextStored[dependentKey] = false;
    });
  });

  explicitlyEnabled.forEach((moduleKey) => {
    nextStored[moduleKey] = true;
    resolveDependenciesForEnable(moduleKey, nextStored, explicitlyDisabled).forEach((dependencyKey) => {
      nextStored[dependencyKey] = true;
    });
  });

  const normalized = normaliseStoredModulesToValidState(nextStored);
  return normalized;
}

export function getModuleDefinitions() {
  return MODULE_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    group: definition.group,
    isCore: definition.group === "core",
    locked: definition.group === "core",
    dependencies: [...definition.requiredDependencies],
    required_dependencies: [...definition.requiredDependencies],
    all_dependencies: resolveDependencyClosure(definition.key),
    optional_dependencies: [...(definition.optionalDependencies || [])],
    dependents: [...(REQUIRED_DEPENDENTS_MAP.get(definition.key) || [])],
    all_dependents: resolveDependentClosure(definition.key),
    optional_dependents: [...(OPTIONAL_DEPENDENTS_MAP.get(definition.key) || [])],
    entities: [...(definition.entities || [])],
  }));
}

export function getModuleDependencyMatrix() {
  return getModuleDefinitions();
}

export function getModuleConfig() {
  const record = ensureModuleConfigRecord();
  const storedConfig = parseStoredModuleConfig(record.modules);
  return resolveModuleConfig(storedConfig.modules, record, null, storedConfig.storageIssues);
}

export function isModuleEnabled(moduleKey: AppModuleKey) {
  return getModuleConfig().enabled[moduleKey] === true;
}

export function requireModuleEnabled(moduleKey: AppModuleKey) {
  if (!isModuleEnabled(moduleKey)) {
    const definition = MODULE_DEFINITION_MAP.get(moduleKey);
    throw new RouteRequestError(
      403,
      "module_disabled",
      `${definition?.label || "This module"} is currently disabled by an administrator.`
    );
  }
}

export function getMissingDependencies(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>> = normaliseBooleanMap(ensureModuleConfigRecord().modules)
) {
  return getMissingDependenciesForMap(moduleKey, buildEffectiveEnabledMap(normaliseBooleanMap(storedModules)));
}

export function getDependentModules(
  moduleKey: AppModuleKey,
  options: { recursive?: boolean; optional?: boolean } = {}
) {
  const recursive = options.recursive === true;
  const optional = options.optional === true;

  if (optional) {
    return [...(OPTIONAL_DEPENDENTS_MAP.get(moduleKey) || [])];
  }

  if (recursive) {
    return resolveDependentClosure(moduleKey);
  }

  return [...(REQUIRED_DEPENDENTS_MAP.get(moduleKey) || [])];
}

export function resolveDependenciesOnEnable(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>> = normaliseBooleanMap(ensureModuleConfigRecord().modules)
) {
  return resolveDependenciesForEnable(moduleKey, storedModules);
}

export function canEnable(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>> = normaliseBooleanMap(ensureModuleConfigRecord().modules)
) {
  return buildEnableActionPreview(moduleKey, storedModules);
}

export function canDisable(
  moduleKey: AppModuleKey,
  storedModules: Partial<Record<AppModuleKey, boolean>> = normaliseBooleanMap(ensureModuleConfigRecord().modules)
) {
  return buildDisableActionPreview(moduleKey, storedModules);
}

export function validateModuleState(
  storedModules: Partial<Record<AppModuleKey, boolean>> = normaliseBooleanMap(ensureModuleConfigRecord().modules)
) {
  const storageIssues = collectModuleMapIssues(storedModules);
  const validation = validateState(normaliseBooleanMap(storedModules));
  return {
    ...validation,
    valid: validation.valid && storageIssues.length === 0,
    storage_issues: storageIssues,
  };
}

export function updateModuleConfig(
  nextModules: Partial<Record<AppModuleKey, boolean>>,
  context: MutationContext
) {
  const record = ensureModuleConfigRecord();
  const patch = parseModulePatch(nextModules);
  const storedConfig = parseStoredModuleConfig(record.modules);
  const currentStored = storedConfig.modules;
  const normalizedNextState = buildNextStoredModules(currentStored, patch);
  const lastChange = buildChangeSummary(
    currentStored,
    normalizedNextState.storedModules,
    patch,
    normalizedNextState.normalizedModules
  );

  const updatedRecord = updateEntityRecord("AppModuleConfig", record.id, {
    modules: normalizedNextState.storedModules,
    schema_version: MODULE_CONFIG_SCHEMA_VERSION,
  }, {
    actor: context.actor,
    request_source: context.requestSource,
  }) as AppModuleConfigRecord | null;

  const nextRecord = updatedRecord || ensureModuleConfigRecord();
  return resolveModuleConfig(normalizedNextState.storedModules, nextRecord, lastChange);
}

export function getEntityModuleKey(entityName: string): AppModuleKey | null {
  const normalizedEntity = String(entityName || "");
  return ENTITY_MODULE_MAP.get(normalizedEntity) || null;
}
