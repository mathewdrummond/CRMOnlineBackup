import fs from "node:fs";
import path from "node:path";
import { AiRequestStatus } from "./aiTypes";

const DEFAULT_LOG_DIRECTORY = path.resolve(__dirname, "..", "..", "logs");

type AiLogLevel = "info" | "warn" | "error";

export function logAiEvent(event: string, detail: Record<string, unknown> = {}, level: AiLogLevel = "info") {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    category: "ai",
    event,
    ...detail,
  };

  appendStructuredLog(getAppLogPath(), payload);
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  method(`[ai] ${event}`, detail);
}

export function logAiRequest(detail: {
  requestId: string;
  model: string;
  status: AiRequestStatus;
  durationMs?: number;
  promptTokensEstimate?: number;
  responseTokensEstimate?: number;
  error?: string;
}) {
  logAiEvent("ai_request", detail, detail.status === "success" ? "info" : "warn");
}

export function estimateTokens(text: string) {
  const value = String(text || "").trim();
  if (!value) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

function getLogDirectory() {
  return path.resolve(process.env.LOG_DIRECTORY || DEFAULT_LOG_DIRECTORY);
}

function getAppLogPath() {
  return path.join(getLogDirectory(), "app.jsonl");
}

function appendStructuredLog(filePath: string, payload: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
}
