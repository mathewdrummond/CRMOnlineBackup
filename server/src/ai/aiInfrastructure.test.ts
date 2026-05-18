import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { generateStructured, generateText } from "./aiClient";
import { AiServiceError } from "./aiTypes";
import { parseJsonOnlyResponse, validateStructuredOutput } from "./structuredOutput";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  delete process.env.AI_ENABLED;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.AI_REQUEST_TIMEOUT_MS;
  delete process.env.AI_REQUEST_RETRIES;
});

describe("AI structured output enforcement", () => {
  test("rejects malformed AI responses", () => {
    expect(() => parseJsonOnlyResponse("```json\n{\"ok\":true}\n```", "test-request"))
      .toThrow(AiServiceError);
  });

  test("rejects invalid JSON", () => {
    expect(() => parseJsonOnlyResponse("{ ok: true", "test-request"))
      .toThrow("AI response was not valid JSON");
  });

  test("rejects Zod validation failures", () => {
    const schema = z.object({ ok: z.boolean() }).strict();

    expect(() => validateStructuredOutput("{\"ok\":\"yes\"}", schema, "test-request"))
      .toThrow("AI response did not match the required schema");
  });
});

describe("Ollama AI client safety", () => {
  test("isolates Ollama offline failures", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_REQUEST_RETRIES = "0";
    global.fetch = vi.fn(async () => {
      throw new TypeError("connection refused");
    }) as typeof fetch;

    await expect(generateText({
      requestId: "offline-request",
      prompt: "Return JSON",
    })).rejects.toMatchObject({
      code: "ollama_offline",
      status: 503,
      requestId: "offline-request",
    });
  });

  test("handles timeout deterministically", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_REQUEST_RETRIES = "0";
    global.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as typeof fetch;

    await expect(generateText({
      requestId: "timeout-request",
      prompt: "Return JSON",
      timeoutMs: 5,
    })).rejects.toMatchObject({
      code: "timeout",
      status: 504,
      requestId: "timeout-request",
    });
  });

  test("validates structured Ollama responses", async () => {
    process.env.AI_ENABLED = "true";
    process.env.AI_REQUEST_RETRIES = "0";
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      response: "{\"ok\":true}",
      done: true,
      prompt_eval_count: 5,
      eval_count: 3,
    }), { status: 200 })) as typeof fetch;

    const result = await generateStructured({
      requestId: "structured-request",
      prompt: "Return JSON",
      schema: z.object({ ok: z.boolean() }).strict(),
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.requestId).toBe("structured-request");
  });

  test("AI can be disabled entirely", async () => {
    process.env.AI_ENABLED = "false";

    await expect(generateText({
      requestId: "disabled-request",
      prompt: "Return JSON",
    })).rejects.toMatchObject({
      code: "disabled",
      status: 503,
    });
  });
});
