import { z } from "zod";
import { createAiRequestId, getAiConfig, getAiModelForRole } from "./aiConfig";
import { estimateTokens, logAiRequest } from "./aiLogger";
import { JSON_ONLY_SYSTEM_PROMPT } from "./promptTemplates";
import { validateStructuredOutput } from "./structuredOutput";
import {
  AiGenerateResult,
  AiGenerationOptions,
  AiServiceError,
  AiStructuredGenerationOptions,
  AiStructuredGenerateResult,
} from "./aiTypes";

type OllamaGenerateResponse = {
  response?: string;
  done?: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

export async function generateText(options: AiGenerationOptions): Promise<AiGenerateResult> {
  const config = getAiConfig();
  const requestId = options.requestId || createAiRequestId();
  const model = options.model || getAiModelForRole(options.modelRole || "primary", config);
  const startedAt = Date.now();
  const prompt = String(options.prompt || "");
  const system = options.system || "";

  if (!config.enabled) {
    logAiRequest({ requestId, model, status: "disabled", durationMs: 0 });
    throw new AiServiceError(503, "disabled", "AI assistance is disabled.", requestId);
  }

  const retries = options.retries ?? config.requestRetries;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const payload = {
        model,
        prompt,
        system,
        stream: false,
        format: "json",
        options: {
          temperature: options.temperature ?? 0,
        },
      };
      const response = await fetchWithTimeout(`${config.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, options.timeoutMs ?? config.requestTimeoutMs);

      if (!response.ok) {
        throw new AiServiceError(
          response.status >= 500 ? 503 : 502,
          "request_failed",
          `Ollama request failed with status ${response.status}.`,
          requestId
        );
      }

      const body = await response.json() as OllamaGenerateResponse;
      const durationMs = Date.now() - startedAt;
      const result = {
        requestId,
        model,
        response: String(body.response || ""),
        durationMs,
        promptTokensEstimate: Number(body.prompt_eval_count || 0) || estimateTokens(`${system}\n${prompt}`),
        responseTokensEstimate: Number(body.eval_count || 0) || estimateTokens(String(body.response || "")),
      };
      logAiRequest({
        requestId,
        model,
        status: "success",
        durationMs,
        promptTokensEstimate: result.promptTokensEstimate,
        responseTokensEstimate: result.responseTokensEstimate,
      });
      return result;
    } catch (error) {
      lastError = error;
      if (error instanceof AiServiceError && !["timeout", "ollama_offline", "request_failed"].includes(error.code)) {
        break;
      }
      if (attempt < retries) {
        await delay(Math.min(250 * (attempt + 1), 1_000));
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  const normalized = normalizeAiError(lastError, requestId);
  logAiRequest({
    requestId,
    model,
    status: normalized.code,
    durationMs,
    promptTokensEstimate: estimateTokens(`${system}\n${prompt}`),
    error: normalized.message,
  });
  throw normalized;
}

export async function generateStructured<TSchema extends z.ZodType>(
  options: AiStructuredGenerationOptions<TSchema>
): Promise<AiStructuredGenerateResult<z.infer<TSchema>>> {
  const result = await generateText({
    ...options,
    system: [JSON_ONLY_SYSTEM_PROMPT, options.system || ""].filter(Boolean).join("\n\n"),
  });

  const data = validateStructuredOutput(result.response, options.schema, result.requestId);
  return {
    requestId: result.requestId,
    model: result.model,
    data,
    durationMs: result.durationMs,
    promptTokensEstimate: result.promptTokensEstimate,
    responseTokensEstimate: result.responseTokensEstimate,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError(504, "timeout", "Ollama request timed out.", createAiRequestId());
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAiError(error: unknown, requestId: string) {
  if (error instanceof AiServiceError) {
    return new AiServiceError(error.status, error.code, error.message, requestId, error.detail);
  }

  if (error instanceof TypeError) {
    return new AiServiceError(503, "ollama_offline", "Ollama is offline or unreachable.", requestId, error.message);
  }

  return new AiServiceError(
    502,
    "request_failed",
    error instanceof Error ? error.message : "AI request failed.",
    requestId
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
