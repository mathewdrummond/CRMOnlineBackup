const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const textEncoder = new TextEncoder();
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeSheetName(value) {
  const cleaned = String(value || "Sheet1")
    .replace(/[\\/*?:[\]]/g, " ")
    .trim()
    .slice(0, 31);

  return cleaned || "Sheet1";
}

function toColumnLabel(index) {
  let value = Math.max(1, Number(index || 1));
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function concatenateUint8Arrays(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function encodeText(value) {
  return textEncoder.encode(String(value || ""));
}

function computeCrc32(bytes) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getZipTimestamp() {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime =
    ((now.getHours() & 0x1f) << 11)
    | ((now.getMinutes() & 0x3f) << 5)
    | Math.floor((now.getSeconds() & 0x3f) / 2);
  const dosDate =
    (((year - 1980) & 0x7f) << 9)
    | (((now.getMonth() + 1) & 0x0f) << 5)
    | (now.getDate() & 0x1f);

  return { dosTime, dosDate };
}

function createStoredZip(entries) {
  const fileParts = [];
  const centralDirectoryParts = [];
  const { dosTime, dosDate } = getZipTimestamp();
  let offset = 0;

  entries.forEach((entry) => {
    const fileName = encodeText(entry.name);
    const data = typeof entry.data === "string" ? encodeText(entry.data) : entry.data;
    const crc32 = computeCrc32(data);

    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc32, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, fileName.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileName, 30);
    fileParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc32, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(fileName, 46);
    centralDirectoryParts.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralDirectory = concatenateUint8Arrays(centralDirectoryParts);
  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatenateUint8Arrays([
    ...fileParts,
    centralDirectory,
    endOfCentralDirectory,
  ]);
}

function buildColumnWidthXml(columnWidths = []) {
  const columns = columnWidths
    .map((width, index) => {
      const numericWidth = Number(width);
      if (!Number.isFinite(numericWidth) || numericWidth <= 0) {
        return "";
      }

      const columnIndex = index + 1;
      return `<col min="${columnIndex}" max="${columnIndex}" width="${numericWidth}" customWidth="1"/>`;
    })
    .filter(Boolean)
    .join("");

  return columns ? `<cols>${columns}</cols>` : "";
}

function getCellStyleIndex(styleKey = "") {
  if (styleKey === "header") {
    return 1;
  }

  if (styleKey === "summary") {
    return 2;
  }

  return 0;
}

function buildCellXml(value, rowIndex, columnIndex, styleKey = "") {
  if (value == null || value === "") {
    return "";
  }

  const cellReference = `${toColumnLabel(columnIndex)}${rowIndex}`;
  const styleIndex = getCellStyleIndex(styleKey);
  const styleAttribute = styleIndex > 0 ? ` s="${styleIndex}"` : "";

  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.formula === "string") {
    const cachedValue = typeof value.result === "number" && Number.isFinite(value.result)
      ? `<v>${value.result}</v>`
      : "";
    return `<c r="${cellReference}"${styleAttribute}><f>${escapeXml(value.formula)}</f>${cachedValue}</c>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${cellReference}"${styleAttribute}><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return `<c r="${cellReference}" t="b"${styleAttribute}><v>${value ? 1 : 0}</v></c>`;
  }

  return `<c r="${cellReference}" t="inlineStr"${styleAttribute}><is><t>${escapeXml(value)}</t></is></c>`;
}

function isBlankRow(row) {
  if (!Array.isArray(row) || row.length === 0) {
    return true;
  }

  return row.every((value) => value == null || value === "");
}

function buildSheetXml({ rows = [], rowStyles = {}, columnWidths = [] }) {
  let renderedRowIndex = 0;
  const xmlRows = rows
    .map((row, rowIndex) => {
      if (isBlankRow(row)) {
        return "";
      }

      renderedRowIndex += 1;
      const styleKey = rowStyles[rowIndex + 1] || "";
      const cells = row
        .map((value, columnIndex) => buildCellXml(value, renderedRowIndex, columnIndex + 1, styleKey))
        .filter(Boolean)
        .join("");

      return `<row r="${renderedRowIndex}">${cells}</row>`;
    })
    .filter(Boolean)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${buildColumnWidthXml(columnWidths)}
  <sheetData>${xmlRows}</sheetData>
</worksheet>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function buildWorkbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr calcMode="auto"/>
</workbook>`;
}

function buildWorkbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildRootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

export function buildXlsxArrayBuffer(workbook) {
  const sheetName = sanitizeSheetName(workbook?.sheetName);
  const entries = [
    { name: "[Content_Types].xml", data: buildContentTypesXml() },
    { name: "_rels/.rels", data: buildRootRelationshipsXml() },
    { name: "xl/workbook.xml", data: buildWorkbookXml(sheetName) },
    { name: "xl/_rels/workbook.xml.rels", data: buildWorkbookRelationshipsXml() },
    { name: "xl/styles.xml", data: buildStylesXml() },
    { name: "xl/worksheets/sheet1.xml", data: buildSheetXml(workbook || {}) },
  ];

  return createStoredZip(entries).buffer;
}

export function buildXlsxBlob(workbook) {
  return new Blob([buildXlsxArrayBuffer(workbook)], { type: XLSX_MIME_TYPE });
}

export function getXlsxMimeType() {
  return XLSX_MIME_TYPE;
}
