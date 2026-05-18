import { describe, expect, test } from "vitest";

import { generatePdfFromHtml } from "./htmlPdf";

describe("htmlPdf", () => {
  test("generates a pdf buffer from html", async () => {
    const pdf = await generatePdfFromHtml(`
      <!doctype html>
      <html>
        <head>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #1f2933; }
          </style>
        </head>
        <body>
          <h1>Millbrook Test PDF</h1>
          <p>Rendered via Chromium.</p>
        </body>
      </html>
    `);

    expect(pdf.subarray(0, 8).toString()).toContain("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 20000);
});
