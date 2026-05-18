import { readColumnExportValue, readColumnText } from "./reportingUtils";
import { buildXlsxBlob } from "@/lib/xlsx/workbook";

function cleanCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildExportHeaderLines({ title, filtersSummary, exportedAt }) {
  return [
    [title || "Report Export"],
    ["Filters", filtersSummary || "No filters"],
    ["Exported", exportedAt],
    [],
  ];
}

function buildCsvRows({ title, filtersSummary, exportedAt, columns, rows }) {
  return [
    ...buildExportHeaderLines({ title, filtersSummary, exportedAt }),
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => readColumnText(column, row))),
  ];
}

function buildCsvContent(exportConfig) {
  return buildCsvRows(exportConfig)
    .map((row) => row.map((value) => {
      const text = cleanCell(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    }).join(","))
    .join("\r\n");
}

export async function exportReportCsv(exportConfig) {
  const contents = buildCsvContent(exportConfig);
  downloadBlob(exportConfig.filename, new Blob([contents], { type: "text/csv;charset=utf-8" }));
}

export async function exportReportExcel(exportConfig) {
  const headerLines = buildExportHeaderLines(exportConfig);
  const rows = [
    ...headerLines,
    exportConfig.columns.map((column) => column.label),
    ...exportConfig.rows.map((row) => exportConfig.columns.map((column) => readColumnExportValue(column, row))),
  ];
  const blob = buildXlsxBlob({
    sheetName: "Report",
    rows,
    rowStyles: {
      [headerLines.length + 1]: "header",
    },
    columnWidths: exportConfig.columns.map((column) => Math.max(14, Math.min(40, column.label.length + 6))),
  });
  downloadBlob(
    exportConfig.filename,
    blob
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportReportPdf(exportConfig) {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!reportWindow) {
    throw new Error("Popup blocked");
  }

  const tableHead = exportConfig.columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const tableRows = exportConfig.rows
    .map((row) => `<tr>${exportConfig.columns.map((column) => `<td>${escapeHtml(readColumnText(column, row))}</td>`).join("")}</tr>`)
    .join("");

  reportWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(exportConfig.title)}</title>
        <style>
          body { font-family: Georgia, "Times New Roman", serif; padding: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 26px; }
          p { margin: 0 0 6px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }
          th { background: #f3f4f6; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(exportConfig.title)}</h1>
        <p><strong>Filters:</strong> ${escapeHtml(exportConfig.filtersSummary || "No filters")}</p>
        <p><strong>Exported:</strong> ${escapeHtml(exportConfig.exportedAt)}</p>
        <table>
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}
