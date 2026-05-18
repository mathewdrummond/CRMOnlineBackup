import moduleDefinitions from "../../../shared/moduleDefinitions.json";

const CLIENT_MODULE_DEFINITIONS = moduleDefinitions;

const CLIENT_MODULE_DEFINITION_MAP = new Map(
  CLIENT_MODULE_DEFINITIONS.map((definition) => [definition.key, definition])
);

function buildReverseDependencyMap(getDependencies) {
  return new Map(
    CLIENT_MODULE_DEFINITIONS.map((definition) => [
      definition.key,
      CLIENT_MODULE_DEFINITIONS
        .filter((candidate) => getDependencies(candidate).includes(definition.key))
        .map((candidate) => candidate.key),
    ])
  );
}

const REQUIRED_DEPENDENTS_MAP = buildReverseDependencyMap((definition) => definition.requiredDependencies);
const OPTIONAL_DEPENDENTS_MAP = buildReverseDependencyMap((definition) => definition.optionalDependencies || []);

function resolveRequiredDependencyClosure(moduleKey, visited = new Set()) {
  const definition = CLIENT_MODULE_DEFINITION_MAP.get(moduleKey);
  if (!definition) {
    return [];
  }

  definition.requiredDependencies.forEach((dependencyKey) => {
    if (visited.has(dependencyKey)) {
      return;
    }
    visited.add(dependencyKey);
    resolveRequiredDependencyClosure(dependencyKey, visited);
  });

  return [...visited];
}

function resolveRequiredDependentClosure(moduleKey, visited = new Set()) {
  (REQUIRED_DEPENDENTS_MAP.get(moduleKey) || []).forEach((dependentKey) => {
    if (visited.has(dependentKey)) {
      return;
    }
    visited.add(dependentKey);
    resolveRequiredDependentClosure(dependentKey, visited);
  });

  return [...visited];
}

function getFallbackEnabledState(moduleKey, explicitEnabled) {
  if (typeof explicitEnabled === "boolean") {
    return explicitEnabled;
  }

  const definition = CLIENT_MODULE_DEFINITION_MAP.get(moduleKey);
  return definition?.group === "core";
}

function buildFallbackModuleRecord(definition, explicitEnabled) {
  const enabled = getFallbackEnabledState(definition.key, explicitEnabled);

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    group: definition.group,
    dependencies: [...definition.requiredDependencies],
    required_dependencies: [...definition.requiredDependencies],
    all_dependencies: resolveRequiredDependencyClosure(definition.key),
    optional_dependencies: [...definition.optionalDependencies],
    entities: [...(definition.entities || [])],
    dependents: [...(REQUIRED_DEPENDENTS_MAP.get(definition.key) || [])],
    all_dependents: resolveRequiredDependentClosure(definition.key),
    optional_dependents: [...(OPTIONAL_DEPENDENTS_MAP.get(definition.key) || [])],
    isCore: definition.group === "core",
    enabled,
    stored_enabled: enabled,
    locked: definition.group === "core",
    state: enabled ? "enabled" : "disabled",
    disabled_by: null,
    blocking_dependencies: [],
    inactive_optional_dependencies: [],
    enable_action: null,
    disable_action: null,
  };
}

