import { HELP_CONTENT_AUDIT, REQUIRED_HELP_WORKFLOWS } from "./helpQuality";

describe("help quality audit", () => {
  test("required workshop workflows are covered without duplicate recording titles", () => {
    expect(REQUIRED_HELP_WORKFLOWS.length).toBeGreaterThan(35);
    expect(HELP_CONTENT_AUDIT.missingWorkflows).toEqual([]);
    expect(HELP_CONTENT_AUDIT.duplicateRecordingTitles).toEqual([]);
  });

  test("training content has no outdated or placeholder terminology", () => {
    expect(HELP_CONTENT_AUDIT.outdatedTerms).toEqual([]);
    expect(HELP_CONTENT_AUDIT.brokenRecordingLinks).toEqual([]);
    expect(HELP_CONTENT_AUDIT.emptyRecordingMedia).toEqual([]);
  });

  test("library categories support the final workshop help structure", () => {
    expect(HELP_CONTENT_AUDIT.missingCategories).toEqual([]);
    expect(HELP_CONTENT_AUDIT.status).toBe("clean");
  });
});
