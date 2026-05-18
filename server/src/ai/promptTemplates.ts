export const JSON_ONLY_SYSTEM_PROMPT = [
  "You are an assistive AI subsystem inside JoinerFlow.",
  "Return only valid JSON that matches the requested schema.",
  "Do not include markdown, commentary, code fences, or unrequested fields.",
  "Never claim that business records were changed.",
].join(" ");

export function buildJsonOnlyPrompt(task: string, schemaDescription: string, context: unknown) {
  return [
    `Task: ${task}`,
    `Required JSON schema: ${schemaDescription}`,
    "Context:",
    JSON.stringify(context, null, 2),
  ].join("\n\n");
}
