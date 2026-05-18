import { getAiConfig } from "./aiConfig";
import { logAiEvent } from "./aiLogger";
import { AiHealthStatus } from "./aiTypes";
import { getVectorStoreConfig } from "./vectorStore";

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

export async function checkAiHealth(timeoutMs = 2_000): Promise<AiHealthStatus> {
  const config = getAiConfig();
  const checkedAt = new Date().toISOString();

  if (!config.enabled) {
    return {
      enabled: false,
      status: "disabled",
      baseUrl: config.baseUrl,
      primaryModel: config.primaryModel,
      fastModel: config.fastModel,
      embedModel: config.embedModel,
      checkedAt,
      latencyMs: null,
      modelsAvailable: [],
      configuredModelsAvailable: {
        primary: false,
        fast: false,
        embed: false,
      },
    };
  }

  const startedAt = Date.now();
  const qdrant = await checkQdrantHealth(timeoutMs);
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/api/tags`, timeoutMs);
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const body = await response.json() as OllamaTagsResponse;
    const modelsAvailable = (body.models || [])
      .map((model) => String(model.name || model.model || "").trim())
      .filter(Boolean);
    const modelSet = new Set(modelsAvailable);
    const configuredModelsAvailable = {
      primary: modelSet.has(config.primaryModel),
      fast: modelSet.has(config.fastModel),
      embed: modelSet.has(config.embedModel),
    };
    const status = Object.values(configuredModelsAvailable).every(Boolean) ? "ok" : "degraded";
    const health: AiHealthStatus = {
      enabled: true,
      status,
      baseUrl: config.baseUrl,
      primaryModel: config.primaryModel,
      fastModel: config.fastModel,
      embedModel: config.embedModel,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      modelsAvailable,
      configuredModelsAvailable,
      qdrant,
    };
    logAiEvent("ai_health_check", {
      status: health.status,
      latency_ms: health.latencyMs,
      models_available: modelsAvailable.length,
    }, status === "ok" ? "info" : "warn");
    return health;
  } catch (error) {
    const health: AiHealthStatus = {
      enabled: true,
      status: "offline",
      baseUrl: config.baseUrl,
      primaryModel: config.primaryModel,
      fastModel: config.fastModel,
      embedModel: config.embedModel,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      modelsAvailable: [],
      configuredModelsAvailable: {
        primary: false,
        fast: false,
        embed: false,
      },
      qdrant,
      error: error instanceof Error ? error.message : String(error),
    };
    logAiEvent("ai_health_check", {
      status: health.status,
      latency_ms: health.latencyMs,
      error: health.error,
    }, "warn");
    return health;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkQdrantHealth(timeoutMs: number) {
  const config = getVectorStoreConfig();
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(`${config.url}/healthz`, timeoutMs);
    if (!response.ok) {
      throw new Error(`Qdrant returned ${response.status}`);
    }
    return {
      url: config.url,
      status: "ok" as const,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url: config.url,
      status: "offline" as const,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
