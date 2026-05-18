import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { areAnyModulesEnabled, createDefaultModuleConfig, isModuleEnabled, normalizeModuleConfig } from "./moduleConfig";

const APP_KIND = import.meta.env.VITE_APP_KIND || "crm";
const MODULE_CONFIG_CACHE_KEY = "crm-module-config";
const ModuleContext = createContext(null);

function canUseStorage() {
  return (
    typeof window !== "undefined"
    && typeof window.localStorage !== "undefined"
    && typeof window.localStorage?.getItem === "function"
    && typeof window.localStorage?.setItem === "function"
    && typeof window.localStorage?.removeItem === "function"
  );
}

function readCachedModuleConfig() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(MODULE_CONFIG_CACHE_KEY);
    if (!rawValue) {
      return null;
    }

    return normalizeModuleConfig(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function writeCachedModuleConfig(config) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(MODULE_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Ignore cache write failures and keep the in-memory config.
  }
}

export function ModuleProvider({ children }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [moduleConfig, setModuleConfig] = useState(() => createDefaultModuleConfig());
  const [modulesLoaded, setModulesLoaded] = useState(APP_KIND === "timeclock");
  const [isLoadingModules, setIsLoadingModules] = useState(false);

  useEffect(() => {
    if (APP_KIND === "timeclock") {
      setModuleConfig(createDefaultModuleConfig());
      setModulesLoaded(true);
      setIsLoadingModules(false);
      return;
    }

    if (isLoadingAuth) {
      return;
    }

    if (!isAuthenticated) {
      setModuleConfig(createDefaultModuleConfig());
      setModulesLoaded(true);
      setIsLoadingModules(false);
      return;
    }

    setIsLoadingModules(true);
    crmApi.modules.getConfig()
      .then((config) => {
        const normalizedConfig = normalizeModuleConfig(config);
        setModuleConfig(normalizedConfig);
        writeCachedModuleConfig(normalizedConfig);
      })
      .catch(() => {
        setModuleConfig(readCachedModuleConfig() || createDefaultModuleConfig());
      })
      .finally(() => {
        setModulesLoaded(true);
        setIsLoadingModules(false);
      });
  }, [isAuthenticated, isLoadingAuth]);

  const refreshModules = async () => {
    if (APP_KIND === "timeclock") {
      const fallback = createDefaultModuleConfig();
      setModuleConfig(fallback);
      return fallback;
    }

    try {
      const config = await crmApi.modules.getConfig();
      const normalizedConfig = normalizeModuleConfig(config);
      setModuleConfig(normalizedConfig);
      writeCachedModuleConfig(normalizedConfig);
      return normalizedConfig;
    } catch {
      const fallbackConfig = readCachedModuleConfig() || moduleConfig || createDefaultModuleConfig();
      setModuleConfig(fallbackConfig);
      return fallbackConfig;
    }
  };

  const updateModules = async (patch) => {
    const nextConfig = await crmApi.modules.updateConfig({ modules: patch });
    const normalizedConfig = normalizeModuleConfig(nextConfig);
    setModuleConfig(normalizedConfig);
    writeCachedModuleConfig(normalizedConfig);
    return normalizedConfig;
  };

  const toggleModule = async (moduleKey, enabled) => {
    try {
      const nextConfig = await updateModules({ [moduleKey]: enabled });
      const moduleRecord = nextConfig?.modules?.find((module) => module.key === moduleKey);
      const lastChange = nextConfig?.last_change;
      const autoEnabledLabels = (lastChange?.auto_enabled || [])
        .map((dependencyKey) => nextConfig?.modules?.find((module) => module.key === dependencyKey)?.label || dependencyKey)
        .filter(Boolean);
      const autoDisabledLabels = (lastChange?.auto_disabled || [])
        .map((dependencyKey) => nextConfig?.modules?.find((module) => module.key === dependencyKey)?.label || dependencyKey)
        .filter(Boolean);
      const optionalImpactLabels = (lastChange?.impacted_optional_modules || [])
        .map((dependencyKey) => nextConfig?.modules?.find((module) => module.key === dependencyKey)?.label || dependencyKey)
        .filter(Boolean);

      toast({
        title: enabled ? "Module enabled" : "Module disabled",
        description: [
          lastChange?.message
            || (moduleRecord?.label
              ? `${moduleRecord.label} has been ${enabled ? "enabled" : "disabled"}.`
              : "The module setting was updated."),
          autoEnabledLabels.length > 0 ? `Auto-enabled: ${autoEnabledLabels.join(", ")}.` : "",
          autoDisabledLabels.length > 0 ? `Also disabled: ${autoDisabledLabels.join(", ")}.` : "",
          optionalImpactLabels.length > 0 ? `Reduced related behaviour in: ${optionalImpactLabels.join(", ")}.` : "",
        ].filter(Boolean).join(" "),
      });
      return nextConfig;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update modules",
        description: error?.message || "The module setting could not be saved.",
      });
      throw error;
    }
  };

  const value = useMemo(() => ({
    moduleConfig,
    modulesLoaded,
    isLoadingModules,
    moduleDefinitions: moduleConfig?.modules || [],
    isModuleEnabled: (moduleKey) => isModuleEnabled(moduleConfig, moduleKey),
    areAnyModulesEnabled: (moduleKeys) => areAnyModulesEnabled(moduleConfig, moduleKeys),
    refreshModules,
    updateModules,
    toggleModule,
  }), [isLoadingModules, moduleConfig, modulesLoaded]);

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>;
}

export function useModules() {
  const context = useContext(ModuleContext);

  if (!context) {
    throw new Error("useModules must be used within a ModuleProvider");
  }

  return context;
}
