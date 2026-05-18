import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROMIUM_CANDIDATE_PATHS = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean) as string[];

function resolveChromiumExecutablePath() {
  return CHROMIUM_CANDIDATE_PATHS.find((candidatePath) => fs.existsSync(candidatePath));
}

export async function generatePdfFromHtml(html: string) {
  const executablePath = resolveChromiumExecutablePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: process.env.NODE_ENV === "production" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1240, height: 1754 },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
