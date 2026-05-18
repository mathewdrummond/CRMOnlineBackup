import { buildXlsxArrayBuffer } from "./workbook";

const textDecoder = new TextDecoder();

function readStoredZipEntries(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let offset = 0;

  while (offset + 30 <= view.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);

    expect(compressionMethod).toBe(0);

    const fileNameStart = offset + 30;
    const dataStart = fileNameStart + fileNameLength + extraFieldLength;
    const fileName = textDecoder.decode(bytes.slice(fileNameStart, fileNameStart + fileNameLength));
    const data = textDecoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    entries.set(fileName, data);

    offset = dataStart + compressedSize;
  }

  return entries;
}

describe("xlsx workbook builder", () => {
  test("creates a valid workbook archive with sheet content and styles", () => {
    const buffer = buildXlsxArrayBuffer({
      sheetName: "Report",
      rows: [
        ["Title", "Hours"],
        ["Assemble", 12.5],
        ["TOTAL", 12.5],
      ],
      rowStyles: {
        1: "header",
        3: "summary",
      },
      columnWidths: [24, 14],
    });

    const entries = readStoredZipEntries(buffer);

    expect(entries.get("[Content_Types].xml")).toContain("/xl/workbook.xml");
    expect(entries.get("xl/workbook.xml")).toContain('sheet name="Report"');
    expect(entries.get("xl/styles.xml")).toContain("<cellXfs count=\"3\">");
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("<cols><col min=\"1\" max=\"1\" width=\"24\"");
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("<c r=\"A1\" t=\"inlineStr\" s=\"1\">");
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("<c r=\"B2\"><v>12.5</v></c>");
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("<c r=\"A3\" t=\"inlineStr\" s=\"2\">");
  });

  test("skips completely blank rows and preserves style mapping for rendered rows", () => {
    const buffer = buildXlsxArrayBuffer({
      sheetName: "Report",
      rows: [
        ["Title", "Hours"],
        [],
        ["TOTAL", 12.5],
      ],
      rowStyles: {
        1: "header",
        3: "summary",
      },
    });

    const entries = readStoredZipEntries(buffer);
    const sheetXml = entries.get("xl/worksheets/sheet1.xml");

    expect(sheetXml).toContain("<c r=\"A1\" t=\"inlineStr\" s=\"1\">");
    expect(sheetXml).toContain("<c r=\"A2\" t=\"inlineStr\" s=\"2\">");
    expect(sheetXml).not.toContain("<row r=\"3\">");
  });

  test("writes formulas with cached values and automatic workbook calculation", () => {
    const buffer = buildXlsxArrayBuffer({
      sheetName: "Report",
      rows: [
        ["Qty", "Unit", "Total"],
        [2, 50, { formula: "A2*B2", result: 100 }],
        ["TOTAL", "", { formula: "SUM(C2:C2)", result: 100 }],
      ],
      rowStyles: {
        1: "header",
        3: "summary",
      },
    });

    const entries = readStoredZipEntries(buffer);
    const sheetXml = entries.get("xl/worksheets/sheet1.xml");

    expect(entries.get("xl/workbook.xml")).toContain("<calcPr calcMode=\"auto\"/>");
    expect(sheetXml).toContain("<c r=\"C2\"><f>A2*B2</f><v>100</v></c>");
    expect(sheetXml).toContain("<c r=\"C3\" s=\"2\"><f>SUM(C2:C2)</f><v>100</v></c>");
  });
});
