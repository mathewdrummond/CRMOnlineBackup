import path from "node:path";

export const TEXT_BASED_EXTENSIONS = [
  "txt",
  "md",
  "csv",
  "json",
  "xml",
  "html",
  "log",
] as const;

export const OFFICE_DOCUMENT_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
] as const;

export const DRAWING_METADATA_ONLY_EXTENSIONS = [
  "bxf",
  "mozaik",
  "cnc",
  "cutlist",
] as const;

export const DEFAULT_ALLOWED_EXTENSIONS = [
  ...TEXT_BASED_EXTENSIONS,
  ...OFFICE_DOCUMENT_EXTENSIONS,
  ...DRAWING_METADATA_ONLY_EXTENSIONS,
];

const SUPPORTED_EXTENSION_SET = new Set(DEFAULT_ALLOWED_EXTENSIONS.map((value) => value.toLowerCase()));
const TEXT_EXTENSION_SET = new Set(TEXT_BASED_EXTENSIONS.map((value) => value.toLowerCase()));
const DRAWING_EXTENSION_SET = new Set(DRAWING_METADATA_ONLY_EXTENSIONS.map((value) => value.toLowerCase()));
const OFFICE_EXTENSION_SET = new Set(OFFICE_DOCUMENT_EXTENSIONS.map((value) => value.toLowerCase()));

export type SupportedKnowledgeExtension = typeof DEFAULT_ALLOWED_EXTENSIONS[number];

export function normalizeExtension(fileNameOrPath: string) {
  const extension = path.extname(String(fileNameOrPath || "")).toLowerCase().replace(/^\./, "").trim();
  return extension;
}

export function toNormalizedExtensions(values: unknown) {
  if (!Array.isArray(values)) {
    return [...DEFAULT_ALLOWED_EXTENSIONS];
  }

  const normalized = values
    .map((value) => String(value || "").toLowerCase().replace(/^\./, "").trim())
    .filter(Boolean)
    .filter((value) => SUPPORTED_EXTENSION_SET.has(value));

  if (normalized.length === 0) {
    return [...DEFAULT_ALLOWED_EXTENSIONS];
  }

  return [...new Set(normalized)];
}

export function isSupportedExtension(extension: string) {
  return SUPPORTED_EXTENSION_SET.has(String(extension || "").toLowerCase());
}

export function isTextBasedExtension(extension: string) {
  return TEXT_EXTENSION_SET.has(String(extension || "").toLowerCase());
}

export function isOfficeDocumentExtension(extension: string) {
  return OFFICE_EXTENSION_SET.has(String(extension || "").toLowerCase());
}

export function isMetadataOnlyExtension(extension: string) {
  return DRAWING_EXTENSION_SET.has(String(extension || "").toLowerCase());
}
