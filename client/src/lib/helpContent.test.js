import {
  GUIDED_TOURS,
  HELP_ARTICLES,
  HELP_TRAINING_PACKS,
  getHelpContextForPath,
} from "./helpContent";
import { buildHelpDocumentHtml } from "./helpExport";

describe("help content integrity", () => {
  test("route help resolves detail routes to the correct module article", () => {
    expect(getHelpContextForPath("/quotes/abc-123")?.articleId).toBe("quotes-workflow");
    expect(getHelpContextForPath("/leads/lead-1")?.articleId).toBe("leads-and-contacts");
    expect(getHelpContextForPath("/companies/company-1")?.articleId).toBe("leads-and-contacts");
    expect(getHelpContextForPath("/pricing")?.articleId).toBe("pricing-overview");
    expect(getHelpContextForPath("/log-time")?.articleId).toBe("reporting-and-time-tracking");
    expect(getHelpContextForPath("/schedule")?.tourId).toBe("install-planner");
  });

  test("related article links point to real articles", () => {
    const articleIds = new Set(HELP_ARTICLES.map((article) => article.id));
    HELP_ARTICLES.forEach((article) => {
      (article.relatedArticles || []).forEach((relatedArticleId) => {
        expect(articleIds.has(relatedArticleId)).toBe(true);
      });
    });
  });

  test("training packs only reference real articles", () => {
    const articleIds = new Set(HELP_ARTICLES.map((article) => article.id));
    HELP_TRAINING_PACKS.forEach((pack) => {
      pack.articleIds.forEach((articleId) => {
        expect(articleIds.has(articleId)).toBe(true);
      });
    });
  });

  test("guided tours point to real articles and routes", () => {
    const articleIds = new Set(HELP_ARTICLES.map((article) => article.id));
    GUIDED_TOURS.forEach((tour) => {
      expect(articleIds.has(tour.articleId)).toBe(true);
      expect(String(tour.startRoute || "")).toMatch(/^\//);
      tour.steps.forEach((step) => {
        expect(String(step.route || "")).toMatch(/^\//);
        expect(step.why).toBeTruthy();
        expect(step.target).toBeTruthy();
      });
    });
  });

  test("guided tour why text is specific and not repeated within a tour", () => {
    GUIDED_TOURS.forEach((tour) => {
      const whyTexts = tour.steps.map((step) => step.why);
      expect(new Set(whyTexts).size).toBe(whyTexts.length);
      whyTexts.forEach((whyText) => {
        expect(whyText.length).toBeGreaterThan(45);
        expect(whyText).not.toBe("This keeps the workflow predictable and gives the next person a clear record to trust.");
      });
    });
  });

  test("guided tours cover core workshop adoption workflows", () => {
    const tourIds = new Set(GUIDED_TOURS.map((tour) => tour.id));
    [
      "first-login-welcome",
      "dashboard-overview",
      "create-first-lead",
      "import-mozaik-csv",
      "import-supplier-price-list",
      "import-pdf-quote",
      "review-imported-pricing",
      "understanding-review-warnings",
      "adjust-margin-cards",
      "send-quote",
      "archive-quote",
      "restore-archived-quote",
      "categories-vs-sections",
      "auto-inclusions-overview",
      "every-job-auto-inclusions",
      "site-measure-workflow",
      "undo-recovery",
      "archive-vs-delete",
      "import-mistake-recovery",
      "review-states",
    ].forEach((tourId) => expect(tourIds.has(tourId)).toBe(true));
  });

  test("help export HTML includes article content for printable guides", () => {
    const article = HELP_ARTICLES.find((entry) => entry.id === "quotes-workflow");
    const html = buildHelpDocumentHtml({
      title: "Quote Workflow Guide",
      subtitle: "Export test",
      articles: [article],
    });

    expect(html).toContain("Quote Workflow Guide");
    expect(html).toContain("Quotes: Create, Price, and Manage");
    expect(html).toContain("Quote detail tabs");
  });
});
