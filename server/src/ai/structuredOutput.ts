import { z } from "zod";
import { createAiRequestId } from "./aiConfig";
import { AiServiceError } from "./aiTypes";

export function parseJsonOnlyResponse(rawResponse: string, requestId = createAiRequestId("ai_parse")) {
  const trimmed = String(rawResponse || "").trim();
  if (!trimmed) {
    throw new AiServiceError(502, "invalid_json", "AI response was empty.", requestId);
  }

  if (/```/.test(trimmed)) {
    throw new AiServiceError(502, "invalid_json", "AI response included markdown instead of JSON only.", requestId);
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new AiServiceError(
      502,
      "invalid_json",
      "AI response was not valid JSON.",
      requestId,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export function validateStructuredOutput<TSchema extends z.ZodType>(
  rawResponse: string,
  schema: TSchema,
  requestId = createAiRequestId("ai_validate")
): z.infer<TSchema> {
  const parsed = parseJsonOnlyResponse(rawResponse, requestId);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiServiceError(
      502,
      "schema_validation_failed",
      "AI response did not match the required schema.",
      requestId,
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    );
  }

  return result.data;
}

export const aiTestResponseSchema = z.object({
  ok: z.boolean(),
  summary: z.string().trim().min(1).max(500),
  recommended_next_step: z.string().trim().min(1).max(500),
}).strict();
