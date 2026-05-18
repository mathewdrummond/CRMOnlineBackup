function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderArticleSection(section) {
  return `
    <section class="section">
      <h2>${escapeHtml(section.heading || "")}</h2>
      ${(section.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      ${(section.bullets || []).length ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>` : ""}
      ${(section.steps || []).length ? `<ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : ""}
      ${(section.notes || []).length ? `<div class="notes">${section.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>` : ""}
    </section>
  `;
}

export function buildHelpDocumentHtml({ title, subtitle = "", articles = [] }) {
  const renderedArticles = articles.map((article) => `
    <article class="article">
      <header class="article-header">
        <p class="eyebrow">${escapeHtml(article.category || "")}</p>
        <h1>${escapeHtml(article.title || "")}</h1>
        ${article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : ""}
      </header>
      ${(article.sections || []).map((section) => renderArticleSection(section)).join("")}
    </article>
  `).join('<div class="page-break"></div>');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 18mm 16mm; }
      body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #2c241d;
        margin: 0;
        background: #ffffff;
      }
      .document {
        max-width: 920px;
        margin: 0 auto;
        padding: 24px 0 40px;
      }
      .document-header {
        border-bottom: 2px solid #d7c8b0;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      .document-header h1 {
        font-size: 30px;
        margin: 0 0 8px;
      }
      .document-header p {
        margin: 0;
        color: #685a4d;
        font-size: 14px;
      }
      .article {
        break-inside: avoid-page;
      }
      .article-header {
        margin-bottom: 18px;
      }
      .eyebrow {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        color: #9b4f1c;
        font-weight: 700;
      }
      .article h1 {
        font-size: 24px;
        margin: 0 0 8px;
      }
      .summary {
        font-size: 15px;
        color: #685a4d;
      }
      .section {
        break-inside: avoid-page;
        margin-bottom: 18px;
      }
      .section h2 {
        font-size: 18px;
        margin: 0 0 10px;
      }
      p, li {
        font-size: 14px;
        line-height: 1.6;
      }
      ul, ol {
        padding-left: 20px;
        margin: 10px 0;
      }
      .notes {
        border-left: 3px solid #d7c8b0;
        padding-left: 12px;
        color: #685a4d;
      }
      .page-break {
        break-before: page;
      }
      @media print {
        .document {
          max-width: none;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="document">
      <header class="document-header">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </header>
      ${renderedArticles}
    </div>
  </body>
</html>`;
}

export function downloadHtmlDocument(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function openHtmlDocumentInNewTab(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!openedWindow) {
    window.location.assign(url);
    return;
  }
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function printHelpDocument(html) {
  const printFrame = document.createElement("iframe");
  printFrame.style.position = "fixed";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";
  printFrame.style.opacity = "0";
  const cleanup = () => {
    window.setTimeout(() => {
      if (printFrame.parentNode) {
        printFrame.parentNode.removeChild(printFrame);
      }
    }, 500);
  };
  printFrame.addEventListener("load", () => {
    const frameWindow = printFrame.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    const handleAfterPrint = () => {
      frameWindow.removeEventListener("afterprint", handleAfterPrint);
      cleanup();
    };
    frameWindow.addEventListener("afterprint", handleAfterPrint);
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(cleanup, 1500);
    }, 120);
  }, { once: true });
  document.body.appendChild(printFrame);
  printFrame.srcdoc = html;
}
