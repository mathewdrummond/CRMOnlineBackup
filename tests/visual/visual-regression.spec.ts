import { expect, test } from "@playwright/test";
import {
  expectVisualSnapshot,
  loginAsVisualAdmin,
  prepareVisualPage,
  resetVisualState,
  seedVisualData,
  visualViewports,
} from "./visual-helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await resetVisualState();
  await prepareVisualPage(page);
});

test("login screen visual baseline", async ({ page }) => {
  await page.setViewportSize(visualViewports[2]);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Millbrook CRM" })).toBeVisible();
  await expectVisualSnapshot(page, "login-desktop");
});

test("major responsive route baselines", async ({ page }) => {
  await loginAsVisualAdmin(page);
  await seedVisualData(page);

  const routes = [
    { path: "/", label: "operations", heading: "Operations" },
    { path: "/dashboard", label: "dashboard", heading: "Dashboard" },
    { path: "/quotes", label: "quotes", heading: "Quotes" },
    { path: "/jobs", label: "jobs", heading: "Jobs" },
    { path: "/schedule", label: "schedule", heading: "Install Planner" },
    { path: "/time-tracking", label: "timeclock", heading: "Time Clock" },
    { path: "/access", label: "access-admin", heading: "Access & Modules" },
    { path: "/help", label: "help-centre", heading: "Help Centre" },
  ];

  for (const viewport of visualViewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator("main")).toContainText(route.heading);
      await page.locator("main").evaluate((element) => element.scrollTo(0, 0));
      await expectVisualSnapshot(page, `${route.label}-${viewport.key}`);
    }
  }
});

test("navigation, dialogs, and component preview baselines", async ({ page }) => {
  await loginAsVisualAdmin(page);
  await seedVisualData(page);

  await page.setViewportSize(visualViewports[0]);
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expectVisualSnapshot(page, "mobile-navigation-open");

  await page.setViewportSize(visualViewports[2]);
  await page.goto("/quotes");
  await page.getByRole("button", { name: "New Quote" }).click();
  await expect(page.getByRole("dialog", { name: "New Quote" })).toBeVisible();
  await expectVisualSnapshot(page, "new-quote-dialog-desktop");

  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add Job" }).click();
  await expect(page.getByRole("dialog", { name: "New Job" })).toBeVisible();
  await expectVisualSnapshot(page, "new-job-dialog-desktop");

  await page.goto("/__ui-preview");
  await expect(page.getByTestId("component-preview")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Preview Dialog" })).toBeVisible();
  await expectVisualSnapshot(page, "component-preview-overlay-desktop");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Preview Dialog" })).toBeHidden();
  await expectVisualSnapshot(page, "component-preview-desktop");
});
