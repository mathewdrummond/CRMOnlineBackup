import { expect, request, test } from "@playwright/test";

const TEST_API_BASE_URL = "http://127.0.0.1:4100";

async function resetTestState() {
  const api = await request.newContext();
  const response = await api.post(`${TEST_API_BASE_URL}/api/test/reset`);
  expect(response.ok()).toBeTruthy();
  await api.dispose();
}

async function loginAsTestAdmin(page) {
  await page.goto("/login");
  await page.getByTestId("test-login-button").click();
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
}

test.beforeEach(async () => {
  await resetTestState();
});

test("major frontend routes remain stable across responsive viewports", async ({ page }) => {
  const consoleFailures: string[] = [];
  const pageFailures: string[] = [];

  await loginAsTestAdmin(page);

  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("401 (Unauthorized)")) {
      consoleFailures.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageFailures.push(error.message);
  });

  const routes = [
    { path: "/", heading: "Operations" },
    { path: "/dashboard", heading: "Dashboard" },
    { path: "/jobs", heading: "Jobs" },
    { path: "/quotes", heading: "Quotes" },
    { path: "/schedule", heading: "Install Planner" },
    { path: "/help", heading: "Help Centre" },
  ];
  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route.path);
      await page.locator("main").evaluate((element) => element.scrollTo(0, 0));
      await expect(page.locator("main")).toContainText(route.heading);

      const overflow = await page.evaluate(() => {
        const documentElement = document.documentElement;
        return documentElement.scrollWidth - documentElement.clientWidth;
      });

      expect(overflow, `${route.path} overflowed by ${overflow}px at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  }

  expect(pageFailures).toEqual([]);
  expect(consoleFailures).toEqual([]);
});
