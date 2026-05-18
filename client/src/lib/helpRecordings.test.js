import {
  HELP_RECORDINGS,
  buildRecordingStepGuide,
  filterHelpRecordings,
  getRecordingForTour,
  getRecordingsForArticle,
} from "./helpRecordings";
import { GUIDED_TOURS, HELP_ARTICLES } from "./helpContent";

describe("help recordings", () => {
  test("defines Scribe-style walkthroughs for all requested workflow groups", () => {
    expect(HELP_RECORDINGS.length).toBeGreaterThanOrEqual(35);
    expect(new Set(HELP_RECORDINGS.map((recording) => recording.category))).toEqual(new Set([
      "Getting Started",
      "Quotes",
      "Imports",
      "Pricing",
      "Documents",
      "Workshop",
      "Scheduling",
      "Labour Tracking",
      "Files",
    ]));
  });

  test("recordings link to real articles and tours when present", () => {
    const articleIds = new Set(HELP_ARTICLES.map((article) => article.id));
    const tourIds = new Set(GUIDED_TOURS.map((tour) => tour.id));

    HELP_RECORDINGS.forEach((recording) => {
      expect(articleIds.has(recording.articleId)).toBe(true);
      if (recording.tourId) {
        expect(tourIds.has(recording.tourId)).toBe(true);
      }
      expect(recording.videoUrl).toMatch(/^\/help\/walkthroughs\/.+\.jpg$/);
      expect(recording.thumbnailUrl).toMatch(/^\/help\/walkthroughs\/.+\.jpg$/);
      expect(recording.captionTrackUrl).toMatch(/^data:text\/vtt/);
      expect(recording.generationStatus).toBe("ready");
      expect(recording.steps.length).toBeGreaterThanOrEqual(3);
      recording.steps.forEach((step) => {
        expect(step.caption).toBeTruthy();
        expect(step.screenshotAlt).toBeTruthy();
        expect(step.screenshotUrl).toMatch(/^\/help\/walkthroughs\/.+\.jpg$/);
        expect(step.click.label).toBeTruthy();
        expect(step.click.xPercent).toBeGreaterThan(0);
        expect(step.click.yPercent).toBeGreaterThan(0);
        expect(step.why.length).toBeGreaterThan(40);
      });
    });
  });

  test("video library search finds visual workflow recordings", () => {
    const results = filterHelpRecordings({ query: "Mozaik" });
    expect(results.map((recording) => recording.title)).toContain("Import Mozaik CSV");
  });

  test("recordings can be resolved from tours and articles", () => {
    expect(getRecordingForTour("import-mozaik-csv")?.title).toBe("Import Mozaik CSV");
    expect(getRecordingsForArticle("quote-documents-and-generation").length).toBeGreaterThan(0);
  });

  test("step guides include application screenshots and linked articles", () => {
    const guide = buildRecordingStepGuide("import-mozaik-csv");
    expect(guide.articleId).toBeTruthy();
    expect(guide.steps[0].screenshotAlt).toContain("walkthrough frame");
    expect(guide.steps[0].screenshotUrl).toMatch(/^\/help\/walkthroughs\/pricing\.jpg$/);
  });
});
