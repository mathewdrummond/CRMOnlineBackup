import crypto from "node:crypto";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_PRIMARY_MODEL = "qwen2.5:3b-instruct-q4_K_M";
export const DEFAULT_OLLAMA_FAST_MODEL = "gemma3:1b";
export const DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text";

export type AiConfig = {
  enabled: boolean;
  baseUrl: string;
  primaryModel: string;
  fastModel: string;
  embedModel: string;
  requestTimeoutMs: number;
  requestRetries: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
};

export function getAiConfig(): AiConfig {
  return {
    enabled: readBooleanEnv("AI_ENABLED", true),
    baseUrl: normalizeBaseUrl(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL),
    primaryModel: readStringEnv("OLLAMA_PRIMARY_MODEL", DEFAULT_OLLAMA_PRIMARY_MODEL),
    fastModel: readStringEnv("OLLAMA_FAST_MODEL", DEFAULT_OLLAMA_FAST_MODEL),
    embedModel: readStringEnv("OLLAMA_EMBED_MODEL", DEFAULT_OLLAMA_EMBED_MODEL),
    requestTimeoutMs: readIntEnv("AI_REQUEST_TIMEOUT_MS", 30_000, 1_000, 180_000),
    requestRetries: readIntEnv("AI_REQUEST_RETRIES", 1, 0, 5),
    rateLimitMax: readIntEnv("AI_RATE_LIMIT_MAX", 20, 1, 300),
    rateLimitWindowMs: readIntEnv("AI_RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 60 * 60_000),
  };
}

export function getAiModelForRole(role: "primary" | "fast" | "embed", config = getAiConfig()) {
  if (role === "fast") return config.fastModel;
  if (role === "embed") return config.embedModel;
  return config.primaryModel;
}

export function createAiRequestId(prefix = "ai") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function validateAiStartupConfiguration(config = getAiConfig()) {
  const warnings: string[] = [];

  if (!config.enabled) {
    warnings.push("ai_disabled");
  }

  if (!/^https?:\/\//i.test(config.baseUrl)) {
    warnings.push("ollama_base_url_invalid");
  }

  if (!config.primaryModel) warnings.push("ollama_primary_model_missing");
  if (!config.fastModel) warnings.push("ollama_fast_model_missing");
  if (!config.embedModel) warnings.push("ollama_embed_model_missing");

  return {
    ok: warnings.length === 0 || warnings.every((warning) => warning === "ai_disabled"),
    warnings,
  };
}

function readStringEnv(key: string, fallback: string) {
  return String(process.env[key] || "").trim() || fallback;
}

function readBooleanEnv(key: string, fallback: boolean) {
  const value = String(process.env[key] || "").trim().toLowerCase();
  if (!value) return fallback;
  return !["0", "false", "no", "off", "disabled"].includes(value);
}

function readIntEnv(key: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(process.env[key] || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeBaseUrl(value: string) {
  return String(value || DEFAULT_OLLAMA_BASE_URL).trim().replace(/\/+$/, "");
}