function normalizeModuleRecord(module, fallbackDefinition) {
  const source = module && typeof module === "object" ? module : {};
  const definition = fallbackDefinition || CLIENT_MODULE_DEFINITION_MAP.get(source.key) || null;

  if (!definition && !source.key) {
    return null;
  }

  const group = source.group === "core" || definition?.group === "core" ? "core" : "optional";
  const dependencies = Array.isArray(source.dependencies)
    ? source.dependencies.filter(Boolean)
    : [...(definition?.requiredDependencies || [])];
  const requiredDependencies = Array.isArray(source.required_dependencies)
    ? source.required_dependencies.filter(Boolean)
    : dependencies;
  const allDependencies = Array.isArray(source.all_dependencies)
    ? source.all_dependencies.filter(Boolean)
    : definition
      ? resolveRequiredDependencyClosure(definition.key)
      : requiredDependencies;
  const optionalDependencies = Array.isArray(source.optional_dependencies)
    ? source.optional_dependencies.filter(Boolean)
    : [...(definition?.optionalDependencies || [])];
  const dependents = Array.isArray(source.dependents)
    ? source.dependents.filter(Boolean)
    : definition
      ? [...(REQUIRED_DEPENDENTS_MAP.get(definition.key) || [])]
      : [];
  const allDependents = Array.isArray(source.all_dependents)
    ? source.all_dependents.filter(Boolean)
    : definition
      ? resolveRequiredDependentClosure(definition.key)
      : dependents;
  const optionalDependents = Array.isArray(source.optional_dependents)
    ? source.optional_dependents.filter(Boolean)
    : definition
      ? [...(OPTIONAL_DEPENDENTS_MAP.get(definition.key) || [])]
      : [];
  const blockingDependencies = Array.isArray(source.blocking_dependencies)
    ? source.blocking_dependencies.filter(Boolean)
    : [];
  const inactiveOptionalDependencies = Array.isArray(source.inactive_optional_dependencies)
    ? source.inactive_optional_dependencies.filter(Boolean)
    : [];
  const entities = Array.isArray(source.entities)
    ? source.entities.filter(Boolean)
    : [...(definition?.entities || [])];
  const enabled = getFallbackEnabledState(
    definition?.key || source.key,
    typeof source.enabled === "boolean"
      ? source.enabled
      : typeof source.stored_enabled === "boolean"
        ? source.stored_enabled
        : undefined
  );

  return {
    ...source,
    key: source.key || definition?.key || "",
    label: source.label || definition?.label || source.key || "Unknown Module",
    description: source.description || definition?.description || "",
    group,
    dependencies,
    required_dependencies: requiredDependencies,
    all_dependencies: allDependencies,
    optional_dependencies: optionalDependencies,
    entities,
    dependents,
    all_dependents: allDependents,
    optional_dependents: optionalDependents,
    isCore: source.isCore === true || group === "core",
    enabled,
    stored_enabled: typeof source.stored_enabled === "boolean" ? source.stored_enabled : enabled,
    locked: source.locked === true || group === "core",
    state: source.state || (enabled ? "enabled" : "disabled"),
    disabled_by: source.disabled_by || null,
    blocking_dependencies: blockingDependencies,
    inactive_optional_dependencies: inactiveOptionalDependencies,
    enable_action: source.enable_action || null,
    disable_action: source.disable_action || null,
  };
}

function createSummary(modules) {
  const coreModules = modules.filter((module) => module.group === "core");
  const optionalModules = modules.filter((module) => module.group === "optional");

  return {
    total: modules.length,
    core: coreModules.length,
    optional: optionalModules.length,
    enabled_optional: optionalModules.filter((module) => module.enabled).length,
    disabled_optional: optionalModules.filter((module) => !module.enabled).length,
    invalid_requested_states: 0,
  };
}

export function createDefaultModuleConfig() {
  const modules = CLIENT_MODULE_DEFINITIONS.map((definition) => buildFallbackModuleRecord(definition));

  return {
    record_id: "client-default",
    updated_date: "",
    schema_version: 0,
    enabled: modules.reduce((accumulator, module) => {
      accumulator[module.key] = module.enabled === true;
      return accumulator;
    }, {}),
    summary: createSummary(modules),
    validation: {
      valid: true,
      issues: [],
    },
    last_change: null,
    modules,
  };
}

export function normalizeModuleConfig(config) {
  if (!config || typeof config !== "object") {
    return createDefaultModuleConfig();
  }

  const rawEnabled = config.enabled && typeof config.enabled === "object" ? config.enabled : {};
  const normalizedModulesByKey = new Map(
    (Array.isArray(config.modules) ? config.modules : [])
      .map((module) => {
        const fallbackDefinition = CLIENT_MODULE_DEFINITION_MAP.get(module?.key);
        return normalizeModuleRecord(module, fallbackDefinition);
      })
      .filter(Boolean)
      .map((module) => [module.key, module])
  );

  const modules = CLIENT_MODULE_DEFINITIONS.map((definition) => (
    normalizedModulesByKey.get(definition.key)
    || buildFallbackModuleRecord(
      definition,
      typeof rawEnabled[definition.key] === "boolean" ? rawEnabled[definition.key] === true : undefined
    )
  ));

  const enabled = modules.reduce((accumulator, module) => {
    accumulator[module.key] = module.enabled === true;
    return accumulator;
  }, {});

  return {
    record_id: config.record_id || "client-default",
    updated_date: config.updated_date || "",
    schema_version: Number(config.schema_version || 0),
    enabled,
    summary: {
      ...createSummary(modules),
      invalid_requested_states: Number(config.summary?.invalid_requested_states ?? 0),
    },
    validation: {
      valid: config.validation?.valid !== false,
      issues: Array.isArray(config.validation?.issues) ? config.validation.issues : [],
    },
    last_change: config.last_change || null,
    modules,
  };
}

export function isModuleEnabled(config, moduleKey) {
  const moduleRecord = Array.isArray(config?.modules)
    ? config.modules.find((module) => module.key === moduleKey)
    : null;

  if (moduleRecord) {
    return moduleRecord.enabled === true;
  }

  if (typeof config?.enabled?.[moduleKey] === "boolean") {
    return config.enabled[moduleKey] === true;
  }

  return CLIENT_MODULE_DEFINITION_MAP.get(moduleKey)?.group === "core";
}

export function areAnyModulesEnabled(config, moduleKeys = []) {
  return moduleKeys.some((moduleKey) => isModuleEnabled(config, moduleKey));
}
