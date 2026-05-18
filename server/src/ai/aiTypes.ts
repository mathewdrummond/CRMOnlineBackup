import type { z } from "zod";

export type AiModelRole = "primary" | "fast" | "embed";

export type AiRequestStatus =
  | "success"
  | "disabled"
  | "timeout"
  | "ollama_offline"
  | "invalid_json"
  | "schema_validation_failed"
  | "request_failed";

export type AiGenerationOptions = {
  modelRole?: Exclude<AiModelRole, "embed">;
  model?: string;
  system?: string;
  prompt: string;
  requestId?: string;
  timeoutMs?: number;
  retries?: number;
  temperature?: number;
  stream?: boolean;
};

export type AiStructuredGenerationOptions<TSchema extends z.ZodType> =
  AiGenerationOptions & {
    schema: TSchema;
    schemaName?: string;
  };

export type AiGenerateResult = {
  requestId: string;
  model: string;
  response: string;
  durationMs: number;
  promptTokensEstimate: number;
  responseTokensEstimate: number;
};

export type AiStructuredGenerateResult<T> = Omit<AiGenerateResult, "response"> & {
  data: T;
};

export type AiHealthStatus = {
  enabled: boolean;
  status: "disabled" | "ok" | "offline" | "degraded";
  baseUrl: string;
  primaryModel: string;
  fastModel: string;
  embedModel: string;
  checkedAt: string;
  latencyMs: number | null;
  modelsAvailable: string[];
  configuredModelsAvailable: {
    primary: boolean;
    fast: boolean;
    embed: boolean;
  };
  qdrant?: {
    url: string;
    status: "ok" | "offline";
    latencyMs: number | null;
    error?: string;
  };
  error?: string;
};

export class AiServiceError extends Error {
  status: number;
  code: AiRequestStatus;
  requestId: string;
  detail?: unknown;

  constructor(status: number, code: AiRequestStatus, message: string, requestId: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.detail = detail;
  }
}
