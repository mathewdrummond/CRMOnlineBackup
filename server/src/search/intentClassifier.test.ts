import { describe, expect, test } from "vitest";
import { classifySearchIntent } from "./intentClassifier";

describe("unified search intent classifier", () => {
  test("keeps short operational terms on the direct entity path", () => {
    const result = classifySearchIntent("Smith kitchen");
    expect(result.primary).toBe("entity_search");
    expect(result.requiresAi).toBe(false);
  });

  test("detects direct quote lookup without requiring AI", () => {
    const result = classifySearchIntent("Quote 2415");
    expect(result.primary).toBe("direct_lookup");
    expect(result.intents).toContain("entity_search");
    expect(result.requiresAi).toBe(false);
  });

  test("routes operational questions to grounded AI retrieval", () => {
    const result = classifySearchIntent("What jobs had plumbing delays?");
    expect(result.primary).toBe("operational_question");
    expect(result.requiresAi).toBe(true);
    expect(result.requiresSemantic).toBe(true);
    expect(result.requiresKnowledge).toBe(true);
  });

  test("routes file and workflow language to semantic retrieval", () => {
    const result = classifySearchIntent("Show me install notes mentioning curved islands");
    expect(result.intents).toContain("file_search");
    expect(result.intents).toContain("workflow_lookup");
    expect(result.requiresKnowledge).toBe(true);
  });
});
