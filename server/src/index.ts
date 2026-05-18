import cors from "cors";
import express, { Request, Response } from "express";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getAiConfig, validateAiStartupConfiguration } from "./ai/aiConfig";
import { buildAiDiagnostics } from "./ai/aiDiagnostics";
import { logAiEvent } from "./ai/aiLogger";
import { AiServiceError } from "./ai/aiTypes";
import { deleteEmbeddingForRecord, ensureEmbeddingIndex } from "./ai/embeddings/embeddingIndex";
import { queueEmbeddingRefresh, queueInitialEmbeddingBackfill, stopEmbeddingQueue } from "./ai/embeddings/embeddingQueue";
import { stopVectorSyncQueue } from "./ai/vectorStore";
import {
  ensureKnowledgeTables,
  getKnowledgeStats,
  listKnowledgeQueueSummary,
  listKnowledgeSources,
} from "./ai/knowledge/chunkStorage";
import { startKnowledgeIndexingScheduler, stopKnowledgeIndexingScheduler } from "./ai/knowledge/indexingScheduler";
import {
  isKnowledgeQueuePaused,
  processKnowledgeQueueBatch,
} from "./ai/knowledge/indexingQueue";
import {
  enrichPriceListRowsWithAiSuggestions,
  enrichQuoteImportWithAiSuggestions,
} from "./ai/imports/importIntelligence";
import { registerAiRoutes } from "./routes/aiRoutes";
import {
  applyBackupRetention,
  applyLogRetention,
  buildDiagnosticsSnapshot,
  createBackupSnapshot,
  deleteBackupSnapshot,
  getBackupSnapshot,
  getLogFileDescriptor,
  importBackupSnapshot,
  listBackupSnapshots,
  readLogFile,
  restoreBackupSnapshotById,
  runDatabaseMaintenance,
} from "./adminOperations";
import {
  AuthError,
  authenticateWithGoogleCredential,
  clearSessionCookie,
  createOrInviteAccessUser,
  getAuthConfig,
  hasSessionCookie,
  invalidateUserSessions,
  listAccessUsers,
  requireAdminUserFromToken,
  requireAuthenticatedUserFromToken,
  updateAccessUser,
  writeSessionCookie,
} from "./auth";
import {
  getEntityModuleKey,
  getModuleConfig,
  requireModuleEnabled,
  updateModuleConfig,
} from "./appModules";
import { formatLocalDate, normalizeDateOnly } from "./dateUtils";
import {
  createAttachmentVersionRecord,
  countAuditLogRecords,
  closeDatabase,
  createEntityRecord,
  deleteAttachmentVersions,
  deleteEntityRecord,
  EntityConflictError,
  getDatabaseDiagnostics,
  getEntityRecord,
  initializeDatabase,
  isKnownEntityName,
  listAllAttachmentVersions,
  listAttachmentVersions,
  listAuditLogRecords,
  listEntityCounts,
  listEntityRecords,
  runInTransaction,
  resetDatabaseForTests,
  updateAttachmentVersionRecord,
  updateEntityRecord,
  getPersistenceParitySnapshot,
} from "./db";
import { readDatabaseDriver } from "./infrastructure/databaseMode";
import { getCompanyDetailBundle } from "./companyDetail";
import {
  listInstallPlannerEntries,
  deleteInstallPlannerEntry,
  saveInstallPlannerEntry,
} from "./installPlanner";
import {
  enrichJobWithWorkflowDefaults,
  ensureQuoteWorkflowTasks,
  ensureWorkflowTaskCoverage,
  ensureJobWorkflowDefaults,
  ensureJobWorkflowTasks,
  getWorkflowExampleForQuote,
  getRoleMappingSummary,
  getWorkflowExampleForJob,
  getWorkflowTemplateSummary,
  reconcileJobWorkflowStatuses,
  reconcileQuoteWorkflowStatuses,
} from "./jobWorkflow";
import {
  applyLeadCategoryDefaultsToLeadPayload,
  createLeadCategoryRecord,
  deleteLeadCategoryRecord,
  ensureLeadCategoryDefaults,
  updateLeadCategoryRecord,
} from "./leadCategories";
import {
  SAFE_TEMPLATE_FIELDS,
  buildDefaultDocumentTemplate,
  buildSampleQuoteDocument,
  buildTemplateRecordPayload,
  generateDocumentTemplatePdf,
  importMozaikTemplate,
  normalizeDocumentTemplate,
  renderDocumentTemplateHtml,
  validateDocumentTemplate,
} from "./documentTemplates";
import {
  DEFAULT_DISCLAIMER,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_TERMS_SECTIONS,
  buildClientFacingDocumentPayload,
  buildQuoteDocumentDraft,
  calculateDefaultPaymentSchedule,
  calculateDocumentTotals,
  generateQuoteDocumentPdf,
  renderQuoteDocumentHtml,
  validateQuoteDocument,
} from "./quoteDocuments";
import { generatePdfFromHtml } from "./htmlPdf";
import { RouteRequestError } from "./routeError";
import { buildAssignedStaffDisplay, resolveAssignedStaffIds, resolveLaneStaffRecord } from "./staffIdentity";
import { getDashboardOverviewData, getOperationsHubData, getReportingDatasets } from "./uiData";
import {
  completeTimer,
  ensureTimeTrackingConstraints,
  normalizeTimeEntryPayload as normalizeSegmentedTimeEntryPayload,
  pauseTimer,
  repairTimeTrackingData,
  resumeTimer,
  startTimer,
  syncTimeEntrySideEffects as syncSegmentedTimeEntrySideEffects,
} from "./timeTracking";
import {
  applyPricingRules,
  buildPricingAssumptions,
  buildScenarios,
  buildPriceListSummary,
  buildSupplierImportProfile,
  calculatePricing,
  compareHistoricalJobs,
  parseMozaikFile,
  parseMozaikCsv,
  parsePriceListFile,
  parseQuoteImportFile,
  stagePriceListRows,
  validatePriceListSchema,
} from "./pricingModel";
import {
  buildPricingCategoryRecord,
  normalizePricingCategoryName,
} from "./pricingCategories";
import {
  buildPricingSectionRecord,
  findMatchingPricingSection,
  normalizePricingSectionName,
} from "./pricingSections";
import { EntityRecord, LocalUser } from "./types";
import { loadEnvFiles } from "./runtimeConfig";

loadEnvFiles();

const DEFAULT_FILESYSTEM_DIRECTORY = path.resolve(__dirname, "..", "filesystem");
const DEFAULT_SQLITE_PATH = path.resolve(__dirname, "..", "data", "joinerflow.sqlite");
const DEFAULT_LOG_DIRECTORY = path.resolve(__dirname, "..", "logs");
const FILESYSTEM_SUBDIRECTORIES = ["jobs", "quotes", "contacts", "companies", ".versions"];
const SERVER_PACKAGE_PATH = path.resolve(__dirname, "..", "package.json");
const REQUEST_ID_HEADER = "X-Request-Id";
const TIMECLOCK_KIOSK_KEY_HEADER = "X-Timeclock-Kiosk-Key";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ADDRESS_SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const GLOBAL_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const GLOBAL_RATE_LIMIT_MAX = 300;
const AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 30;
const MUTATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MUTATION_RATE_LIMIT_MAX = 120;
const addressSearchCache = new Map<string, { timestamp: number; results: AddressSuggestion[] }>();
let activeMaintenanceOperation: null | { kind: string; started_at: string; note: string } = null;

type AddressSuggestion = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: Record<string, string>;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimiter = {
  buckets: Map<string, RateLimitBucket>;
  max: number;
  windowMs: number;
};

const uploadSchema = z.object({
  related_id: z.string().trim().min(1).max(128),
  related_type: z.enum(["job", "quote", "contact", "company"]),
  name: z.string().trim().min(1).max(180),
  mime_type: z.string().trim().min(1).max(120),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES).optional(),
  data_base64: z.string().trim().min(1).max(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 1024),
  document_information: z.string().trim().max(4000).optional(),
  production_visibility: z.enum(["production", "install", "management", "internal"]).optional(),
  visible_to_production: z.boolean().optional(),
});

const accessUserSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "member"]).optional(),
  status: z.enum(["active", "invited", "revoked"]).optional(),
  full_name: z.string().trim().max(120).optional(),
});

const googleLoginSchema = z.object({
  credential: z.string().trim().min(20).max(4096),
});

const testSessionSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "member"]).optional(),
});

const quoteConversionSchema = z.object({
  job_number: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._/\- ]+$/),
});

const moduleConfigSchema = z.object({
  modules: z.record(z.string(), z.boolean()).default({}),
});

const backupCreateSchema = z.object({
  label: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});

const backupImportSchema = z.object({
  source_path: z.string().trim().min(1).max(600),
});

const backupRetentionSchema = z.object({
  keep_latest: z.coerce.number().int().min(1).max(200),
});

const logRetentionSchema = z.object({
  app_keep_entries: z.coerce.number().int().min(1).max(50000),
  security_keep_entries: z.coerce.number().int().min(1).max(50000),
});

const installPlannerSaveSchema = z.object({
  job_id: z.string().trim().min(1).max(128),
  operation_id: z.string().trim().max(128).optional(),
  install_label: z.string().trim().max(160).optional(),
  title: z.string().trim().max(180).optional(),
  description: z.string().trim().max(4000).optional(),
  install_type: z.enum(["install", "measure", "delivery", "service", "admin", "prep"]).optional(),
  duration_hours: z.coerce.number().min(0.25).max(500).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  deadline: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  earliest_start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  latest_finish: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dependencies: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  assigned_staff_ids: z.array(z.string().trim().min(1).max(128)).max(10).optional(),
  assigned_crew_id: z.string().trim().max(128).optional(),
  required_crew_size: z.coerce.number().int().min(1).max(20).optional(),
  required_skills: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  preferred_crew_id: z.string().trim().max(128).optional(),
  crew_assignment_locked: z.coerce.boolean().optional(),
  lane_id: z.string().trim().max(128).optional(),
  location: z.string().trim().max(240).optional(),
  status: z.enum(["pending", "scheduled", "ready", "in_progress", "complete", "completed", "on_hold"]).optional(),
  manually_locked: z.coerce.boolean().optional(),
  start_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const installPlannerDeleteSchema = z.object({
  job_id: z.string().trim().min(1).max(128),
  operation_id: z.string().trim().max(128).optional(),
});

const pricingImportSchema = z.object({
  quote_id: z.string().trim().max(128).optional(),
  job_name: z.string().trim().max(180).optional(),
  raw_csv: z.string().max(2_000_000).optional().default(""),
  file_name: z.string().trim().max(240).optional(),
  file_type: z.enum(["csv", "xlsx", "pdf"]).optional(),
  file_base64: z.string().trim().max(8_000_000).optional(),
  column_mapping: z.record(z.string(), z.array(z.string())).optional(),
}).refine((value) => Boolean(value.raw_csv || value.file_base64), {
  message: "A CSV string or uploaded file is required.",
  path: ["raw_csv"],
});

const pricingDefaultsSaveSchema = z.object({
  source_quote_id: z.string().trim().max(128).optional(),
  source_import_id: z.string().trim().max(128).optional(),
  items: z.array(z.object({
    pricing_item_id: z.string().trim().max(128).optional(),
    match_name: z.string().trim().max(240).optional(),
    fields: z.record(z.string(), z.unknown()),
  })).default([]),
});

const pricingDeactivateSchema = z.object({
  source_quote_id: z.string().trim().max(128).optional(),
  source_import_id: z.string().trim().max(128).optional(),
  reason: z.string().trim().max(500).optional(),
});

const pricingAutoInclusionsSaveSchema = z.object({
  source_quote_id: z.string().trim().max(128).optional(),
  source_import_id: z.string().trim().max(128).optional(),
  save_as_default: z.boolean().default(false),
  inclusions: z.array(z.object({
    id: z.string().trim().max(128).optional(),
    inclusion_pricing_item_id: z.string().trim().max(128).optional(),
    inclusion_sku: z.string().trim().max(160).optional(),
    inclusion_description: z.string().trim().min(1).max(240),
    inclusion_category: z.string().trim().max(80).optional(),
    quantity_logic: z.enum(["fixed", "per_imported_item", "per_set", "custom_multiplier", "custom_formula"]).default("per_imported_item"),
    quantity_value: z.coerce.number().min(0).max(100000).default(1),
    custom_formula: z.string().trim().max(240).optional(),
    unit_cost: z.coerce.number().min(0).max(1000000).default(0),
    markup_percent: z.coerce.number().min(0).max(1000).default(30),
    is_active: z.boolean().default(true),
  })).default([]),
});

const quoteGlobalInclusionApplySchema = z.object({
  rule_ids: z.array(z.string().trim().min(1).max(128)).optional(),
});

const quoteGlobalInclusionConfirmSchema = z.object({
  section: z.string().trim().min(1).max(120).optional(),
  section_id: z.string().trim().max(128).optional(),
  section_key: z.string().trim().max(128).optional(),
  section_display_order: z.coerce.number().min(0).max(100000).optional(),
});

const quoteMarginAdjustmentSchema = z.object({
  action_type: z.enum(["gross_margin_adjustment", "material_margin_adjustment"]),
  target_margin_percent: z.coerce.number().min(0).max(95),
  include_locked: z.boolean().default(false),
});

const pricingCalculationSchema = z.object({
  quote_id: z.string().trim().max(128).optional(),
  job_name: z.string().trim().max(180).optional(),
  job_type: z.string().trim().max(120).optional(),
  items: z.array(z.record(z.string(), z.unknown())).default([]),
  auto_inclusions: z.array(z.record(z.string(), z.unknown())).optional(),
  labour_profile: z.record(z.string(), z.unknown()).optional(),
  assumptions: z.record(z.string(), z.unknown()).optional(),
  persist: z.boolean().optional(),
});

const priceListStageSchema = z.object({
  supplier: z.string().trim().min(1).max(180),
  supplier_id: z.string().trim().max(128).optional(),
  file_name: z.string().trim().min(1).max(240),
  file_type: z.enum(["csv", "xlsx", "pdf"]).optional(),
  file_base64: z.string().trim().min(1).max(8_000_000),
  ocr_text: z.string().trim().max(2_000_000).optional(),
  column_mapping: z.record(z.string(), z.string()).optional(),
  movement_threshold_percent: z.coerce.number().min(1).max(100).optional(),
});

const priceListCommitSchema = z.object({
  create_new_items: z.boolean().default(false),
  row_ids: z.array(z.string()).optional(),
});

const quoteImportStageSchema = z.object({
  quote_id: z.string().trim().min(1).max(128),
  job_name: z.string().trim().max(180).optional(),
  file_name: z.string().trim().min(1).max(240),
  file_type: z.enum(["csv", "xlsx", "pdf"]).optional(),
  file_base64: z.string().trim().min(1).max(8_000_000),
  ocr_text: z.string().trim().max(2_000_000).optional(),
  default_markup_percent: z.coerce.number().min(0).max(1000).optional(),
});

const quoteImportCommitSchema = z.object({
  row_ids: z.array(z.string()).optional(),
  replace_existing_imported: z.boolean().default(false),
  force_destructive_replace: z.boolean().default(false),
});

const quoteImportUpdateLineItemsSchema = z.object({
  row_ids: z.array(z.string()).optional(),
  apply_removed_rows: z.boolean().default(false),
});

const pricingCategoryMergeSchema = z.object({
  target_category_id: z.string().trim().min(1).max(128),
  allow_inactive_target: z.boolean().default(false),
});

const pricingSectionMergeSchema = z.object({
  target_section_id: z.string().trim().min(1).max(128),
});

const quoteDocumentLineItemSchema = z.object({
  description: z.string().trim().max(500),
  quantity: z.coerce.number().min(0).max(1_000_000).default(1),
  unit: z.string().trim().max(40).default("ea"),
  total: z.coerce.number().min(0).max(100_000_000).default(0),
  section: z.string().trim().max(180).optional(),
  sectionDisplayOrder: z.coerce.number().min(0).max(100000).optional(),
  notes: z.string().trim().max(4000).optional(),
  gstTreatment: z.string().trim().max(80).optional(),
  isOptional: z.boolean().optional(),
  sortOrder: z.coerce.number().min(0).max(100000).optional(),
});

const quoteDocumentTermSectionSchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().max(10_000),
});

const quoteDocumentSchema = z.object({
  quoteId: z.string().trim().min(1).max(128),
  jobId: z.string().trim().max(128).optional().default(""),
  quoteNumber: z.string().trim().max(120).optional().default(""),
  customerName: z.string().trim().max(240).default(""),
  customerPhone: z.string().trim().max(120).default(""),
  customerEmail: z.string().trim().max(240).default(""),
  jobName: z.string().trim().max(240).default(""),
  jobAddress: z.string().trim().max(500).default(""),
  jobNotes: z.string().trim().max(20_000).default(""),
  scopeNotes: z.string().trim().max(20_000).default(""),
  specificationNotes: z.string().trim().max(30_000).default(""),
  preparedBy: z.string().trim().max(240).optional().default(""),
  generatedAt: z.string().trim().max(80).optional().default(""),
  lineItems: z.array(quoteDocumentLineItemSchema).default([]),
  subtotalExGst: z.coerce.number().min(0).max(100_000_000).default(0),
  gstAmount: z.coerce.number().min(0).max(100_000_000).default(0),
  totalIncGst: z.coerce.number().min(0).max(100_000_000).default(0),
  depositAmount: z.coerce.number().min(0).max(100_000_000).default(0),
  balanceDue: z.coerce.number().min(0).max(100_000_000).default(0),
  issueDate: z.string().trim().max(40).default(""),
  documentType: z.enum(["quote", "contract", "quote_list"]).default("contract"),
  paymentTerms: z.string().trim().max(20_000).default(DEFAULT_PAYMENT_TERMS),
  disclaimer: z.string().trim().max(30_000).default(DEFAULT_DISCLAIMER),
  termsSections: z.array(quoteDocumentTermSectionSchema).default(DEFAULT_TERMS_SECTIONS),
  status: z.string().trim().max(80).optional().default("draft"),
});

const quoteDocumentRequestSchema = z.object({
  document_type: z.enum(["quote", "contract", "quote_list"]).optional(),
  template_id: z.string().trim().max(128).optional(),
  document: quoteDocumentSchema.optional(),
});

const templateBlockSchema = z.object({
  id: z.string().trim().max(128).optional(),
  pageIndex: z.coerce.number().int().min(0).max(100).default(0),
  type: z.enum(["text", "richText", "field", "table", "image", "line", "signature", "terms", "spacer"]).default("text"),
  x: z.coerce.number().min(0).max(2000).default(0),
  y: z.coerce.number().min(0).max(3000).default(0),
  width: z.coerce.number().min(1).max(2000).default(160),
  height: z.coerce.number().min(1).max(3000).default(40),
  styleJson: z.record(z.string(), z.unknown()).default({}),
  contentJson: z.record(z.string(), z.unknown()).default({}),
  bindingKey: z.string().trim().max(120).optional().default(""),
  repeatSource: z.string().trim().max(120).optional().default(""),
  sortOrder: z.coerce.number().min(0).max(100000).optional().default(0),
}).passthrough();

const documentTemplatePayloadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  type: z.enum(["quote", "contract", "invoice", "quote_list"]).default("contract"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  pageSize: z.literal("a4").default("a4"),
  margins: z.object({
    top: z.coerce.number().min(0).max(240).default(48),
    right: z.coerce.number().min(0).max(240).default(48),
    bottom: z.coerce.number().min(0).max(240).default(48),
    left: z.coerce.number().min(0).max(240).default(48),
  }).default({ top: 48, right: 48, bottom: 48, left: 48 }),
  defaultFont: z.string().trim().max(80).default("Arial"),
  sourceType: z.enum(["native", "imported_mozaik", "imported_pdf", "duplicated"]).default("native"),
  blocks: z.array(templateBlockSchema).max(1000).default([]),
  version: z.coerce.number().int().min(1).max(100000).default(1),
});

const documentTemplateCreateSchema = documentTemplatePayloadSchema.partial({
  status: true,
  pageSize: true,
  margins: true,
  defaultFont: true,
  sourceType: true,
  blocks: true,
  version: true,
}).extend({
  name: z.string().trim().min(1).max(180),
  type: z.enum(["quote", "contract", "invoice"]).default("contract"),
});

const documentTemplateImportSchema = z.object({
  file_name: z.string().trim().min(1).max(260),
  content: z.string().max(8_000_000),
  type: z.enum(["quote", "contract", "invoice"]).optional().default("contract"),
});

const RECORD_CODE_PATTERN = /^[A-Za-z0-9._/\- ]+$/;
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ONLY_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const staffStatusSchema = z.enum(["active", "inactive"]);
const jobStatusSchema = z.enum(["planning", "approved", "production", "ready_to_install", "installed", "callback", "complete", "on_hold", "cancelled"]);
const invoiceTypeSchema = z.enum(["deposit", "progress", "final", "variation"]);
const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "overdue", "cancelled"]);
const purchaseOrderStatusSchema = z.enum(["draft", "sent", "acknowledged", "part_received", "received", "cancelled"]);
const appAlertTypeSchema = z.enum(["info", "warning", "urgent", "overdue"]);
const appAlertCategorySchema = z.enum(["lead", "quote", "job", "purchasing", "timesheet", "general"]);
const quoteStatusSchema = z.enum([
  "draft",
  "awaiting_bruce",
  "awaiting_mathew",
  "quote_complete",
  "awaiting_confirmation",
  "won",
  "sent",
  "accepted",
  "revised",
  "declined",
  "expired",
]);
const timeEntryStatusSchema = z.enum(["active", "paused", "completed", "complete"]);

function requiredTextField(label: string, maxLength: number) {
  return z.string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maxLength, `${label} must be ${maxLength} characters or less.`);
}

function optionalTextField(label: string, maxLength: number) {
  return z.string()
    .trim()
    .max(maxLength, `${label} must be ${maxLength} characters or less.`);
}

function requiredCodeField(label: string, maxLength: number) {
  return requiredTextField(label, maxLength).regex(RECORD_CODE_PATTERN, `${label} contains invalid characters.`);
}

function optionalCodeField(label: string, maxLength: number) {
  return optionalTextField(label, maxLength).refine(
    (value) => !value || RECORD_CODE_PATTERN.test(value),
    `${label} contains invalid characters.`
  );
}

function isFiniteNumberLike(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed);
  }

  return false;
}

function parseNumberLike(value: unknown) {
  return typeof value === "string" ? Number(value.trim()) : Number(value);
}

function numberField(
  label: string,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
) {
  return z.any()
    .refine(isFiniteNumberLike, `${label} must be a valid number.`)
    .refine(
      (value) => !options.integer || Number.isInteger(parseNumberLike(value)),
      `${label} must be a whole number.`
    )
    .refine(
      (value) => options.min == null || parseNumberLike(value) >= options.min,
      `${label} must be at least ${options.min}.`
    )
    .refine(
      (value) => options.max == null || parseNumberLike(value) <= options.max,
      `${label} must be no more than ${options.max}.`
    );
}

function isValidDateOnlyValue(value: string) {
  if (!DATE_ONLY_VALUE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isValidDateLikeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (DATE_ONLY_VALUE_PATTERN.test(trimmed)) {
    return isValidDateOnlyValue(trimmed);
  }

  return !Number.isNaN(Date.parse(trimmed));
}

function optionalEmailField(label: string) {
  return z.string()
    .trim()
    .max(254, `${label} must be 254 characters or less.`)
    .refine((value) => !value || SIMPLE_EMAIL_PATTERN.test(value), `${label} must be a valid email address.`);
}

function optionalDateField(label: string, maxLength = 40) {
  return z.string()
    .trim()
    .max(maxLength, `${label} must be ${maxLength} characters or less.`)
    .refine((value) => isValidDateLikeValue(value), `${label} must be a valid date.`);
}

const staffRecordSchema = z.object({
  name: requiredTextField("Staff name", 160),
  employee_id: requiredCodeField("Employee ID", 80),
  employee_record_id: optionalCodeField("Employee record ID", 120).optional(),
  email: optionalEmailField("Email").optional(),
  phone: optionalTextField("Phone", 80).optional(),
  staff_type: z.enum(["Employee", "Contractor"]).optional(),
  hourly_rate: numberField("Hourly rate", { min: 0, max: 10000 }).optional(),
  status: staffStatusSchema.optional(),
}).passthrough();

const appAlertRecordSchema = z.object({
  title: requiredTextField("Alert title", 180),
  message: requiredTextField("Alert message", 2000),
  type: appAlertTypeSchema.optional(),
  category: appAlertCategorySchema.optional(),
  related_id: optionalTextField("Related record ID", 128).optional(),
  related_type: optionalTextField("Related type", 80).optional(),
  assigned_to: optionalTextField("Assigned to", 160).optional(),
  is_read: z.boolean().optional(),
  is_resolved: z.boolean().optional(),
}).passthrough();

const jobRecordSchema = z.object({
  title: requiredTextField("Job title", 180),
  job_number: requiredCodeField("Job number", 80),
  contact_id: optionalTextField("Contact ID", 128).optional(),
  contact_name: optionalTextField("Contact name", 180).optional(),
  company_id: optionalTextField("Company ID", 128).optional(),
  company_name: optionalTextField("Company name", 180).optional(),
  site_address: optionalTextField("Site address", 500).optional(),
  status: jobStatusSchema.optional(),
  budget_hours: numberField("Budget hours", { min: 0, max: 100000 }).optional(),
  quoted_value: numberField("Quoted value", { min: 0, max: 100000000 }).optional(),
  billing_basis: optionalTextField("Billing basis", 80).optional(),
  job_source: optionalTextField("Job source", 80).optional(),
  is_walk_in: z.boolean().optional(),
  due_date: optionalDateField("Due date").optional(),
  lead_id: optionalTextField("Lead ID", 128).optional(),
  notes: optionalTextField("Notes", 4000).optional(),
  salesperson: optionalTextField("Salesperson", 160).optional(),
}).passthrough();

const quoteRecordSchema = z.object({
  title: requiredTextField("Quote title", 180),
  quote_number: requiredCodeField("Quote number", 80),
  status: quoteStatusSchema.optional(),
  contact_id: optionalTextField("Contact ID", 128).optional(),
  contact_name: optionalTextField("Contact name", 180).optional(),
  company_id: optionalTextField("Company ID", 128).optional(),
  company_name: optionalTextField("Company name", 180).optional(),
  site_address: optionalTextField("Site address", 500).optional(),
  assigned_to: optionalTextField("Assigned to", 160).optional(),
  valid_until: optionalDateField("Valid until").optional(),
  subtotal: numberField("Subtotal", { min: 0, max: 100000000 }).optional(),
  gst: numberField("GST", { min: 0, max: 100000000 }).optional(),
  total: numberField("Total", { min: 0, max: 100000000 }).optional(),
}).passthrough();

const invoiceRecordSchema = z.object({
  invoice_number: optionalCodeField("Invoice number", 80).optional(),
  job_id: requiredTextField("Job ID", 128),
  job_number: optionalCodeField("Job number", 80).optional(),
  job_title: optionalTextField("Job title", 180).optional(),
  contact_id: optionalTextField("Contact ID", 128).optional(),
  contact_name: optionalTextField("Contact name", 180).optional(),
  company_name: optionalTextField("Company name", 180).optional(),
  type: invoiceTypeSchema.optional(),
  status: invoiceStatusSchema.optional(),
  subtotal: numberField("Subtotal", { min: 0, max: 100000000 }).optional(),
  gst: numberField("GST", { min: 0, max: 100000000 }).optional(),
  total: numberField("Total", { min: 0, max: 100000000 }).optional(),
  amount_paid: numberField("Amount paid", { min: 0, max: 100000000 }).optional(),
  issue_date: optionalDateField("Issue date").optional(),
  due_date: optionalDateField("Due date").optional(),
  paid_date: optionalDateField("Paid date").optional(),
  notes: optionalTextField("Notes", 4000).optional(),
}).passthrough();

const purchaseOrderRecordSchema = z.object({
  po_number: optionalCodeField("PO number", 80).optional(),
  supplier_id: optionalTextField("Supplier ID", 128).optional(),
  supplier_name: requiredTextField("Supplier name", 180),
  job_id: optionalTextField("Job ID", 128).optional(),
  job_number: optionalCodeField("Job number", 80).optional(),
  job_title: optionalTextField("Job title", 180).optional(),
  status: purchaseOrderStatusSchema.optional(),
  subtotal: numberField("Subtotal", { min: 0, max: 100000000 }).optional(),
  gst: numberField("GST", { min: 0, max: 100000000 }).optional(),
  total: numberField("Total", { min: 0, max: 100000000 }).optional(),
  order_date: optionalDateField("Order date").optional(),
  expected_date: optionalDateField("Expected delivery").optional(),
  received_date: optionalDateField("Received date").optional(),
  notes: optionalTextField("Notes", 4000).optional(),
  ordered_by: optionalTextField("Ordered by", 160).optional(),
}).passthrough();

const poItemRecordSchema = z.object({
  po_id: requiredTextField("Purchase order ID", 128),
  description: requiredTextField("PO item description", 500),
  quantity: numberField("Quantity", { min: 0, max: 1000000 }).optional(),
  unit: optionalTextField("Unit", 40).optional(),
  unit_price: numberField("Unit price", { min: 0, max: 100000000 }).optional(),
  total: numberField("Line total", { min: 0, max: 100000000 }).optional(),
  received_qty: numberField("Received quantity", { min: 0, max: 1000000 }).optional(),
  job_id: optionalTextField("Job ID", 128).optional(),
  sort_order: numberField("Sort order", { min: 0, max: 1000000, integer: true }).optional(),
}).passthrough();

const timeSegmentSchema = z.object({
  started_at: optionalDateField("Segment start").optional(),
  ended_at: optionalDateField("Segment end").optional(),
  duration_minutes: numberField("Segment duration", { min: 0, max: 10080 }).optional(),
}).passthrough();

const timeEntryRecordSchema = z.object({
  staff_id: requiredTextField("Staff ID", 128),
  staff_name: optionalTextField("Staff name", 160).optional(),
  employee_id: optionalCodeField("Employee ID", 80).optional(),
  job_id: optionalTextField("Job ID", 128).optional(),
  job_number: optionalCodeField("Job number", 80).optional(),
  job_name: optionalTextField("Job name", 180).optional(),
  job_title: optionalTextField("Job title", 180).optional(),
  customer: optionalTextField("Customer", 180).optional(),
  company_name: optionalTextField("Company name", 180).optional(),
  job_operation_id: optionalTextField("Job operation ID", 128).optional(),
  job_operation_label: optionalTextField("Job operation label", 160).optional(),
  workflow_phase: optionalTextField("Workflow phase", 80).optional(),
  operation: optionalTextField("Operation", 80).optional(),
  activity: optionalTextField("Activity", 120).optional(),
  description: optionalTextField("Description", 2000).optional(),
  notes: optionalTextField("Notes", 2000).optional(),
  location_type: optionalTextField("Location type", 40).optional(),
  session_group_id: optionalTextField("Session group ID", 160).optional(),
  manual_override: z.boolean().optional(),
  manual_reason: optionalTextField("Manual reason", 500).optional(),
  resume_context: z.record(z.string(), z.unknown()).nullable().optional(),
  break_minutes: numberField("Break minutes", { min: 0, max: 600 }).optional(),
  hours: numberField("Hours", { min: 0, max: 1000 }).optional(),
  hourly_rate: numberField("Hourly rate", { min: 0, max: 10000 }).optional(),
  is_break: z.boolean().optional(),
  entry_kind: optionalTextField("Entry kind", 40).optional(),
  status: timeEntryStatusSchema.optional(),
  date: optionalDateField("Date").optional(),
  clock_in: optionalDateField("Clock-in", 64).optional(),
  clock_out: optionalDateField("Clock-out", 64).optional(),
  paused_at: optionalDateField("Paused at", 64).optional(),
  exported: z.boolean().optional(),
  segments: z.array(timeSegmentSchema).optional(),
}).passthrough();

const reportViewFilterValueSchema = z.union([
  z.string().trim().max(180),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().trim().max(180)).max(50),
]);

const reportViewRecordSchema = z.object({
  name: requiredTextField("Report view name", 120),
  user_id: optionalTextField("User ID", 128).optional(),
  user_name: optionalTextField("User name", 160).optional(),
  pack_key: optionalCodeField("Pack key", 80).optional(),
  report_key: optionalCodeField("Report key", 80).optional(),
  description: optionalTextField("Description", 500).optional(),
  is_default: z.boolean().optional(),
  grouping: optionalCodeField("Grouping", 80).optional(),
  sort: z.object({
    column: optionalCodeField("Sort column", 80).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
  }).passthrough().optional(),
  filters: z.record(z.string(), reportViewFilterValueSchema).optional(),
  visible_columns: z.array(z.string().trim().min(1).max(80)).max(60).optional(),
}).passthrough();

const entityMutationSchemas: Partial<Record<string, z.ZodType<Record<string, unknown>>>> = {
  AppAlert: appAlertRecordSchema,
  Staff: staffRecordSchema,
  Invoice: invoiceRecordSchema,
  Job: jobRecordSchema,
  POItem: poItemRecordSchema,
  PurchaseOrder: purchaseOrderRecordSchema,
  Quote: quoteRecordSchema,
  TimeEntry: timeEntryRecordSchema,
  ReportView: reportViewRecordSchema,
};

type UploadRule = {
  extensions: string[];
  mimeTypes: string[];
  inline: boolean;
  signature?: (buffer: Buffer) => boolean;
};

const BINARY_CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURES = [Buffer.from("504b0304", "hex"), Buffer.from("504b0506", "hex"), Buffer.from("504b0708", "hex")];
const UPLOAD_RULES: UploadRule[] = [
  {
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    inline: true,
    signature: (buffer) => buffer.subarray(0, 5).equals(Buffer.from("%PDF-")),
  },
  {
    extensions: [".png"],
    mimeTypes: ["image/png"],
    inline: true,
    signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  },
  {
    extensions: [".jpg", ".jpeg"],
    mimeTypes: ["image/jpeg"],
    inline: true,
    signature: (buffer) => buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
  },
  {
    extensions: [".gif"],
    mimeTypes: ["image/gif"],
    inline: true,
    signature: (buffer) => buffer.subarray(0, 6).equals(Buffer.from("474946383761", "hex"))
      || buffer.subarray(0, 6).equals(Buffer.from("474946383961", "hex")),
  },
  {
    extensions: [".webp"],
    mimeTypes: ["image/webp"],
    inline: true,
    signature: (buffer) => buffer.length >= 12
      && buffer.subarray(0, 4).equals(Buffer.from("RIFF"))
      && buffer.subarray(8, 12).equals(Buffer.from("WEBP")),
  },
  {
    extensions: [".avif"],
    mimeTypes: ["image/avif"],
    inline: true,
    signature: (buffer) => hasIsoBaseMediaType(buffer, ["avif"]),
  },
  {
    extensions: [".heic"],
    mimeTypes: ["image/heic", "image/heif"],
    inline: true,
    signature: (buffer) => hasIsoBaseMediaType(buffer, ["heic", "heix", "heif", "heim"]),
  },
  {
    extensions: [".docx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    inline: false,
    signature: (buffer) => hasZipSignature(buffer),
  },
  {
    extensions: [".xlsx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    inline: false,
    signature: (buffer) => hasZipSignature(buffer),
  },
  {
    extensions: [".doc"],
    mimeTypes: ["application/msword"],
    inline: false,
    signature: (buffer) => buffer.subarray(0, 8).equals(BINARY_CFB_SIGNATURE),
  },
  {
    extensions: [".xls"],
    mimeTypes: ["application/vnd.ms-excel"],
    inline: false,
    signature: (buffer) => buffer.subarray(0, 8).equals(BINARY_CFB_SIGNATURE),
  },
  {
    extensions: [".csv"],
    mimeTypes: ["text/csv", "application/csv", "text/plain"],
    inline: false,
    signature: (buffer) => isProbablyTextFile(buffer),
  },
  {
    extensions: [".txt"],
    mimeTypes: ["text/plain"],
    inline: false,
    signature: (buffer) => isProbablyTextFile(buffer),
  },
  {
    extensions: [".mp4"],
    mimeTypes: ["video/mp4"],
    inline: false,
    signature: (buffer) => hasIsoBaseMediaType(buffer, ["mp41", "mp42", "isom"]),
  },
  {
    extensions: [".mov"],
    mimeTypes: ["video/quicktime"],
    inline: false,
    signature: (buffer) => hasIsoBaseMediaType(buffer, ["qt  "]),
  },
];

const DANGEROUS_UPLOAD_EXTENSIONS = new Set([
  ".app", ".bat", ".cmd", ".com", ".cpl", ".dll", ".exe", ".hta", ".html", ".htm", ".jar", ".js",
  ".json", ".lnk", ".msi", ".php", ".ps1", ".py", ".rb", ".reg", ".scr", ".sh", ".svg", ".ts", ".vbs",
  ".wasm", ".xml", ".yaml", ".yml", ".zip",
]);

function getFilesystemDirectory() {
  return path.resolve(process.env.FILESYSTEM_ROOT || DEFAULT_FILESYSTEM_DIRECTORY);
}

function getLogDirectory() {
  return path.resolve(process.env.LOG_DIRECTORY || DEFAULT_LOG_DIRECTORY);
}

function getAppLogPath() {
  return path.join(getLogDirectory(), "app.jsonl");
}

function getSecurityLogPath() {
  return path.join(getLogDirectory(), "security.jsonl");
}

export async function createApp() {
  validateEarlyProductionConfiguration();
  await initializeDatabase();
  repairTimeTrackingData({
    actor: buildSystemActor("Time Tracking Repair"),
    requestSource: "time-tracking-startup",
    skipAudit: true,
  });
  ensureTimeTrackingConstraints();
  ensureLeadCategoryDefaults({
    actor: buildSystemActor("Lead Category Setup"),
    requestSource: "lead-category-startup",
    skipAudit: true,
  });
  ensureJobWorkflowDefaults({
    actor: buildSystemActor("Workflow Setup"),
    requestSource: "workflow-startup",
    skipAudit: true,
  });
  ensureWorkflowTaskCoverage({
    actor: buildSystemActor("Workflow Coverage"),
    requestSource: "workflow-startup",
    skipAudit: true,
  });
  ensureEmbeddingIndex();
  ensureKnowledgeTables();
  fs.mkdirSync(getFilesystemDirectory(), { recursive: true });
  ensureFilesystemLayout();

  const app = express();
  const allowedOrigins = readAllowedOrigins();
  const allowedHosts = readAllowedHosts(allowedOrigins);
  const trustProxy = readTrustProxyValue();
  const authConfig = getAuthConfig();
  validateRuntimeConfiguration(allowedOrigins, authConfig);
  const globalRateLimiter = createRateLimiter(GLOBAL_RATE_LIMIT_MAX, GLOBAL_RATE_LIMIT_WINDOW_MS);
  const authRateLimiter = createRateLimiter(AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS);
  const mutationRateLimiter = createRateLimiter(MUTATION_RATE_LIMIT_MAX, MUTATION_RATE_LIMIT_WINDOW_MS);
  const aiConfig = getAiConfig();
  const aiRateLimiter = createRateLimiter(aiConfig.rateLimitMax, aiConfig.rateLimitWindowMs);
  fs.mkdirSync(getLogDirectory(), { recursive: true });
  logAppEvent("server_started", {
    mode: "offline-local",
    host: String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0",
    port: Number(process.env.PORT || 4000),
    filesystem_root: getFilesystemDirectory(),
  });
  logAppEvent("auth_runtime_configuration", {
    google_enabled: authConfig.googleEnabled,
    session_secret_configured: authConfig.sessionSecretConfigured,
    bootstrap_admins_configured: authConfig.bootstrapAdminsConfigured,
    bootstrap_admin_count: authConfig.bootstrapAdminCount,
    has_invited_users: authConfig.hasInvitedUsers,
    sign_in_enabled: authConfig.signInEnabled,
    issues: authConfig.issues,
  }, "auth", authConfig.signInEnabled ? "info" : "warn");
  const aiStartup = validateAiStartupConfiguration(aiConfig);
  logAiEvent("ai_runtime_configuration", {
    enabled: aiConfig.enabled,
    base_url: aiConfig.baseUrl,
    primary_model: aiConfig.primaryModel,
    fast_model: aiConfig.fastModel,
    embed_model: aiConfig.embedModel,
    request_timeout_ms: aiConfig.requestTimeoutMs,
    request_retries: aiConfig.requestRetries,
    rate_limit_max: aiConfig.rateLimitMax,
    rate_limit_window_ms: aiConfig.rateLimitWindowMs,
    warnings: aiStartup.warnings,
  }, aiStartup.ok ? "info" : "warn");
  queueInitialEmbeddingBackfill();
  startKnowledgeIndexingScheduler();

  app.set("trust proxy", trustProxy);
  app.disable("x-powered-by");
  app.disable("etag");

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    const requestId = crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  });

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    applySecurityHeaders(req, res);
    next();
  });

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    if (allowedHosts.length > 0 && !isAllowedHost(req.hostname, allowedHosts)) {
      logSecurityEvent("blocked_host", req, `host=${req.hostname}`);
      res.status(421).json({ error: "Host header not allowed." });
      return;
    }

    next();
  });

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    if (isTestModeEnabled() && req.path.startsWith("/api/test/")) {
      next();
      return;
    }

    enforceRateLimit(req, res, next, globalRateLimiter);
  });

  app.use(cors({
    origin(origin, callback) {
      if (
        !origin
        || allowedOrigins.includes(origin)
        || (allowedOrigins.length === 0 && String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production" && isLocalOrigin(origin))
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-CRM-App", TIMECLOCK_KIOSK_KEY_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, "Retry-After"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }));

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    if (!isAllowedMutationOrigin(req, allowedOrigins)) {
      logSecurityEvent("blocked_origin", req, `origin=${String(req.header("origin") || "")}`);
      res.status(403).json({ error: "Origin not allowed for this request." });
      return;
    }

    next();
  });

  app.use(express.json({ limit: `${MAX_UPLOAD_BYTES}b`, strict: true, type: ["application/json", "application/*+json"] }));
  app.use("/filesystem", (req: Request, res: Response, next: express.NextFunction) => {
    try {
      requireAuthenticatedApiUser(req);
      authorizeFilesystemStaticPath(req);
      next();
    } catch (error) {
      handleRouteError(error, res);
    }
  });
  app.use("/filesystem", express.static(getFilesystemDirectory(), {
    fallthrough: false,
    dotfiles: "deny",
    index: false,
    setHeaders(res, absolutePath) {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; sandbox; frame-ancestors 'self'; base-uri 'none'; object-src 'none'");
      res.setHeader("Content-Disposition", buildAttachmentContentDisposition(absolutePath));
    },
  }));

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    if (!activeMaintenanceOperation) {
      next();
      return;
    }

    if (req.path === "/health" || req.path === "/api/health") {
      next();
      return;
    }

    res.status(503).json({
      error: "System maintenance is in progress.",
      code: "maintenance_in_progress",
      maintenance: activeMaintenanceOperation,
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json(buildPublicHealthSummary());
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json(buildPublicHealthSummary());
  });

  if (isTestModeEnabled()) {
    app.post("/api/test/reset", async (_req: Request, res: Response) => {
      await resetTestState();
      res.status(204).send();
    });

    app.post("/api/test/session", (req: Request, res: Response) => {
      requireJsonMutation(req);

      const body = parseBodyWithSchema(req.body, testSessionSchema);
      const email = body.email.trim().toLowerCase();
      const role = body.role === "member" ? "member" : "admin";

      const existing = listEntityRecords("AppUser", { sort: "email" }).find(
        (record) => String(record.email || "").trim().toLowerCase() === email
      );

      const record = existing
        ? updateEntityRecord("AppUser", existing.id, {
            email,
            role,
            status: "active",
            full_name: String(existing.full_name || email.split("@")[0] || "Test User"),
            row_version: existing.row_version,
          }, {
            actor: buildSystemActor("Test Auth"),
            request_source: "test-auth",
            expected_row_version: existing.row_version,
          })
        : createEntityRecord("AppUser", {
            email,
            role,
            status: "active",
            full_name: email.split("@")[0] || "Test User",
            invited_by_email: "test-suite",
            invited_date: new Date().toISOString(),
            last_login_date: new Date().toISOString(),
          }, {
            actor: buildSystemActor("Test Auth"),
            request_source: "test-auth",
          });

      if (!record) {
        res.status(500).json({ error: "Failed to create test session user." });
        return;
      }

      const user = {
        id: String(record.id),
        full_name: String(record.full_name || email),
        role: String(record.role || role),
        email: String(record.email || email),
        avatar_url: String(record.avatar_url || ""),
      };

      writeSessionCookie(res, user, false);
      res.status(201).json({ user });
    });
  }

  app.get("/api/auth/config", (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(buildAuthConfigResponse(req));
  });

  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, authRateLimiter)) {
        return;
      }
      ensureSecureAuthLoginContext(req);
      requireJsonMutation(req);
      const body = parseBodyWithSchema(req.body, googleLoginSchema);
      const credential = body.credential;

      const session = await authenticateWithGoogleCredential(credential);
      writeSessionCookie(res, session.user, shouldUseSecureCookies(req));
      logAppEvent("auth_login", {
        user_id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        request_source: readRequestSource(req),
      }, "auth");
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json(session);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const currentUser = tryReadAuthenticatedUser(req);
    if (currentUser) {
      try {
        invalidateUserSessions(currentUser.id, {
          actor: currentUser,
          request_source: readRequestSource(req),
        });
      } catch (error) {
        logAppEvent("auth_logout_revoke_failed", {
          user_id: currentUser.id,
          email: currentUser.email,
          message: error instanceof Error ? error.message : "unknown",
          request_source: readRequestSource(req),
        }, "auth", "warn");
      }
      logAppEvent("auth_logout", {
        user_id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        request_source: readRequestSource(req),
      }, "auth");
    }
    clearSessionCookie(res);
    res.setHeader("Cache-Control", "no-store");
    res.status(204).send();
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    try {
      const user = requireAuthenticatedApiUser(req);
      writeSessionCookie(res, user, shouldUseSecureCookies(req));
      res.setHeader("Cache-Control", "no-store");
      res.json(user);
    } catch (error) {
      if (error instanceof AuthError && ["auth_required", "invalid_session", "user_not_found", "access_revoked"].includes(error.code)) {
        clearSessionCookie(res);
      }
      handleRouteError(error, res);
    }
  });

  app.get("/api/modules", (req: Request, res: Response) => {
    try {
      if (!isLocalKioskRequest(req)) {
        requireAuthenticatedApiUser(req);
      }
      res.json(getModuleConfig());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/timeclock/handover-data", (req: Request, res: Response) => {
    try {
      if (!isLocalKioskRequest(req)) {
        requireAuthenticatedApiUser(req);
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(buildTimeclockHandoverData());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/access/users", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      res.json(listAccessUsers());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/workflow/summary/:jobId", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      const jobId = readRouteParam(req.params.jobId);
      res.json({
        templates: getWorkflowTemplateSummary().filter((template) => template.scope === "job"),
        roles: getRoleMappingSummary(),
        tasks: getWorkflowExampleForJob(jobId),
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/workflow/quote-summary/:quoteId", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      const quoteId = readRouteParam(req.params.quoteId);
      res.json({
        templates: getWorkflowTemplateSummary().filter((template) => template.scope === "quote"),
        roles: getRoleMappingSummary(),
        tasks: getWorkflowExampleForQuote(quoteId),
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/access/users", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const invitedUser = createOrInviteAccessUser(parseBodyWithSchema(req.body, accessUserSchema), adminUser.email, {
        actor: adminUser,
        request_source: readRequestSource(req),
      });
      logAppEvent("access_user_created", {
        actor_email: adminUser.email,
        invited_email: invitedUser.email,
        invited_role: invitedUser.role,
        request_source: readRequestSource(req),
      }, "admin");
      res.status(201).json(invitedUser);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.put("/api/access/users/:id", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const userId = readRouteParam(req.params.id);
      const updatedUser = updateAccessUser(userId, parseBodyWithSchema(req.body, accessUserSchema), {
        actor: adminUser,
        request_source: readRequestSource(req),
      });
      logAppEvent("access_user_updated", {
        actor_email: adminUser.email,
        target_user_id: userId,
        target_email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
        request_source: readRequestSource(req),
      }, "admin");
      res.json(updatedUser);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/access/users/:id", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      const adminUser = requireAdminApiUser(req);
      const userId = readRouteParam(req.params.id);
      const deleted = deleteEntityRecord("AppUser", userId, {
        actor: adminUser,
        request_source: readRequestSource(req),
      });

      if (!deleted) {
        res.status(404).json({ error: "Access record not found." });
        return;
      }

      logAppEvent("access_user_deleted", {
        actor_email: adminUser.email,
        target_user_id: userId,
        request_source: readRequestSource(req),
      }, "admin");
      res.status(204).send();
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/admin/audit/export", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      const limit = parseLimit(req.query.limit) || 500;
      const entity = typeof req.query.entity === "string" ? req.query.entity : undefined;
      const recordId = typeof req.query.record_id === "string" ? req.query.record_id : undefined;
      const action = typeof req.query.action === "string" ? req.query.action : undefined;
      const actorEmail = typeof req.query.actor_email === "string" ? req.query.actor_email : undefined;
      const requestSource = typeof req.query.request_source === "string" ? req.query.request_source : undefined;
      const query = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
      const format = typeof req.query.format === "string" && req.query.format.toLowerCase() === "json"
        ? "json"
        : "csv";
      const entries = listAuditLogRecords({
        entity,
        record_id: recordId,
        action,
        actor_email: actorEmail,
        request_source: requestSource,
        query,
        limit,
      });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (format === "json") {
        sendJsonDownload(res, `audit-export-${timestamp}.json`, {
          generated_at: new Date().toISOString(),
          filters: {
            entity: entity || "",
            record_id: recordId || "",
            action: action || "",
            actor_email: actorEmail || "",
            request_source: requestSource || "",
            query: query || "",
            limit,
          },
          entries,
        });
        return;
      }

      sendTextDownload(res, `audit-export-${timestamp}.csv`, buildAuditCsv(entries), "text/csv; charset=utf-8");
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/admin/audit", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      const limit = parseLimit(req.query.limit) || 200;
      const entity = typeof req.query.entity === "string" ? req.query.entity : undefined;
      const recordId = typeof req.query.record_id === "string" ? req.query.record_id : undefined;
      const action = typeof req.query.action === "string" ? req.query.action : undefined;
      const actorEmail = typeof req.query.actor_email === "string" ? req.query.actor_email : undefined;
      const requestSource = typeof req.query.request_source === "string" ? req.query.request_source : undefined;
      const query = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

      res.json(listAuditLogRecords({
        entity,
        record_id: recordId,
        action,
        actor_email: actorEmail,
        request_source: requestSource,
        query,
        limit,
      }));
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/admin/health", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      res.json(buildAdminHealthSummary());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/admin/database/parity", async (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      const limit = parseLimit(req.query.limit) || 50;
      const entity = typeof req.query.entity === "string" ? req.query.entity : undefined;
      const snapshot = await getPersistenceParitySnapshot({ limit, entity });
      res.json(snapshot);
    } catch (error) {
      handleRouteError(error, res);
    }
  });
  registerAiRoutes(app, {
    enforceAiRateLimit(req, res) {
      return enforceRateLimit(req, res, undefined, aiRateLimiter);
    },
    enforceMutationRateLimit(req, res) {
      return enforceRateLimit(req, res, undefined, mutationRateLimiter);
    },
    requireJsonMutation,
    requireAuthenticatedApiUser,
    requireAdminApiUser,
    parseBodyWithSchema,
    readRouteParam,
    handleRouteError,
    requestIdHeader: REQUEST_ID_HEADER,
  });

  app.get("/api/admin/backups", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      res.json(listBackupSnapshots());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/backups", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const body = parseBodyWithSchema(req.body, backupCreateSchema);
      const snapshot = createBackupSnapshot({
        actor: adminUser,
        label: body.label,
        note: body.note,
      });
      logAppEvent("admin_backup_created", {
        actor_email: adminUser.email,
        backup_id: snapshot.id,
        backup_label: snapshot.label,
        request_source: readRequestSource(req),
      }, "admin");
      res.status(201).json(snapshot);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/backups/import", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const body = parseBodyWithSchema(req.body, backupImportSchema);
      const snapshot = importBackupSnapshot({
        actor: adminUser,
        sourcePath: body.source_path,
      });
      logAppEvent("admin_backup_imported", {
        actor_email: adminUser.email,
        backup_id: snapshot.id,
        source_path: body.source_path,
        request_source: readRequestSource(req),
      }, "admin");
      res.status(201).json(snapshot);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/admin/backups/:id", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      const adminUser = requireAdminApiUser(req);
      const snapshotId = readRouteParam(req.params.id);
      const snapshot = deleteBackupSnapshot(snapshotId);
      logAppEvent("admin_backup_deleted", {
        actor_email: adminUser.email,
        backup_id: snapshot.id,
        request_source: readRequestSource(req),
      }, "admin", "warn");
      res.json(snapshot);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/backups/:id/restore", async (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      const adminUser = requireAdminApiUser(req);
      const snapshotId = readRouteParam(req.params.id);
      const snapshot = getBackupSnapshot(snapshotId);
      activeMaintenanceOperation = {
        kind: "restore_backup",
        started_at: new Date().toISOString(),
        note: `Restoring ${snapshot.label}`,
      };
      const result = await restoreBackupSnapshotById(snapshotId);
      activeMaintenanceOperation = null;
      logAppEvent("admin_backup_restored", {
        actor_email: adminUser.email,
        backup_id: snapshotId,
        backup_label: snapshot.label,
        request_source: readRequestSource(req),
      }, "admin", "warn");
      res.json({
        restored_at: new Date().toISOString(),
        ...result,
        health: buildAdminHealthSummary(),
      });
    } catch (error) {
      activeMaintenanceOperation = null;
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/backups/retention", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const body = parseBodyWithSchema(req.body, backupRetentionSchema);
      const result = applyBackupRetention(body.keep_latest);
      logAppEvent("admin_backup_retention_applied", {
        actor_email: adminUser.email,
        keep_latest: body.keep_latest,
        removed_count: result.removed.length,
        request_source: readRequestSource(req),
      }, "admin");
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/admin/diagnostics/download", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      const generatedAt = new Date().toISOString();
      const payload = buildDiagnosticsSnapshot({
        generatedAt,
        health: buildAdminHealthSummary(),
        auditPreview: listAuditLogRecords({ limit: 50 }),
      });
      sendJsonDownload(
        res,
        `joinerflow-diagnostics-${generatedAt.replace(/[:.]/g, "-")}.json`,
        payload
      );
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/admin/logs/:kind/download", (req: Request, res: Response) => {
    try {
      requireAdminApiUser(req);
      const kind = req.params.kind === "security" ? "security" : "app";
      const logFile = readLogFile(kind);
      if (!logFile.exists) {
        res.status(404).json({ error: "Log file not found." });
        return;
      }

      sendTextDownload(res, logFile.file_name, logFile.content, "application/x-ndjson; charset=utf-8");
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/logs/retention", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const body = parseBodyWithSchema(req.body, logRetentionSchema);
      const result = applyLogRetention({
        appKeepEntries: body.app_keep_entries,
        securityKeepEntries: body.security_keep_entries,
      });
      logAppEvent("admin_log_retention_applied", {
        actor_email: adminUser.email,
        app_keep_entries: body.app_keep_entries,
        security_keep_entries: body.security_keep_entries,
        request_source: readRequestSource(req),
      }, "admin");
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/maintenance/database/optimize", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      const adminUser = requireAdminApiUser(req);
      const diagnostics = runDatabaseMaintenance();
      logAppEvent("admin_database_optimized", {
        actor_email: adminUser.email,
        page_count: diagnostics.page_count,
        request_source: readRequestSource(req),
      }, "admin");
      res.json({
        completed_at: new Date().toISOString(),
        diagnostics,
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/maintenance/time-tracking/repair", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      const adminUser = requireAdminApiUser(req);
      repairTimeTrackingData({
        actor: adminUser,
        requestSource: readRequestSource(req) || "admin-maintenance",
      });
      logAppEvent("admin_time_tracking_repaired", {
        actor_email: adminUser.email,
        request_source: readRequestSource(req),
      }, "admin", "warn");
      res.json({
        completed_at: new Date().toISOString(),
        health: buildAdminHealthSummary(),
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/admin/maintenance/filesystem/reconcile", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      const adminUser = requireAdminApiUser(req);
      ensureFilesystemLayout();
      syncFilesystemAttachments(req);
      logAppEvent("admin_filesystem_reconciled", {
        actor_email: adminUser.email,
        request_source: readRequestSource(req),
      }, "admin", "warn");
      res.json({
        completed_at: new Date().toISOString(),
        filesystem: summarizeFilesystemRoot(),
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.put("/api/modules", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      const adminUser = requireAdminApiUser(req);
      const body = parseBodyWithSchema(req.body, moduleConfigSchema);
      res.json(updateModuleConfig(body.modules, {
        actor: adminUser,
        requestSource: readRequestSource(req),
      }));
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/dashboard/overview", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("dashboard");
      res.json(getDashboardOverviewData());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/operations/hub", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("operations");
      res.json(getOperationsHubData());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/reporting/datasets", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("reports");
      res.json(getReportingDatasets());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/install-planner/entries", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("schedule");
      requireModuleEnabled("jobs");
      requireModuleEnabled("activities");
      res.json(listInstallPlannerEntries());
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/install-planner/entries", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("schedule");
      requireModuleEnabled("jobs");
      requireModuleEnabled("activities");
      const body = parseBodyWithSchema(req.body, installPlannerSaveSchema);
      const result = saveInstallPlannerEntry(body, {
        actor,
        requestSource: readRequestSource(req),
      });
      res.status(200).json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/install-planner/entries", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("schedule");
      requireModuleEnabled("jobs");
      requireModuleEnabled("activities");
      const body = parseBodyWithSchema(req.body, installPlannerDeleteSchema);
      const result = deleteInstallPlannerEntry(body, {
        actor,
        requestSource: readRequestSource(req),
      });
      res.status(200).json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/addresses/search", async (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (query.length < 3) {
      res.json([]);
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = addressSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ADDRESS_SEARCH_CACHE_TTL_MS) {
      res.json(cached.results);
      return;
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "nz");
    url.searchParams.set("limit", "5");
    url.searchParams.set("q", query);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Joinerflow Offline CRM/1.0 (local address lookup)",
        "Accept-Language": "en-NZ,en;q=0.9",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(502).json({ error: text || "Address search failed" });
      return;
    }

    const payload = await response.json() as AddressSuggestion[];
    const suggestions = Array.isArray(payload)
      ? payload.map((item) => ({
          place_id: item.place_id,
          display_name: item.display_name,
          lat: item.lat,
          lon: item.lon,
          address: item.address || {},
        }))
      : [];

    addressSearchCache.set(cacheKey, {
      timestamp: Date.now(),
      results: suggestions,
    });

    res.json(suggestions);
  });

  app.post("/api/filesystem", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    try {
      const {
        related_id,
        related_type,
        name,
        mime_type,
        size,
        data_base64,
        document_information,
        production_visibility,
        visible_to_production,
      } = parseBodyWithSchema(req.body, uploadSchema);

      const relatedEntity = related_type === "job"
        ? "Job"
        : related_type === "quote"
          ? "Quote"
          : related_type === "contact"
            ? "Contact"
            : "Company";
      if (!getEntityRecord(relatedEntity, related_id)) {
        res.status(404).json({ error: `${relatedEntity} record not found` });
        return;
      }

      const base64Payload = stripDataUrlPrefix(data_base64);
      const fileBuffer = decodeBase64Upload(base64Payload);

      if (fileBuffer.byteLength === 0) {
        res.status(400).json({ error: "Uploaded file is empty" });
        return;
      }

      if (fileBuffer.byteLength > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: "Uploaded file exceeds 25 MB limit" });
        return;
      }

      const originalName = normalizeAttachmentName(name);
      validateUploadPayload(originalName, mime_type, fileBuffer);
      const safeName = sanitiseFilename(originalName);
      const entityDirectory = path.join(getFilesystemDirectory(), `${related_type}s`, resolveAttachmentDirectoryName(related_type, related_id));
      fs.mkdirSync(entityDirectory, { recursive: true });

      const attachment = upsertAttachmentUpload({
        req,
        actor,
        relatedId: related_id,
        relatedType: related_type,
        originalName,
        safeName,
        mimeType: mime_type,
        size: typeof size === "number" ? size : fileBuffer.byteLength,
        fileBuffer,
        entityDirectory,
        source: "ui-upload",
        metadata: {
          document_information: document_information || "",
          file_source: "Manual Upload",
          uploaded_by: actor?.full_name || actor?.email || "",
          uploaded_at: new Date().toISOString(),
          production_visibility: production_visibility || "production",
          visible_to_production: visible_to_production !== false && production_visibility !== "management" && production_visibility !== "internal",
          management_only: production_visibility === "management",
          internal_only: production_visibility === "internal",
        },
      });

      logAppEvent("filesystem_uploaded", {
        attachment_id: attachment.id,
        related_id: related_id,
        related_type: related_type,
        name: attachment.name,
        size: attachment.size,
        actor_email: actor?.email || "",
        request_source: readRequestSource(req),
      }, "filesystem");
      res.status(201).json(attachment);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/filesystem/:attachmentId/versions", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      const attachmentId = readRouteParam(req.params.attachmentId);
      const attachment = getEntityRecord("Attachment", attachmentId);
      if (!attachment) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }

      authorizeAttachmentRead(req, attachment);
      res.json(listAttachmentVersions(attachmentId));
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/timeclock/filesystem/:attachmentId/content", (req: Request, res: Response) => {
    try {
      if (!isLocalKioskRequest(req)) {
        requireAuthenticatedApiUser(req);
      }
      const attachmentId = readRouteParam(req.params.attachmentId);
      const attachment = getEntityRecord("Attachment", attachmentId);
      if (!attachment) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }

      if (!isLocalKioskRequest(req)) {
        authorizeAttachmentRead(req, attachment);
      }
      authorizeProductionAttachmentRead(attachment);
      sendAttachmentContent(req, res, attachment, String(req.query.disposition || "inline") === "attachment" ? "attachment" : "inline");
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/filesystem/:attachmentId", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      actor = requireAuthenticatedApiUser(req);
      const attachmentId = readRouteParam(req.params.attachmentId);
      const attachment = getEntityRecord("Attachment", attachmentId);
      if (!attachment) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }

      authorizeAttachmentWrite(req, attachment);
      deleteAttachmentUpload(req, attachment, actor);
      logAppEvent("filesystem_deleted", {
        attachment_id: attachmentId,
        related_id: String(attachment.related_id || ""),
        related_type: String(attachment.related_type || ""),
        actor_email: actor?.email || "",
        request_source: readRequestSource(req),
      }, "filesystem");
      res.status(204).send();
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/companies/:id/detail", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      authorizeEntityRequest(req, "Company", "read");
      res.json(getCompanyDetailBundle(readRouteParam(req.params.id)));
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:id/convert-to-job", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    const quoteId = readRouteParam(req.params.id);
    const quote = getEntityRecord("Quote", quoteId);

    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }

    const requestedJobNumber = parseBodyWithSchema(req.body, quoteConversionSchema).job_number;

    const existingJob = listEntityRecords("Job").find(
      (job) => String(job.job_number || "").trim().toLowerCase() === requestedJobNumber.toLowerCase()
    );
    if (existingJob) {
      res.status(409).json({ error: "That job number already exists" });
      return;
    }

    const quoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId } });
    const createdJob = createEntityRecord("Job", enrichJobWithWorkflowDefaults({
      title: quote.title,
      job_number: requestedJobNumber,
      quote_id: quoteId,
      quote_number: quote.quote_number,
      quote_revision: quote.revision,
      quote_status: "won",
      quote_subtotal: quote.subtotal,
      quote_gst: quote.gst,
      quote_total: quote.total,
      quote_valid_until: quote.valid_until,
      quote_exclusions: quote.exclusions,
      quote_notes: quote.notes,
      quote_items_snapshot: quoteItems,
      quote_snapshot: quote,
      lead_id: quote.lead_id,
      contact_id: quote.contact_id,
      contact_name: quote.contact_name,
      company_id: quote.company_id,
      company_name: quote.company_name,
      quoted_value: quote.total,
      site_address: quote.site_address,
      notes: quote.notes || "",
      exclusions: quote.exclusions || "",
      status: "planning",
      approval_status: quote.approval_status || "pending_internal",
      approval_owner: quote.approval_owner || "",
      approval_requested_date: quote.approval_requested_date || "",
      approval_completed_date: quote.approval_completed_date || "",
      approval_history: Array.isArray(quote.approval_history) ? quote.approval_history : [],
      change_orders: Array.isArray(quote.change_orders) ? quote.change_orders : [],
      handoff_status: quote.production_handoff_status === "ready" ? "in_progress" : "not_ready",
      handoff_drawings_ready: Boolean(quote.quote_drawings_signed_off),
      handoff_materials_confirmed: Boolean(quote.quote_scope_signed_off),
      internal_operational_notes: quote.quote_internal_notes || quote.job_conversion_notes || "",
    }), {
      actor,
      request_source: readRequestSource(req),
    });

    ensureJobWorkflowTasks(createdJob, {
      actor,
      requestSource: readRequestSource(req),
    });

    ensureEntityUploadDirectory("Job", createdJob);
    archiveAndMoveQuoteFiles(req, quote, createdJob, actor);

    const updatedQuote = updateEntityRecord("Quote", quoteId, { status: "won", row_version: quote.row_version }, {
      actor,
      request_source: readRequestSource(req),
      expected_row_version: quote.row_version,
    });
    if (updatedQuote) {
      ensureQuoteWorkflowTasks(updatedQuote, {
        actor,
        requestSource: readRequestSource(req),
      });
      reconcileQuoteWorkflowStatuses(updatedQuote.id, {
        actor,
        requestSource: readRequestSource(req),
      });
    }
    if (quote.lead_id) {
      const lead = getEntityRecord("Lead", String(quote.lead_id));
      if (lead) {
        updateEntityRecord("Lead", String(quote.lead_id), { stage: "won", row_version: lead.row_version }, {
          actor,
          request_source: readRequestSource(req),
          expected_row_version: lead.row_version,
        });
      }
    }

    logAppEvent("quote_converted_to_job", {
      quote_id: quoteId,
      quote_number: quote.quote_number,
      job_id: createdJob.id,
      job_number: createdJob.job_number,
      actor_email: actor?.email || "",
      request_source: readRequestSource(req),
    }, "quotes");
    res.status(201).json(createdJob);
  });

  app.post("/api/quotes/:id/global-inclusions/apply", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireModuleEnabled("pricing");
      actor = requireAuthenticatedApiUser(req);
      const quoteId = readRouteParam(req.params.id);
      const body = quoteGlobalInclusionApplySchema.parse(req.body || {});
      const requestSource = readRequestSource(req) || "quote-global-auto-inclusions-apply";
      const result = runInTransaction(() => applyGlobalAutoInclusionsToQuote(quoteId, {
        actor,
        requestSource,
        ruleIds: body.rule_ids,
      }));
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:quoteId/items/:itemId/confirm-global-inclusion", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireModuleEnabled("pricing");
      actor = requireAuthenticatedApiUser(req);
      const quoteId = readRouteParam(req.params.quoteId);
      const itemId = readRouteParam(req.params.itemId);
      const body = quoteGlobalInclusionConfirmSchema.parse(req.body || {});
      const requestSource = readRequestSource(req) || "quote-global-auto-inclusion-confirm";
      const result = runInTransaction(() => confirmGlobalAutoInclusionItem(quoteId, itemId, {
        actor,
        requestSource,
        section: body,
      }));
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:id/global-inclusions/confirm-all", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireModuleEnabled("pricing");
      actor = requireAuthenticatedApiUser(req);
      const quoteId = readRouteParam(req.params.id);
      const body = quoteGlobalInclusionConfirmSchema.parse(req.body || {});
      const requestSource = readRequestSource(req) || "quote-global-auto-inclusions-confirm-all";
      const result = runInTransaction(() => confirmAllGlobalAutoInclusionItems(quoteId, {
        actor,
        requestSource,
        section: body,
      }));
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:quoteId/items/:itemId/confirm-triggered-inclusion", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireModuleEnabled("pricing");
      actor = requireAuthenticatedApiUser(req);
      const quoteId = readRouteParam(req.params.quoteId);
      const itemId = readRouteParam(req.params.itemId);
      const requestSource = readRequestSource(req) || "quote-triggered-auto-inclusion-confirm";
      const result = runInTransaction(() => confirmTriggeredAutoInclusionItem(quoteId, itemId, {
        actor,
        requestSource,
      }));
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:id/margin-adjustments", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireModuleEnabled("pricing");
      actor = requireAuthenticatedApiUser(req);
      const quoteId = readRouteParam(req.params.id);
      const body = quoteMarginAdjustmentSchema.parse(req.body || {});
      const requestSource = readRequestSource(req) || "quote-margin-adjustment";
      const result = runInTransaction(() => applyQuoteMarginAdjustment(quoteId, {
        actor,
        requestSource,
        actionType: body.action_type,
        targetMarginPercent: body.target_margin_percent,
        includeLocked: body.include_locked,
      }));
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/document-templates/merge-fields", (_req: Request, res: Response) => {
    try {
      requireModuleEnabled("quotes");
      res.json({ fields: SAFE_TEMPLATE_FIELDS });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/document-templates", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      ensureDefaultGraphicalDocumentTemplates();
      const type = String(req.query.type || "").trim();
      const templates = listEntityRecords("DocumentTemplate", { sort: "-updated_date", limit: 10000 })
        .filter((template) => !type || String(template.type || template.document_type || "") === type)
        .map((template) => ({ ...template, template_json: normalizeDocumentTemplate(template) }));
      res.json(templates);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/document-templates/:id", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const templateId = readRouteParam(req.params.id);
      const template = getEntityRecord("DocumentTemplate", templateId);
      if (!template) throw new RouteRequestError(404, "document_template_not_found", "Document template was not found.");
      res.json({ ...template, template_json: normalizeDocumentTemplate(template) });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/document-templates", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const body = documentTemplateCreateSchema.parse(req.body || {});
      const template = {
        ...buildDefaultDocumentTemplate(body.type),
        ...body,
        blocks: body.blocks?.length ? body.blocks : buildDefaultDocumentTemplate(body.type).blocks,
        status: body.status || "draft",
      };
      const normalizedTemplate = normalizeDocumentTemplate(template);
      if (!normalizedTemplate) throw new RouteRequestError(400, "document_template_invalid", "Template payload is invalid.");
      const validation = validateDocumentTemplate(normalizedTemplate);
      if (validation.errors.length > 0) {
        throw new RouteRequestError(400, "document_template_invalid", validation.errors.join(" "));
      }
      const created = createEntityRecord("DocumentTemplate", buildTemplateRecordPayload(normalizedTemplate), {
        actor,
        request_source: readRequestSource(req) || "document-template-create",
      });
      createEntityRecord("DocumentTemplateVersion", {
        template_id: created.id,
        version: created.version || 1,
        status: created.status || "draft",
        snapshot: normalizeDocumentTemplate(created),
        change_summary: "Initial draft",
      }, { actor, request_source: "document-template-version-create" });
      res.status(201).json({ ...created, template_json: normalizeDocumentTemplate(created), warnings: validation.warnings });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.put("/api/document-templates/:id", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const templateId = readRouteParam(req.params.id);
      const existing = getEntityRecord("DocumentTemplate", templateId);
      if (!existing) throw new RouteRequestError(404, "document_template_not_found", "Document template was not found.");
      const body = documentTemplatePayloadSchema.parse(req.body || {});
      const current = normalizeDocumentTemplate(existing);
      if (current?.status === "published" && body.status !== "published" && body.status !== "archived") {
        body.version = Number(current.version || existing.version || 1) + 1;
        body.status = "draft";
      }
      const normalizedTemplate = normalizeDocumentTemplate(body);
      if (!normalizedTemplate) throw new RouteRequestError(400, "document_template_invalid", "Template payload is invalid.");
      const validation = validateDocumentTemplate(normalizedTemplate);
      if (validation.errors.length > 0) {
        throw new RouteRequestError(400, "document_template_invalid", validation.errors.join(" "));
      }
      const updated = updateEntityRecord("DocumentTemplate", templateId, {
        ...buildTemplateRecordPayload(normalizedTemplate),
        row_version: existing.row_version,
      }, {
        actor,
        request_source: readRequestSource(req) || "document-template-update",
        expected_row_version: existing.row_version,
      });
      createEntityRecord("DocumentTemplateVersion", {
        template_id: templateId,
        version: body.version,
        status: body.status,
        snapshot: normalizeDocumentTemplate(updated || existing),
        change_summary: "Saved draft",
      }, { actor, request_source: "document-template-version-save" });
      res.json({ ...(updated || existing), template_json: normalizeDocumentTemplate(updated || existing), warnings: validation.warnings });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/document-templates/:id/duplicate", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const templateId = readRouteParam(req.params.id);
      const existing = getEntityRecord("DocumentTemplate", templateId);
      const normalized = normalizeDocumentTemplate(existing);
      if (!existing || !normalized) throw new RouteRequestError(404, "document_template_not_found", "Document template was not found.");
      const duplicate = {
        ...normalized,
        id: undefined,
        name: `${normalized.name} Copy`,
        status: "draft" as const,
        sourceType: "duplicated" as const,
        version: 1,
        blocks: normalized.blocks.map((block) => ({ ...block, id: crypto.randomUUID() })),
      };
      const created = createEntityRecord("DocumentTemplate", buildTemplateRecordPayload(duplicate), {
        actor,
        request_source: readRequestSource(req) || "document-template-duplicate",
      });
      res.status(201).json({ ...created, template_json: normalizeDocumentTemplate(created) });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/document-templates/:id/publish", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const templateId = readRouteParam(req.params.id);
      const existing = getEntityRecord("DocumentTemplate", templateId);
      if (!existing) throw new RouteRequestError(404, "document_template_not_found", "Document template was not found.");
      const normalized = normalizeDocumentTemplate(existing);
      const validation = validateDocumentTemplate(normalized || existing);
      if (validation.errors.length > 0) {
        throw new RouteRequestError(400, "document_template_invalid", validation.errors.join(" "));
      }
      const next = normalized ? { ...normalized, status: "published" as const } : null;
      const updated = updateEntityRecord("DocumentTemplate", templateId, {
        ...(next ? buildTemplateRecordPayload(next) : {}),
        status: "published",
        row_version: existing.row_version,
      }, {
        actor,
        request_source: readRequestSource(req) || "document-template-publish",
        expected_row_version: existing.row_version,
      });
      createEntityRecord("DocumentTemplateVersion", {
        template_id: templateId,
        version: Number(normalized?.version || existing.version || 1),
        status: "published",
        snapshot: normalizeDocumentTemplate(updated || existing),
        published_by_user_id: actor?.id || "",
        published_by_user_name: actor?.full_name || actor?.email || "",
        published_at: new Date().toISOString(),
        change_summary: "Published template",
      }, { actor, request_source: "document-template-version-publish" });
      res.json({ ...(updated || existing), template_json: normalizeDocumentTemplate(updated || existing), warnings: validation.warnings });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/document-templates/import/mozaik", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const body = documentTemplateImportSchema.parse(req.body || {});
      const imported = importMozaikTemplate({ fileName: body.file_name, content: body.content, type: body.type });
      const created = createEntityRecord("DocumentTemplate", buildTemplateRecordPayload(imported.template), {
        actor,
        request_source: readRequestSource(req) || "document-template-import-mozaik",
      });
      const importSource = createEntityRecord("TemplateImportSource", {
        ...imported.importSource,
        template_id: created.id,
        imported_by_user_id: actor?.id || "",
        imported_by_user_name: actor?.full_name || actor?.email || "",
      }, { actor, request_source: "document-template-import-source" });
      res.status(201).json({ ...created, template_json: normalizeDocumentTemplate(created), import_source: importSource });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/document-templates/:id/preview", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const templateId = readRouteParam(req.params.id);
      const template = getEntityRecord("DocumentTemplate", templateId);
      if (!template) throw new RouteRequestError(404, "document_template_not_found", "Document template was not found.");
      const document = req.body?.document ? quoteDocumentSchema.parse(req.body.document) : buildSampleQuoteDocument();
      res.json({
        html: renderDocumentTemplateHtml(template, document),
        validation: validateDocumentTemplate(template),
        fields: SAFE_TEMPLATE_FIELDS,
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/quotes/:id/document-draft", (req: Request, res: Response) => {
    try {
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const quoteId = readRouteParam(req.params.id);
      const rawDocumentType = String(req.query.document_type || "").trim();
      const documentType = rawDocumentType === "quote" || rawDocumentType === "quote_list" ? rawDocumentType : "contract";
      res.json(buildQuoteDocumentDraftResponse(quoteId, documentType));
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:id/documents/preview", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const quoteId = readRouteParam(req.params.id);
      const body = quoteDocumentRequestSchema.parse(req.body);
      const document = normalizeSubmittedQuoteDocument(quoteId, body);
      const selectedTemplate = resolveDocumentTemplateForGeneration(body.template_id, document.documentType);
      res.json({
        ...buildClientFacingDocumentPayload(document),
        html: selectedTemplate ? renderDocumentTemplateHtml(selectedTemplate, document) : renderQuoteDocumentHtml(document),
        template: selectedTemplate || ensureDefaultMillbrookContractTemplate(),
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/quotes/:id/documents/generate", async (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      actor = requireAuthenticatedApiUser(req);
      requireModuleEnabled("quotes");
      const quoteId = readRouteParam(req.params.id);
      const body = quoteDocumentRequestSchema.parse(req.body);
      const document = normalizeSubmittedQuoteDocument(quoteId, body);
      const validation = validateQuoteDocument(document);
      if (validation.errors.length > 0) {
        throw new RouteRequestError(400, "quote_document_invalid", validation.errors.join(" "));
      }

      const requestSource = readRequestSource(req) || "quote-document-generate";
      const quote = getEntityRecord("Quote", quoteId);
      if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
      const selectedTemplate = resolveDocumentTemplateForGeneration(body.template_id, document.documentType);
      const html = selectedTemplate ? renderDocumentTemplateHtml(selectedTemplate, document) : renderQuoteDocumentHtml(document);
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await generatePdfFromHtml(html);
      } catch {
        pdfBuffer = selectedTemplate ? generateDocumentTemplatePdf(selectedTemplate, document) : generateQuoteDocumentPdf(document);
      }
      const result = runInTransaction(() => {
        const documentTitle = document.documentType === "quote"
          ? "Quote"
          : document.documentType === "quote_list"
            ? "Quote List"
            : "Contract";
        const fileName = `${documentTitle}-${String(quote.quote_number || document.jobName || quoteId).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
        const entityDirectory = path.join(getFilesystemDirectory(), "quotes", resolveAttachmentDirectoryName("quote", quoteId));
        fs.mkdirSync(entityDirectory, { recursive: true });
        const quoteDocument = createEntityRecord("QuoteDocument", {
          ...document,
          quoteId,
          quote_id: quoteId,
          job_id: document.jobId || "",
          status: "generated",
          warnings: validation.warnings,
          errors: [],
          template_id: selectedTemplate?.id || body.template_id || "",
        }, { actor, request_source: requestSource });
        const attachment = upsertAttachmentUpload({
          req,
          actor,
          relatedId: quoteId,
          relatedType: "quote",
          originalName: fileName,
          safeName: sanitiseFilename(fileName),
          mimeType: "application/pdf",
          size: pdfBuffer.byteLength,
          fileBuffer: pdfBuffer,
          entityDirectory,
          source: "generated-document",
          metadata: {
            document_information: `Generated ${documentTitle.toLowerCase()} document. Customer: ${document.customerName}. Job: ${document.jobName}. Total inc GST: ${formatMoneyForDocumentInfo(document.totalIncGst)}.`,
            file_source: document.documentType === "contract" ? "Generated Contract" : document.documentType === "quote_list" ? "Generated Quote List" : "Generated Quote",
            uploaded_by: actor?.full_name || actor?.email || "",
            uploaded_at: new Date().toISOString(),
            document_type: document.documentType,
            template_id: selectedTemplate?.id || body.template_id || "",
            extracted_inc_gst_total: document.totalIncGst,
            extracted_ex_gst_subtotal: document.subtotalExGst,
            extracted_gst_amount: document.gstAmount,
          },
        });
        const generatedDocument = createEntityRecord("GeneratedDocument", {
          quote_id: quoteId,
          quote_document_id: quoteDocument.id,
          job_id: document.jobId || "",
          document_type: document.documentType,
          file_name: fileName,
          attachment_id: attachment.id,
          url: attachment.url,
          generated_by_user_id: actor?.id || "",
          generated_by_user_name: actor?.full_name || actor?.email || "",
          metadata: {
            warnings: validation.warnings,
            total_inc_gst: document.totalIncGst,
            client_facing: true,
            template_id: selectedTemplate?.id || body.template_id || "",
          },
        }, { actor, request_source: requestSource });
        const updatedQuoteDocument = updateEntityRecord("QuoteDocument", quoteDocument.id, {
          generatedPdfUrl: attachment.url,
          generated_document_id: generatedDocument.id,
          attachment_id: attachment.id,
          row_version: quoteDocument.row_version,
        }, {
          actor,
          request_source: requestSource,
          expected_row_version: quoteDocument.row_version,
        });
        createEntityRecord("PaymentSchedule", {
          quote_id: quoteId,
          quote_document_id: quoteDocument.id,
          deposit_amount: document.depositAmount,
          balance_due: document.balanceDue,
          total_inc_gst: document.totalIncGst,
        }, { actor, request_source: requestSource });
        return {
          quote_document: updatedQuoteDocument || quoteDocument,
          generated_document: generatedDocument,
          attachment,
          warnings: validation.warnings,
          html,
        };
      });

      res.status(201).json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  function isAdminActor(actor: LocalUser | null) {
    return String(actor?.role || "").trim().toLowerCase() === "admin";
  }

  function isExportLockedTimeEntry(record: EntityRecord | null | undefined) {
    if (!record) {
      return false;
    }

    return Boolean(record.exported || record.exported_at || record.exported_batch_id);
  }

  function isTimerLifecycleOnlyMutation(
    previousRecord: EntityRecord | null | undefined,
    body: Record<string, unknown>,
    requestedStatus: string
  ) {
    const allowedKeys = new Set(["status", "row_version", "paused_at", "clock_out", "clock_in", "completed_at"]);
    const bodyKeys = Object.keys(body || {});
    const previousStatus = String(previousRecord?.status || "").trim().toLowerCase() === "complete"
      ? "completed"
      : String(previousRecord?.status || "").trim().toLowerCase();

    if (!bodyKeys.every((key) => allowedKeys.has(key))) {
      return false;
    }

    if (previousStatus === "active" && ["paused", "completed"].includes(requestedStatus)) {
      return true;
    }

    if (previousStatus === "paused" && ["active", "completed"].includes(requestedStatus)) {
      return true;
    }

    return false;
  }

  function assertTimeEntryMutationAuthorized(
    actor: LocalUser | null,
    body: Record<string, unknown>,
    previousRecord?: EntityRecord | null
  ) {
    const isAdmin = isAdminActor(actor);
    const requestedStatus = normalizeTimeEntryStatus(body.status ?? previousRecord?.status);
    const manualOverrideRequested = Boolean(body.manual_override ?? previousRecord?.manual_override);
    const exportedLocked = isExportLockedTimeEntry(previousRecord);

    if (manualOverrideRequested && !isAdmin) {
      throw new RouteRequestError(403, "admin_required", "Only Office/Admin users may create or edit manual corrections.");
    }

    if (previousRecord) {
      if (exportedLocked) {
        const allowedAdminKeys = new Set(["row_version", "voided", "void_reason", "excluded_from_costing", "excluded_from_payroll", "review_status", "review_flags", "review_required"]);
        const bodyKeys = Object.keys(body || {});
        const adminCanManageLockState = isAdmin && bodyKeys.length > 0 && bodyKeys.every((key) => allowedAdminKeys.has(key));
        if (!adminCanManageLockState) {
          throw new RouteRequestError(409, "time_entry_export_locked", "Exported payroll or activity-slip entries are locked from normal editing.");
        }
      }

      if (!isAdmin) {
        const previousStatus = normalizeTimeEntryStatus(previousRecord.status);
        const isCompletedEdit = previousStatus === "completed";
        if (isCompletedEdit || !isTimerLifecycleOnlyMutation(previousRecord, body, requestedStatus)) {
          throw new RouteRequestError(403, "admin_required", "Only Office/Admin users may edit recorded time entries.");
        }
      }
    }
  }

  function scopeReportViewFilters(req: Request, filters: Record<string, unknown> = {}) {
    const actor = requireAuthenticatedApiUser(req);
    if (isAdminActor(actor)) {
      return filters;
    }

    return {
      ...filters,
      user_id: actor.id,
    };
  }

  function ensureReportViewAccess(req: Request, record: EntityRecord) {
    const actor = requireAuthenticatedApiUser(req);
    if (isAdminActor(actor)) {
      return;
    }

    if (String(record.user_id || "").trim() !== String(actor.id || "").trim()) {
      throw new AuthError(403, "report_view_forbidden", "You do not have access to this saved report view.");
    }
  }

  function normalizeReportViewPayload(
    payload: Record<string, unknown>,
    actor: LocalUser | null,
    previousRecord?: EntityRecord | null
  ): Record<string, unknown> {
    return {
      ...payload,
      user_id: actor
        ? String(actor.id || "").trim()
        : String(previousRecord?.user_id || "").trim(),
      user_name: actor
        ? String(actor.full_name || previousRecord?.user_name || "").trim()
        : String(previousRecord?.user_name || "").trim(),
    };
  }

  app.get("/api/entities/:entity", (req: Request, res: Response) => {
    const entity = readRouteParam(req.params.entity);
    if (!isKnownEntityName(entity)) {
      res.status(404).json({ error: "Unknown entity type." });
      return;
    }

    try {
      authorizeEntityRequest(req, entity, "read");
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    if (entity === "AppUser") {
      res.status(403).json({ error: "AppUser records are managed through the access API." });
      return;
    }

    let filters = parseFilters(req.query.filters) || {};
    const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
    const limit = parseLimit(req.query.limit);

    if (entity === "Attachment") {
      syncFilesystemAttachments(req, filters);
    }

    if (entity === "ReportView") {
      filters = scopeReportViewFilters(req, filters);
    }

    const records = listEntityRecords(entity, { filters, sort, limit });
    res.json(records);
  });

  app.post("/api/pricing/imports/mozaik", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = pricingImportSchema.parse(req.body);
      const parsed = body.file_base64
        ? parseMozaikFile({ fileName: body.file_name || "mozaik.csv", fileBase64: body.file_base64, fileType: body.file_type }, body.column_mapping)
        : parseMozaikCsv(body.raw_csv, body.column_mapping);
      const record = createEntityRecord("QuoteImport", {
        quote_id: body.quote_id || "",
        job_name: body.job_name || "",
        source: "mozaik_csv",
        raw_csv: body.raw_csv || "",
        file_name: body.file_name || "",
        file_type: body.file_type || "csv",
        original_file_base64: body.file_base64 || "",
        column_mapping: body.column_mapping || {},
        structured_items: parsed.items,
        import_warnings: parsed.warnings,
        metadata: parsed.metadata || {},
      }, {
        actor,
        request_source: readRequestSource(req) || "pricing-csv-import",
      });

      const quoteItems = body.quote_id
        ? parsed.items.map((item) => createEntityRecord("PricingQuoteItem", {
            quote_id: body.quote_id || "",
            import_id: record.id,
            source: "mozaik_csv",
            ...item,
            status: "review",
            match_type: item.normalized_sku ? "normalized_sku_ready" : "",
            warnings: item.validation_warnings || [],
            errors: [],
          }, {
            actor,
            request_source: readRequestSource(req) || "pricing-csv-import",
          }))
        : [];

      res.status(201).json({
        import: record,
        quote_items: quoteItems,
        items: parsed.items,
        warnings: parsed.warnings,
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/quote-imports/stage", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = quoteImportStageSchema.parse(req.body);
      const quote = getEntityRecord("Quote", body.quote_id);
      if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
      const decodedSize = Buffer.from(body.file_base64, "base64").length;
      if (decodedSize > MAX_UPLOAD_BYTES) {
        throw new RouteRequestError(400, "quote_import_file_too_large", "Quote import file is too large.");
      }
      const fileType = body.file_type || String(body.file_name.split(".").pop() || "").toLowerCase();
      if (!["csv", "xlsx", "pdf"].includes(fileType)) {
        throw new RouteRequestError(400, "quote_import_file_type_invalid", "Only CSV, XLSX, and PDF quote imports are supported.");
      }

      const pricingItems = listEntityRecords("PricingItem", { filters: { is_active: true }, limit: 10000 });
      const parsed = enrichQuoteImportWithAiSuggestions({
        parsed: parseQuoteImportFile({
        fileName: body.file_name,
        fileBase64: body.file_base64,
        fileType,
        ocrText: body.ocr_text,
          pricingItems,
        defaultMarkupPercent: body.default_markup_percent,
        }),
        suppliers: listEntityRecords("Supplier", { limit: 10000 }),
        pricingItems,
      });
      const requestSource = readRequestSource(req) || "quote-pricing-import-stage";
      const importRecord = createEntityRecord("QuoteImport", {
        quote_id: body.quote_id,
        job_name: body.job_name || quote.title || quote.quote_number || "",
        source: "quote_level_import",
        import_type: "quote_level",
        import_status: "staged",
        raw_csv: "",
        file_name: body.file_name,
        file_type: fileType,
        file_size: decodedSize,
        original_file_base64: body.file_base64,
        structured_items: parsed.items,
        import_warnings: parsed.warnings,
        metadata: parsed.metadata,
        ai_suggestions: parsed.ai_suggestions,
        ai_review_required: Boolean(parsed.ai_suggestions?.review_required),
        imported_by_user_id: actor?.id || "",
        imported_by_user_name: actor?.full_name || "",
      }, { actor, request_source: requestSource });

      const attachment = upsertPricingImportAttachment({
        req,
        actor,
        quoteId: body.quote_id,
        fileName: body.file_name,
        fileType,
        fileBase64: body.file_base64,
        importRecord,
        parsed,
      });
      const linkedImportRecord = updateEntityRecord("QuoteImport", importRecord.id, {
        quote_file_id: attachment.id,
        attachment_id: attachment.id,
      }, { actor, request_source: requestSource }) || importRecord;
      const pricingSections = listPricingSections();

      if (parsed.metadata?.document_type === "mozaik_material_list") {
        replacePriorMozaikQuoteImports(body.quote_id, linkedImportRecord.id, {
          actor,
          requestSource,
          includeCommitted: false,
        });
      }

      parsed.items.forEach((item, index) => {
        const resolvedSection = resolvePricingSectionAssignment(item.heading_category, pricingSections);
        const nextWarnings = new Set<string>([...(item.warnings || []), ...(item.validation_warnings || [])]);
        if (resolvedSection.warning) {
          nextWarnings.add(resolvedSection.warning);
        }
        const itemSection = String(item.section || "").trim();
        createEntityRecord("PricingQuoteItem", {
          ...item,
          quote_id: body.quote_id,
          import_id: linkedImportRecord.id,
          import_type: "quote_level",
          source: item.source || `quote_${fileType}_import`,
          source_file_name: body.file_name,
          source_file_type: fileType,
          section: itemSection || resolvedSection.section,
          section_id: String(item.section_id || "").trim() || resolvedSection.section_id,
          section_key: String(item.section_key || "").trim() || resolvedSection.section_key,
          section_display_order: Number.isFinite(Number(item.section_display_order))
            ? Number(item.section_display_order)
            : resolvedSection.section_display_order,
          status: "review",
          review_state: "active",
          sort_order: index,
          warnings: [...nextWarnings],
          ai_suggestions: item.ai_suggestions || {},
          ai_review_required: Boolean(item.ai_review_required),
          errors: [],
        }, { actor, request_source: requestSource });
      });

      const rows = syncTriggeredAutoInclusionRowsForImport(linkedImportRecord, {
        actor,
        requestSource: `${requestSource}:triggered-auto-inclusions`,
      });

      res.status(201).json({ import: linkedImportRecord, rows, attachment, warnings: parsed.warnings, metadata: parsed.metadata, ai_suggestions: parsed.ai_suggestions });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/quote-imports/:id/commit", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = quoteImportCommitSchema.parse(req.body);
      const importId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "quote-pricing-import-commit";
      const result = runInTransaction(() => {
        const importRecord = getEntityRecord("QuoteImport", importId);
        if (!importRecord) throw new RouteRequestError(404, "quote_import_not_found", "Quote import was not found.");
        if (importRecord.import_type !== "quote_level") throw new RouteRequestError(400, "quote_import_wrong_type", "Only quote-level imports can create quote line items.");
        if (importRecord.import_status === "committed") throw new RouteRequestError(400, "quote_import_already_committed", "This quote import has already been committed.");
        const quoteId = String(importRecord.quote_id || "");
        const quote = getEntityRecord("Quote", quoteId);
        if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
        const quoteItemsForQuote = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });

        const isMozaikRefresh = isMozaikQuoteImport(importRecord);
        const priorMozaikImportIds = isMozaikRefresh
          ? replacePriorMozaikQuoteImports(quoteId, importId, {
              actor,
              requestSource,
              includeCommitted: true,
            })
          : [];
        const matchedPriorMozaikItemIds = new Set<string>();
        const priorMozaikItemsByKey = isMozaikRefresh
          ? buildQuoteImportItemLookup(
              listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 })
                .filter((item) => priorMozaikImportIds.includes(String(item.import_id || "")))
            )
          : new Map<string, EntityRecord[]>();

        const destructiveCandidates = isMozaikRefresh
          ? quoteItemsForQuote.filter((item) => priorMozaikImportIds.includes(String(item.import_id || "")))
          : body.replace_existing_imported
            ? quoteItemsForQuote.filter((item) => item.import_type === "quote_level")
            : [];
        const protectedLineItems = destructiveCandidates.filter(isProtectedQuoteImportLineItem);
        if (protectedLineItems.length > 0 && !body.force_destructive_replace) {
          throw new RouteRequestError(
            409,
            "quote_import_destructive_replace_blocked",
            `This import would replace ${protectedLineItems.length} manually managed quote line item(s). Confirm force replace to continue.`
          );
        }

        if (body.replace_existing_imported && !isMozaikRefresh) {
          listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 })
            .filter((item) => item.import_type === "quote_level")
            .forEach((item) => deleteEntityRecord("QuoteItem", item.id, { actor, request_source: requestSource }));
        }

        syncTriggeredAutoInclusionRowsForImport(importRecord, {
          actor,
          requestSource: `${requestSource}:triggered-auto-inclusions`,
        });

        const stagedRows = listEntityRecords("PricingQuoteItem", { filters: { import_id: importId }, sort: "sort_order", limit: 10000 })
          .filter((row) => !body.row_ids || body.row_ids.includes(row.id))
          .filter((row) => !["excluded", "deleted"].includes(String(row.review_state || row.status || "")))
          .filter((row) => !(Array.isArray(row.errors) && row.errors.length > 0));

        const createdItemsByRowId = new Map<string, EntityRecord>();
        const createdItems = stagedRows.map((row, index) => {
          const quoteItemPayload = {
            ...buildQuoteItemPayloadFromPricingRow(row, importRecord),
            created_by_user_id: actor?.id || "",
            created_by_user_name: actor?.full_name || "",
            sort_order: index,
          };

          const priorItem = isMozaikRefresh ? takeMatchingQuoteImportItem(row, priorMozaikItemsByKey, matchedPriorMozaikItemIds) : null;
          if (priorItem) {
            const updated = updateEntityRecord("QuoteItem", priorItem.id, quoteItemPayload, { actor, request_source: requestSource }) || {
              ...priorItem,
              ...quoteItemPayload,
            };
            createdItemsByRowId.set(String(row.id || ""), updated);
            return updated;
          }

          const created = createEntityRecord("QuoteItem", quoteItemPayload, { actor, request_source: requestSource });
          createdItemsByRowId.set(String(row.id || ""), created);
          return created;
        });

        stagedRows
          .filter((row) => row.source === "triggered_auto_inclusion" && row.parent_pricing_quote_item_id)
          .forEach((row) => {
            const quoteItem = createdItemsByRowId.get(String(row.id || ""));
            const parentItem = createdItemsByRowId.get(String(row.parent_pricing_quote_item_id || ""));
            if (!quoteItem || !parentItem) return;
            updateEntityRecord("QuoteItem", quoteItem.id, {
              parent_line_item_id: parentItem.id,
              parent_pricing_quote_item_id: row.parent_pricing_quote_item_id || "",
            }, { actor, request_source: `${requestSource}:triggered-parent-link` });
            createEntityRecord("TriggeredAutoInclusionAudit", buildTriggeredAutoInclusionAuditPayload("committed_to_quote", {
              quoteId,
              importId,
              parentPricingQuoteItemId: String(row.parent_pricing_quote_item_id || ""),
              parentQuoteItemId: parentItem.id,
              ruleId: String(row.auto_inclusion_id || row.source_rule_id || ""),
              inclusionQuoteItemId: quoteItem.id,
              calculatedQuantity: Number(row.calculated_quantity || row.quantity || 0),
              quantityMultiplier: Number(row.quantity_multiplier || 0),
              originalRuleValues: (row.parsed_normalized_value as Record<string, unknown> | undefined)?.original_rule_values as Record<string, unknown> || {},
              editedQuoteValues: {
                description: quoteItem.description || "",
                quantity: quoteItem.quantity || 0,
                total: quoteItem.total || 0,
                review_status: quoteItem.review_status || "",
              },
              actor,
            }), {
              actor,
              request_source: requestSource,
            });
          });

        if (isMozaikRefresh) {
          listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 })
            .filter((item) => priorMozaikImportIds.includes(String(item.import_id || "")))
            .filter((item) => !matchedPriorMozaikItemIds.has(String(item.id || "")))
            .forEach((item) => deleteEntityRecord("QuoteItem", item.id, { actor, request_source: requestSource }));
        }

        stagedRows.forEach((row, index) => updateEntityRecord("PricingQuoteItem", row.id, {
          status: "committed",
          review_state: "committed",
          quote_item_id: createdItems[index]?.id || "",
        }, { actor, request_source: requestSource }));

        applyGlobalAutoInclusionsToQuote(quoteId, {
          actor,
          requestSource: `${requestSource}:global-auto-inclusions`,
        });

        const allQuoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
        const subtotal = Math.round(allQuoteItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + Number(item.total || 0), 0) * 100) / 100;
        const gst = Math.round(subtotal * 0.15 * 100) / 100;
        updateEntityRecord("Quote", quoteId, { subtotal, gst, total: subtotal + gst }, { actor, request_source: requestSource });
        const updatedImport = updateEntityRecord("QuoteImport", importId, {
          import_status: "committed",
          committed_at: new Date().toISOString(),
          summary: {
            item_count: createdItems.length,
            total_buy_price: Math.round(stagedRows.reduce((sum, row) => sum + Number(row.total_buy_price || Number(row.buy_price || 0) * Number(row.quantity || 1)), 0) * 100) / 100,
            total_sell_price: Math.round(createdItems.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100) / 100,
          },
        }, { actor, request_source: requestSource });

        return { import: updatedImport, quote_items: createdItems, created: createdItems.length };
      });

      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/quote-imports/:id/update-line-items", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = quoteImportUpdateLineItemsSchema.parse(req.body);
      const importId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "quote-pricing-import-update-line-items";
      const result = runInTransaction(() => {
        const importRecord = getEntityRecord("QuoteImport", importId);
        if (!importRecord) throw new RouteRequestError(404, "quote_import_not_found", "Quote import was not found.");
        if (importRecord.import_type !== "quote_level") throw new RouteRequestError(400, "quote_import_wrong_type", "Only quote-level imports can update quote line items.");
        const quoteId = String(importRecord.quote_id || "");
        const quote = getEntityRecord("Quote", quoteId);
        if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");

        const initialRows = listEntityRecords("PricingQuoteItem", { filters: { import_id: importId }, sort: "sort_order", limit: 10000 })
          .filter((row) => !body.row_ids || body.row_ids.includes(row.id));
        const quoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId, import_id: importId }, limit: 10000 });
        const quoteItemsByRowId = new Map(quoteItems.map((item) => [String(item.pricing_quote_item_id || ""), item]));
        const quoteItemsById = new Map(quoteItems.map((item) => [String(item.id || ""), item]));
        const quoteItemsBySource = new Map(quoteItems.map((item) => [`${Number(item.source_row || 0)}:${String(item.source_item_code || item.product_number || item.description || "").toLowerCase()}`, item]));
        const updatedItems: EntityRecord[] = [];
        const skippedRows: EntityRecord[] = [];
        let auditCount = 0;

        initialRows
          .filter((row) => String(row.source || "") !== "triggered_auto_inclusion")
          .forEach((row) => {
            const warnings = buildQuoteImportRowWarnings(row);
            const rowPatch = buildPricingQuoteItemCalculatedPatch(row, warnings);
            updateEntityRecord("PricingQuoteItem", row.id, rowPatch, { actor, request_source: requestSource });
          });

        const stagedRows = syncTriggeredAutoInclusionRowsForImport(importRecord, {
          actor,
          requestSource: `${requestSource}:triggered-auto-inclusions`,
        }).filter((row) => !body.row_ids || body.row_ids.includes(row.id) || String(row.parent_pricing_quote_item_id || "") === "");

        const activeRows = stagedRows.filter((row) => {
          const reviewState = String(row.review_state || row.status || "active");
          if (!body.apply_removed_rows && ["excluded", "deleted"].includes(reviewState)) {
            skippedRows.push(row);
            return false;
          }
          return true;
        });

        activeRows.forEach((row) => {
          const warnings = buildQuoteImportRowWarnings(row);
          const rowPatch = buildPricingQuoteItemCalculatedPatch(row, warnings);
          const updatedRow = updateEntityRecord("PricingQuoteItem", row.id, rowPatch, { actor, request_source: requestSource }) || { ...row, ...rowPatch };
          const quoteItem = quoteItemsByRowId.get(String(row.id))
            || quoteItemsById.get(String(row.quote_item_id || ""))
            || quoteItemsBySource.get(`${Number(row.source_row || 0)}:${String(row.source_item_code || row.original_sku || row.product_number || row.description || row.name || "").toLowerCase()}`);

          if (!quoteItem) {
            if (row.source === "triggered_auto_inclusion") {
              const created = createEntityRecord("QuoteItem", buildQuoteItemPayloadFromPricingRow(updatedRow, importRecord), {
                actor,
                request_source: `${requestSource}:create-triggered`,
              });
              quoteItemsByRowId.set(String(row.id || ""), created);
              quoteItemsById.set(String(created.id || ""), created);
              updatedItems.push(created);
              return;
            }
            skippedRows.push(updatedRow);
            return;
          }

          const patch = buildQuoteItemPatchFromPricingRow(updatedRow, importRecord);
          const changedFields = Object.entries(patch).filter(([field, value]) => !valuesEqualForAudit(quoteItem[field], value));
          if (changedFields.length === 0) {
            updatedItems.push(quoteItem);
            return;
          }
          const updatedQuoteItem = updateEntityRecord("QuoteItem", quoteItem.id, patch, { actor, request_source: requestSource });
          if (!updatedQuoteItem) return;
          updatedItems.push(updatedQuoteItem);
          changedFields.forEach(([field, value]) => {
            createEntityRecord("QuoteLineItemUpdateAudit", {
              quote_id: quoteId,
              import_id: importId,
              line_item_id: quoteItem.id,
              pricing_quote_item_id: row.id,
              field,
              old_value: quoteItem[field] ?? null,
              new_value: value ?? null,
              user_id: actor?.id || "",
              user_name: actor?.full_name || actor?.email || "",
            }, { actor, request_source: requestSource });
            auditCount += 1;
          });
        });

        const refreshedQuoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId, import_id: importId }, limit: 10000 });
        const refreshedQuoteItemsByRowId = new Map(refreshedQuoteItems.map((item) => [String(item.pricing_quote_item_id || ""), item]));
        activeRows
          .filter((row) => row.source === "triggered_auto_inclusion" && row.parent_pricing_quote_item_id)
          .forEach((row) => {
            const childItem = refreshedQuoteItemsByRowId.get(String(row.id || ""));
            const parentItem = refreshedQuoteItemsByRowId.get(String(row.parent_pricing_quote_item_id || ""));
            if (!childItem || !parentItem) return;
            updateEntityRecord("QuoteItem", childItem.id, {
              parent_line_item_id: parentItem.id,
              parent_pricing_quote_item_id: row.parent_pricing_quote_item_id || "",
            }, { actor, request_source: `${requestSource}:triggered-parent-link` });
          });

        const allQuoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
        const subtotal = roundMoney(allQuoteItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + Number(item.total || 0), 0));
        const gst = roundMoney(subtotal * 0.15);
        const quotePatch = { subtotal, gst, total: roundMoney(subtotal + gst) };
        updateEntityRecord("Quote", quoteId, quotePatch, { actor, request_source: requestSource });
        const importRows = listEntityRecords("PricingQuoteItem", { filters: { import_id: importId }, limit: 10000 });
        const importActiveRows = importRows.filter((row) => !["excluded", "deleted"].includes(String(row.review_state || row.status || "")));
        const importWarnings = [...new Set(importActiveRows.flatMap((row) => Array.isArray(row.warnings) ? row.warnings : []))];
        const updatedImport = updateEntityRecord("QuoteImport", importId, {
          import_warnings: importWarnings,
          summary: {
            item_count: importActiveRows.length,
            total_buy_price: roundMoney(importActiveRows.reduce((sum, row) => sum + Number(row.total_buy_price || 0), 0)),
            total_sell_price: roundMoney(importActiveRows.reduce((sum, row) => sum + Number(row.total_sell_price || 0), 0)),
            updated_line_items_at: new Date().toISOString(),
          },
        }, { actor, request_source: requestSource });

        return {
          import: updatedImport,
          quote: { ...quote, ...quotePatch },
          updated: updatedItems.length,
          skipped: skippedRows.length,
          audit_count: auditCount,
          warnings: importWarnings,
        };
      });

      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/pricing/quote-imports/:id", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const importId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "quote-pricing-import-delete";
      const result = runInTransaction(() => {
        const importRecord = getEntityRecord("QuoteImport", importId);
        if (!importRecord) throw new RouteRequestError(404, "quote_import_not_found", "Quote import was not found.");
        if (importRecord.import_type !== "quote_level") throw new RouteRequestError(400, "quote_import_wrong_type", "Only quote-level imports can be deleted from this workflow.");
        const quoteId = String(importRecord.quote_id || "");
        const quote = getEntityRecord("Quote", quoteId);
        if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");

        const reviewRows = listEntityRecords("PricingQuoteItem", { filters: { import_id: importId }, limit: 10000 });
        const quoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId, import_id: importId }, limit: 10000 });
        reviewRows.forEach((row) => deleteEntityRecord("PricingQuoteItem", row.id, { actor, request_source: requestSource }));
        quoteItems.forEach((item) => deleteEntityRecord("QuoteItem", item.id, { actor, request_source: requestSource }));

        listEntityRecords("Attachment", { filters: { related_id: quoteId, related_type: "quote" }, limit: 10000 })
          .filter((attachment) => String(attachment.linked_pricing_import_id || "") === importId)
          .forEach((attachment) => updateEntityRecord("Attachment", attachment.id, {
            linked_pricing_import_id: "",
            quote_file_id: attachment.quote_file_id || attachment.id,
            row_version: attachment.row_version,
          }, {
            actor,
            request_source: requestSource,
            expected_row_version: attachment.row_version,
          }));

        deleteEntityRecord("QuoteImport", importId, { actor, request_source: requestSource });

        const remainingQuoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
        const subtotal = roundMoney(remainingQuoteItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + Number(item.total || 0), 0));
        const gst = roundMoney(subtotal * 0.15);
        const updatedQuote = updateEntityRecord("Quote", quoteId, {
          subtotal,
          gst,
          total: roundMoney(subtotal + gst),
        }, { actor, request_source: requestSource });

        return {
          deleted_import_id: importId,
          deleted_review_rows: reviewRows.length,
          deleted_quote_items: quoteItems.length,
          quote: updatedQuote,
        };
      });

      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/items/save-defaults", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = pricingDefaultsSaveSchema.parse(req.body);
      const allowedFields = new Set([
        "category", "buy_price", "markup_percent", "default_markup", "unit", "supplier", "product_number",
        "supplier_sku", "original_sku", "description", "section", "section_id", "section_key", "section_display_order",
        "waste_factor", "labour_defaults", "default_inclusion_behaviour", "notes",
      ]);
      const requestSource = readRequestSource(req) || "pricing-save-defaults";
      const result = runInTransaction(() => {
        let updated = 0;
        let created = 0;
        const records = body.items.map((item) => {
          const fields = Object.fromEntries(Object.entries(item.fields || {}).filter(([field]) => allowedFields.has(field)));
          if ((fields.default_markup == null || fields.default_markup === "") && fields.markup_percent != null) {
            fields.default_markup = fields.markup_percent;
          }
          if ((!fields.supplier_sku || String(fields.supplier_sku).trim() === "") && fields.product_number) {
            fields.supplier_sku = fields.product_number;
          }
          if ((!fields.original_sku || String(fields.original_sku).trim() === "") && fields.product_number) {
            fields.original_sku = fields.product_number;
          }
          if ((!fields.description || String(fields.description).trim() === "") && item.match_name) {
            fields.description = item.match_name;
          }
          let existing = item.pricing_item_id ? getEntityRecord("PricingItem", item.pricing_item_id) : null;
          const supplier = String(fields.supplier || "").trim().toLowerCase();
          const productNumber = String(fields.product_number || fields.supplier_sku || "").trim().toLowerCase();
          if (!existing && productNumber) {
            existing = listEntityRecords("PricingItem", { limit: 10000 }).find((candidate) => {
              const candidateSku = String(candidate.product_number || candidate.supplier_sku || "").trim().toLowerCase();
              const candidateSupplier = String(candidate.supplier || "").trim().toLowerCase();
              if (!candidateSku || candidateSku !== productNumber) return false;
              if (!supplier) return true;
              return candidateSupplier === supplier;
            }) || null;
          }
          if (!existing && item.match_name) {
            const normalizedMatchName = String(item.match_name).trim().toLowerCase();
            existing = listEntityRecords("PricingItem", { limit: 10000 }).find((candidate) => {
              const candidateName = String(candidate.name || candidate.description || "").trim().toLowerCase();
              if (!candidateName || candidateName !== normalizedMatchName) return false;
              if (!supplier) return true;
              return String(candidate.supplier || "").trim().toLowerCase() === supplier;
            }) || null;
          }
          if (existing) {
            Object.entries(fields).forEach(([field, value]) => {
              const oldValue = existing?.[field];
              if (JSON.stringify(oldValue ?? null) === JSON.stringify(value ?? null)) return;
              createEntityRecord("PricingItemLearningAudit", {
                pricing_item_id: existing?.id || "",
                field,
                old_value: oldValue ?? null,
                new_value: value ?? null,
                source_quote_id: body.source_quote_id || "",
                source_import_id: body.source_import_id || "",
                user_id: actor?.id || "",
                user_name: actor?.full_name || "",
                action_type: "save_default",
              }, { actor, request_source: requestSource });
            });
            const saved = updateEntityRecord("PricingItem", existing.id, fields, { actor, request_source: requestSource });
            updated += 1;
            return saved;
          }
          const createdRecord = createEntityRecord("PricingItem", {
            ...fields,
            name: item.match_name || String(fields.product_number || fields.supplier_sku || "New pricing item"),
            description: String(fields.description || item.match_name || ""),
            supplier_sku: String(fields.supplier_sku || fields.product_number || ""),
            original_sku: String(fields.original_sku || fields.product_number || ""),
            default_markup: Number(fields.default_markup ?? fields.markup_percent ?? 30) || 30,
            is_user_created: true,
            is_active: true,
          }, { actor, request_source: requestSource });
          createEntityRecord("PricingItemLearningAudit", {
            pricing_item_id: createdRecord.id,
            field: "*",
            old_value: null,
            new_value: fields,
            source_quote_id: body.source_quote_id || "",
            source_import_id: body.source_import_id || "",
            user_id: actor?.id || "",
            user_name: actor?.full_name || "",
            action_type: "new_default_created",
          }, { actor, request_source: requestSource });
          created += 1;
          return createdRecord;
        });
        return { updated, created, records };
      });
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/items/:id/deactivate", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = pricingDeactivateSchema.parse(req.body);
      const id = readRouteParam(req.params.id);
      const existing = getEntityRecord("PricingItem", id);
      if (!existing) throw new RouteRequestError(404, "pricing_item_not_found", "Pricing item was not found.");
      if (existing.is_user_created !== true) {
        throw new RouteRequestError(400, "pricing_item_not_user_created", "Only user-created pricing items can be removed from future quotes.");
      }
      const requestSource = readRequestSource(req) || "pricing-item-deactivate";
      const updated = updateEntityRecord("PricingItem", id, { is_active: false }, { actor, request_source: requestSource });
      createEntityRecord("PricingItemActionAudit", {
        pricing_item_id: id,
        action_type: "master_soft_delete",
        source_quote_id: body.source_quote_id || "",
        source_import_id: body.source_import_id || "",
        user_id: actor?.id || "",
        user_name: actor?.full_name || "",
        details: { reason: body.reason || "", warnings: ["Check existing quotes and pricing rules before relying on this removal."] },
      }, { actor, request_source: requestSource });
      res.json({ item: updated, warnings: ["This item was soft-deleted from future quotes only. Historical quotes were preserved."] });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/items/:id/auto-inclusions", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const parentId = readRouteParam(req.params.id);
      const parent = getEntityRecord("PricingItem", parentId);
      if (!parent) throw new RouteRequestError(404, "pricing_item_not_found", "Parent pricing item was not found.");
      const body = pricingAutoInclusionsSaveSchema.parse(req.body);
      const requestSource = readRequestSource(req) || "pricing-auto-inclusions";
      const result = runInTransaction(() => {
        const existing = listEntityRecords("PricingItemAutoInclusion", { filters: { parent_pricing_item_id: parentId }, limit: 1000 });
        const previousRules = existing.map((record) => ({ ...record }));
        existing.forEach((record) => {
          updateEntityRecord("PricingItemAutoInclusion", record.id, { is_active: false }, { actor, request_source: requestSource });
        });

        const saved = body.save_as_default
          ? body.inclusions.map((inclusion) => createEntityRecord("PricingItemAutoInclusion", {
              parent_pricing_item_id: parentId,
              parent_sku: parent.product_number || parent.supplier_sku || "",
              inclusion_pricing_item_id: inclusion.inclusion_pricing_item_id || "",
              inclusion_sku: inclusion.inclusion_sku || "",
              inclusion_description: inclusion.inclusion_description,
              inclusion_category: inclusion.inclusion_category || "misc_fixings",
              quantity_logic: inclusion.quantity_logic,
              quantity_value: inclusion.quantity_value,
              custom_formula: inclusion.custom_formula || "",
              unit_cost: inclusion.unit_cost,
              markup_percent: inclusion.markup_percent,
              is_active: inclusion.is_active !== false,
            }, { actor, request_source: requestSource }))
          : [];

        createEntityRecord("AutoInclusionAuditLog", {
          parent_pricing_item_id: parentId,
          inclusion_item_id: body.inclusions.map((item) => item.inclusion_pricing_item_id || item.inclusion_sku || item.inclusion_description).join(", "),
          old_inclusion_rule: previousRules,
          new_inclusion_rule: body.inclusions,
          source_quote_id: body.source_quote_id || "",
          source_import_id: body.source_import_id || "",
          user_id: actor?.id || "",
          user_name: actor?.full_name || "",
        }, { actor, request_source: requestSource });

        return { saved, quote_only: body.save_as_default ? [] : body.inclusions };
      });
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/calculate", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = pricingCalculationSchema.parse(req.body);
      const profile = body.labour_profile
        || listEntityRecords("LabourProfile", { filters: { is_default: true }, limit: 1 })[0]
        || {};
      const assumptions = buildPricingAssumptions(profile, body.assumptions || {});
      const rules = listEntityRecords("PricingRule", { filters: { is_active: true }, sort: "sort_order", limit: 500 }) as unknown as Parameters<typeof applyPricingRules>[1];
      const items = body.items as unknown as Parameters<typeof applyPricingRules>[0];
      const ruleInclusions = applyPricingRules(items, rules);
      const providedInclusions = body.auto_inclusions
        ? body.auto_inclusions as unknown as Parameters<typeof calculatePricing>[1]
        : [];
      const autoInclusions = [...ruleInclusions, ...providedInclusions];
      const calculation = calculatePricing(items, autoInclusions, assumptions);
      const scenarios = buildScenarios(items, autoInclusions, assumptions);
      const historical = compareHistoricalJobs(
        calculation,
        listEntityRecords("HistoricalJob", { limit: 1000 }),
        body.job_type || ""
      );
      const requestSource = readRequestSource(req) || "pricing-calculate";
      let persisted = null;

      if (body.persist) {
        persisted = createEntityRecord("QuoteCalculation", {
          quote_id: body.quote_id || "",
          job_name: body.job_name || "",
          assumptions: calculation.assumptions,
          totals: calculation.totals,
          warnings: calculation.warnings,
          line_items: calculation.line_items,
          auto_inclusions: calculation.auto_inclusions,
        }, {
          actor,
          request_source: requestSource,
        });

        scenarios.forEach((scenario) => {
          createEntityRecord("QuoteScenario", {
            quote_id: body.quote_id || "",
            ...scenario,
          }, {
            actor,
            request_source: requestSource,
          });
        });
      }

      res.json({
        calculation,
        scenarios,
        historical,
        persisted,
      });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/price-list-imports/stage", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = priceListStageSchema.parse(req.body);
      const decodedSize = Buffer.from(body.file_base64, "base64").length;
      if (decodedSize > MAX_UPLOAD_BYTES) {
        throw new RouteRequestError(400, "price_list_file_too_large", "Price list file is too large.");
      }
      const fileType = body.file_type || String(body.file_name.split(".").pop() || "").toLowerCase();
      if (!["csv", "xlsx", "pdf"].includes(fileType)) {
        throw new RouteRequestError(400, "price_list_file_type_invalid", "Only CSV, XLSX, and PDF price lists are supported.");
      }

      const parsedRows = parsePriceListFile({ fileName: body.file_name, fileBase64: body.file_base64, fileType, ocrText: body.ocr_text });
      const profileRecord = listEntityRecords("SupplierImportProfile", { filters: { supplier: body.supplier }, limit: 1 })[0];
      const savedProfileMapping = profileRecord?.column_mapping && typeof profileRecord.column_mapping === "object"
        ? profileRecord.column_mapping as Record<string, string>
        : undefined;
      const appliedMapping = body.column_mapping || savedProfileMapping;
      const schemaCheck = validatePriceListSchema(appliedMapping || {});
      if (appliedMapping && !schemaCheck.valid) {
        throw new RouteRequestError(400, "price_list_required_columns_missing", schemaCheck.errors.join(" "));
      }
      const existingPricingItems = listEntityRecords("PricingItem", { limit: 10000 });
      const stagedRows = enrichPriceListRowsWithAiSuggestions({
        rows: stagePriceListRows({
        rows: parsedRows,
        supplier: body.supplier,
        mapping: appliedMapping,
        pricingItems: existingPricingItems,
        movementThresholdPercent: body.movement_threshold_percent,
        }),
        supplier: body.supplier,
        suppliers: listEntityRecords("Supplier", { limit: 10000 }),
        pricingItems: existingPricingItems,
        movementThresholdPercent: body.movement_threshold_percent,
      });
      const summary = buildPriceListSummary(stagedRows);
      const requestSource = readRequestSource(req) || "price-list-stage";
      const importRecord = createEntityRecord("PriceListImport", {
        supplier: body.supplier,
        supplier_id: body.supplier_id || "",
        file_name: body.file_name,
        file_type: fileType,
        file_size: decodedSize,
        original_file_base64: body.file_base64,
        imported_by_user_id: actor?.id || "",
        imported_by_user_name: actor?.full_name || "",
        import_status: "staged",
        column_mapping: appliedMapping || {},
        summary,
        warnings: [...schemaCheck.warnings, ...stagedRows.flatMap((row) => row.warnings)],
        ai_suggestions: {
          status: "staged_review_required",
          generated_at: new Date().toISOString(),
          review_required: stagedRows.some((row) => row.ai_review_required),
          auto_commit: false,
        },
        ai_review_required: stagedRows.some((row) => row.ai_review_required),
      }, { actor, request_source: requestSource });

      const rowRecords = stagedRows.map((row) => createEntityRecord("PriceListImportRow", {
        ...row,
        import_id: importRecord.id,
      }, { actor, request_source: requestSource }));

      if (appliedMapping && Object.keys(appliedMapping).length > 0) {
        const existingMapping = listEntityRecords("SupplierColumnMapping", { filters: { supplier: body.supplier }, limit: 1 })[0];
        const mappingPayload = {
          supplier: body.supplier,
          supplier_id: body.supplier_id || "",
          mapping: appliedMapping,
          last_used_at: new Date().toISOString(),
        };
        if (existingMapping) updateEntityRecord("SupplierColumnMapping", existingMapping.id, mappingPayload, { actor, request_source: requestSource });
        else createEntityRecord("SupplierColumnMapping", mappingPayload, { actor, request_source: requestSource });

        const profilePayload = {
          ...buildSupplierImportProfile({ supplier: body.supplier, row: parsedRows[0] || {}, mapping: appliedMapping }),
          supplier_id: body.supplier_id || "",
          last_used_at: new Date().toISOString(),
        };
        if (profileRecord) updateEntityRecord("SupplierImportProfile", profileRecord.id, profilePayload, { actor, request_source: requestSource });
        else createEntityRecord("SupplierImportProfile", profilePayload, { actor, request_source: requestSource });
      }

      res.status(201).json({ import: importRecord, rows: rowRecords, summary, ai_suggestions: importRecord.ai_suggestions });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/price-list-imports/:id/commit", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const body = priceListCommitSchema.parse(req.body);
      const importId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "price-list-commit";
      const result = runInTransaction(() => {
        const importRecord = getEntityRecord("PriceListImport", importId);
        if (!importRecord) throw new RouteRequestError(404, "price_list_import_not_found", "Price list import was not found.");
        if (importRecord.import_status !== "staged") throw new RouteRequestError(400, "price_list_import_not_staged", "Only staged imports can be committed.");
        const selectedRows = listEntityRecords("PriceListImportRow", { filters: { import_id: importId }, limit: 10000 })
          .filter((row) => !body.row_ids || body.row_ids.includes(row.id));
        let updated = 0;
        let created = 0;
        let skipped = 0;

        selectedRows.forEach((row) => {
          if (Array.isArray(row.errors) && row.errors.length > 0) {
            skipped += 1;
            return;
          }
          const newValues = row.new_values && typeof row.new_values === "object" ? row.new_values as Record<string, unknown> : {};
          const oldValues = row.old_values && typeof row.old_values === "object" ? row.old_values as Record<string, unknown> : {};
          if (row.pricing_item_id) {
            const existing = getEntityRecord("PricingItem", String(row.pricing_item_id));
            if (!existing) {
              skipped += 1;
              return;
            }
            const nextCost = Number(newValues.buy_price || 0);
            const oldCost = Number(existing.buy_price || 0);
            updateEntityRecord("PricingItem", existing.id, {
              buy_price: nextCost,
              name: newValues.name || existing.name,
              description: newValues.description || existing.description || "",
              unit: newValues.unit || existing.unit,
              pack_quantity: newValues.pack_quantity || existing.pack_quantity || 1,
              minimum_order_quantity: newValues.minimum_order_quantity || existing.minimum_order_quantity || 0,
              supplier: newValues.supplier || existing.supplier || "",
              product_number: newValues.product_number || existing.product_number || existing.supplier_sku || "",
              original_sku: newValues.original_sku || existing.original_sku || existing.product_number || existing.supplier_sku || "",
              normalized_sku: newValues.normalized_sku || existing.normalized_sku || "",
              supplier_sku: newValues.supplier_sku || existing.supplier_sku || "",
              supplier_item_code: newValues.supplier_item_code || existing.supplier_item_code || "",
              barcode: newValues.barcode || existing.barcode || "",
              supplier_reference: newValues.supplier_reference || existing.supplier_reference || "",
              discount_group: newValues.discount_group || existing.discount_group || "",
              effective_date: newValues.effective_date || existing.effective_date || "",
              dimensions: newValues.dimensions || existing.dimensions || "",
              last_imported_price: nextCost,
              price_list_import_id: importId,
              last_price_update_at: new Date().toISOString(),
            }, { actor, request_source: requestSource });
            if (oldCost !== nextCost) {
              createEntityRecord("PricingItemPriceHistory", {
                pricing_item_id: existing.id,
                supplier: newValues.supplier || existing.supplier || "",
                product_number: newValues.product_number || existing.product_number || existing.supplier_sku || "",
                original_sku: newValues.original_sku || existing.original_sku || existing.product_number || existing.supplier_sku || "",
                normalized_sku: newValues.normalized_sku || existing.normalized_sku || "",
                old_cost: oldCost,
                new_cost: nextCost,
                percentage_change: oldCost > 0 ? Math.round(((nextCost - oldCost) / oldCost * 100) * 100) / 100 : 0,
                effective_date: newValues.effective_date || "",
                import_id: importId,
                changed_by_user_id: actor?.id || "",
                changed_by_user_name: actor?.full_name || "",
              }, { actor, request_source: requestSource });
            }
            updated += 1;
          } else if (row.status === "new" && body.create_new_items) {
            if (!newValues.unit || !newValues.buy_price || !newValues.name) {
              skipped += 1;
              return;
            }
            const createdItem = createEntityRecord("PricingItem", {
              name: newValues.name,
              description: newValues.description || "",
              category: (row.mapped as Record<string, unknown>)?.category || "misc_fixings",
              unit: newValues.unit,
              buy_price: newValues.buy_price,
              markup_percent: 30,
              supplier: newValues.supplier || importRecord.supplier || "",
              product_number: newValues.product_number || "",
              original_sku: newValues.original_sku || newValues.product_number || "",
              normalized_sku: newValues.normalized_sku || "",
              supplier_sku: newValues.supplier_sku || "",
              supplier_item_code: newValues.supplier_item_code || "",
              barcode: newValues.barcode || "",
              supplier_reference: newValues.supplier_reference || "",
              pack_quantity: newValues.pack_quantity || 1,
              minimum_order_quantity: newValues.minimum_order_quantity || 0,
              discount_group: newValues.discount_group || "",
              effective_date: newValues.effective_date || "",
              dimensions: newValues.dimensions || "",
              last_imported_price: Number(newValues.buy_price || 0),
              price_list_import_id: importId,
              last_price_update_at: new Date().toISOString(),
              is_active: true,
            }, { actor, request_source: requestSource });
            updateEntityRecord("PriceListImportRow", row.id, { pricing_item_id: createdItem.id, status: "matched" }, { actor, request_source: requestSource });
            createEntityRecord("PricingItemPriceHistory", {
              pricing_item_id: createdItem.id,
              supplier: newValues.supplier || importRecord.supplier || "",
              product_number: newValues.product_number || "",
              original_sku: newValues.original_sku || newValues.product_number || "",
              normalized_sku: newValues.normalized_sku || "",
              old_cost: 0,
              new_cost: Number(newValues.buy_price || 0),
              percentage_change: 0,
              effective_date: newValues.effective_date || "",
              import_id: importId,
              changed_by_user_id: actor?.id || "",
              changed_by_user_name: actor?.full_name || "",
            }, { actor, request_source: requestSource });
            created += 1;
          } else {
            skipped += 1;
          }
          void oldValues;
        });

        const updatedImport = updateEntityRecord("PriceListImport", importId, {
          import_status: "committed",
          committed_at: new Date().toISOString(),
          summary: { ...(importRecord.summary as Record<string, unknown> || {}), updated, created, skipped },
        }, { actor, request_source: requestSource });
        return { import: updatedImport, updated, created, skipped };
      });

      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/price-list-imports/:id/rollback", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const importId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "price-list-rollback";
      const result = runInTransaction(() => {
        const importRecord = getEntityRecord("PriceListImport", importId);
        if (!importRecord) throw new RouteRequestError(404, "price_list_import_not_found", "Price list import was not found.");
        if (importRecord.import_status !== "committed") throw new RouteRequestError(400, "price_list_import_not_committed", "Only committed imports can be rolled back.");
        const rows = listEntityRecords("PriceListImportRow", { filters: { import_id: importId }, limit: 10000 });
        const restoredItems: string[] = [];
        rows.forEach((row) => {
          if (!row.pricing_item_id || !row.old_values || typeof row.old_values !== "object" || Object.keys(row.old_values).length === 0) return;
          const existing = getEntityRecord("PricingItem", String(row.pricing_item_id));
          if (!existing) return;
          updateEntityRecord("PricingItem", existing.id, {
            ...(row.old_values as Record<string, unknown>),
            last_price_update_at: new Date().toISOString(),
          }, { actor, request_source: requestSource });
          restoredItems.push(existing.id);
        });
        const rollbackLog = createEntityRecord("ImportRollbackLog", {
          import_id: importId,
          rolled_back_by_user_id: actor?.id || "",
          rolled_back_by_user_name: actor?.full_name || "",
          restored_items: restoredItems,
          note: "Price list import rollback restored previous mapped supplier fields and prices.",
        }, { actor, request_source: requestSource });
        const updatedImport = updateEntityRecord("PriceListImport", importId, {
          import_status: "rolled_back",
          rolled_back_at: new Date().toISOString(),
          rolled_back_by_user_id: actor?.id || "",
          rolled_back_by_user_name: actor?.full_name || "",
        }, { actor, request_source: requestSource });
        return { import: updatedImport, rollback: rollbackLog, restored_count: restoredItems.length };
      });
      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/sections/:id/merge", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const sourceSectionId = readRouteParam(req.params.id);
      const body = pricingSectionMergeSchema.parse(req.body);
      const requestSource = readRequestSource(req) || "pricing-section-merge";

      const result = runInTransaction(() => {
        const sourceSection = getEntityRecord("PricingSection", sourceSectionId);
        const targetSection = getEntityRecord("PricingSection", body.target_section_id);
        if (!sourceSection) {
          throw new RouteRequestError(404, "pricing_section_not_found", "Source section was not found.");
        }
        if (!targetSection) {
          throw new RouteRequestError(404, "pricing_section_target_not_found", "Target section was not found.");
        }
        if (String(sourceSection.id || "") === String(targetSection.id || "")) {
          throw new RouteRequestError(400, "pricing_section_same_target", "Choose a different target section.");
        }

        const impact = countPricingSectionUsage(sourceSection);
        listEntityRecords("QuoteItem", { limit: 10000 })
          .filter((record) => sectionMatchesReference(record, sourceSection))
          .forEach((record) => {
            updateEntityRecord("QuoteItem", record.id, applyPricingSectionToPayload(record, targetSection), {
              actor,
              request_source: requestSource,
            });
          });

        listEntityRecords("PricingQuoteItem", { limit: 10000 })
          .filter((record) => sectionMatchesReference(record, sourceSection))
          .forEach((record) => {
            updateEntityRecord("PricingQuoteItem", record.id, applyPricingSectionToPayload(record, targetSection), {
              actor,
              request_source: requestSource,
            });
          });

        listEntityRecords("QuoteImport", { limit: 10000 }).forEach((record) => {
          const structuredItems = Array.isArray(record.structured_items) ? record.structured_items : [];
          let changed = false;
          const nextStructuredItems = structuredItems.map((item) => {
            if (!item || typeof item !== "object") {
              return item;
            }
            const currentHeading = normalizePricingSectionName((item as Record<string, unknown>).heading_category || (item as Record<string, unknown>).section);
            const sourceHeading = normalizePricingSectionName(sourceSection.name || sourceSection.label || "");
            if (!currentHeading || currentHeading !== sourceHeading) {
              return item;
            }
            changed = true;
            return {
              ...(item as Record<string, unknown>),
              heading_category: String(targetSection.label || targetSection.name || ""),
              section: String(targetSection.label || targetSection.name || ""),
              section_key: String(targetSection.key || targetSection.value || ""),
              section_id: String(targetSection.id || ""),
              section_display_order: Number(targetSection.display_order || 999),
            };
          });
          if (changed) {
            updateEntityRecord("QuoteImport", record.id, { structured_items: nextStructuredItems }, {
              actor,
              request_source: requestSource,
            });
          }
        });

        const mergedSource = updateEntityRecord("PricingSection", sourceSection.id, {
          is_active: false,
          merged_into_section_id: String(targetSection.id || ""),
          merged_into_section_key: String(targetSection.key || targetSection.value || ""),
          merged_into_section_name: String(targetSection.label || targetSection.name || ""),
        }, {
          actor,
          request_source: requestSource,
        });

        return { source: mergedSource, target: targetSection, impact };
      });

      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.post("/api/pricing/categories/:id/merge", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireJsonMutation(req);
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const sourceCategoryId = readRouteParam(req.params.id);
      const body = pricingCategoryMergeSchema.parse(req.body);
      const requestSource = readRequestSource(req) || "pricing-category-merge";

      const result = runInTransaction(() => {
        const sourceCategory = getEntityRecord("PricingCategory", sourceCategoryId);
        const targetCategory = getEntityRecord("PricingCategory", body.target_category_id);
        if (!sourceCategory) {
          throw new RouteRequestError(404, "pricing_category_not_found", "Source category was not found.");
        }
        if (!targetCategory) {
          throw new RouteRequestError(404, "pricing_category_target_not_found", "Target category was not found.");
        }
        if (String(sourceCategory.id || "") === String(targetCategory.id || "")) {
          throw new RouteRequestError(400, "pricing_category_same_target", "Choose a different target category.");
        }
        if (targetCategory.is_active === false && body.allow_inactive_target !== true) {
          throw new RouteRequestError(400, "pricing_category_inactive_target", "Choose an active target category or explicitly allow merging into an inactive category.");
        }

        const impact = countPricingCategoryUsage(sourceCategory);
        const nextCategoryValue = String(targetCategory.key || targetCategory.value || buildPricingCategoryRecord(String(targetCategory.label || targetCategory.name || "")).key);

        listEntityRecords("PricingItem", { limit: 10000 })
          .filter((record) => categoryMatchesReference(record, sourceCategory))
          .forEach((record) => {
            updateEntityRecord("PricingItem", record.id, applyPricingCategoryValue(record.category, targetCategory), {
              actor,
              request_source: requestSource,
            });
          });

        listEntityRecords("QuoteItem", { limit: 10000 })
          .filter((record) => categoryMatchesReference(record, sourceCategory))
          .forEach((record) => {
            updateEntityRecord("QuoteItem", record.id, applyPricingCategoryValue(record.category, targetCategory), {
              actor,
              request_source: requestSource,
            });
          });

        listEntityRecords("PricingQuoteItem", { limit: 10000 })
          .filter((record) => categoryMatchesReference(record, sourceCategory))
          .forEach((record) => {
            updateEntityRecord("PricingQuoteItem", record.id, applyPricingCategoryValue(record.category, targetCategory), {
              actor,
              request_source: requestSource,
            });
          });

        listEntityRecords("PriceListImportRow", { limit: 10000 }).forEach((record) => {
          const mapped = record.mapped && typeof record.mapped === "object" ? { ...(record.mapped as Record<string, unknown>) } : null;
          const nextValues = record.new_values && typeof record.new_values === "object" ? { ...(record.new_values as Record<string, unknown>) } : null;
          let changed = false;
          if (mapped && categoryMatchesReference(mapped, sourceCategory)) {
            mapped.category = nextCategoryValue;
            changed = true;
          }
          if (nextValues && categoryMatchesReference(nextValues, sourceCategory)) {
            nextValues.category = nextCategoryValue;
            changed = true;
          }
          if (changed) {
            updateEntityRecord("PriceListImportRow", record.id, {
              ...(mapped ? { mapped } : {}),
              ...(nextValues ? { new_values: nextValues } : {}),
            }, {
              actor,
              request_source: requestSource,
            });
          }
        });

        listEntityRecords("QuoteImport", { limit: 10000 }).forEach((record) => {
          const structuredItems = Array.isArray(record.structured_items) ? record.structured_items : [];
          let changed = false;
          const nextStructuredItems = structuredItems.map((item) => {
            if (!item || typeof item !== "object" || !categoryMatchesReference(item as Record<string, unknown>, sourceCategory)) {
              return item;
            }
            changed = true;
            return {
              ...(item as Record<string, unknown>),
              category: nextCategoryValue,
            };
          });
          if (changed) {
            updateEntityRecord("QuoteImport", record.id, { structured_items: nextStructuredItems }, {
              actor,
              request_source: requestSource,
            });
          }
        });

        listEntityRecords("GlobalAutoInclusion", { limit: 10000 })
          .filter((record) => categoryMatchesReference(record, sourceCategory))
          .forEach((record) => {
            updateEntityRecord("GlobalAutoInclusion", record.id, applyPricingCategoryValue(record.category, targetCategory), {
              actor,
              request_source: requestSource,
            });
          });

        listEntityRecords("TriggeredAutoInclusionRule", { limit: 10000 }).forEach((record) => {
          const payload: Record<string, unknown> = {};
          if (categoryMatchesReference({ category: record.inclusion_category }, sourceCategory)) {
            payload.inclusion_category = nextCategoryValue;
          }
          if (categoryMatchesReference({ category: record.trigger_category }, sourceCategory)) {
            payload.trigger_category = nextCategoryValue;
          }
          if (Object.keys(payload).length > 0) {
            updateEntityRecord("TriggeredAutoInclusionRule", record.id, payload, {
              actor,
              request_source: requestSource,
            });
          }
        });

        const mergedSource = updateEntityRecord("PricingCategory", sourceCategory.id, {
          is_active: false,
          merged_into_category_id: String(targetCategory.id || ""),
          merged_into_category_key: nextCategoryValue,
          merged_into_category_name: String(targetCategory.label || targetCategory.name || ""),
        }, {
          actor,
          request_source: requestSource,
        });

        return { source: mergedSource, target: targetCategory, impact };
      });

      res.json(result);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/pricing/categories/:id", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const categoryId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "pricing-category-delete";
      const category = getEntityRecord("PricingCategory", categoryId);
      if (!category) {
        throw new RouteRequestError(404, "pricing_category_not_found", "Category was not found.");
      }
      const usage = countPricingCategoryUsage(category);
      if (usage.total > 0) {
        throw new RouteRequestError(400, "pricing_category_in_use", "This category is already used. Deactivate it or merge it into another category instead.");
      }
      const deleted = deleteEntityRecord("PricingCategory", categoryId, { actor, request_source: requestSource });
      if (!deleted) {
        throw new RouteRequestError(404, "pricing_category_not_found", "Category was not found.");
      }
      res.json({ deleted: true });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/pricing/sections/:id", (req: Request, res: Response) => {
    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) return;
      requireAuthenticatedApiUser(req);
      requireModuleEnabled("pricing");
      actor = resolveMutationActor(req);
      const sectionId = readRouteParam(req.params.id);
      const requestSource = readRequestSource(req) || "pricing-section-delete";
      const section = getEntityRecord("PricingSection", sectionId);
      if (!section) {
        throw new RouteRequestError(404, "pricing_section_not_found", "Section was not found.");
      }
      const usage = countPricingSectionUsage(section);
      if (usage.total > 0) {
        throw new RouteRequestError(400, "pricing_section_in_use", "This section is already used. Deactivate it or merge it into another section instead.");
      }
      const deleted = deleteEntityRecord("PricingSection", sectionId, { actor, request_source: requestSource });
      if (!deleted) {
        throw new RouteRequestError(404, "pricing_section_not_found", "Section was not found.");
      }
      res.json({ deleted: true });
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.get("/api/entities/:entity/:id", (req: Request, res: Response) => {
    const entity = readRouteParam(req.params.entity);
    if (!isKnownEntityName(entity)) {
      res.status(404).json({ error: "Unknown entity type." });
      return;
    }

    try {
      authorizeEntityRequest(req, entity, "read");
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    if (entity === "AppUser") {
      res.status(403).json({ error: "AppUser records are managed through the access API." });
      return;
    }

    const id = readRouteParam(req.params.id);
    const record = getEntityRecord(entity, id);

    if (!record) {
      res.status(404).json({ error: "Record not found" });
      return;
    }

    try {
      if (entity === "ReportView") {
        ensureReportViewAccess(req, record);
      }
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    res.json(record);
  });

  app.get("/api/entities/:entity/:id/audit", (req: Request, res: Response) => {
    const entity = readRouteParam(req.params.entity);
    if (!isKnownEntityName(entity)) {
      res.status(404).json({ error: "Unknown entity type." });
      return;
    }

    try {
      authorizeEntityRequest(req, entity, "read");
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    const id = readRouteParam(req.params.id);
    res.json(listAuditLogRecords({ entity, record_id: id, limit: parseLimit(req.query.limit) || 200 }));
  });

  app.post("/api/entities/:entity", (req: Request, res: Response) => {
    const entity = readRouteParam(req.params.entity);
    if (!isKnownEntityName(entity)) {
      res.status(404).json({ error: "Unknown entity type." });
      return;
    }

    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      authorizeEntityRequest(req, entity, "write");
      actor = resolveMutationActor(req);
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    if (entity === "AppUser") {
      res.status(403).json({ error: "AppUser records are managed through the access API." });
      return;
    }

    try {
      const requestBody = validateEntityMutationPayload(entity, req.body);
      const requestSource = readRequestSource(req);
      const normalizedRequestBody: Record<string, unknown> =
        entity === "ReportView"
          ? normalizeReportViewPayload(requestBody, actor)
          : requestBody;
      if (entity === "Invoice") {
        assertInvoiceJobReference(normalizedRequestBody);
      }
      if (entity === "PurchaseOrder") {
        assertPurchaseOrderJobReference(normalizedRequestBody);
      }
      if (entity === "POItem") {
        assertPoItemPurchaseOrderReference(normalizedRequestBody);
      }
      if (entity === "TimeEntry") {
        assertTimeEntryMutationAuthorized(actor, normalizedRequestBody);
      }
      const startedTimer = entity === "TimeEntry" && normalizeTimeEntryStatus(requestBody.status) === "active"
        ? startTimer(normalizedRequestBody, {
            actor,
            requestSource,
          })
        : null;
      let record =
        entity === "LeadCategory"
          ? createLeadCategoryRecord(normalizedRequestBody, {
              actor,
              requestSource,
            })
          : startedTimer
            ? startedTimer.entry
          : createEntityRecord(
              entity,
              entity === "Lead"
                ? applyLeadCategoryDefaultsToLeadPayload(normalizedRequestBody)
                : entity === "Job"
                  ? enrichJobWithWorkflowDefaults(normalizedRequestBody)
                  : entity === "ScheduleLane"
                    ? applyScheduleLaneLifecycleFields(normalizedRequestBody)
                  : entity === "JobOperation"
                    ? applyJobOperationLifecycleFields(normalizedRequestBody)
                    : entity === "TimeEntry"
                      ? normalizeSegmentedTimeEntryPayload(normalizedRequestBody)
                      : entity === "ClockIn"
                        ? normalizeClockInPayload(normalizedRequestBody)
                        : normalizedRequestBody,
              {
                actor,
                request_source: requestSource,
              }
            );

      if (entity === "Job") {
        ensureJobWorkflowTasks(record, {
          actor,
          requestSource,
        });
      }

      if (entity === "Quote") {
        ensureQuoteWorkflowTasks(record, {
          actor,
          requestSource,
        });
        const applied = applyGlobalAutoInclusionsToQuote(record.id, {
          actor,
          requestSource: requestSource || "quote-create-global-auto-inclusions",
        });
        if (applied.quote) {
          record = applied.quote;
        }
        reconcileQuoteWorkflowStatuses(record.id, {
          actor,
          requestSource,
        });
      }

      if (entity === "JobOperation" && record.job_id) {
        reconcileJobWorkflowStatuses(String(record.job_id), {
          actor,
          requestSource,
        });
      }
      if (entity === "JobOperation" && record.quote_id) {
        reconcileQuoteWorkflowStatuses(String(record.quote_id), {
          actor,
          requestSource,
        });
      }

      if (entity === "TimeEntry") {
        if (startedTimer?.auto_paused_entry) {
          syncSegmentedTimeEntrySideEffects(startedTimer.auto_paused_entry, startedTimer.auto_paused_entry, actor, requestSource);
        }
        syncSegmentedTimeEntrySideEffects(null, record, actor, requestSource);
      }

      ensureEntityUploadDirectory(entity, record);
      logAppEvent("entity_created", {
        entity,
        record_id: record.id,
        actor_email: actor?.email || "",
        request_source: requestSource,
      });
      queueEmbeddingRefresh(entity, record.id);
      res.status(201).json(record);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.put("/api/entities/:entity/:id", (req: Request, res: Response) => {
    const entity = readRouteParam(req.params.entity);
    if (!isKnownEntityName(entity)) {
      res.status(404).json({ error: "Unknown entity type." });
      return;
    }

    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      requireJsonMutation(req);
      authorizeEntityRequest(req, entity, "write");
      actor = resolveMutationActor(req);
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    if (entity === "AppUser") {
      res.status(403).json({ error: "AppUser records are managed through the access API." });
      return;
    }

    try {
      const id = readRouteParam(req.params.id);
      const previousRecord = getEntityRecord(entity, id);
      if (entity === "ReportView" && previousRecord) {
        ensureReportViewAccess(req, previousRecord);
      }
      const requestBody = validateEntityMutationPayload(entity, req.body, previousRecord, {
        requireRowVersion: true,
      });
      const body: Record<string, unknown> = entity === "ReportView"
        ? normalizeReportViewPayload(requestBody, actor, previousRecord)
        : requestBody;
      if (entity === "Invoice") {
        assertInvoiceJobReference(body, previousRecord);
      }
      if (entity === "PurchaseOrder") {
        assertPurchaseOrderJobReference(body, previousRecord);
      }
      if (entity === "POItem") {
        assertPoItemPurchaseOrderReference(body, previousRecord);
      }
      if (entity === "PricingQuoteItem" && previousRecord?.source === "triggered_auto_inclusion") {
        const manualFields = ["description", "category", "quantity", "unit", "buy_price", "markup_percent", "gst_treatment", "review_state", "status"];
        if (manualFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
          body.is_manual_override = true;
          if (!Object.prototype.hasOwnProperty.call(body, "review_status")) {
            body.review_status = "manually_edited";
          }
        }
      }
      if (entity === "QuoteItem" && previousRecord?.source === "triggered_auto_inclusion") {
        const manualFields = ["description", "category", "quantity", "unit_cost", "markup_percent", "total", "gst_treatment", "is_optional"];
        if (manualFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
          body.is_manual_override = true;
          if (!Object.prototype.hasOwnProperty.call(body, "review_status")) {
            body.review_status = "manually_edited";
          }
        }
      }
      if (entity === "TimeEntry") {
        assertTimeEntryMutationAuthorized(actor, body, previousRecord);
      }
      const requestSource = readRequestSource(req);
      const previousTimeEntryStatus: string =
        entity === "TimeEntry" && previousRecord ? normalizeTimeEntryStatus(previousRecord.status) : "";
      const requestedTimeEntryStatus: string = entity === "TimeEntry"
        ? normalizeTimeEntryStatus(body.status ?? previousRecord?.status)
        : "";
      const resumedTimer = entity === "TimeEntry" && requestedTimeEntryStatus === "active" && previousTimeEntryStatus === "paused"
        ? resumeTimer(id, body, {
            actor,
            requestSource,
            expectedRowVersion: typeof body.row_version === "number" ? body.row_version : null,
          })
        : null;
      const record: EntityRecord | null =
        entity === "LeadCategory"
          ? updateLeadCategoryRecord(id, body, {
              actor,
              requestSource,
              expectedRowVersion: typeof body.row_version === "number" ? body.row_version : null,
            })
          : entity === "TimeEntry" && requestedTimeEntryStatus === "paused" && previousTimeEntryStatus === "active"
            ? pauseTimer(id, body, {
                actor,
                requestSource,
                expectedRowVersion: typeof body.row_version === "number" ? body.row_version : null,
              })
          : entity === "TimeEntry" && requestedTimeEntryStatus === "active" && previousTimeEntryStatus === "paused"
            ? (resumedTimer?.entry || null)
          : entity === "TimeEntry" && requestedTimeEntryStatus === "completed" && previousTimeEntryStatus !== "completed"
            ? completeTimer(id, body, {
                actor,
                requestSource,
                expectedRowVersion: typeof body.row_version === "number" ? body.row_version : null,
              })
          : updateEntityRecord(entity, id, entity === "Lead"
              ? applyLeadCategoryDefaultsToLeadPayload(body)
              : entity === "Job"
                ? enrichJobWithWorkflowDefaults(body)
                : entity === "ScheduleLane"
                  ? applyScheduleLaneLifecycleFields(body, previousRecord)
                : entity === "JobOperation"
                  ? applyJobOperationLifecycleFields(body, previousRecord)
                  : entity === "TimeEntry"
                    ? normalizeSegmentedTimeEntryPayload(body, previousRecord)
                    : entity === "ClockIn"
                      ? normalizeClockInPayload(body, previousRecord)
                  : body, {
              actor,
              request_source: requestSource,
              expected_row_version: typeof body.row_version === "number" ? body.row_version : null,
            }) as EntityRecord | null;

      if (!record) {
        res.status(404).json({ error: "Record not found" });
        return;
      }

      reconcileEntityUploadDirectory(entity, previousRecord, record);

      if (entity === "Job") {
        ensureJobWorkflowTasks(record, {
          actor,
          requestSource,
        });
      }

      if (entity === "Quote") {
        ensureQuoteWorkflowTasks(record, {
          actor,
          requestSource,
        });
        reconcileQuoteWorkflowStatuses(record.id, {
          actor,
          requestSource,
        });
      }

      if (entity === "QuoteItem" && previousRecord?.source === "global_auto_inclusion") {
        createEntityRecord("GlobalAutoInclusionAudit", {
          quote_id: record.quote_id || previousRecord.quote_id || "",
          rule_id: record.source_rule_id || previousRecord.source_rule_id || "",
          quote_item_id: record.id,
          action_type: record.is_optional ? "excluded_or_optional" : "edited_quote_item",
          original_default_values: (previousRecord.parsed_normalized_value as Record<string, unknown> | undefined)?.original_default_values || {},
          edited_quote_values: {
            description: record.description || "",
            category: record.category || "",
            quantity: record.quantity || 0,
            unit: record.unit || "",
            unit_cost: record.unit_cost || 0,
            markup_percent: record.markup_percent || 0,
            total: record.total || 0,
            review_status: record.review_status || "",
          },
          user_id: actor?.id || "",
          user_name: actor?.full_name || actor?.email || "",
        }, {
          actor,
          request_source: requestSource,
        });
      }

      if (entity === "QuoteItem" && previousRecord?.source === "triggered_auto_inclusion") {
        createEntityRecord("TriggeredAutoInclusionAudit", buildTriggeredAutoInclusionAuditPayload(
          record.review_status === "confirmed" ? "confirmed" : record.is_optional ? "excluded_or_optional" : "edited_quote_item",
          {
            quoteId: String(record.quote_id || previousRecord.quote_id || ""),
            importId: String(record.import_id || previousRecord.import_id || ""),
            parentPricingQuoteItemId: String(record.parent_pricing_quote_item_id || previousRecord.parent_pricing_quote_item_id || ""),
            parentQuoteItemId: String(record.parent_line_item_id || previousRecord.parent_line_item_id || ""),
            ruleId: String(record.source_rule_id || previousRecord.source_rule_id || ""),
            inclusionQuoteItemId: String(record.id || ""),
            calculatedQuantity: Number(record.quantity || 0),
            quantityMultiplier: Number(record.parsed_normalized_value && typeof record.parsed_normalized_value === "object"
              ? (record.parsed_normalized_value as Record<string, unknown>).quantity_multiplier || 0
              : 0),
            originalRuleValues: (previousRecord.parsed_normalized_value as Record<string, unknown> | undefined)?.original_rule_values as Record<string, unknown> || {},
            editedQuoteValues: {
              description: record.description || "",
              category: record.category || "",
              quantity: record.quantity || 0,
              unit_cost: record.unit_cost || 0,
              markup_percent: record.markup_percent || 0,
              total: record.total || 0,
              review_status: record.review_status || "",
            },
            actor,
          }
        ), {
          actor,
          request_source: requestSource,
        });
      }

      if (entity === "JobOperation" && record.job_id) {
        reconcileJobWorkflowStatuses(String(record.job_id), {
          actor,
          requestSource,
        });
      }
      if (entity === "JobOperation" && record.quote_id) {
        reconcileQuoteWorkflowStatuses(String(record.quote_id), {
          actor,
          requestSource,
        });
      }

      if (entity === "TimeEntry") {
        if (resumedTimer?.auto_paused_entry) {
          syncSegmentedTimeEntrySideEffects(resumedTimer.auto_paused_entry, resumedTimer.auto_paused_entry, actor, requestSource);
        }
        syncSegmentedTimeEntrySideEffects(previousRecord, record, actor, requestSource);
      }

      logAppEvent("entity_updated", {
        entity,
        record_id: record.id,
        actor_email: actor?.email || "",
        request_source: requestSource,
        row_version: record.row_version,
      });
      queueEmbeddingRefresh(entity, record.id);
      res.json(record);
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.delete("/api/entities/:entity/:id", (req: Request, res: Response) => {
    const entity = readRouteParam(req.params.entity);
    if (!isKnownEntityName(entity)) {
      res.status(404).json({ error: "Unknown entity type." });
      return;
    }

    let actor: LocalUser | null = null;
    try {
      if (!enforceRateLimit(req, res, undefined, mutationRateLimiter)) {
        return;
      }
      authorizeEntityRequest(req, entity, "write");
      actor = resolveMutationActor(req);
    } catch (error) {
      handleRouteError(error, res);
      return;
    }

    if (entity === "AppUser") {
      res.status(403).json({ error: "AppUser records are managed through the access API." });
      return;
    }

    try {
      const id = readRouteParam(req.params.id);
      const expectedRowVersion = parseRowVersion(req.query.row_version, { required: true });
      const previousRecord = getEntityRecord(entity, id);
      if (entity === "TimeEntry") {
        throw new RouteRequestError(409, "time_entry_delete_blocked", "Time entries are never permanently deleted. Void or exclude the entry instead.");
      }
      if (entity === "ReportView" && previousRecord) {
        ensureReportViewAccess(req, previousRecord);
      }
      const deleted = entity === "LeadCategory"
        ? deleteLeadCategoryRecord(id, {
            actor,
            requestSource: readRequestSource(req),
            expectedRowVersion,
          })
        : deleteEntityRecord(entity, id, {
            actor,
            request_source: readRequestSource(req),
            expected_row_version: expectedRowVersion,
          });

      if (!deleted) {
        res.status(404).json({ error: "Record not found" });
        return;
      }

      if (entity === "JobOperation" && previousRecord?.job_id) {
        reconcileJobWorkflowStatuses(String(previousRecord.job_id), {
          actor,
          requestSource: readRequestSource(req),
        });
      }
      if (entity === "JobOperation" && previousRecord?.quote_id) {
        reconcileQuoteWorkflowStatuses(String(previousRecord.quote_id), {
          actor,
          requestSource: readRequestSource(req),
        });
      }

      if (entity === "TimeEntry") {
        syncSegmentedTimeEntrySideEffects(previousRecord, null, actor, readRequestSource(req));
      }

      if (entity === "QuoteItem" && previousRecord?.source === "global_auto_inclusion") {
        createEntityRecord("GlobalAutoInclusionAudit", {
          quote_id: previousRecord.quote_id || "",
          rule_id: previousRecord.source_rule_id || "",
          quote_item_id: previousRecord.id || "",
          action_type: "deleted_or_removed",
          original_default_values: (previousRecord.parsed_normalized_value as Record<string, unknown> | undefined)?.original_default_values || {},
          edited_quote_values: previousRecord,
          user_id: actor?.id || "",
          user_name: actor?.full_name || actor?.email || "",
        }, {
          actor,
          request_source: readRequestSource(req),
        });
      }

      if (entity === "QuoteItem" && previousRecord?.source === "triggered_auto_inclusion") {
        createEntityRecord("TriggeredAutoInclusionAudit", buildTriggeredAutoInclusionAuditPayload("deleted_or_removed", {
          quoteId: String(previousRecord.quote_id || ""),
          importId: String(previousRecord.import_id || ""),
          parentPricingQuoteItemId: String(previousRecord.parent_pricing_quote_item_id || ""),
          parentQuoteItemId: String(previousRecord.parent_line_item_id || ""),
          ruleId: String(previousRecord.source_rule_id || ""),
          inclusionQuoteItemId: String(previousRecord.id || ""),
          calculatedQuantity: Number(previousRecord.quantity || 0),
          quantityMultiplier: Number(previousRecord.parsed_normalized_value && typeof previousRecord.parsed_normalized_value === "object"
            ? (previousRecord.parsed_normalized_value as Record<string, unknown>).quantity_multiplier || 0
            : 0),
          originalRuleValues: (previousRecord.parsed_normalized_value as Record<string, unknown> | undefined)?.original_rule_values as Record<string, unknown> || {},
          editedQuoteValues: previousRecord,
          actor,
        }), {
          actor,
          request_source: readRequestSource(req),
        });
      }

      logAppEvent("entity_deleted", {
        entity,
        record_id: id,
        actor_email: actor?.email || "",
        request_source: readRequestSource(req),
      });
      deleteEmbeddingForRecord(entity, id);
      res.status(204).send();
    } catch (error) {
      handleRouteError(error, res);
    }
  });

  app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    logAppEvent("unhandled_middleware_error", {
      message: error.message,
      stack: error.stack || "",
      request_id: String(res.getHeader(REQUEST_ID_HEADER) || ""),
    }, "api", "error");
    res.status(500).json({
      error: "An unexpected server error occurred.",
      code: "internal_error",
      request_id: String(res.getHeader(REQUEST_ID_HEADER) || ""),
    });
  });
  return app;
}

function validateEarlyProductionConfiguration() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv !== "production") {
    return;
  }

  if (isTestModeEnabled()) {
    throw new Error("ENABLE_TEST_AUTH must be disabled in production.");
  }

  const publicOrigin = readConfiguredPublicOrigin();
  if (!publicOrigin.rawValue) {
    throw new Error("PUBLIC_API_ORIGIN must be configured in production.");
  }

  if (!publicOrigin.url) {
    throw new Error("PUBLIC_API_ORIGIN must be a valid absolute URL in production.");
  }

  if (publicOrigin.url.protocol !== "https:") {
    throw new Error("PUBLIC_API_ORIGIN must use https:// in production.");
  }

  if (!isOriginOnlyUrl(publicOrigin.url)) {
    throw new Error("PUBLIC_API_ORIGIN must be an origin only with no path, query, or hash in production.");
  }

  const googleClientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID must be configured in production.");
  }

  if (!/\.apps\.googleusercontent\.com$/i.test(googleClientId)) {
    throw new Error("GOOGLE_CLIENT_ID must be a Google web client ID ending in .apps.googleusercontent.com.");
  }

  if (!String(process.env.AUTH_SESSION_SECRET || "").trim()) {
    throw new Error("AUTH_SESSION_SECRET must be configured in production.");
  }

  const databaseDriver = readDatabaseDriver();
  if (databaseDriver === "sqlite") {
    const sqlitePath = readConfiguredStoragePathInfo("SQLITE_PATH", DEFAULT_SQLITE_PATH);
    if (!sqlitePath.explicitlyConfigured) {
      throw new Error("SQLITE_PATH must be configured explicitly in production.");
    }
  } else {
    if (!String(process.env.DATABASE_URL || "").trim() && !String(process.env.PGHOST || "").trim()) {
      throw new Error("DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD must be configured in production when DATABASE_DRIVER=postgres.");
    }
  }

  const filesystemRoot = readConfiguredStoragePathInfo("FILESYSTEM_ROOT", DEFAULT_FILESYSTEM_DIRECTORY);
  if (!filesystemRoot.explicitlyConfigured) {
    throw new Error("FILESYSTEM_ROOT must be configured explicitly in production.");
  }
}

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT || 4000);
  const HOST = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
  const server = http.createServer(app);
  server.headersTimeout = 65_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  server.listen(PORT, HOST, () => {
    console.log(`Offline API running on http://${HOST}:${PORT}`);
  });

  const shutdown = (signal: string) => {
    logAppEvent("server_shutdown_requested", { signal }, "app", "warn");
    stopEmbeddingQueue();
    stopKnowledgeIndexingScheduler();
    stopVectorSyncQueue();
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });

    setTimeout(() => {
      logAppEvent("server_shutdown_forced", { signal }, "app", "error");
      process.exit(1);
    }, 10_000).unref();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

function buildAdminHealthSummary() {
  const entityCounts = listEntityCounts();
  const filesystemSummary = summarizeFilesystemRoot();
  const recentAudit = listAuditLogRecords({ limit: 10 });
  const backups = listBackupSnapshots();

  return {
    status: activeMaintenanceOperation ? "maintenance" : "ok",
    mode: "offline-local",
    server_version: readServerVersion(),
    uptime_seconds: Math.round(process.uptime()),
    maintenance: activeMaintenanceOperation,
    database: getDatabaseDiagnostics(),
    entities: entityCounts,
    audit: {
      total_entries: countAuditLogRecords(),
      recent: recentAudit,
    },
    filesystem: filesystemSummary,
    backups: {
      root: path.resolve(process.env.BACKUP_ROOT || path.resolve(__dirname, "..", "backups")),
      total_snapshots: backups.length,
      recent: backups.slice(0, 8),
    },
    diagnostics: {
      app_log: getLogFileDescriptor("app"),
      security_log: getLogFileDescriptor("security"),
    },
    ai_knowledge: {
      paused: isKnowledgeQueuePaused(),
      stats: getKnowledgeStats(),
      queue: listKnowledgeQueueSummary(),
    },
    ai_diagnostics: buildAiDiagnostics(),
    logs: {
      app: readStructuredLogTail(getAppLogPath(), 20),
      security: readStructuredLogTail(getSecurityLogPath(), 20),
    },
  };
}

function buildPublicHealthSummary() {
  return {
    status: activeMaintenanceOperation ? "maintenance" : "ok",
    mode: "offline-local",
    server_version: readServerVersion(),
    uptime_seconds: Math.round(process.uptime()),
    maintenance: activeMaintenanceOperation,
  };
}

async function resetTestState() {
  if (!isTestModeEnabled()) {
    throw new AuthError(403, "test_mode_disabled", "Test-only endpoints are disabled.");
  }

  stopKnowledgeIndexingScheduler();
  stopEmbeddingQueue();
  stopVectorSyncQueue();
  closeDatabase();

  if (fs.existsSync(getFilesystemDirectory())) {
    fs.rmSync(getFilesystemDirectory(), { recursive: true, force: true });
  }
  ensureFilesystemLayout();

  await resetDatabaseForTests();
  repairTimeTrackingData({
    actor: buildSystemActor("Time Tracking Repair"),
    requestSource: "time-tracking-test-reset",
    skipAudit: true,
  });
  ensureTimeTrackingConstraints();
  ensureJobWorkflowDefaults({
    actor: buildSystemActor("Workflow Setup"),
    requestSource: "workflow-test-reset",
    skipAudit: true,
  });
  startKnowledgeIndexingScheduler();
}

function summarizeFilesystemRoot() {
  const roots = ["jobs", "quotes", "contacts"].map((name) => path.join(getFilesystemDirectory(), name));
  let totalFiles = 0;
  let totalBytes = 0;
  let totalDirectories = 0;

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        totalDirectories += 1;
      }
    }

    for (const absolutePath of listFilesRecursively(root)) {
      totalFiles += 1;
      totalBytes += fs.statSync(absolutePath).size;
    }
  }

  return {
    root: getFilesystemDirectory(),
    expected_directories: FILESYSTEM_SUBDIRECTORIES,
    directory_count: totalDirectories,
    file_count: totalFiles,
    total_bytes: totalBytes,
  };
}

function ensureFilesystemLayout() {
  fs.mkdirSync(getFilesystemDirectory(), { recursive: true });
  FILESYSTEM_SUBDIRECTORIES.forEach((name) => {
    fs.mkdirSync(path.join(getFilesystemDirectory(), name), { recursive: true });
  });
}

function readServerVersion() {
  try {
    const payload = JSON.parse(fs.readFileSync(SERVER_PACKAGE_PATH, "utf8")) as { version?: string };
    return String(payload.version || "unknown");
  } catch {
    return "unknown";
  }
}

function readStructuredLogTail(filePath: string, limit = 20) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const lines = fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit);

  return lines.map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return {
        timestamp: new Date().toISOString(),
        level: "warn",
        event: "unparseable_log_line",
        raw: line,
      };
    }
  });
}

function buildCsvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildAuditCsv(entries: Array<{
  created_date?: unknown;
  entity?: unknown;
  action?: unknown;
  record_id?: unknown;
  actor_name?: unknown;
  actor_email?: unknown;
  actor_role?: unknown;
  request_source?: unknown;
  summary?: { changed_fields?: unknown[] } | null;
}>) {
  const header = [
    "created_date",
    "entity",
    "action",
    "record_id",
    "actor_name",
    "actor_email",
    "actor_role",
    "request_source",
    "changed_fields",
  ];
  const rows = entries.map((entry) => {
    const summary = entry.summary && typeof entry.summary === "object" ? entry.summary : {};
    const changedFields = Array.isArray(summary.changed_fields) ? summary.changed_fields.join(", ") : "";
    return [
      entry.created_date,
      entry.entity,
      entry.action,
      entry.record_id,
      entry.actor_name,
      entry.actor_email,
      entry.actor_role,
      entry.request_source,
      changedFields,
    ].map(buildCsvValue).join(",");
  });

  return `${header.map(buildCsvValue).join(",")}\n${rows.join("\n")}\n`;
}

function sendTextDownload(res: Response, fileName: string, content: string, contentType = "text/plain; charset=utf-8") {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=\"${fileName.replace(/"/g, "")}\"`);
  res.send(content);
}

function sendJsonDownload(res: Response, fileName: string, payload: unknown) {
  sendTextDownload(res, fileName, `${JSON.stringify(payload, null, 2)}\n`, "application/json; charset=utf-8");
}

function appendStructuredLog(filePath: string, payload: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

function logAppEvent(eventType: string, detail: Record<string, unknown>, category = "app", level = "info") {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    category,
    event: eventType,
    ...detail,
  };

  appendStructuredLog(getAppLogPath(), payload);
  console.info(`[${category}] ${eventType}`, detail);
}

function stripDataUrlPrefix(value: string) {
  const markerIndex = value.indexOf("base64,");
  return markerIndex >= 0 ? value.slice(markerIndex + "base64,".length) : value;
}

function decodeBase64Upload(value: string) {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 0 || decoded.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
      throw new Error("invalid");
    }
    return decoded;
  } catch {
    throw new AuthError(400, "invalid_upload_payload", "Uploaded file data is not valid base64.");
  }
}

function normalizeAttachmentName(value: string) {
  const basename = path.basename(String(value || "").trim().replace(/[\r\n\t]+/g, " "));
  const collapsed = basename.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    throw new AuthError(400, "invalid_upload_name", "A valid filename is required.");
  }

  return collapsed.slice(0, 180);
}

function getUploadRuleForName(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (DANGEROUS_UPLOAD_EXTENSIONS.has(extension)) {
    throw new AuthError(415, "blocked_upload_type", "That file type is not allowed.");
  }

  return UPLOAD_RULES.find((rule) => rule.extensions.includes(extension)) || null;
}

function validateUploadPayload(filename: string, mimeType: string, fileBuffer: Buffer) {
  const extension = path.extname(filename).toLowerCase();
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  const rule = getUploadRuleForName(filename);

  if (!rule) {
    throw new AuthError(415, "unsupported_upload_type", `Files with the ${extension || "selected"} extension are not supported.`);
  }

  if (
    normalizedMimeType
    && normalizedMimeType !== "application/octet-stream"
    && !rule.mimeTypes.includes(normalizedMimeType)
  ) {
    throw new AuthError(415, "upload_mime_mismatch", "The uploaded file type did not match the selected file.");
  }

  if (rule.signature && !rule.signature(fileBuffer)) {
    throw new AuthError(415, "upload_content_mismatch", "The uploaded file content did not match its file type.");
  }
}

function sanitiseFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "upload";
}

function sanitisePathSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.length > 0 ? cleaned : "item";
}

function buildPublicFilesystemUrl(req: Request, relativePath: string) {
  return `${req.protocol}://${req.get("host")}/filesystem/${relativePath}`;
}

function buildStaticFilesystemUrl(relativePath: string) {
  const host = String(process.env.PUBLIC_API_ORIGIN || process.env.CORS_ORIGIN || "").split(",")[0].trim();
  if (host) {
    return `${host.replace(/\/$/, "")}/filesystem/${relativePath}`;
  }

  const port = Number(process.env.PORT || 4000);
  const configuredHost = String(process.env.HOST || "").trim();
  const localHost = configuredHost && configuredHost !== "0.0.0.0" ? configuredHost : "localhost";
  return `http://${localHost}:${port}/filesystem/${relativePath}`;
}

function readConfiguredPublicOrigin() {
  const rawValue = String(process.env.PUBLIC_API_ORIGIN || "").trim();
  if (!rawValue) {
    return {
      rawValue,
      origin: "",
      url: null as URL | null,
    };
  }

  try {
    const url = new URL(rawValue);
    return {
      rawValue,
      origin: url.origin,
      url,
    };
  } catch {
    return {
      rawValue,
      origin: "",
      url: null as URL | null,
    };
  }
}

function isOriginOnlyUrl(url: URL) {
  return url.pathname === "/" && !url.search && !url.hash;
}

function readConfiguredStoragePathInfo(envKey: "SQLITE_PATH" | "FILESYSTEM_ROOT", defaultPath: string) {
  const rawValue = String(process.env[envKey] || "").trim();
  return {
    rawValue,
    resolvedPath: path.resolve(rawValue || defaultPath),
    explicitlyConfigured: Boolean(rawValue),
  };
}

function emitProductionPathWarning(label: string, configuredPath: string, defaultPath: string) {
  if (configuredPath !== defaultPath) {
    return;
  }

  console.warn(
    `[startup] ${label} is using the repository default path (${configuredPath}). ` +
    "Set an explicit production path so the live install does not accidentally reuse local runtime data."
  );
}

function buildAuthConfigResponse(req: Request) {
  const authConfig = getAuthConfig();
  const publicOrigin = readConfiguredPublicOrigin();
  const requestOrigin = readRequestOrigin(req);
  const warnings: string[] = [];

  if (publicOrigin.origin && requestOrigin !== publicOrigin.origin) {
    warnings.push(
      `This CRM is responding from ${requestOrigin}, but PUBLIC_API_ORIGIN is ${publicOrigin.origin}. ` +
      `Google Sign-In with the current GOOGLE_CLIENT_ID must be served from ${publicOrigin.origin} and that exact origin must be registered in Google Cloud Console.`
    );
  }

  return {
    ...authConfig,
    publicApiOrigin: publicOrigin.origin || publicOrigin.rawValue,
    requestOrigin,
    originMatchesPublicOrigin: publicOrigin.origin ? requestOrigin === publicOrigin.origin : true,
    googleAuthorizedJavaScriptOrigins: publicOrigin.origin ? [publicOrigin.origin] : [],
    warnings,
  };
}

function hasZipSignature(buffer: Buffer) {
  return ZIP_SIGNATURES.some((signature) => buffer.subarray(0, signature.length).equals(signature));
}

function hasIsoBaseMediaType(buffer: Buffer, brands: string[]) {
  if (buffer.length < 12) {
    return false;
  }

  const boxType = buffer.subarray(4, 8).toString("ascii");
  const brand = buffer.subarray(8, 12).toString("ascii");
  return boxType === "ftyp" && brands.includes(brand);
}

function isProbablyTextFile(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspiciousBytes = 0;

  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) {
      continue;
    }

    if (byte < 32) {
      suspiciousBytes += 1;
    }
  }

  return suspiciousBytes <= Math.max(2, Math.floor(sample.length * 0.01));
}

function buildAttachmentContentDisposition(absolutePath: string) {
  const mimeType = guessMimeType(absolutePath);
  const isInline = UPLOAD_RULES.some((rule) => rule.inline && rule.mimeTypes.includes(mimeType));
  const disposition = isInline ? "inline" : "attachment";
  const fileName = encodeURIComponent(path.basename(absolutePath)).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `${disposition}; filename*=UTF-8''${fileName}`;
}

function buildNamedContentDisposition(fileNameValue: string, disposition: "inline" | "attachment") {
  const safeFileName = encodeURIComponent(path.basename(fileNameValue)).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `${disposition}; filename*=UTF-8''${safeFileName}`;
}

function isTestModeEnabled() {
  return String(process.env.ENABLE_TEST_AUTH || "").trim().toLowerCase() === "true";
}

function createFileId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildSystemActor(label: string): LocalUser {
  const normalizedLabel = label.trim() || "System";
  return {
    id: `system-${sanitisePathSegment(normalizedLabel).toLowerCase()}`,
    full_name: normalizedLabel,
    role: "system",
    email: `${sanitisePathSegment(normalizedLabel).toLowerCase()}@local.system`,
  };
}

function calculateChecksum(content: Buffer) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function calculateChecksumForFile(absolutePath: string) {
  return calculateChecksum(fs.readFileSync(absolutePath));
}

function buildArchivedVersionRelativePath(attachment: Record<string, unknown>, versionNumber: number, filename: string) {
  const archiveDirectory = path.join(
    ".versions",
    `${String(attachment.related_type || "job")}s`,
    resolveAttachmentDirectoryName(String(attachment.related_type || "job"), String(attachment.related_id || "")),
    String(attachment.id || "attachment")
  );
  const archiveFilename = `v${String(versionNumber).padStart(4, "0")}-${filename}`;
  return path.join(archiveDirectory, archiveFilename).split(path.sep).join("/");
}

function buildCurrentAttachmentVersionPayload(
  req: Request,
  attachment: Record<string, unknown>,
  actor: LocalUser | null,
  createdDate?: string
) {
  return {
    attachment_id: String(attachment.id || ""),
    version_number: Math.max(1, Number(attachment.current_version || attachment.version_count || 1)),
    related_id: String(attachment.related_id || ""),
    related_type: String(attachment.related_type || "job"),
    name: String(attachment.name || attachment.stored_name || "file"),
    stored_name: String(attachment.stored_name || ""),
    mime_type: String(attachment.mime_type || "application/octet-stream"),
    size: Number(attachment.size || 0),
    relative_path: String(attachment.relative_path || ""),
    url: String(attachment.url || buildPublicFilesystemUrl(req, String(attachment.relative_path || ""))),
    checksum: String(attachment.checksum || ""),
    source: String(attachment.source || "filesystem"),
    actor_id: actor?.id || "",
    actor_email: actor?.email || "",
    actor_name: actor?.full_name || "",
    created_date: createdDate || String(attachment.updated_date || attachment.created_date || new Date().toISOString()),
  };
}

function ensureAttachmentVersionSnapshot(req: Request, attachment: Record<string, unknown>, actor: LocalUser | null, requestSource: string) {
  const existingVersions = listAttachmentVersions(String(attachment.id || ""));
  if (existingVersions.length > 0) {
    return existingVersions;
  }

  const snapshot = createAttachmentVersionRecord(buildCurrentAttachmentVersionPayload(req, attachment, actor));
  void requestSource;
  return [snapshot];
}

function archiveAttachmentCurrentVersion(req: Request, attachment: Record<string, unknown>) {
  const currentRelativePath = String(attachment.relative_path || "");
  if (!currentRelativePath) {
    return null;
  }

  const currentAbsolutePath = path.join(getFilesystemDirectory(), currentRelativePath);
  if (!fs.existsSync(currentAbsolutePath)) {
    return null;
  }

  const archivedRelativePath = buildArchivedVersionRelativePath(
    attachment,
    Math.max(1, Number(attachment.current_version || 1)),
    path.basename(currentAbsolutePath)
  );
  const archivedAbsolutePath = path.join(getFilesystemDirectory(), archivedRelativePath);
  fs.mkdirSync(path.dirname(archivedAbsolutePath), { recursive: true });

  const resolvedArchivedAbsolutePath = fs.existsSync(archivedAbsolutePath)
    ? path.join(path.dirname(archivedAbsolutePath), `${createFileId()}-${path.basename(archivedAbsolutePath)}`)
    : archivedAbsolutePath;

  fs.renameSync(currentAbsolutePath, resolvedArchivedAbsolutePath);

  return {
    relativePath: path.relative(getFilesystemDirectory(), resolvedArchivedAbsolutePath).split(path.sep).join("/"),
    url: buildPublicFilesystemUrl(req, path.relative(getFilesystemDirectory(), resolvedArchivedAbsolutePath).split(path.sep).join("/")),
  };
}

function findAttachmentByLogicalName(relatedType: string, relatedId: string, originalName: string) {
  return listEntityRecords("Attachment", {
    filters: {
      related_type: relatedType,
      related_id: relatedId,
    },
    sort: "-updated_date",
  }).find((record) => String(record.name || "").trim().toLowerCase() === originalName.trim().toLowerCase()) || null;
}

function recalculateQuoteTotals(quoteId: string, context: { actor: LocalUser | null; requestSource?: string }) {
  const quoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
  const subtotal = roundMoney(quoteItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + Number(item.total || 0), 0));
  const gst = roundMoney(subtotal * 0.15);
  return updateEntityRecord("Quote", quoteId, { subtotal, gst, total: roundMoney(subtotal + gst) }, {
    actor: context.actor,
    request_source: context.requestSource,
  });
}

function isQuoteItemActiveForMarginAdjustment(item: EntityRecord) {
  const reviewState = String(item.review_state || "").trim().toLowerCase();
  return item.is_optional !== true && reviewState !== "excluded" && reviewState !== "deleted";
}

function isQuoteItemMaterialMarginEligible(item: EntityRecord) {
  const normalized = String(item.category || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const excluded = new Set([
    "labour",
    "install",
    "delivery",
    "freight_delivery",
    "packaging_freight",
    "subcontract",
    "subcontracted_items",
    "admin",
    "admin_prep",
    "design",
    "service",
  ]);
  if (excluded.has(normalized)) {
    return false;
  }
  return !["labour", "install", "freight", "delivery", "admin", "design"].some((token) => normalized.includes(token));
}

function isQuoteItemLabourMarginExcluded(item: EntityRecord) {
  const normalized = String(item.category || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "labour" || normalized.includes("labour");
}

function summarizeQuoteMarginRows(rows: EntityRecord[]) {
  const sell = roundMoney(rows.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const cost = roundMoney(rows.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0));
  return {
    sell,
    cost,
    profit: roundMoney(sell - cost),
    marginPercent: sell > 0 ? ((sell - cost) / sell) * 100 : 0,
  };
}

function buildQuoteMarginAdjustmentPlan(
  items: EntityRecord[],
  options: {
    actionType: "gross_margin_adjustment" | "material_margin_adjustment";
    targetMarginPercent: number;
    includeLocked: boolean;
  }
) {
  const activeItems = items.filter(isQuoteItemActiveForMarginAdjustment);
  const scopeItems = options.actionType === "material_margin_adjustment"
    ? activeItems.filter(isQuoteItemMaterialMarginEligible)
    : activeItems.filter((item) => !isQuoteItemLabourMarginExcluded(item));
  const lockedItems = scopeItems.filter((item) => item.is_price_locked === true);
  const eligibleItems = options.includeLocked ? scopeItems : scopeItems.filter((item) => item.is_price_locked !== true);
  if (eligibleItems.length === 0) {
    throw new RouteRequestError(400, "quote_margin_no_eligible_items", "No eligible quote line items were available for this margin adjustment.");
  }

  const targetMarginFraction = Number(options.targetMarginPercent || 0) / 100;
  if (targetMarginFraction >= 1) {
    throw new RouteRequestError(400, "quote_margin_invalid_target", "Target margin must be below 100%.");
  }

  const costTotal = roundMoney(eligibleItems.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0));
  const currentSellTotal = roundMoney(eligibleItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  if (costTotal <= 0 && currentSellTotal <= 0) {
    throw new RouteRequestError(400, "quote_margin_missing_costs", "Eligible quote line items need cost or sell values before margin can be adjusted.");
  }

  const targetSellTotal = roundMoney(costTotal / Math.max(0.0001, 1 - targetMarginFraction));
  const baseTotal = currentSellTotal > 0 ? currentSellTotal : costTotal;
  const adjustmentFactor = baseTotal > 0 ? targetSellTotal / baseTotal : 1;
  const updates = eligibleItems.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unit_cost || 0);
    const cost = roundMoney(unitCost * quantity);
    const sourceTotal = currentSellTotal > 0 ? roundMoney(Number(item.total || 0)) : cost;
    const nextTotal = roundMoney(sourceTotal * adjustmentFactor);
    return {
      item,
      quantity,
      unitCost,
      cost,
      sourceTotal,
      nextTotal,
    };
  });

  if (updates.length > 0) {
    const sumWithoutLast = roundMoney(updates.slice(0, -1).reduce((sum, entry) => sum + entry.nextTotal, 0));
    updates[updates.length - 1].nextTotal = roundMoney(targetSellTotal - sumWithoutLast);
  }

  const changedEntries = updates.map((entry) => {
    const quantity = entry.quantity;
    const nextTotal = Math.max(0, roundMoney(entry.nextTotal));
    const nextSellPrice = quantity > 0 ? roundMoney(nextTotal / quantity) : roundMoney(Number(entry.item.sell_price || 0));
    const nextMarkupPercent = entry.cost > 0
      ? roundMoney(((nextTotal - entry.cost) / entry.cost) * 100)
      : roundMoney(Number(entry.item.markup_percent || 0));
    return {
      ...entry,
      patch: {
        total: nextTotal,
        sell_price: nextSellPrice,
        markup_percent: nextMarkupPercent,
        is_manual_override: true,
      },
    };
  });

  return {
    activeItems,
    scopeItems,
    eligibleItems,
    lockedItems,
    excludedItems: items.filter((item) => !isQuoteItemActiveForMarginAdjustment(item)),
    currentSummary: summarizeQuoteMarginRows(scopeItems),
    currentEligibleSellTotal: currentSellTotal,
    targetSellTotal,
    changedEntries,
  };
}

function applyQuoteMarginAdjustment(
  quoteId: string,
  options: {
    actor: LocalUser | null;
    requestSource?: string;
    actionType: "gross_margin_adjustment" | "material_margin_adjustment";
    targetMarginPercent: number;
    includeLocked: boolean;
  }
) {
  const quote = getEntityRecord("Quote", quoteId);
  if (!quote) {
    throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
  }

  const items = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
  const plan = buildQuoteMarginAdjustmentPlan(items, {
    actionType: options.actionType,
    targetMarginPercent: options.targetMarginPercent,
    includeLocked: options.includeLocked,
  });

  plan.changedEntries.forEach(({ item, patch }) => {
    const changedFields = Object.entries(patch).filter(([field, value]) => !valuesEqualForAudit(item[field], value));
    if (changedFields.length === 0) {
      return;
    }
    updateEntityRecord("QuoteItem", item.id, patch, {
      actor: options.actor,
      request_source: options.requestSource,
    });
    changedFields.forEach(([field, value]) => {
      createEntityRecord("QuoteLineItemUpdateAudit", {
        quote_id: quoteId,
        import_id: String(item.import_id || ""),
        line_item_id: item.id,
        pricing_quote_item_id: String(item.pricing_quote_item_id || ""),
        field,
        old_value: item[field] ?? null,
        new_value: value ?? null,
        user_id: options.actor?.id || "",
        user_name: options.actor?.full_name || options.actor?.email || "",
      }, {
        actor: options.actor,
        request_source: options.requestSource,
      });
    });
  });

  const updatedQuote = recalculateQuoteTotals(quoteId, {
    actor: options.actor,
    requestSource: options.requestSource,
  });
  const refreshedItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 })
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  const refreshedScopeItems = options.actionType === "material_margin_adjustment"
    ? refreshedItems.filter((item) => isQuoteItemActiveForMarginAdjustment(item) && isQuoteItemMaterialMarginEligible(item))
    : refreshedItems.filter(isQuoteItemActiveForMarginAdjustment);
  const nextSummary = summarizeQuoteMarginRows(refreshedScopeItems);

  const audit = createEntityRecord("QuoteMarginAdjustmentAudit", {
    quote_id: quoteId,
    action_type: options.actionType,
    previous_margin_percent: roundMoney(plan.currentSummary.marginPercent),
    target_margin_percent: roundMoney(options.targetMarginPercent),
    affected_line_item_ids: plan.changedEntries.map(({ item }) => item.id),
    locked_line_item_ids: plan.lockedItems.map((item) => item.id),
    excluded_line_item_ids: plan.excludedItems.map((item) => item.id),
    current_sell_total: plan.currentEligibleSellTotal,
    new_sell_total: roundMoney(plan.changedEntries.reduce((sum, entry) => sum + Number(entry.patch.total || 0), 0)),
    old_sell_totals: Object.fromEntries(plan.changedEntries.map(({ item }) => [item.id, roundMoney(Number(item.total || 0))])),
    new_sell_totals: Object.fromEntries(plan.changedEntries.map(({ item, patch }) => [item.id, roundMoney(Number(patch.total || 0))])),
    user_id: options.actor?.id || "",
    user_name: options.actor?.full_name || options.actor?.email || "",
    details: {
      include_locked: options.includeLocked,
      affected_count: plan.changedEntries.length,
      locked_count: plan.lockedItems.length,
      scope_count: plan.scopeItems.length,
      target_sell_total: plan.targetSellTotal,
      resulting_margin_percent: roundMoney(nextSummary.marginPercent),
    },
  }, {
    actor: options.actor,
    request_source: options.requestSource,
  });

  return {
    quote: updatedQuote,
    items: refreshedItems,
    audit,
    summary: {
      previous_margin_percent: roundMoney(plan.currentSummary.marginPercent),
      resulting_margin_percent: roundMoney(nextSummary.marginPercent),
      target_margin_percent: roundMoney(options.targetMarginPercent),
      affected_count: plan.changedEntries.length,
      locked_count: plan.lockedItems.length,
      current_sell_total: plan.currentEligibleSellTotal,
      new_sell_total: roundMoney(plan.changedEntries.reduce((sum, entry) => sum + Number(entry.patch.total || 0), 0)),
      delta: roundMoney(plan.changedEntries.reduce((sum, entry) => sum + Number(entry.patch.total || 0), 0) - plan.currentEligibleSellTotal),
    },
  };
}

function buildQuoteItemFromGlobalInclusion(rule: EntityRecord, quoteId: string, sortOrder: number, actor: LocalUser | null) {
  const quantity = Number(rule.quantity || 1);
  const unitCost = Number(rule.cost || 0);
  const markup = Number(rule.markup || rule.markup_percent || 30);
  const sellPrice = roundMoney(unitCost * (1 + markup / 100));
  const total = roundMoney(sellPrice * quantity);
  const reviewRequired = rule.review_required !== false;
  return {
    quote_id: quoteId,
    section: "Every Job Inclusions",
    category: rule.category || "misc_fixings",
    description: rule.description || "Global inclusion",
    quantity,
    unit: rule.unit || "ea",
    unit_cost: unitCost,
    markup_percent: markup,
    sell_price: sellPrice,
    total,
    gst_treatment: rule.gst_treatment || "ex_gst",
    is_optional: false,
    sort_order: sortOrder,
    source: "global_auto_inclusion",
    source_rule_id: rule.id,
    auto_added: true,
    review_status: reviewRequired ? "auto_added_needs_review" : "confirmed",
    confirmed_at: reviewRequired ? "" : new Date().toISOString(),
    confirmed_by: reviewRequired ? "" : actor?.full_name || actor?.email || "",
    notes: rule.notes || "",
    original_imported_value: {},
    parsed_normalized_value: {
      source_rule_id: rule.id,
      original_default_values: {
        description: rule.description || "",
        category: rule.category || "misc_fixings",
        quantity,
        unit: rule.unit || "ea",
        cost: unitCost,
        markup,
        gst_treatment: rule.gst_treatment || "ex_gst",
        notes: rule.notes || "",
      },
    },
    created_by_user_id: actor?.id || "",
    created_by_user_name: actor?.full_name || actor?.email || "",
  };
}

function applyGlobalAutoInclusionsToQuote(
  quoteId: string,
  options: { actor: LocalUser | null; requestSource?: string; ruleIds?: string[] } = { actor: null }
) {
  const quote = getEntityRecord("Quote", quoteId);
  if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");

  const selectedRuleIds = new Set((options.ruleIds || []).map((id) => String(id)));
  const existingItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
  const existingRuleIds = new Set(existingItems
    .filter((item) => item.source === "global_auto_inclusion" && item.source_rule_id)
    .map((item) => String(item.source_rule_id)));
  const removedRuleIds = new Set(listEntityRecords("GlobalAutoInclusionAudit", { filters: { quote_id: quoteId, action_type: "deleted_or_removed" }, limit: 10000 })
    .map((entry) => String(entry.rule_id || ""))
    .filter(Boolean));
  const activeRules = listEntityRecords("GlobalAutoInclusion", { filters: { active: true }, sort: "description", limit: 10000 })
    .filter((rule) => selectedRuleIds.size === 0 || selectedRuleIds.has(rule.id));

  const created = activeRules
    .filter((rule) => !existingRuleIds.has(rule.id) && !removedRuleIds.has(rule.id))
    .map((rule, index) => {
      const quoteItem = createEntityRecord("QuoteItem", buildQuoteItemFromGlobalInclusion(rule, quoteId, existingItems.length + index, options.actor), {
        actor: options.actor,
        request_source: options.requestSource,
      });
      createEntityRecord("GlobalAutoInclusionAudit", {
        quote_id: quoteId,
        rule_id: rule.id,
        quote_item_id: quoteItem.id,
        action_type: "added_to_quote",
        original_default_values: (quoteItem.parsed_normalized_value as Record<string, unknown> | undefined)?.original_default_values || {},
        edited_quote_values: {},
        user_id: options.actor?.id || "",
        user_name: options.actor?.full_name || options.actor?.email || "",
      }, {
        actor: options.actor,
        request_source: options.requestSource,
      });
      return quoteItem;
    });

  const updatedQuote = created.length > 0 ? recalculateQuoteTotals(quoteId, options) : quote;
  return {
    quote: updatedQuote || quote,
    added: created,
    skipped: activeRules.length - created.length,
  };
}

function confirmGlobalAutoInclusionItem(
  quoteId: string,
  itemId: string,
  options: {
    actor: LocalUser | null;
    requestSource?: string;
    section?: {
      section?: string;
      section_id?: string;
      section_key?: string;
      section_display_order?: number;
    };
  }
) {
  const quoteItem = getEntityRecord("QuoteItem", itemId);
  if (!quoteItem || String(quoteItem.quote_id || "") !== quoteId) {
    throw new RouteRequestError(404, "quote_item_not_found", "Quote line item was not found.");
  }
  if (quoteItem.source !== "global_auto_inclusion") {
    throw new RouteRequestError(400, "quote_item_not_global_auto_inclusion", "Only global auto-inclusion line items can be confirmed here.");
  }
  const confirmedAt = new Date().toISOString();
  const confirmedBy = options.actor?.full_name || options.actor?.email || "";
  const sectionPatch = options.section?.section
    ? {
        section: String(options.section.section || "").trim() || String(quoteItem.section || "General"),
        section_id: String(options.section.section_id || quoteItem.section_id || "").trim(),
        section_key: String(options.section.section_key || quoteItem.section_key || buildPricingSectionRecord(String(options.section.section || quoteItem.section || "General")).key).trim(),
        section_display_order: Number.isFinite(Number(options.section.section_display_order))
          ? Number(options.section.section_display_order)
          : Number(quoteItem.section_display_order || 999),
      }
    : {};
  const updatedItem = updateEntityRecord("QuoteItem", itemId, {
    ...sectionPatch,
    review_status: "confirmed",
    confirmed_at: confirmedAt,
    confirmed_by: confirmedBy,
  }, {
    actor: options.actor,
    request_source: options.requestSource,
  });
  createEntityRecord("GlobalAutoInclusionAudit", {
    quote_id: quoteId,
    rule_id: quoteItem.source_rule_id || "",
    quote_item_id: itemId,
    action_type: "confirmed",
    original_default_values: (quoteItem.parsed_normalized_value as Record<string, unknown> | undefined)?.original_default_values || {},
    edited_quote_values: {
      description: quoteItem.description || "",
      section: sectionPatch.section || quoteItem.section || "",
      category: quoteItem.category || "",
      quantity: quoteItem.quantity || 0,
      unit: quoteItem.unit || "",
      unit_cost: quoteItem.unit_cost || 0,
      markup_percent: quoteItem.markup_percent || 0,
      total: quoteItem.total || 0,
    },
    user_id: options.actor?.id || "",
    user_name: confirmedBy,
  }, {
    actor: options.actor,
    request_source: options.requestSource,
  });
  const quote = recalculateQuoteTotals(quoteId, options);
  return { quote_item: updatedItem, quote };
}

function confirmAllGlobalAutoInclusionItems(
  quoteId: string,
  options: {
    actor: LocalUser | null;
    requestSource?: string;
    section?: {
      section?: string;
      section_id?: string;
      section_key?: string;
      section_display_order?: number;
    };
  }
) {
  const items = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 })
    .filter((item) => item.source === "global_auto_inclusion" && item.review_status === "auto_added_needs_review");
  const confirmed = items.map((item) => confirmGlobalAutoInclusionItem(quoteId, item.id, options).quote_item).filter(Boolean);
  const quote = recalculateQuoteTotals(quoteId, options);
  return { confirmed, quote };
}

function buildTriggeredAutoInclusionAuditPayload(
  actionType: string,
  data: {
    quoteId?: string;
    importId?: string;
    parentPricingQuoteItemId?: string;
    parentQuoteItemId?: string;
    ruleId?: string;
    inclusionQuoteItemId?: string;
    calculatedQuantity?: number;
    quantityMultiplier?: number;
    originalRuleValues?: Record<string, unknown>;
    editedQuoteValues?: Record<string, unknown>;
    actor?: LocalUser | null;
  }
) {
  return {
    quote_id: data.quoteId || "",
    import_id: data.importId || "",
    parent_pricing_quote_item_id: data.parentPricingQuoteItemId || "",
    parent_quote_item_id: data.parentQuoteItemId || "",
    rule_id: data.ruleId || "",
    inclusion_quote_item_id: data.inclusionQuoteItemId || "",
    action_type: actionType,
    calculated_quantity: roundMoney(Number(data.calculatedQuantity || 0)),
    quantity_multiplier: Number(data.quantityMultiplier || 0),
    original_rule_values: data.originalRuleValues || {},
    edited_quote_values: data.editedQuoteValues || {},
    user_id: data.actor?.id || "",
    user_name: data.actor?.full_name || data.actor?.email || "",
  };
}

function splitRuleKeywords(value: unknown) {
  return String(value || "")
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getTriggeredRuleConditions(rule: EntityRecord) {
  return [
    { key: "trigger_category", value: String(rule.trigger_category || "").trim() },
    { key: "trigger_description_contains", value: splitRuleKeywords(rule.trigger_description_contains) },
    { key: "trigger_product_number_equals", value: normalizeQuoteImportSku(rule.trigger_product_number_equals) },
    { key: "trigger_product_number_contains", value: normalizeQuoteImportSku(rule.trigger_product_number_contains) },
    { key: "trigger_supplier", value: normalizeQuoteImportMatchToken(rule.trigger_supplier) },
    { key: "trigger_item_type", value: normalizeQuoteImportMatchToken(rule.trigger_item_type) },
  ];
}

function rowMatchesTriggeredAutoInclusionRule(rule: EntityRecord, row: EntityRecord) {
  const normalizedCategory = String(row.category || row.heading_category || "").trim();
  const normalizedDescription = normalizeQuoteImportMatchToken([
    row.name,
    row.description,
    row.original_description,
    row.original_extracted_description,
  ].filter(Boolean).join(" "));
  const normalizedSku = normalizeQuoteImportSku(row.normalized_sku || row.source_item_code || row.original_sku || row.product_number);
  const normalizedSupplier = normalizeQuoteImportMatchToken(row.supplier);
  const normalizedItemType = normalizeQuoteImportMatchToken(row.imported_item_type || row.item_type || row.source);
  const conditions = getTriggeredRuleConditions(rule)
    .filter((condition) => Array.isArray(condition.value) ? condition.value.length > 0 : Boolean(condition.value));

  if (conditions.length === 0) return false;

  const checks = conditions.map((condition) => {
    switch (condition.key) {
      case "trigger_category":
        return normalizeQuoteImportMatchToken(normalizedCategory) === normalizeQuoteImportMatchToken(condition.value);
      case "trigger_description_contains":
        return (condition.value as string[]).some((keyword) => normalizedDescription.includes(normalizeQuoteImportMatchToken(keyword)));
      case "trigger_product_number_equals":
        return normalizedSku === condition.value;
      case "trigger_product_number_contains":
        return Boolean(condition.value) && normalizedSku.includes(String(condition.value));
      case "trigger_supplier":
        return normalizedSupplier === condition.value;
      case "trigger_item_type":
        return normalizedItemType === condition.value;
      default:
        return false;
    }
  });

  return String(rule.match_mode || "all") === "any"
    ? checks.some(Boolean)
    : checks.every(Boolean);
}

function calculateTriggeredAutoInclusionQuantity(rule: EntityRecord, row: EntityRecord) {
  const quantity = Number(row.quantity || 0);
  const multiplier = Number(rule.quantity_multiplier || 1);
  const logic = String(rule.quantity_logic || "per_imported_item");
  if (logic === "fixed") return roundMoney(multiplier);
  if (logic === "quantity_per_unit") return roundMoney(quantity * multiplier);
  if (logic === "custom_multiplier") return roundMoney(quantity * multiplier);
  return roundMoney(quantity * multiplier);
}

function buildTriggeredAutoInclusionRow(
  importRecord: EntityRecord,
  parentRow: EntityRecord,
  rule: EntityRecord,
  existingRow?: EntityRecord | null
) {
  const calculatedQuantity = calculateTriggeredAutoInclusionQuantity(rule, parentRow);
  const cost = roundMoney(Number(rule.cost || 0));
  const markupPercent = Number(rule.markup_percent || 30);
  const sellPrice = roundMoney(cost * (1 + markupPercent / 100));
  const reviewRequired = rule.review_required !== false;
  const parentReviewState = String(parentRow.review_state || parentRow.status || "active");
  const shouldExclude = ["deleted", "excluded"].includes(parentReviewState);
  return {
    quote_id: importRecord.quote_id || "",
    import_id: importRecord.id,
    import_type: "quote_level",
    source: "triggered_auto_inclusion",
    name: rule.inclusion_description || "Triggered inclusion",
    description: rule.inclusion_description || "Triggered inclusion",
    category: rule.inclusion_category || "misc_fixings",
    quantity: calculatedQuantity,
    unit: rule.unit || "ea",
    buy_price: cost,
    markup_percent: markupPercent,
    sell_price: sellPrice,
    total_buy_price: roundMoney(cost * calculatedQuantity),
    total_sell_price: roundMoney(sellPrice * calculatedQuantity),
    sort_order: Number(parentRow.sort_order || 0) + 0.5,
    is_auto_inclusion: true,
    auto_inclusion_id: rule.id,
    source_rule_id: rule.id,
    source_rule_name: rule.rule_name || rule.inclusion_description || "Triggered auto-inclusion",
    notes: rule.notes || "",
    source_file_name: parentRow.source_file_name || importRecord.file_name || "",
    source_file_type: parentRow.source_file_type || importRecord.file_type || "",
    source_page: parentRow.source_page || 0,
    source_row: parentRow.source_row || 0,
    source_item_code: rule.inclusion_sku || "",
    supplier: rule.inclusion_supplier || "",
    product_number: rule.inclusion_sku || "",
    original_description: rule.inclusion_description || "",
    original_imported_value: {
      parent_row_id: parentRow.id,
      parent_description: parentRow.description || parentRow.name || "",
    },
    parsed_normalized_value: {
      parent_row_id: parentRow.id,
      parent_description: parentRow.description || parentRow.name || "",
      source_rule_id: rule.id,
      source_rule_name: rule.rule_name || "",
      original_rule_values: {
        inclusion_description: rule.inclusion_description || "",
        inclusion_category: rule.inclusion_category || "misc_fixings",
        inclusion_sku: rule.inclusion_sku || "",
        quantity_logic: rule.quantity_logic || "per_imported_item",
        quantity_multiplier: Number(rule.quantity_multiplier || 1),
        unit: rule.unit || "ea",
        cost,
        markup_percent: markupPercent,
        gst_treatment: rule.gst_treatment || "ex_gst",
      },
    },
    confidence_score: existingRow?.confidence_score ?? 1,
    gst_treatment: rule.gst_treatment || "ex_gst",
    parent_pricing_quote_item_id: parentRow.id,
    parent_source_description: parentRow.description || parentRow.name || "",
    quantity_multiplier: Number(rule.quantity_multiplier || 1),
    calculated_quantity: calculatedQuantity,
    is_manual_override: existingRow?.is_manual_override === true,
    review_status: existingRow?.is_manual_override === true
      ? "manually_edited"
      : reviewRequired ? "auto_added_needs_review" : "confirmed",
    review_state: shouldExclude ? "excluded" : "active",
    status: shouldExclude ? "excluded" : "review",
    warnings: buildQuoteImportRowWarnings({
      id: existingRow?.id || "triggered-preview",
      created_date: existingRow?.created_date || "",
      updated_date: existingRow?.updated_date || "",
      row_version: Number(existingRow?.row_version || 1),
      buy_price: cost,
      quantity: calculatedQuantity,
      warnings: existingRow?.warnings || [],
    } as EntityRecord),
    errors: [],
  };
}

function syncTriggeredAutoInclusionRowsForImport(
  importRecord: EntityRecord,
  options: { actor: LocalUser | null; requestSource?: string }
) {
  const requestSource = options.requestSource || "quote-triggered-auto-inclusions-sync";
  const quoteId = String(importRecord.quote_id || "");
  const rules = listEntityRecords("TriggeredAutoInclusionRule", { filters: { active: true }, sort: "rule_name", limit: 10000 });
  const stagedRows = listEntityRecords("PricingQuoteItem", { filters: { import_id: String(importRecord.id || "") }, limit: 10000 });
  const baseRows = stagedRows.filter((row) => String(row.source || "") !== "triggered_auto_inclusion");
  const existingTriggeredRows = stagedRows.filter((row) => String(row.source || "") === "triggered_auto_inclusion");
  const existingTriggeredLookup = new Map(existingTriggeredRows.map((row) => [`${String(row.parent_pricing_quote_item_id || "")}:${String(row.auto_inclusion_id || row.source_rule_id || "")}`, row]));
  const desiredKeys = new Set<string>();
  const touchedRows: EntityRecord[] = [];

  baseRows.forEach((row) => {
    rules
      .filter((rule) => rowMatchesTriggeredAutoInclusionRule(rule, row))
      .forEach((rule) => {
        const key = `${String(row.id || "")}:${String(rule.id || "")}`;
        desiredKeys.add(key);
        const existingRow = existingTriggeredLookup.get(key) || null;
        const nextPayload = buildTriggeredAutoInclusionRow(importRecord, row, rule, existingRow);
        if (existingRow) {
          const manualQuantity = Number(nextPayload.quantity || 0);
          const manualBuyPrice = roundMoney(Number(existingRow.buy_price || 0));
          const manualMarkup = Number(existingRow.markup_percent || 0);
          const manualSellPrice = roundMoney(Number(existingRow.sell_price || 0) || manualBuyPrice * (1 + manualMarkup / 100));
          const patch = existingRow.is_manual_override === true
            ? {
                parent_pricing_quote_item_id: nextPayload.parent_pricing_quote_item_id,
                parent_source_description: nextPayload.parent_source_description,
                quantity: manualQuantity,
                calculated_quantity: nextPayload.calculated_quantity,
                quantity_multiplier: nextPayload.quantity_multiplier,
                total_buy_price: roundMoney(manualBuyPrice * manualQuantity),
                total_sell_price: roundMoney(manualSellPrice * manualQuantity),
                review_state: nextPayload.review_state,
                status: nextPayload.status,
                warnings: nextPayload.warnings,
              }
            : nextPayload;
          const updated = updateEntityRecord("PricingQuoteItem", existingRow.id, patch, {
            actor: options.actor,
            request_source: requestSource,
          }) || { ...existingRow, ...patch };
          touchedRows.push(updated);
          return;
        }

        const created = createEntityRecord("PricingQuoteItem", nextPayload, {
          actor: options.actor,
          request_source: requestSource,
        });
        createEntityRecord("TriggeredAutoInclusionAudit", buildTriggeredAutoInclusionAuditPayload("staged_from_import", {
          quoteId,
          importId: String(importRecord.id || ""),
          parentPricingQuoteItemId: String(row.id || ""),
          ruleId: String(rule.id || ""),
          inclusionQuoteItemId: String(created.id || ""),
          calculatedQuantity: nextPayload.calculated_quantity,
          quantityMultiplier: nextPayload.quantity_multiplier,
          originalRuleValues: (nextPayload.parsed_normalized_value as Record<string, unknown>)?.original_rule_values as Record<string, unknown> || {},
          editedQuoteValues: {
            description: created.description || "",
            quantity: created.quantity || 0,
            unit_cost: created.buy_price || 0,
            markup_percent: created.markup_percent || 0,
          },
          actor: options.actor,
        }), {
          actor: options.actor,
          request_source: requestSource,
        });
        touchedRows.push(created);
      });
  });

  existingTriggeredRows
    .filter((row) => !desiredKeys.has(`${String(row.parent_pricing_quote_item_id || "")}:${String(row.auto_inclusion_id || row.source_rule_id || "")}`))
    .forEach((row) => {
      const updated = updateEntityRecord("PricingQuoteItem", row.id, {
        review_state: "excluded",
        status: "excluded",
      }, {
        actor: options.actor,
        request_source: requestSource,
      }) || { ...row, review_state: "excluded", status: "excluded" };
      touchedRows.push(updated);
    });

  return listEntityRecords("PricingQuoteItem", { filters: { import_id: String(importRecord.id || "") }, sort: "sort_order", limit: 10000 })
    .sort((left, right) => {
      const leftParent = left.parent_pricing_quote_item_id ? 1 : 0;
      const rightParent = right.parent_pricing_quote_item_id ? 1 : 0;
      if (leftParent !== rightParent && String(left.parent_pricing_quote_item_id || "") === String(right.id || "")) return 1;
      if (leftParent !== rightParent && String(right.parent_pricing_quote_item_id || "") === String(left.id || "")) return -1;
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    });
}

function buildQuoteItemPayloadFromPricingRow(row: EntityRecord, importRecord: EntityRecord) {
  const quantity = Number(row.quantity || 0);
  const buyPrice = Number(row.buy_price || 0);
  const markup = Number(row.markup_percent || 0);
  const sellPrice = roundMoney(Number(row.sell_price || 0) || buyPrice * (1 + markup / 100));
  const totalBuyPrice = readImportedLineTotal(row);
  const total = roundMoney(Number(row.total_sell_price || 0) || (totalBuyPrice != null ? totalBuyPrice * (1 + markup / 100) : sellPrice * quantity));
  const reviewState = String(row.review_state || row.status || "active");
  const sectionLabel = String(row.section || row.heading_category || row.source_file_name || "Imported").trim() || "Imported";
  return {
    quote_id: String(importRecord.quote_id || ""),
    import_id: String(importRecord.id || ""),
    import_type: "quote_level",
    pricing_quote_item_id: row.id,
    source: row.source || "quote_import",
    source_file_name: row.source_file_name || importRecord.file_name || "",
    source_file_type: row.source_file_type || importRecord.file_type || "",
    source_page: row.source_page || 0,
    source_row: row.source_row || 0,
    original_imported_value: row.original_imported_value || row.raw || {},
    parsed_normalized_value: row.parsed_normalized_value || {},
    confidence_score: row.confidence_score || row.extraction_confidence || null,
    created_by_user_id: row.created_by_user_id || "",
    created_by_user_name: row.created_by_user_name || "",
    section: sectionLabel,
    section_id: row.section_id || "",
    section_key: row.section_key || buildPricingSectionRecord(sectionLabel).key,
    section_display_order: Number(row.section_display_order || 999),
    category: row.category || "materials",
    description: row.description || row.name || "Imported quote item",
    quantity,
    unit: row.unit || "ea",
    unit_cost: buyPrice,
    markup_percent: markup,
    sell_price: sellPrice,
    total,
    supplier: row.supplier || "",
    product_number: row.original_sku || row.product_number || "",
    source_item_code: row.source_item_code || row.original_sku || row.product_number || "",
    original_extracted_description: row.original_description || row.description || row.name || "",
    supplier_quote_number: row.quote_reference || (importRecord.metadata as Record<string, unknown> | undefined)?.quote_reference || "",
    supplier_gst_number: row.supplier_gst_number || (importRecord.metadata as Record<string, unknown> | undefined)?.supplier_gst_number || "",
    normalized_sku: row.normalized_sku || "",
    gst_treatment: row.gst_treatment || "unknown",
    review_state: reviewState,
    is_optional: ["excluded", "deleted"].includes(reviewState),
    source_rule_id: row.auto_inclusion_id || row.source_rule_id || "",
    parent_pricing_quote_item_id: row.parent_pricing_quote_item_id || "",
    parent_source_description: row.parent_source_description || "",
    auto_added: row.source === "triggered_auto_inclusion" ? true : Boolean(row.auto_added),
    review_status: row.review_status || (row.source === "triggered_auto_inclusion" ? "auto_added_needs_review" : "confirmed"),
    is_manual_override: row.is_manual_override === true,
  };
}

function confirmTriggeredAutoInclusionItem(
  quoteId: string,
  itemId: string,
  options: { actor: LocalUser | null; requestSource?: string }
) {
  const quoteItem = getEntityRecord("QuoteItem", itemId);
  if (!quoteItem || String(quoteItem.quote_id || "") !== quoteId) {
    throw new RouteRequestError(404, "quote_item_not_found", "Quote line item was not found.");
  }
  if (quoteItem.source !== "triggered_auto_inclusion") {
    throw new RouteRequestError(400, "quote_item_not_triggered_auto_inclusion", "Only triggered auto-inclusion line items can be confirmed here.");
  }
  const confirmedAt = new Date().toISOString();
  const confirmedBy = options.actor?.full_name || options.actor?.email || "";
  const updatedItem = updateEntityRecord("QuoteItem", itemId, {
    review_status: "confirmed",
    confirmed_at: confirmedAt,
    confirmed_by: confirmedBy,
  }, {
    actor: options.actor,
    request_source: options.requestSource,
  });
  createEntityRecord("TriggeredAutoInclusionAudit", buildTriggeredAutoInclusionAuditPayload("confirmed", {
    quoteId,
    importId: String(quoteItem.import_id || ""),
    parentPricingQuoteItemId: String(quoteItem.parent_pricing_quote_item_id || ""),
    parentQuoteItemId: String(quoteItem.parent_line_item_id || ""),
    ruleId: String(quoteItem.source_rule_id || ""),
    inclusionQuoteItemId: itemId,
    calculatedQuantity: Number(quoteItem.quantity || 0),
    quantityMultiplier: Number(quoteItem.parsed_normalized_value && typeof quoteItem.parsed_normalized_value === "object"
      ? (quoteItem.parsed_normalized_value as Record<string, unknown>).quantity_multiplier || 0
      : 0),
    originalRuleValues: (quoteItem.parsed_normalized_value as Record<string, unknown> | undefined)?.original_rule_values as Record<string, unknown> || {},
    editedQuoteValues: {
      description: quoteItem.description || "",
      quantity: quoteItem.quantity || 0,
      total: quoteItem.total || 0,
      review_status: "confirmed",
    },
    actor: options.actor,
  }), {
    actor: options.actor,
    request_source: options.requestSource,
  });
  const quote = recalculateQuoteTotals(quoteId, options);
  return { quote_item: updatedItem, quote };
}

function buildPricingQuoteItemCalculatedPatch(row: EntityRecord, warnings = buildQuoteImportRowWarnings(row)) {
  const quantity = Number(row.quantity || 0);
  const buyPrice = Number(row.buy_price || 0);
  const markup = Number(row.markup_percent || 0);
  const sellPrice = roundMoney(buyPrice * (1 + markup / 100));
  const importedLineTotal = readReviewLineTotal(row);
  const totalBuyPrice = importedLineTotal != null ? importedLineTotal : roundMoney(buyPrice * quantity);
  return {
    sell_price: sellPrice,
    total_buy_price: totalBuyPrice,
    total_sell_price: roundMoney(totalBuyPrice * (1 + markup / 100)),
    warnings,
  };
}

function buildQuoteItemPatchFromPricingRow(row: EntityRecord, importRecord: EntityRecord) {
  return {
    ...buildQuoteItemPayloadFromPricingRow(row, importRecord),
    parsed_normalized_value: {
      ...(row.parsed_normalized_value && typeof row.parsed_normalized_value === "object" ? row.parsed_normalized_value as Record<string, unknown> : {}),
      description: row.description || row.name || "",
      category: row.category || "materials",
      quantity: Number(row.quantity || 0),
      unit: row.unit || "ea",
      buy_price: Number(row.buy_price || 0),
      markup_percent: Number(row.markup_percent || 0),
      sell_price: Number(row.sell_price || 0),
      total_buy_price: Number(row.total_buy_price || 0),
      total: Number(row.total_sell_price || 0),
      gst_treatment: row.gst_treatment || "unknown",
      review_state: String(row.review_state || row.status || "active"),
      source_rule_id: row.auto_inclusion_id || row.source_rule_id || "",
      parent_pricing_quote_item_id: row.parent_pricing_quote_item_id || "",
    },
  };
}

function readImportedLineTotal(row: EntityRecord) {
  for (const key of ["line_total_ex_gst", "line_total"]) {
    const value = Number(row[key] || 0);
    if (Number.isFinite(value) && value > 0) return roundMoney(value);
  }
  return null;
}

function readReviewLineTotal(row: EntityRecord) {
  const reviewedTotal = Number(row.total_buy_price || 0);
  if (Number.isFinite(reviewedTotal) && reviewedTotal > 0) return roundMoney(reviewedTotal);
  return readImportedLineTotal(row);
}

function ensureDefaultMillbrookContractTemplate() {
  const existing = listEntityRecords("DocumentTemplate", { filters: { template_key: "millbrook_contract" }, limit: 1 })[0];
  const defaultTemplate = {
    ...buildTemplateRecordPayload(buildDefaultDocumentTemplate("contract")),
    name: "Millbrook Contract",
    template_key: "millbrook_contract",
    is_default: true,
    sections: [
      "Header",
      "Customer block",
      "Job block",
      "Job notes/specifications",
      "Price block",
      "Payment schedule",
      "Payment terms",
      "Disclaimer",
      "Signature section",
      "Terms and conditions",
    ],
    style_config: {
      gst_registration_number: "010-724-589",
      layout: "graphical_contract",
    },
  };
  if (existing) {
    const blocks = Array.isArray(existing.blocks) ? existing.blocks : [];
    const shouldUpgradeDefaultLayout = blocks.length === 0 || (
      !blocks.some((block) => block?.type === "image" && String((block as { contentJson?: { src?: string } }).contentJson?.src || "").includes("company.logo"))
      && blocks.some((block) => block?.type === "text" && String((block as { contentJson?: { text?: string } }).contentJson?.text || "").includes("GST Reg. Number: {{company.gstNumber}}"))
    );
    if (shouldUpgradeDefaultLayout) {
      return updateEntityRecord("DocumentTemplate", existing.id, {
        ...defaultTemplate,
        row_version: existing.row_version,
      }, {
        actor: null,
        request_source: "quote-document-template-default-upgrade",
        expected_row_version: existing.row_version,
      }) || existing;
    }
    return existing;
  }
  return createEntityRecord("DocumentTemplate", defaultTemplate, {
    actor: null,
    request_source: "quote-document-template-default",
  });
}

function ensureDefaultMillbrookQuoteTemplate() {
  const existing = listEntityRecords("DocumentTemplate", { filters: { template_key: "millbrook_quote" }, limit: 1 })[0];
  const defaultTemplate = {
    ...buildTemplateRecordPayload(buildDefaultDocumentTemplate("quote")),
    name: "Millbrook Quote",
    template_key: "millbrook_quote",
    is_default: true,
  };
  if (existing) {
    const blocks = Array.isArray(existing.blocks) ? existing.blocks : [];
    const shouldUpgradeDefaultLayout = blocks.length === 0 || (
      !blocks.some((block) => block?.type === "image" && String((block as { contentJson?: { src?: string } }).contentJson?.src || "").includes("company.logo"))
      && blocks.some((block) => block?.type === "text" && String((block as { contentJson?: { text?: string } }).contentJson?.text || "").includes("GST Reg. Number: {{company.gstNumber}}"))
    );
    if (shouldUpgradeDefaultLayout) {
      return updateEntityRecord("DocumentTemplate", existing.id, {
        ...defaultTemplate,
        row_version: existing.row_version,
      }, {
        actor: null,
        request_source: "quote-document-template-default-upgrade",
        expected_row_version: existing.row_version,
      }) || existing;
    }
    return existing;
  }
  return createEntityRecord("DocumentTemplate", {
    ...defaultTemplate,
  }, {
    actor: null,
    request_source: "quote-document-template-default",
  });
}

function ensureDefaultQuoteListTemplate() {
  const existing = listEntityRecords("DocumentTemplate", { filters: { template_key: "quote_list" }, limit: 1 })[0];
  const defaultTemplate = {
    ...buildTemplateRecordPayload(buildDefaultDocumentTemplate("quote_list")),
    name: "Quote List",
    template_key: "quote_list",
    is_default: true,
  };
  if (existing) {
    const blocks = Array.isArray(existing.blocks) ? existing.blocks : [];
    const shouldUpgradeDefaultLayout = blocks.length === 0
      || !blocks.some((block) => block?.type === "table" && block?.contentJson?.showNotes === true);
    if (shouldUpgradeDefaultLayout) {
      return updateEntityRecord("DocumentTemplate", existing.id, {
        ...defaultTemplate,
        row_version: existing.row_version,
      }, {
        actor: null,
        request_source: "quote-list-template-default-upgrade",
        expected_row_version: existing.row_version,
      }) || existing;
    }
    return existing;
  }
  return createEntityRecord("DocumentTemplate", defaultTemplate, {
    actor: null,
    request_source: "quote-list-template-default",
  });
}

function ensureDefaultGraphicalDocumentTemplates() {
  const contract = ensureDefaultMillbrookContractTemplate();
  const quote = ensureDefaultMillbrookQuoteTemplate();
  const quoteList = ensureDefaultQuoteListTemplate();
  return { contract, quote, quoteList };
}

function resolveDocumentTemplateForGeneration(templateId: string | undefined, documentType: "quote" | "contract" | "quote_list") {
  ensureDefaultGraphicalDocumentTemplates();
  if (templateId) {
    const selected = getEntityRecord("DocumentTemplate", templateId);
    if (!selected) throw new RouteRequestError(404, "document_template_not_found", "Document template was not found.");
    return selected;
  }
  const templateKey = documentType === "quote"
    ? "millbrook_quote"
    : documentType === "quote_list"
      ? "quote_list"
      : "millbrook_contract";
  return listEntityRecords("DocumentTemplate", {
    filters: { template_key: templateKey },
    limit: 1,
  })[0] || null;
}

function ensureDefaultContractTerms() {
  const existing = listEntityRecords("ContractTerms", { filters: { is_default: true }, limit: 1 })[0];
  if (existing) return existing;
  return createEntityRecord("ContractTerms", {
    name: "Millbrook Default Terms",
    is_default: true,
    sections: DEFAULT_TERMS_SECTIONS,
    payment_terms: DEFAULT_PAYMENT_TERMS,
    disclaimer: DEFAULT_DISCLAIMER,
  }, {
    actor: null,
    request_source: "quote-document-terms-default",
  });
}

function getLinkedQuoteJob(quote: EntityRecord) {
  const quoteId = String(quote.id || "");
  return listEntityRecords("Job", { filters: { quote_id: quoteId }, limit: 1 })[0] || null;
}

function buildQuoteDocumentDraftResponse(quoteId: string, documentType: "quote" | "contract" | "quote_list") {
  const quote = getEntityRecord("Quote", quoteId);
  if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
  const quoteItems = listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, limit: 10000 });
  const contact = quote.contact_id ? getEntityRecord("Contact", String(quote.contact_id)) : null;
  const job = getLinkedQuoteJob(quote);
  const latestDocument = listEntityRecords("QuoteDocument", { filters: { quote_id: quoteId }, sort: "-updated_date", limit: 1 })[0] || null;
  const terms = ensureDefaultContractTerms();
  const template = documentType === "quote"
    ? ensureDefaultMillbrookQuoteTemplate()
    : documentType === "quote_list"
      ? ensureDefaultQuoteListTemplate()
      : ensureDefaultMillbrookContractTemplate();
  const defaultTermsSections = Array.isArray(terms.sections) ? terms.sections : DEFAULT_TERMS_SECTIONS;
  const existing = latestDocument
    ? {
        paymentTerms: String(latestDocument.paymentTerms || terms.payment_terms || DEFAULT_PAYMENT_TERMS),
        disclaimer: String(latestDocument.disclaimer || terms.disclaimer || DEFAULT_DISCLAIMER),
        termsSections: Array.isArray(latestDocument.termsSections) && latestDocument.termsSections.length ? latestDocument.termsSections as Array<{ title: string; body: string }> : defaultTermsSections as Array<{ title: string; body: string }>,
      }
    : {
        paymentTerms: String(terms.payment_terms || DEFAULT_PAYMENT_TERMS),
        disclaimer: String(terms.disclaimer || DEFAULT_DISCLAIMER),
        termsSections: defaultTermsSections as Array<{ title: string; body: string }>,
      };
  const document = buildQuoteDocumentDraft({
    quote,
    quoteItems,
    contact,
    job,
    documentType,
    existing,
  });
  const payload = buildClientFacingDocumentPayload(document);
  return {
    ...payload,
    html: renderDocumentTemplateHtml(template, document),
    template,
  };
}

function normalizeSubmittedQuoteDocument(
  quoteId: string,
  body: z.infer<typeof quoteDocumentRequestSchema>
) {
  const fallback = buildQuoteDocumentDraftResponse(quoteId, body.document_type || "contract").document;
  const submitted = body.document || fallback;
  if (String(submitted.quoteId || quoteId) !== quoteId) {
    throw new RouteRequestError(400, "quote_document_quote_mismatch", "Document quote ID does not match the route quote.");
  }
  const totals = calculateDocumentTotals({
    subtotalExGst: submitted.subtotalExGst,
    gstAmount: submitted.gstAmount,
    totalIncGst: submitted.totalIncGst,
  });
  const schedule = (!Number(submitted.depositAmount || 0) && !Number(submitted.balanceDue || 0))
    ? calculateDefaultPaymentSchedule(totals.totalIncGst)
    : {
        depositAmount: submitted.depositAmount,
        balanceDue: submitted.balanceDue,
      };
  return {
    ...fallback,
    ...submitted,
    quoteId,
    subtotalExGst: totals.subtotalExGst,
    gstAmount: totals.gstAmount,
    totalIncGst: totals.totalIncGst,
    depositAmount: schedule.depositAmount,
    balanceDue: schedule.balanceDue,
  };
}

function formatMoneyForDocumentInfo(value: number) {
  return `$${roundMoney(value).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isMozaikQuoteImport(importRecord: EntityRecord | null | undefined) {
  const metadata = importRecord?.metadata && typeof importRecord.metadata === "object"
    ? importRecord.metadata as Record<string, unknown>
    : {};
  return String(metadata.document_type || "") === "mozaik_material_list";
}

function replacePriorMozaikQuoteImports(
  quoteId: string,
  currentImportId: string,
  options: { actor: LocalUser | null; requestSource?: string; includeCommitted: boolean }
) {
  const requestSource = options.requestSource || "quote-pricing-import-mozaik-replace";
  const priorImports = listEntityRecords("QuoteImport", { filters: { quote_id: quoteId }, limit: 10000 })
    .filter((record) => record.id !== currentImportId)
    .filter((record) => record.import_type === "quote_level")
    .filter((record) => isMozaikQuoteImport(record))
    .filter((record) => options.includeCommitted || String(record.import_status || "") !== "committed")
    .filter((record) => String(record.import_status || "") !== "replaced");

  priorImports.forEach((record) => {
    updateEntityRecord("QuoteImport", record.id, {
      import_status: "replaced",
      replaced_by_import_id: currentImportId,
      replaced_at: new Date().toISOString(),
    }, { actor: options.actor, request_source: requestSource });

    listEntityRecords("PricingQuoteItem", { filters: { import_id: record.id }, limit: 10000 })
      .forEach((row) => updateEntityRecord("PricingQuoteItem", row.id, {
        status: "replaced",
        review_state: "replaced",
        replaced_by_import_id: currentImportId,
      }, { actor: options.actor, request_source: requestSource }));
  });

  return priorImports.map((record) => String(record.id || ""));
}

function normalizeQuoteImportMatchToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

function normalizeQuoteImportSku(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getQuoteImportItemMatchKeys(record: EntityRecord) {
  const keys: string[] = [];
  const sku = normalizeQuoteImportSku(record.normalized_sku || record.source_item_code || record.original_sku || record.product_number);
  if (sku) {
    keys.push(`sku:${sku}`);
  }

  const description = normalizeQuoteImportMatchToken(record.description || record.name || record.original_extracted_description);
  if (description) {
    keys.push([
      "desc",
      description,
      normalizeQuoteImportMatchToken(record.category || record.heading_category),
      normalizeQuoteImportMatchToken(record.unit || "ea"),
    ].join(":"));
  }

  return keys;
}

function buildQuoteImportItemLookup(items: EntityRecord[]) {
  const lookup = new Map<string, EntityRecord[]>();
  items.forEach((item) => {
    getQuoteImportItemMatchKeys(item).forEach((key) => {
      lookup.set(key, [...(lookup.get(key) || []), item]);
    });
  });
  return lookup;
}

function takeMatchingQuoteImportItem(
  row: EntityRecord,
  lookup: Map<string, EntityRecord[]>,
  usedItemIds: Set<string>
) {
  for (const key of getQuoteImportItemMatchKeys(row)) {
    const match = (lookup.get(key) || []).find((item) => !usedItemIds.has(String(item.id || "")));
    if (match) {
      usedItemIds.add(String(match.id || ""));
      return match;
    }
  }

  return null;
}

function isProtectedQuoteImportLineItem(item: EntityRecord) {
  const source = String(item.source || "").trim().toLowerCase();
  const reviewStatus = String(item.review_status || "").trim().toLowerCase();
  const manuallyManagedSources = new Set(["manual", "global_auto_inclusion", "triggered_auto_inclusion"]);
  const manuallyManagedStatuses = new Set(["confirmed", "manually_edited"]);
  return manuallyManagedSources.has(source)
    || manuallyManagedStatuses.has(reviewStatus)
    || Boolean(item.parent_line_item_id || item.parent_pricing_quote_item_id);
}

function buildQuoteImportRowWarnings(row: EntityRecord) {
  const warnings = new Set<string>(Array.isArray(row.warnings) ? row.warnings.map(String) : []);
  ["Missing buy price.", "Missing quantity."].forEach((warning) => warnings.delete(warning));
  if (!Number(row.buy_price || 0)) warnings.add("Missing buy price.");
  if (!Number(row.quantity || 0)) warnings.add("Missing quantity.");
  return [...warnings];
}

function valuesEqualForAudit(left: unknown, right: unknown) {
  if (typeof left === "number" || typeof right === "number") {
    return Number(left || 0) === Number(right || 0);
  }
  if (typeof left === "object" || typeof right === "object") {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }
  return String(left ?? "") === String(right ?? "");
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function listPricingSections(options: { includeInactive?: boolean } = {}) {
  return listEntityRecords("PricingSection", { limit: 10000 })
    .filter((record) => options.includeInactive || record.is_active !== false)
    .sort((left, right) => {
      const orderCompare = Number(left.display_order || 999) - Number(right.display_order || 999);
      if (orderCompare !== 0) {
        return orderCompare;
      }
      return String(left.label || left.name || left.value || "")
        .localeCompare(String(right.label || right.name || right.value || ""), undefined, { sensitivity: "base" });
    });
}

function categoryMatchesReference(record: Record<string, unknown>, category: EntityRecord) {
  const recordCategory = normalizePricingCategoryName(record.category);
  return recordCategory === normalizePricingCategoryName(category.name || category.label || "")
    || recordCategory === normalizePricingCategoryName(category.key || category.value || "");
}

function countPricingCategoryUsage(category: EntityRecord) {
  const matchesTemplate = (record: EntityRecord) => {
    const haystack = JSON.stringify({
      template_key: record.template_key,
      name: record.name,
      blocks: record.blocks,
      template_json: record.template_json,
      content_json: record.content_json,
    }).toLowerCase();
    const key = String(category.key || category.value || "").trim().toLowerCase();
    const label = String(category.label || category.name || "").trim().toLowerCase();
    return Boolean((key && haystack.includes(key)) || (label && haystack.includes(label)));
  };

  const pricingItems = listEntityRecords("PricingItem", { limit: 10000 }).filter((record) => categoryMatchesReference(record, category)).length;
  const quoteItems = listEntityRecords("QuoteItem", { limit: 10000 }).filter((record) => categoryMatchesReference(record, category)).length;
  const importRows = listEntityRecords("PricingQuoteItem", { limit: 10000 }).filter((record) => categoryMatchesReference(record, category)).length;
  const priceListRows = listEntityRecords("PriceListImportRow", { limit: 10000 }).filter((record) => {
    const mapped = record.mapped && typeof record.mapped === "object" ? record.mapped as Record<string, unknown> : null;
    const nextValues = record.new_values && typeof record.new_values === "object" ? record.new_values as Record<string, unknown> : null;
    return categoryMatchesReference(record, category)
      || (mapped ? categoryMatchesReference(mapped, category) : false)
      || (nextValues ? categoryMatchesReference(nextValues, category) : false);
  }).length;
  const globalInclusions = listEntityRecords("GlobalAutoInclusion", { limit: 10000 }).filter((record) => categoryMatchesReference(record, category)).length;
  const triggeredRuleInclusions = listEntityRecords("TriggeredAutoInclusionRule", { limit: 10000 }).filter((record) => categoryMatchesReference({ category: record.inclusion_category }, category)).length;
  const triggeredRuleTriggers = listEntityRecords("TriggeredAutoInclusionRule", { limit: 10000 }).filter((record) => categoryMatchesReference({ category: record.trigger_category }, category)).length;
  const quoteImports = listEntityRecords("QuoteImport", { limit: 10000 }).filter((record) => {
    const structuredItems = Array.isArray(record.structured_items) ? record.structured_items : [];
    return structuredItems.some((item) => item && typeof item === "object" && categoryMatchesReference(item as Record<string, unknown>, category));
  }).length;
  const documentTemplates = listEntityRecords("DocumentTemplate", { limit: 10000 }).filter(matchesTemplate).length;

  return {
    pricing_items: pricingItems,
    quote_items: quoteItems,
    pricing_quote_items: importRows,
    supplier_price_list_rows: priceListRows,
    global_auto_inclusions: globalInclusions,
    triggered_rule_inclusions: triggeredRuleInclusions,
    triggered_rule_triggers: triggeredRuleTriggers,
    import_mappings: quoteImports,
    historical_records: quoteItems,
    document_templates: documentTemplates,
    total: pricingItems + quoteItems + importRows + priceListRows + globalInclusions + triggeredRuleInclusions + triggeredRuleTriggers + quoteImports + documentTemplates,
  };
}

function applyPricingCategoryValue(value: unknown, category: EntityRecord) {
  const nextCategory = String(category.key || category.value || buildPricingCategoryRecord(String(category.label || category.name || value || "")).key);
  return {
    category: nextCategory,
  };
}

function resolvePricingSectionAssignment(
  heading: unknown,
  sections = listPricingSections(),
) {
  const rawHeading = String(heading || "").trim();
  if (!rawHeading) {
    return {
      section: "General",
      section_id: "",
      section_key: "general",
      section_display_order: 999,
      matched: null as EntityRecord | null,
      warning: "",
    };
  }

  const matched = findMatchingPricingSection(sections as Array<Record<string, unknown>>, rawHeading) as EntityRecord | null;
  if (matched) {
    return {
      section: String(matched.label || matched.name || rawHeading),
      section_id: String(matched.id || ""),
      section_key: String(matched.key || matched.value || buildPricingSectionRecord(rawHeading).key),
      section_display_order: Number(matched.display_order || 999),
      matched,
      warning: "",
    };
  }

  return {
    section: rawHeading,
    section_id: "",
    section_key: buildPricingSectionRecord(rawHeading).key,
    section_display_order: 999,
    matched: null,
    warning: `Section "${rawHeading}" is not mapped to an active section yet.`,
  };
}

function sectionMatchesReference(record: EntityRecord, section: EntityRecord) {
  const recordSectionId = String(record.section_id || "").trim();
  const recordSectionKey = String(record.section_key || "").trim();
  const recordSectionName = normalizePricingSectionName(record.section || record.heading_category || record.section_name);
  return recordSectionId === String(section.id || "")
    || (recordSectionKey && recordSectionKey === String(section.key || section.value || ""))
    || (recordSectionName && recordSectionName === normalizePricingSectionName(section.name || section.label || ""));
}

function countPricingSectionUsage(section: EntityRecord) {
  const quoteItems = listEntityRecords("QuoteItem", { limit: 10000 }).filter((record) => sectionMatchesReference(record, section)).length;
  const importRows = listEntityRecords("PricingQuoteItem", { limit: 10000 }).filter((record) => sectionMatchesReference(record, section)).length;
  const importMappings = listEntityRecords("QuoteImport", { limit: 10000 }).filter((record) => {
    const structuredItems = Array.isArray(record.structured_items) ? record.structured_items : [];
    return structuredItems.some((item) => {
      const heading = item && typeof item === "object"
        ? normalizePricingSectionName((item as Record<string, unknown>).heading_category || (item as Record<string, unknown>).section)
        : "";
      return heading && heading === normalizePricingSectionName(section.name || section.label || "");
    });
  }).length;

  return {
    quote_items: quoteItems,
    pricing_quote_items: importRows,
    import_mappings: importMappings,
    pricing_items: 0,
    auto_inclusion_rules: 0,
    total: quoteItems + importRows + importMappings,
  };
}

function applyPricingSectionToPayload(payload: Record<string, unknown>, section: EntityRecord) {
  const sectionName = String(section.label || section.name || payload.section || "General");
  return {
    ...payload,
    section: sectionName,
    section_id: String(section.id || ""),
    section_key: String(section.key || section.value || buildPricingSectionRecord(sectionName).key),
    section_display_order: Number(section.display_order || 999),
  };
}

function upsertPricingImportAttachment(input: {
  req: Request;
  actor: LocalUser | null;
  quoteId: string;
  fileName: string;
  fileType: string;
  fileBase64: string;
  importRecord: Record<string, unknown>;
  parsed: ReturnType<typeof parseQuoteImportFile>;
}) {
  const { req, actor, quoteId, fileName, fileType, fileBase64, importRecord, parsed } = input;
  const fileBuffer = decodeBase64Upload(stripDataUrlPrefix(fileBase64));
  const originalName = normalizeAttachmentName(fileName);
  const safeName = sanitiseFilename(originalName);
  const mimeType = mimeTypeForImportFile(originalName, fileType);
  validateUploadPayload(originalName, mimeType, fileBuffer);

  const metadata = parsed.metadata || {};
  const totalExtractedValue = Math.round(parsed.items.reduce((sum, item) => sum + Number(item.total_buy_price || item.line_total || 0), 0) * 100) / 100;
  const attachmentMetadata = {
    document_information: buildPricingImportDocumentInformation({ fileType, parsed, totalExtractedValue }),
    linked_pricing_import_id: importRecord.id || "",
    import_type: "quote_level",
    document_type: metadata.document_type || "",
    document_number: metadata.document_number || metadata.quote_reference || "",
    extracted_inc_gst_total: metadata.total_inc_gst || metadata.gst_inclusive_total || 0,
    extracted_ex_gst_subtotal: metadata.subtotal_ex_gst || metadata.gst_exclusive_total || 0,
    extracted_gst_amount: metadata.gst_amount || 0,
    file_source: fileType === "pdf" ? pricingDocumentSourceLabel(metadata.document_type) : ["csv", "xlsx"].includes(fileType) ? "Mozaik Import" : "Pricing Import",
    supplier_name: metadata.supplier_name || "",
    supplier_quote_number: metadata.quote_reference || "",
    uploaded_by: actor?.full_name || actor?.email || "",
    uploaded_at: new Date().toISOString(),
  };

  const checksum = calculateChecksum(fileBuffer);
  const existingAttachment = findAttachmentByLogicalName("quote", quoteId, originalName);
  if (existingAttachment && existingAttachment.checksum === checksum) {
    const updated = updateEntityRecord("Attachment", String(existingAttachment.id), {
      ...attachmentMetadata,
      source: "pricing-import",
      quote_file_id: existingAttachment.id,
      row_version: existingAttachment.row_version,
    }, {
      actor,
      request_source: readRequestSource(req) || "quote-pricing-import-attachment",
      expected_row_version: existingAttachment.row_version,
    });
    if (!updated) throw new Error("Attachment update failed");
    return updated;
  }

  const entityDirectory = path.join(getFilesystemDirectory(), "quotes", resolveAttachmentDirectoryName("quote", quoteId));
  fs.mkdirSync(entityDirectory, { recursive: true });
  const attachment = upsertAttachmentUpload({
    req,
    actor,
    relatedId: quoteId,
    relatedType: "quote",
    originalName,
    safeName,
    mimeType,
    size: fileBuffer.byteLength,
    fileBuffer,
    entityDirectory,
    source: "pricing-import",
    metadata: attachmentMetadata,
  });

  if (attachment.quote_file_id) return attachment;
  return updateEntityRecord("Attachment", String(attachment.id), {
    quote_file_id: attachment.id,
    row_version: attachment.row_version,
  }, {
    actor,
    request_source: readRequestSource(req) || "quote-pricing-import-attachment",
    expected_row_version: attachment.row_version,
  }) || attachment;
}

function mimeTypeForImportFile(fileName: string, fileType: string) {
  if (fileType === "pdf") return "application/pdf";
  if (fileType === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (fileType === "csv") return "text/csv";
  return guessMimeType(fileName);
}

function buildPricingImportDocumentInformation(input: {
  fileType: string;
  parsed: ReturnType<typeof parseQuoteImportFile>;
  totalExtractedValue: number;
}) {
  const { fileType, parsed, totalExtractedValue } = input;
  const metadata = parsed.metadata || {};
  const parts = ["Imported via Pricing tab."];
  if (fileType === "pdf") {
    parts.push(`${pricingDocumentDescription(metadata.document_type)} detected.`);
    if (metadata.supplier_name) parts.push(`Supplier: ${metadata.supplier_name}.`);
    if (metadata.document_number || metadata.quote_reference) parts.push(`Document: ${metadata.document_number || metadata.quote_reference}.`);
    parts.push(`Extracted ${parsed.items.length} line item${parsed.items.length === 1 ? "" : "s"}.`);
    if (metadata.total_inc_gst || metadata.gst_inclusive_total) parts.push(`Extracted total inc GST: ${formatMoney(metadata.total_inc_gst || metadata.gst_inclusive_total)}.`);
    if (metadata.gst_amount) parts.push(`GST: ${formatMoney(metadata.gst_amount)}.`);
    if (metadata.subtotal_ex_gst || metadata.gst_exclusive_total) parts.push(`Ex GST: ${formatMoney(metadata.subtotal_ex_gst || metadata.gst_exclusive_total)}.`);
    else if (totalExtractedValue) parts.push(`Extracted ex GST total: ${formatMoney(totalExtractedValue)}.`);
    if (metadata.total_inc_gst || metadata.gst_inclusive_total) parts.push(`Inc GST total: ${formatMoney(metadata.total_inc_gst || metadata.gst_inclusive_total)}.`);
    return parts.join(" ");
  }
  if (["csv", "xlsx"].includes(fileType)) {
    parts.push("Mozaik material list.");
    parts.push(`Extracted ${parsed.items.length} quote line item${parsed.items.length === 1 ? "" : "s"}.`);
    parts.push("Used for quote pricing calculation.");
    return parts.join(" ");
  }
  parts.push(`Extracted ${parsed.items.length} quote line item${parsed.items.length === 1 ? "" : "s"}.`);
  return parts.join(" ");
}

function pricingDocumentSourceLabel(documentType: unknown) {
  if (documentType === "supplier_invoice") return "Supplier Invoice";
  if (documentType === "supplier_estimate") return "Supplier Estimate";
  if (documentType === "supplier_quote") return "Supplier Quote";
  if (documentType === "generic_pricing_document") return "Pricing Import";
  return "Pricing Import";
}

function pricingDocumentDescription(documentType: unknown) {
  if (documentType === "supplier_invoice") return "Supplier invoice";
  if (documentType === "supplier_estimate") return "Supplier estimate";
  if (documentType === "supplier_quote") return "Supplier quote";
  if (documentType === "mozaik_material_list") return "Mozaik material list";
  return "Pricing document";
}

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function upsertAttachmentUpload(input: {
  req: Request;
  actor: LocalUser | null;
  relatedId: string;
  relatedType: string;
  originalName: string;
  safeName: string;
  mimeType: string;
  size: number;
  fileBuffer: Buffer;
  entityDirectory: string;
  source: string;
  metadata?: Record<string, unknown>;
}) {
  const {
    req,
    actor,
    relatedId,
    relatedType,
    originalName,
    safeName,
    mimeType,
    size,
    fileBuffer,
    entityDirectory,
    source,
    metadata = {},
  } = input;

  const requestSource = readRequestSource(req);
  const checksum = calculateChecksum(fileBuffer);
  const existingAttachment = findAttachmentByLogicalName(relatedType, relatedId, originalName);

  if (existingAttachment) {
    const currentVersion = Math.max(1, Number(existingAttachment.current_version || existingAttachment.version_count || 1));
    const existingVersions = ensureAttachmentVersionSnapshot(req, existingAttachment, actor, requestSource);
    const currentVersionRecord = existingVersions.find((version) => version.version_number === currentVersion) || null;
    const archivedVersionLocation = archiveAttachmentCurrentVersion(req, existingAttachment);

    if (currentVersionRecord && archivedVersionLocation) {
      updateAttachmentVersionRecord(currentVersionRecord.id, {
        relative_path: archivedVersionLocation.relativePath,
        url: archivedVersionLocation.url,
      });
    }

    const storedFilename = `${createFileId()}-${safeName}`;
    const absolutePath = path.join(entityDirectory, storedFilename);
    fs.writeFileSync(absolutePath, fileBuffer);

    const relativePath = path.relative(getFilesystemDirectory(), absolutePath).split(path.sep).join("/");
    const publicUrl = buildPublicFilesystemUrl(req, relativePath);
    const nextVersion = currentVersion + 1;
    const updatedAttachment = updateEntityRecord("Attachment", String(existingAttachment.id), {
      related_id: relatedId,
      related_type: relatedType,
      name: originalName,
      stored_name: storedFilename,
      mime_type: mimeType,
      size,
      relative_path: relativePath,
      url: publicUrl,
      checksum,
      source,
      ...metadata,
      current_version: nextVersion,
      version_count: Math.max(Number(existingAttachment.version_count || currentVersion), nextVersion),
      row_version: existingAttachment.row_version,
    }, {
      actor,
      request_source: requestSource,
      expected_row_version: existingAttachment.row_version,
    });

    if (!updatedAttachment) {
      throw new Error("Attachment update failed");
    }

    createAttachmentVersionRecord({
      ...buildCurrentAttachmentVersionPayload(req, updatedAttachment, actor),
      version_number: nextVersion,
      checksum,
      created_date: updatedAttachment.updated_date,
    });

    return updatedAttachment;
  }

  const storedFilename = `${createFileId()}-${safeName}`;
  const absolutePath = path.join(entityDirectory, storedFilename);
  fs.writeFileSync(absolutePath, fileBuffer);

  const relativePath = path.relative(getFilesystemDirectory(), absolutePath).split(path.sep).join("/");
  const publicUrl = buildPublicFilesystemUrl(req, relativePath);
  const attachment = createEntityRecord("Attachment", {
    related_id: relatedId,
    related_type: relatedType,
    name: originalName,
    stored_name: storedFilename,
    mime_type: mimeType,
    size,
    relative_path: relativePath,
    url: publicUrl,
    checksum,
    source,
    ...metadata,
    current_version: 1,
    version_count: 1,
  }, {
    actor,
    request_source: requestSource,
  });

  createAttachmentVersionRecord({
    ...buildCurrentAttachmentVersionPayload(req, attachment, actor),
    version_number: 1,
    checksum,
    created_date: attachment.created_date,
  });

  return attachment;
}

function ensureEntityUploadDirectory(entity: string, record: Record<string, unknown> | null) {
  const folderPath = getEntityUploadDirectory(entity, record);
  if (!folderPath) {
    return;
  }

  fs.mkdirSync(folderPath, { recursive: true });
}

function reconcileEntityUploadDirectory(
  entity: string,
  previousRecord: Record<string, unknown> | null,
  nextRecord: Record<string, unknown> | null
) {
  const nextDirectory = getEntityUploadDirectory(entity, nextRecord);
  if (!nextDirectory) {
    return;
  }

  const previousDirectory = getEntityUploadDirectory(entity, previousRecord);
  if (!previousDirectory || previousDirectory === nextDirectory) {
    fs.mkdirSync(nextDirectory, { recursive: true });
    return;
  }

  mergeDirectoryContents(previousDirectory, nextDirectory);
  remapAttachmentDirectoryRecords(entity, previousRecord, nextRecord);
  removeEmptyDirectories(previousDirectory);
}

function getEntityUploadDirectory(entity: string, record: Record<string, unknown> | null) {
  const relatedType = entity === "Job"
    ? "job"
    : entity === "Quote"
      ? "quote"
      : entity === "Contact"
        ? "contact"
        : entity === "Company"
          ? "company"
        : "";
  if (!relatedType || !record?.id) {
    return "";
  }

  const directoryName = resolveAttachmentDirectoryName(relatedType, String(record.id));
  return path.join(getFilesystemDirectory(), `${relatedType}s`, directoryName);
}

function mergeDirectoryContents(sourceDirectory: string, targetDirectory: string) {
  if (!fs.existsSync(sourceDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true });
    return;
  }

  fs.mkdirSync(targetDirectory, { recursive: true });

  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      mergeDirectoryContents(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const resolvedTargetPath = fs.existsSync(targetPath)
      ? path.join(targetDirectory, `${Date.now()}-${entry.name}`)
      : targetPath;
    fs.renameSync(sourcePath, resolvedTargetPath);
  }
}

function removeEmptyDirectories(directoryPath: string, preserveRoot = false) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirectories(path.join(directoryPath, entry.name));
    }
  }

  if (!preserveRoot && fs.readdirSync(directoryPath).length === 0) {
    fs.rmdirSync(directoryPath);
  }
}

function archiveAndMoveQuoteFiles(req: Request, quote: Record<string, unknown>, job: Record<string, unknown>, actor: LocalUser | null) {
  const quoteDirectory = getEntityUploadDirectory("Quote", quote);
  const jobDirectory = getEntityUploadDirectory("Job", job);

  if (!quoteDirectory || !jobDirectory) {
    return;
  }

  fs.mkdirSync(quoteDirectory, { recursive: true });
  fs.mkdirSync(jobDirectory, { recursive: true });

  const sourceFiles = listFilesRecursively(quoteDirectory);
  if (sourceFiles.length === 0) {
    return;
  }

  const quoteNumber = sanitisePathSegment(String(quote.quote_number || quote.id || "quote"));
  const archiveDate = formatLocalDate(new Date());
  const archiveName = `${quoteNumber}-${archiveDate}.zip`;
  const archiveOutputPath = path.join(quoteDirectory, archiveName);
  const archiveInputFiles = sourceFiles.filter((absolutePath) => path.resolve(absolutePath) !== path.resolve(archiveOutputPath));
  const movedFiles = new Map<string, string>();

  if (archiveInputFiles.length > 0) {
    const temporaryArchivePath = path.join(os.tmpdir(), `${createFileId()}-${archiveName}`);
    const relativeArchiveInputs = archiveInputFiles.map((absolutePath) => path.relative(quoteDirectory, absolutePath));

    execFileSync("zip", ["-q", "-r", temporaryArchivePath, "--", ...relativeArchiveInputs], {
      cwd: quoteDirectory,
      stdio: "ignore",
    });

    if (fs.existsSync(archiveOutputPath)) {
      fs.rmSync(archiveOutputPath, { force: true });
    }
    fs.renameSync(temporaryArchivePath, archiveOutputPath);

    const archiveStats = fs.statSync(archiveOutputPath);
    const archiveRelativePath = path.relative(getFilesystemDirectory(), archiveOutputPath).split(path.sep).join("/");
    const existingArchiveAttachment = findAttachmentByLogicalName("quote", String(quote.id || ""), archiveName);
    if (!existingArchiveAttachment) {
      const archiveAttachment = createEntityRecord("Attachment", {
        related_id: String(quote.id || ""),
        related_type: "quote",
        name: archiveName,
        stored_name: path.basename(archiveOutputPath),
        mime_type: "application/zip",
        size: archiveStats.size,
        relative_path: archiveRelativePath,
        url: buildPublicFilesystemUrl(req, archiveRelativePath),
        checksum: calculateChecksumForFile(archiveOutputPath),
        source: "quote-archive",
        current_version: 1,
        version_count: 1,
      }, {
        actor: actor || buildSystemActor("Quote Archive"),
        request_source: "quote-convert",
      });
      createAttachmentVersionRecord({
        ...buildCurrentAttachmentVersionPayload(req, archiveAttachment, actor || buildSystemActor("Quote Archive")),
        version_number: 1,
        checksum: String(archiveAttachment.checksum || ""),
        created_date: archiveAttachment.created_date,
      });
    }
  }

  for (const sourcePath of archiveInputFiles) {
    const relativePath = path.relative(quoteDirectory, sourcePath);
    const targetPath = path.join(jobDirectory, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const resolvedTargetPath = fs.existsSync(targetPath)
      ? path.join(path.dirname(targetPath), `${createFileId()}-${path.basename(targetPath)}`)
      : targetPath;
    fs.renameSync(sourcePath, resolvedTargetPath);
    movedFiles.set(
      path.relative(getFilesystemDirectory(), sourcePath).split(path.sep).join("/"),
      path.relative(getFilesystemDirectory(), resolvedTargetPath).split(path.sep).join("/")
    );
  }

  reassignQuoteAttachmentsToJob(req, quote, job, movedFiles, actor);
  removeEmptyDirectories(quoteDirectory, true);
}

function remapAttachmentDirectoryRecords(
  entity: string,
  previousRecord: Record<string, unknown> | null,
  nextRecord: Record<string, unknown> | null
) {
  const relatedType = entity === "Job" ? "job" : entity === "Quote" ? "quote" : "";
  if (!relatedType || !nextRecord?.id || !previousRecord?.id) {
    return;
  }

  const previousDirectoryName = resolveAttachmentDirectoryName(relatedType, String(previousRecord.id));
  const nextDirectoryName = resolveAttachmentDirectoryName(relatedType, String(nextRecord.id));

  if (!previousDirectoryName || !nextDirectoryName || previousDirectoryName === nextDirectoryName) {
    return;
  }

  const previousPrefix = `${relatedType}s/${previousDirectoryName}/`;
  const nextPrefix = `${relatedType}s/${nextDirectoryName}/`;
  const systemActor = buildSystemActor("Filesystem Reconcile");
  const attachments = listEntityRecords("Attachment", {
    filters: {
      related_id: String(nextRecord.id),
      related_type: relatedType,
    },
  });

  for (const attachment of attachments) {
    const currentRelativePath = String(attachment.relative_path || "");
    if (!currentRelativePath.startsWith(previousPrefix)) {
      continue;
    }

    const nextRelativePath = `${nextPrefix}${currentRelativePath.slice(previousPrefix.length)}`;
    const nextAbsolutePath = path.join(getFilesystemDirectory(), nextRelativePath);
    if (!fs.existsSync(nextAbsolutePath)) {
      continue;
    }

    const updatedAttachment = updateEntityRecord("Attachment", String(attachment.id), {
      relative_path: nextRelativePath,
      url: buildStaticFilesystemUrl(nextRelativePath),
      checksum: calculateChecksumForFile(nextAbsolutePath),
      row_version: attachment.row_version,
    }, {
      actor: systemActor,
      request_source: "filesystem-reconcile",
      expected_row_version: attachment.row_version,
    });

    if (!updatedAttachment) {
      continue;
    }

    const latestVersion = listAttachmentVersions(String(attachment.id)).find(
      (version) => version.version_number === Math.max(1, Number(updatedAttachment.current_version || 1))
    );
    if (latestVersion) {
      updateAttachmentVersionRecord(latestVersion.id, {
        relative_path: nextRelativePath,
        url: buildStaticFilesystemUrl(nextRelativePath),
        checksum: String(updatedAttachment.checksum || latestVersion.checksum || ""),
        related_id: String(nextRecord.id),
        related_type: relatedType,
      });
    }
  }
}

function reassignQuoteAttachmentsToJob(
  req: Request,
  quote: Record<string, unknown>,
  job: Record<string, unknown>,
  movedFiles: Map<string, string>,
  actor: LocalUser | null
) {
  const quoteAttachments = listEntityRecords("Attachment", {
    filters: {
      related_id: String(quote.id || ""),
      related_type: "quote",
    },
  });

  for (const attachment of quoteAttachments) {
    const currentRelativePath = String(attachment.relative_path || "");
    if (!movedFiles.has(currentRelativePath)) {
      continue;
    }

    const nextRelativePath = movedFiles.get(currentRelativePath) || currentRelativePath;
    const nextAbsolutePath = path.join(getFilesystemDirectory(), nextRelativePath);
    const updatedAttachment = updateEntityRecord("Attachment", String(attachment.id), {
      related_id: String(job.id || ""),
      related_type: "job",
      relative_path: nextRelativePath,
      url: buildPublicFilesystemUrl(req, nextRelativePath),
      checksum: fs.existsSync(nextAbsolutePath) ? calculateChecksumForFile(nextAbsolutePath) : String(attachment.checksum || ""),
      row_version: attachment.row_version,
    }, {
      actor: actor || buildSystemActor("Quote Conversion"),
      request_source: "quote-convert",
      expected_row_version: attachment.row_version,
    });

    if (!updatedAttachment) {
      continue;
    }

    const latestVersion = listAttachmentVersions(String(attachment.id)).find(
      (version) => version.version_number === Math.max(1, Number(updatedAttachment.current_version || 1))
    );
    if (latestVersion) {
      updateAttachmentVersionRecord(latestVersion.id, {
        related_id: String(job.id || ""),
        related_type: "job",
        relative_path: nextRelativePath,
        url: buildPublicFilesystemUrl(req, nextRelativePath),
      });
    }
  }
}

function syncFilesystemAttachments(req: Request, filters?: Record<string, unknown>) {
  const actor = buildSystemActor("Filesystem Sync");
  const requestSource = "filesystem-sync";
  const targetTypes = typeof filters?.related_type === "string"
    ? [String(filters.related_type)]
    : ["job", "quote", "contact", "company"];
  const targetRelatedId = typeof filters?.related_id === "string" ? String(filters.related_id) : "";
  const entityLookup = buildAttachmentEntityLookup();

  const attachmentRecords = listEntityRecords("Attachment");
  const recordsByPath = new Map(
    attachmentRecords
      .filter((record) => typeof record.relative_path === "string")
      .map((record) => [String(record.relative_path), record])
  );

  for (const record of attachmentRecords) {
    if (!targetTypes.includes(String(record.related_type || ""))) {
      continue;
    }

    if (targetRelatedId && String(record.related_id || "") !== targetRelatedId) {
      continue;
    }

    const relativePath = typeof record.relative_path === "string" ? record.relative_path : "";
    const absolutePath = relativePath ? path.join(getFilesystemDirectory(), relativePath) : "";

    if (!relativePath || !fs.existsSync(absolutePath)) {
      deleteEntityRecord("Attachment", record.id, {
        actor,
        request_source: requestSource,
      });
      recordsByPath.delete(relativePath);
    }
  }

  for (const relatedType of targetTypes) {
    const entityDirectory = path.join(getFilesystemDirectory(), `${relatedType}s`);
    if (!fs.existsSync(entityDirectory)) {
      continue;
    }

    const relatedDirectories = targetRelatedId
      ? [resolveAttachmentDirectoryName(relatedType, targetRelatedId)]
      : fs.readdirSync(entityDirectory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

    for (const directoryName of relatedDirectories) {
      const recordDirectory = path.join(entityDirectory, sanitisePathSegment(directoryName));
      if (!fs.existsSync(recordDirectory)) {
        continue;
      }

      const relatedId = resolveRelatedIdFromDirectoryName(relatedType, directoryName, entityLookup);
      if (!relatedId) {
        continue;
      }

      for (const absolutePath of listFilesRecursively(recordDirectory)) {
        const relativePath = path.relative(getFilesystemDirectory(), absolutePath).split(path.sep).join("/");
        const existingRecord = recordsByPath.get(relativePath);
        const stats = fs.statSync(absolutePath);
        const nextPayload = {
          related_id: relatedId,
          related_type: relatedType,
          name: String(existingRecord?.name || path.basename(absolutePath)),
          stored_name: path.basename(absolutePath),
          mime_type: String(existingRecord?.mime_type || guessMimeType(absolutePath)),
          size: stats.size,
          relative_path: relativePath,
          url: buildPublicFilesystemUrl(req, relativePath),
          source: String(existingRecord?.source || "filesystem"),
        };

        if (existingRecord) {
          const needsUpdate =
            existingRecord.related_id !== nextPayload.related_id ||
            existingRecord.related_type !== nextPayload.related_type ||
            existingRecord.stored_name !== nextPayload.stored_name ||
            existingRecord.mime_type !== nextPayload.mime_type ||
            existingRecord.size !== nextPayload.size ||
            existingRecord.url !== nextPayload.url;

          if (needsUpdate) {
            updateEntityRecord("Attachment", existingRecord.id, {
              ...nextPayload,
              updated_date: stats.mtime.toISOString(),
              row_version: existingRecord.row_version,
            }, {
              actor,
              request_source: requestSource,
              expected_row_version: existingRecord.row_version,
            });
          }

          ensureAttachmentVersionSnapshot(req, existingRecord, actor, requestSource);

          continue;
        }

        const created = createEntityRecord("Attachment", {
          ...nextPayload,
          created_date: stats.birthtime.toISOString(),
          updated_date: stats.mtime.toISOString(),
        }, {
          actor,
          request_source: requestSource,
        });
        ensureAttachmentVersionSnapshot(req, created, actor, requestSource);
        recordsByPath.set(relativePath, created);
      }
    }
  }
}

function buildAttachmentEntityLookup() {
  const jobs = listEntityRecords("Job");
  const quotes = listEntityRecords("Quote");
  const contacts = listEntityRecords("Contact");
  const companies = listEntityRecords("Company");

  return {
    jobById: new Map(jobs.map((record) => [String(record.id), record])),
    jobByDirectoryName: new Map(
      jobs
        .map((record) => [resolveAttachmentDirectoryName("job", String(record.id)), record])
    ),
    quoteById: new Map(quotes.map((record) => [String(record.id), record])),
    quoteByDirectoryName: new Map(
      quotes
        .map((record) => [resolveAttachmentDirectoryName("quote", String(record.id)), record])
    ),
    contactById: new Map(contacts.map((record) => [String(record.id), record])),
    contactByDirectoryName: new Map(
      contacts
        .map((record) => [resolveAttachmentDirectoryName("contact", String(record.id)), record])
    ),
    companyById: new Map(companies.map((record) => [String(record.id), record])),
    companyByDirectoryName: new Map(
      companies
        .map((record) => [resolveAttachmentDirectoryName("company", String(record.id)), record])
    ),
  };
}

function resolveAttachmentDirectoryName(relatedType: string, relatedId: string) {
  if (relatedType === "job") {
    const job = getEntityRecord("Job", relatedId);
    const jobNumber = String(job?.job_number || "").trim();
    if (jobNumber) {
      return sanitisePathSegment(jobNumber);
    }
  }

  if (relatedType === "quote") {
    const quote = getEntityRecord("Quote", relatedId);
    const quoteNumber = String(quote?.quote_number || "").trim();
    if (quoteNumber) {
      return sanitisePathSegment(quoteNumber);
    }
  }

  if (relatedType === "contact") {
    return sanitisePathSegment(relatedId);
  }

  if (relatedType === "company") {
    const company = getEntityRecord("Company", relatedId);
    const companyName = String(company?.name || "").trim();
    if (companyName) {
      return sanitisePathSegment(`${companyName}-${String(relatedId).slice(0, 8)}`);
    }
  }

  return sanitisePathSegment(relatedId);
}

function resolveRelatedIdFromDirectoryName(
  relatedType: string,
  directoryName: string,
  entityLookup: ReturnType<typeof buildAttachmentEntityLookup>
) {
  if (relatedType === "job") {
    const jobRecord = entityLookup.jobByDirectoryName.get(directoryName);
    return jobRecord ? String(jobRecord.id) : "";
  }

  if (relatedType === "quote") {
    const quoteRecord = entityLookup.quoteByDirectoryName.get(directoryName);
    return quoteRecord ? String(quoteRecord.id) : "";
  }

  if (relatedType === "contact") {
    const contactRecord = entityLookup.contactByDirectoryName.get(directoryName);
    return contactRecord ? String(contactRecord.id) : "";
  }

  if (relatedType === "company") {
    const companyRecord = entityLookup.companyByDirectoryName.get(directoryName);
    return companyRecord ? String(companyRecord.id) : "";
  }

  return directoryName;
}

function deleteAttachmentUpload(req: Request, attachment: Record<string, unknown>, actor: LocalUser | null) {
  const currentRelativePath = String(attachment.relative_path || "");
  const currentAbsolutePath = currentRelativePath ? path.join(getFilesystemDirectory(), currentRelativePath) : "";
  const versions = listAttachmentVersions(String(attachment.id || ""));

  if (currentAbsolutePath && fs.existsSync(currentAbsolutePath)) {
    fs.rmSync(currentAbsolutePath, { force: true });
    removeEmptyDirectories(path.dirname(currentAbsolutePath));
  }

  versions.forEach((version) => {
    const relativePath = String(version.relative_path || "");
    if (!relativePath) {
      return;
    }
    const absolutePath = path.join(getFilesystemDirectory(), relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { force: true });
      removeEmptyDirectories(path.dirname(absolutePath));
    }
  });

  const archiveDirectory = path.join(
    getFilesystemDirectory(),
    ".versions",
    `${String(attachment.related_type || "job")}s`,
    resolveAttachmentDirectoryName(String(attachment.related_type || "job"), String(attachment.related_id || "")),
    String(attachment.id || "")
  );
  if (fs.existsSync(archiveDirectory)) {
    fs.rmSync(archiveDirectory, { recursive: true, force: true });
    removeEmptyDirectories(path.dirname(archiveDirectory));
  }

  deleteAttachmentVersions(String(attachment.id || ""));
  deleteEntityRecord("Attachment", String(attachment.id || ""), {
    actor,
    request_source: readRequestSource(req),
    expected_row_version: typeof attachment.row_version === "number" ? attachment.row_version : undefined,
  });
}

function listFilesRecursively(directoryPath: string) {
  const discoveredFiles: string[] = [];

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      discoveredFiles.push(...listFilesRecursively(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      discoveredFiles.push(absolutePath);
    }
  }

  return discoveredFiles;
}

function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const knownMimeTypes: Record<string, string> = {
    ".avif": "image/avif",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".webp": "image/webp",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return knownMimeTypes[extension] || "application/octet-stream";
}

if (require.main === module) {
  if (String(process.env.JOINERFLOW_CONFIG_CHECK_ONLY || "").trim().toLowerCase() === "true") {
    void createApp()
      .then(() => {
        closeDatabase();
        process.exit(0);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    void startServer().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}

function parseFilters(rawFilters: unknown): Record<string, unknown> | undefined {
  if (typeof rawFilters !== "string" || rawFilters.trim() === "") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawFilters) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key))
    );
  } catch {
    return undefined;
  }
}

function parseLimit(rawLimit: unknown): number | undefined {
  if (typeof rawLimit !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(parsed, 1000);
}

function parseRowVersion(rawValue: unknown, options: { required?: boolean } = {}): number | undefined {
  if (rawValue == null) {
    if (options.required) {
      throw new RouteRequestError(400, "row_version_required", "row_version is required for this mutation.");
    }
    return undefined;
  }

  if (typeof rawValue !== "string" || !/^[1-9]\d*$/.test(rawValue.trim())) {
    throw new RouteRequestError(400, "invalid_row_version", "row_version must be a positive integer.");
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isSafeInteger(parsed)) {
    throw new RouteRequestError(400, "invalid_row_version", "row_version must be a positive integer.");
  }

  return parsed;
}

function validateEntityMutationMetadata(requestBody: Record<string, unknown>, options: { requireRowVersion?: boolean } = {}) {
  if (!Object.prototype.hasOwnProperty.call(requestBody, "row_version")) {
    if (options.requireRowVersion) {
      throw new RouteRequestError(400, "row_version_required", "row_version is required for this mutation.");
    }
    return undefined;
  }

  if (typeof requestBody.row_version !== "number" || !Number.isSafeInteger(requestBody.row_version) || requestBody.row_version <= 0) {
    throw new RouteRequestError(400, "invalid_entity_payload", "row_version must be a positive integer.");
  }

  return requestBody.row_version;
}

function readJsonObjectBody(rawBody: unknown) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new AuthError(400, "invalid_json_body", "Request body must be a JSON object.");
  }

  return rawBody as Record<string, unknown>;
}

function normalizeDateTime(value: unknown) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function roundHours(value: unknown) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function calculateTimeEntryHours(startValue: string, endValue: string, breakMinutes: unknown) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const rawHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const deductedHours = rawHours - (Number(breakMinutes) || 0) / 60;
  return roundHours(Math.max(0, deductedHours));
}

function normalizeTimeEntryStatus(value: unknown) {
  const normalized = String(value || "active").trim().toLowerCase();
  if (normalized === "complete") {
    return "completed";
  }

  return normalized === "completed" ? "completed" : "active";
}

function getTimeEntryComparableRange(record: Record<string, unknown>, nowValue = new Date()) {
  const clockIn = normalizeDateTime(record.clock_in);
  if (!clockIn) {
    return null;
  }

  const clockOut = normalizeDateTime(record.clock_out) || (normalizeTimeEntryStatus(record.status) === "active" ? nowValue.toISOString() : "");
  if (!clockOut) {
    return null;
  }

  const start = new Date(clockIn);
  const end = new Date(clockOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

function assertSingleActiveTimeEntry(candidate: Record<string, unknown>, excludeId = "") {
  if (normalizeTimeEntryStatus(candidate.status) !== "active") {
    return;
  }

  const staffId = String(candidate.staff_id || "").trim();
  if (!staffId) {
    return;
  }

  const conflicting = listEntityRecords("TimeEntry", { filters: { staff_id: staffId }, limit: 200 })
    .find((record) => record.id !== excludeId && normalizeTimeEntryStatus(record.status) === "active");

  if (conflicting) {
    throw new RouteRequestError(409, "active_time_entry_conflict", "This staff member already has an active time entry.");
  }
}

function assertTimeEntryDoesNotOverlap(candidate: Record<string, unknown>, excludeId = "") {
  if (normalizeTimeEntryStatus(candidate.status) === "active") {
    return;
  }

  const staffId = String(candidate.staff_id || "").trim();
  if (!staffId) {
    return;
  }

  const candidateRange = getTimeEntryComparableRange(candidate);
  if (!candidateRange || candidateRange.end <= candidateRange.start) {
    return;
  }

  const conflicting = listEntityRecords("TimeEntry", { filters: { staff_id: staffId }, limit: 1000 }).find((record) => {
    if (record.id === excludeId) {
      return false;
    }

    const range = getTimeEntryComparableRange(record);
    if (!range) {
      return false;
    }

    return candidateRange.start < range.end && candidateRange.end > range.start;
  });

  if (conflicting) {
    throw new RouteRequestError(409, "time_entry_overlap", "This time entry overlaps another recorded session for the same staff member.");
  }
}

function normalizeTimeEntryPayload(
  nextInput: Record<string, unknown>,
  previousRecord?: Record<string, unknown> | null
) {
  const nextRecord = { ...nextInput };
  const staffId = String(nextRecord.staff_id ?? previousRecord?.staff_id ?? "").trim();
  if (!staffId) {
    throw new RouteRequestError(400, "invalid_time_entry", "Staff member is required.");
  }

  nextRecord.staff_id = staffId;
  nextRecord.job_id = String(nextRecord.job_id ?? previousRecord?.job_id ?? "").trim();
  nextRecord.job_operation_id = String(nextRecord.job_operation_id ?? previousRecord?.job_operation_id ?? "").trim();
  nextRecord.job_operation_label = String(nextRecord.job_operation_label ?? previousRecord?.job_operation_label ?? "").trim().slice(0, 160);
  nextRecord.workflow_phase = String(nextRecord.workflow_phase ?? previousRecord?.workflow_phase ?? "").trim().slice(0, 80);
  nextRecord.activity = String(nextRecord.activity ?? previousRecord?.activity ?? "Labour").trim().slice(0, 120) || "Labour";
  nextRecord.description = String(nextRecord.description ?? previousRecord?.description ?? "").trim().slice(0, 2000);
  nextRecord.notes = String(nextRecord.notes ?? nextRecord.description ?? previousRecord?.notes ?? "").trim().slice(0, 2000);
  nextRecord.location_type = String(nextRecord.location_type ?? previousRecord?.location_type ?? "workshop").trim().slice(0, 40) || "workshop";
  nextRecord.session_group_id = String(nextRecord.session_group_id ?? previousRecord?.session_group_id ?? "").trim().slice(0, 160);
  nextRecord.manual_override = Boolean(nextRecord.manual_override ?? previousRecord?.manual_override ?? false);
  nextRecord.manual_reason = String(nextRecord.manual_reason ?? previousRecord?.manual_reason ?? "").trim().slice(0, 500);

  const breakMinutes = Number(nextRecord.break_minutes ?? previousRecord?.break_minutes ?? 0);
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) {
    throw new RouteRequestError(400, "invalid_time_entry", "Break minutes must be between 0 and 600.");
  }
  nextRecord.break_minutes = breakMinutes;

  const normalizedStatus = normalizeTimeEntryStatus(nextRecord.status ?? previousRecord?.status);
  nextRecord.status = normalizedStatus;

  const isBreak = Boolean(nextRecord.is_break ?? previousRecord?.is_break ?? false) || String(nextRecord.activity || "").trim().toLowerCase() === "break";
  nextRecord.is_break = isBreak;
  nextRecord.entry_kind = isBreak ? "break" : String(nextRecord.entry_kind ?? previousRecord?.entry_kind ?? "work").trim().toLowerCase().slice(0, 40) || "work";
  if (isBreak) {
    nextRecord.activity = "Break";
  }

  const normalizedClockIn = normalizeDateTime(nextRecord.clock_in ?? previousRecord?.clock_in);
  const normalizedClockOut = normalizeDateTime(nextRecord.clock_out ?? previousRecord?.clock_out);

  if (normalizedStatus === "active") {
    nextRecord.clock_in = normalizedClockIn || new Date().toISOString();
    nextRecord.clock_out = "";
    nextRecord.hours = 0;
  } else {
    if (normalizedClockIn && normalizedClockOut) {
      if (new Date(normalizedClockOut).getTime() <= new Date(normalizedClockIn).getTime()) {
        throw new RouteRequestError(400, "invalid_time_entry", "Finish time must be after start time.");
      }

      nextRecord.clock_in = normalizedClockIn;
      nextRecord.clock_out = normalizedClockOut;
      nextRecord.hours = calculateTimeEntryHours(normalizedClockIn, normalizedClockOut, breakMinutes);
    } else {
      const parsedHours = Number(nextRecord.hours ?? previousRecord?.hours ?? NaN);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
        throw new RouteRequestError(400, "invalid_time_entry", "Completed time entries need start and finish times or a positive number of hours.");
      }

      nextRecord.hours = roundHours(parsedHours);
      nextRecord.clock_in = normalizedClockIn;
      nextRecord.clock_out = normalizedClockOut;
    }
  }

  nextRecord.date = normalizeDateOnly(nextRecord.date ?? previousRecord?.date ?? nextRecord.clock_in ?? nextRecord.clock_out ?? new Date());
  if (!String(nextRecord.date || "").trim()) {
    throw new RouteRequestError(400, "invalid_time_entry", "A valid time entry date is required.");
  }

  const relatedStaff = getEntityRecord("Staff", staffId);
  nextRecord.staff_name = String(nextRecord.staff_name ?? relatedStaff?.name ?? previousRecord?.staff_name ?? "").trim().slice(0, 160);
  nextRecord.employee_id = String(nextRecord.employee_id ?? relatedStaff?.employee_id ?? previousRecord?.employee_id ?? "").trim().slice(0, 80);
  nextRecord.hourly_rate = Number(nextRecord.hourly_rate ?? relatedStaff?.hourly_rate ?? previousRecord?.hourly_rate ?? 0) || 0;

  const relatedJob = nextRecord.job_id ? getEntityRecord("Job", String(nextRecord.job_id)) : null;
  nextRecord.job_number = String(nextRecord.job_number ?? relatedJob?.job_number ?? previousRecord?.job_number ?? "").trim().slice(0, 80);
  nextRecord.job_name = String(nextRecord.job_name ?? relatedJob?.title ?? relatedJob?.job_name ?? previousRecord?.job_name ?? "").trim().slice(0, 180);
  nextRecord.job_title = String(nextRecord.job_title ?? relatedJob?.title ?? relatedJob?.job_name ?? previousRecord?.job_title ?? "").trim().slice(0, 180);
  nextRecord.customer = String(nextRecord.customer ?? relatedJob?.contact_name ?? relatedJob?.company_name ?? previousRecord?.customer ?? "").trim().slice(0, 180);
  nextRecord.company_name = String(nextRecord.company_name ?? relatedJob?.company_name ?? previousRecord?.company_name ?? "").trim().slice(0, 180);

  const relatedOperation = nextRecord.job_operation_id ? getEntityRecord("JobOperation", String(nextRecord.job_operation_id)) : null;
  nextRecord.job_operation_label = String(nextRecord.job_operation_label ?? relatedOperation?.name ?? relatedOperation?.title ?? relatedOperation?.operation ?? previousRecord?.job_operation_label ?? "").trim().slice(0, 160);
  nextRecord.workflow_phase = String(nextRecord.workflow_phase ?? relatedOperation?.workflow_phase ?? previousRecord?.workflow_phase ?? "").trim().slice(0, 80);
  nextRecord.operation = String(nextRecord.operation ?? relatedOperation?.operation ?? previousRecord?.operation ?? "").trim().slice(0, 80);
  nextRecord.total_cost = roundHours(Number(nextRecord.hours || 0) * Number(nextRecord.hourly_rate || 0));

  assertSingleActiveTimeEntry(nextRecord, String(previousRecord?.id || ""));
  assertTimeEntryDoesNotOverlap(nextRecord, String(previousRecord?.id || ""));

  return nextRecord;
}

function normalizeClockInPayload(
  nextInput: Record<string, unknown>,
  previousRecord?: Record<string, unknown> | null
) {
  const nextRecord = { ...nextInput };
  const staffId = String(nextRecord.staff_id ?? previousRecord?.staff_id ?? "").trim();
  if (!staffId) {
    throw new RouteRequestError(400, "invalid_clock_in", "Staff member is required.");
  }

  nextRecord.staff_id = staffId;
  const relatedStaff = getEntityRecord("Staff", staffId);
  nextRecord.staff_name = String(nextRecord.staff_name ?? relatedStaff?.name ?? previousRecord?.staff_name ?? "").trim().slice(0, 160);
  nextRecord.date = normalizeDateOnly(nextRecord.date ?? previousRecord?.date ?? new Date());

  const clockIn = normalizeDateTime(nextRecord.clock_in_time ?? previousRecord?.clock_in_time);
  const clockOut = normalizeDateTime(nextRecord.clock_out_time ?? previousRecord?.clock_out_time);
  if (!clockIn) {
    throw new RouteRequestError(400, "invalid_clock_in", "Clock-in time is required.");
  }

  nextRecord.clock_in_time = clockIn;
  nextRecord.clock_out_time = clockOut;
  if (clockOut) {
    if (new Date(clockOut).getTime() <= new Date(clockIn).getTime()) {
      throw new RouteRequestError(400, "invalid_clock_in", "Clock-out time must be after clock-in time.");
    }

    nextRecord.total_hours = roundHours((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / (1000 * 60 * 60));
  } else {
    nextRecord.total_hours = 0;
    const conflicting = listEntityRecords("ClockIn", { filters: { staff_id: staffId }, limit: 200 })
      .find((record) => record.id !== String(previousRecord?.id || "") && !String(record.clock_out_time || "").trim());
    if (conflicting) {
      throw new RouteRequestError(409, "active_clock_in_conflict", "This staff member is already clocked in.");
    }
  }

  return nextRecord;
}

function syncJobOperationFromTimeEntries(jobOperationId: string, actor: LocalUser | null, requestSource: string) {
  const normalizedOperationId = String(jobOperationId || "").trim();
  if (!normalizedOperationId) {
    return;
  }

  const operation = getEntityRecord("JobOperation", normalizedOperationId);
  if (!operation) {
    return;
  }

  const linkedEntries = listEntityRecords("TimeEntry", { filters: { job_operation_id: normalizedOperationId }, limit: 2000 });
  const completedEntries = linkedEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) !== "active" && !Boolean(entry.is_break));
  const activeEntries = linkedEntries.filter((entry) => normalizeTimeEntryStatus(entry.status) === "active" && !Boolean(entry.is_break));

  const actualHours = roundHours(completedEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0));
  const actualStartDate = normalizeDateOnly(
    [...completedEntries, ...activeEntries]
      .map((entry) => String(entry.clock_in || entry.date || ""))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))[0] || operation.actual_start_date
  );

  let nextStatus = String(operation.status || "pending").trim().toLowerCase() || "pending";
  if (activeEntries.length > 0 || actualHours > 0) {
    if (nextStatus === "pending" || nextStatus === "ready") {
      nextStatus = "in_progress";
    }
  } else if (nextStatus === "in_progress") {
    nextStatus = "pending";
  }

  const updatedOperation = updateEntityRecord("JobOperation", normalizedOperationId, {
    actual_hours: actualHours,
    actual_start_date: actualStartDate,
    status: nextStatus,
  }, {
    actor,
    request_source: requestSource,
  });

  if (updatedOperation?.job_id) {
    reconcileJobWorkflowStatuses(String(updatedOperation.job_id), {
      actor,
      requestSource,
    });
  }
}

function syncTimeEntrySideEffects(
  previousRecord: Record<string, unknown> | null | undefined,
  nextRecord: Record<string, unknown> | null | undefined,
  actor: LocalUser | null,
  requestSource: string
) {
  const operationIds = new Set([
    String(previousRecord?.job_operation_id || "").trim(),
    String(nextRecord?.job_operation_id || "").trim(),
  ]);

  operationIds.forEach((operationId) => {
    if (operationId) {
      syncJobOperationFromTimeEntries(operationId, actor, requestSource);
    }
  });
}

function normalizeWorkflowStatus(value: unknown) {
  const normalizedValue = String(value || "pending").trim().toLowerCase();
  if (normalizedValue === "completed") {
    return "complete";
  }
  if (normalizedValue === "scheduled") {
    return "ready";
  }
  return normalizedValue || "pending";
}

function applyJobOperationLifecycleFields(
  nextInput: Record<string, unknown>,
  previousRecord?: Record<string, unknown> | null
) {
  const nextRecord = { ...nextInput };
  const staffRecords = listEntityRecords("Staff", { limit: 1000 });
  const assignedStaffIds = resolveAssignedStaffIds({
    ...previousRecord,
    ...nextRecord,
  }, staffRecords);
  nextRecord.assigned_staff_ids = assignedStaffIds;
  nextRecord.assigned_to = buildAssignedStaffDisplay(
    assignedStaffIds,
    staffRecords,
    String(nextRecord.assigned_to ?? previousRecord?.assigned_to ?? "")
  );
  const nextStatus = normalizeWorkflowStatus(nextRecord.status ?? previousRecord?.status);
  const hasActualStart = Object.prototype.hasOwnProperty.call(nextInput, "actual_start_date");
  const hasActualCompletion = Object.prototype.hasOwnProperty.call(nextInput, "actual_completion_date");

  const previousActualStartDate = normalizeDateOnly(previousRecord?.actual_start_date);
  const previousActualCompletionDate = normalizeDateOnly(previousRecord?.actual_completion_date);
  const requestedActualStartDate = normalizeDateOnly(nextRecord.actual_start_date);
  const requestedActualCompletionDate = normalizeDateOnly(nextRecord.actual_completion_date);
  const baselineStartDate = normalizeDateOnly(nextRecord.start_date ?? previousRecord?.start_date);
  const baselineFinishDate = normalizeDateOnly(nextRecord.end_date ?? previousRecord?.end_date);
  const today = normalizeDateOnly(new Date());

  if (!hasActualStart && previousActualStartDate) {
    nextRecord.actual_start_date = previousActualStartDate;
  } else if (hasActualStart) {
    nextRecord.actual_start_date = requestedActualStartDate;
  }

  if (!hasActualCompletion && previousActualCompletionDate) {
    nextRecord.actual_completion_date = previousActualCompletionDate;
  } else if (hasActualCompletion) {
    nextRecord.actual_completion_date = requestedActualCompletionDate;
  }

  if ((nextStatus === "in_progress" || nextStatus === "complete") && !String(nextRecord.actual_start_date || "").trim()) {
    nextRecord.actual_start_date = baselineStartDate || today;
  }

  if (nextStatus === "complete") {
    if (!String(nextRecord.actual_completion_date || "").trim()) {
      nextRecord.actual_completion_date = baselineFinishDate || today;
    }
  }

  return nextRecord;
}

function applyScheduleLaneLifecycleFields(
  nextInput: Record<string, unknown>,
  previousRecord?: Record<string, unknown> | null
) {
  const nextRecord = { ...nextInput };
  const staffRecords = listEntityRecords("Staff", { limit: 1000 });
  const relatedStaff = resolveLaneStaffRecord({
    ...previousRecord,
    ...nextRecord,
  }, staffRecords);

  nextRecord.staff_id = String(nextRecord.staff_id ?? relatedStaff?.id ?? previousRecord?.staff_id ?? "").trim();
  nextRecord.staff_name = String(nextRecord.staff_name ?? relatedStaff?.name ?? previousRecord?.staff_name ?? "").trim().slice(0, 160);

  return nextRecord;
}

function readRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function applySecurityHeaders(req: Request, res: Response) {
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }

  if (req.secure || String(req.header("x-forwarded-proto") || "").toLowerCase() === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function normalizeRemoteAddress(address: string | undefined) {
  if (!address) {
    return "";
  }

  if (address.startsWith("::ffff:")) {
    return address.slice(7);
  }

  const zoneIndex = address.indexOf("%");
  if (zoneIndex >= 0) {
    return address.slice(0, zoneIndex);
  }

  return address;
}

function isPrivateIpv4(address: string) {
  if (address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("169.254.")) {
    return true;
  }

  if (!address.startsWith("172.")) {
    return false;
  }

  const secondOctet = Number(address.split(".")[1] || -1);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLocalNetworkAddress(address: string) {
  const normalized = normalizeRemoteAddress(address);

  if (!normalized) {
    return false;
  }

  if (normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }

  if (normalized.includes(".")) {
    return isPrivateIpv4(normalized);
  }

  return normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

function isAllowedHost(hostname: string, allowedHosts: string[]) {
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  if (!normalizedHost) {
    return false;
  }

  if (allowedHosts.includes(normalizedHost)) {
    return true;
  }

  return normalizedHost === "localhost" || isLocalNetworkAddress(normalizedHost);
}

function isLocalOrigin(origin: string) {
  const raw = String(origin || "").trim();
  if (!raw) {
    return false;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "http:" && isAllowedHost(url.hostname, []);
  } catch {
    return false;
  }
}

function readAllowedOrigins() {
  return String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readAllowedHosts(allowedOrigins: string[]) {
  const explicitHosts = String(process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (explicitHosts.length > 0) {
    return explicitHosts;
  }

  const derivedOrigins = [
    String(process.env.PUBLIC_API_ORIGIN || "").trim(),
    ...allowedOrigins,
  ].filter(Boolean);

  const originHosts = derivedOrigins
    .map((origin) => {
      try {
        return new URL(origin).hostname.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  return [...new Set(originHosts)];
}

function readTrustProxyValue() {
  const rawValue = String(process.env.TRUST_PROXY || "").trim();
  if (!rawValue) {
    return false;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return rawValue;
}

function isAllowedMutationOrigin(req: Request, allowedOrigins: string[]) {
  if (!req.path.startsWith("/api/")) {
    return true;
  }

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) {
    return true;
  }

  const origin = String(req.header("origin") || "").trim();
  if (!origin) {
    const fetchSite = String(req.header("sec-fetch-site") || "").trim().toLowerCase();
    if (fetchSite) {
      return ["same-origin", "same-site", "none"].includes(fetchSite);
    }

    if (req.header("authorization") || isLocalKioskRequest(req)) {
      return true;
    }

    if (hasSessionCookie(req.header("cookie"))) {
      return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
    }

    return true;
  }

  if (allowedOrigins.length === 0) {
    if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
      return true;
    }

    return origin === readRequestOrigin(req);
  }

  return allowedOrigins.includes(origin);
}

function shouldUseSecureCookies(req: Request) {
  if (String(process.env.AUTH_SECURE_COOKIE || "").trim().toLowerCase() === "true") {
    return true;
  }

  return req.secure || String(req.header("x-forwarded-proto") || "").toLowerCase() === "https";
}

function ensureSecureAuthLoginContext(req: Request) {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv !== "production") {
    return;
  }

  if (!shouldUseSecureCookies(req)) {
    throw new AuthError(503, "https_required", "Secure sign-in requires HTTPS in production.");
  }
}

function requireJsonMutation(req: Request) {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return;
  }

  if (!req.is("application/json")) {
    throw new AuthError(415, "json_required", "Requests must use application/json.");
  }
}

function requireAuthenticatedApiUser(req: Request): LocalUser {
  return requireAuthenticatedUserFromToken(req.header("authorization"), req.header("cookie"));
}

function requireAdminApiUser(req: Request): LocalUser {
  return requireAdminUserFromToken(req.header("authorization"), req.header("cookie"));
}

function tryReadAuthenticatedUser(req: Request) {
  try {
    return requireAuthenticatedApiUser(req);
  } catch {
    return null;
  }
}

function readRequestSource(req: Request) {
  return String(req.header("x-crm-app") || "").trim().toLowerCase() || "crm";
}

function isTimeclockRequest(req: Request) {
  return readRequestSource(req) === "timeclock";
}

function isLocalKioskRequest(req: Request) {
  if (!isTimeclockRequest(req)) {
    return false;
  }

  const kioskKey = getConfiguredTimeclockKioskKey();
  const providedKey = String(req.header(TIMECLOCK_KIOSK_KEY_HEADER) || "").trim();
  if (kioskKey) {
    return safeConstantTimeCompare(providedKey, kioskKey);
  }

  return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production"
    && isLocalNetworkAddress(req.ip || "");
}

function authorizeEntityRequest(req: Request, entity: string, mode: "read" | "write") {
  const normalizedEntity = String(entity || "");
  const moduleKey = getEntityModuleKey(normalizedEntity);
  const timeclockReadEntities = new Set(["Staff", "Job", "JobOperation", "TimeEntry", "ClockIn"]);
  const timeclockWriteEntities = new Set(["TimeEntry", "ClockIn"]);
  const adminWriteEntities = new Set<string>();

  if (isLocalKioskRequest(req)) {
    if (mode === "read" && timeclockReadEntities.has(normalizedEntity)) {
      return;
    }

    if (mode === "write" && timeclockWriteEntities.has(normalizedEntity)) {
      return;
    }
  }

  if (mode === "write" && adminWriteEntities.has(normalizedEntity)) {
    requireAdminApiUser(req);
    if (moduleKey) {
      requireModuleEnabled(moduleKey);
    }
    return;
  }

  if (moduleKey) {
    requireModuleEnabled(moduleKey);
  }

  requireAuthenticatedApiUser(req);
}

function resolveMutationActor(req: Request): LocalUser | null {
  if (isLocalKioskRequest(req)) {
    return buildSystemActor("Time Clock Kiosk");
  }

  return requireAuthenticatedApiUser(req);
}

function createRateLimiter(max: number, windowMs: number): RateLimiter {
  return {
    buckets: new Map<string, RateLimitBucket>(),
    max,
    windowMs,
  };
}

function getRateLimitKey(req: Request) {
  const address = normalizeRemoteAddress(req.ip);
  const appKind = String(req.header("x-crm-app") || "").trim().toLowerCase() || "crm";
  return `${address || "unknown"}:${appKind}`;
}

function authorizeAttachmentRead(req: Request, attachment: Record<string, unknown>) {
  const relatedType = String(attachment.related_type || "").trim().toLowerCase();
  const entityName = relatedType === "job"
    ? "Job"
    : relatedType === "quote"
      ? "Quote"
      : relatedType === "contact"
        ? "Contact"
        : relatedType === "company"
          ? "Company"
          : "";
  if (!entityName) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }

  authorizeEntityRequest(req, entityName, "read");
}

function isProductionVisibleAttachment(attachment: Record<string, unknown>) {
  const visibility = String(attachment.production_visibility || attachment.visibility || "production").trim().toLowerCase();
  if (attachment.visible_to_production === false || attachment.management_only === true || attachment.internal_only === true) {
    return false;
  }
  return !["management", "management_only", "internal", "internal_only"].includes(visibility);
}

function isActiveTimeclockJob(job: Record<string, unknown>) {
  return !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").trim().toLowerCase());
}

function getActiveTimeclockJobScope() {
  const jobs = listEntityRecords("Job", { limit: 10000 }).filter(isActiveTimeclockJob);
  const jobIds = new Set(jobs.map((job) => String(job.id || "")).filter(Boolean));
  const quoteIds = new Set(jobs.map((job) => String(job.quote_id || "")).filter(Boolean));
  return { jobs, jobIds, quoteIds };
}

function isAttachmentLinkedToTimeclockScope(
  attachment: Record<string, unknown>,
  scope = getActiveTimeclockJobScope(),
) {
  const relatedType = String(attachment.related_type || "").trim().toLowerCase();
  const relatedId = String(attachment.related_id || "");
  const linkedJobId = String(attachment.job_id || attachment.source_job_id || "");
  const linkedQuoteId = String(attachment.quote_id || attachment.source_quote_id || "");

  return (relatedType === "job" && scope.jobIds.has(relatedId))
    || (relatedType === "quote" && scope.quoteIds.has(relatedId))
    || Boolean(linkedJobId && scope.jobIds.has(linkedJobId))
    || Boolean(linkedQuoteId && scope.quoteIds.has(linkedQuoteId));
}

function buildTimeclockHandoverData() {
  const scope = getActiveTimeclockJobScope();
  const quotes = listEntityRecords("Quote", { limit: 10000 })
    .filter((quote) => scope.quoteIds.has(String(quote.id || "")));
  const quoteItems = listEntityRecords("QuoteItem", { limit: 10000 })
    .filter((item) => scope.quoteIds.has(String(item.quote_id || "")));
  const jobOperations = listEntityRecords("JobOperation", { limit: 10000 })
    .filter((operation) => scope.jobIds.has(String(operation.job_id || "")));
  const siteMeasures = listEntityRecords("SiteMeasure", { limit: 10000 })
    .filter((measure) => scope.jobIds.has(String(measure.job_id || "")) || scope.quoteIds.has(String(measure.quote_id || "")));
  const attachments = listEntityRecords("Attachment", { limit: 10000 })
    .filter((attachment) => isProductionVisibleAttachment(attachment))
    .filter((attachment) => isAttachmentLinkedToTimeclockScope(attachment, scope));
  const activeEntries = listEntityRecords("TimeEntry", { filters: { status: "active" }, limit: 1000 })
    .filter((entry) => !entry.job_id || scope.jobIds.has(String(entry.job_id || "")));

  return {
    jobs: scope.jobs,
    quotes,
    quoteItems,
    jobOperations,
    siteMeasures,
    attachments,
    activeEntries,
  };
}

function authorizeProductionAttachmentRead(attachment: Record<string, unknown>) {
  const relatedType = String(attachment.related_type || "").trim().toLowerCase();
  if (!["job", "quote"].includes(relatedType)) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
  if (!isProductionVisibleAttachment(attachment)) {
    throw new AuthError(403, "attachment_hidden_from_production", "This file is not visible to production staff.");
  }
  if (!isAttachmentLinkedToTimeclockScope(attachment)) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
}

function resolveAttachmentAbsolutePath(attachment: Record<string, unknown>) {
  const relativePath = String(attachment.relative_path || "").replace(/\\/g, "/");
  if (!relativePath || relativePath.includes("\0")) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
  const root = path.resolve(getFilesystemDirectory());
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new AuthError(404, "attachment_file_missing", "Attachment file not found.");
  }
  return absolutePath;
}

function sendAttachmentContent(req: Request, res: Response, attachment: Record<string, unknown>, disposition: "inline" | "attachment") {
  const absolutePath = resolveAttachmentAbsolutePath(attachment);
  const fileName = normalizeAttachmentName(String(attachment.name || path.basename(absolutePath)));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:; sandbox; frame-ancestors 'self'; base-uri 'none'; object-src 'none'");
  res.setHeader("Content-Disposition", buildNamedContentDisposition(fileName, disposition));
  res.type(String(attachment.mime_type || guessMimeType(fileName) || "application/octet-stream"));
  res.sendFile(absolutePath);
  logAppEvent("production_attachment_viewed", {
    attachment_id: String(attachment.id || ""),
    related_id: String(attachment.related_id || ""),
    related_type: String(attachment.related_type || ""),
    request_source: readRequestSource(req),
  }, "filesystem");
}

function findAttachmentByRelativePath(relativePathValue: string) {
  const normalized = relativePathValue.replace(/\\/g, "/").replace(/^\/+/, "");
  const attachment = listEntityRecords("Attachment", { limit: 10000 }).find((record) => String(record.relative_path || "").replace(/\\/g, "/") === normalized);
  if (attachment) {
    return attachment;
  }
  const version = listAllAttachmentVersions().find((record) => String(record.relative_path || "").replace(/\\/g, "/") === normalized);
  if (!version?.attachment_id) {
    return null;
  }
  return getEntityRecord("Attachment", String(version.attachment_id));
}

function authorizeFilesystemStaticPath(req: Request) {
  const rawPath = String(req.path || "").replace(/^\/+/, "");
  let relativePath = "";
  try {
    relativePath = decodeURIComponent(rawPath);
  } catch {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
  if (!relativePath || relativePath.includes("\0") || relativePath.includes("..")) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
  const attachment = findAttachmentByRelativePath(relativePath);
  if (!attachment) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }
  authorizeAttachmentRead(req, attachment);
}

function authorizeAttachmentWrite(req: Request, attachment: Record<string, unknown>) {
  const relatedType = String(attachment.related_type || "").trim().toLowerCase();
  const entityName = relatedType === "job"
    ? "Job"
    : relatedType === "quote"
      ? "Quote"
      : relatedType === "contact"
        ? "Contact"
        : relatedType === "company"
          ? "Company"
          : "";
  if (!entityName) {
    throw new AuthError(404, "attachment_not_found", "Attachment not found.");
  }

  authorizeEntityRequest(req, entityName, "write");
}

function enforceRateLimit(
  req: Request,
  res: Response,
  next: express.NextFunction | undefined,
  limiter: RateLimiter
) {
  if (isTestModeEnabled()) {
    if (next) {
      next();
    }
    return true;
  }

  const now = Date.now();
  const key = getRateLimitKey(req);
  const current = limiter.buckets.get(key);

  if (!current || current.resetAt <= now) {
    limiter.buckets.set(key, {
      count: 1,
      resetAt: now + limiter.windowMs,
    });

    if (next) {
      next();
    }
    return true;
  }

  if (current.count >= limiter.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    logSecurityEvent("rate_limited", req, `limit=${limiter.max} window_ms=${limiter.windowMs}`);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
    return false;
  }

  current.count += 1;
  limiter.buckets.set(key, current);

  if (next) {
    next();
  }

  return true;
}

function logSecurityEvent(eventType: string, req: Request, detail: string) {
  const remoteAddress = normalizeRemoteAddress(req.ip || "");
  const method = req.method.toUpperCase();
  const pathValue = req.originalUrl || req.path || "";
  const payload = {
    timestamp: new Date().toISOString(),
    level: "warn",
    category: "security",
    event: eventType,
    ip: remoteAddress || "unknown",
    method,
    path: pathValue,
    detail,
  };

  appendStructuredLog(getSecurityLogPath(), payload);
  console.warn(`[security] ${eventType} ip=${remoteAddress || "unknown"} method=${method} path=${pathValue} ${detail}`.trim());
}

function handleRouteError(error: unknown, res: Response) {
  if (error instanceof RouteRequestError) {
    logAppEvent("route_request_error", {
      message: error.message,
      code: error.code,
      request_id: String(res.getHeader(REQUEST_ID_HEADER) || ""),
    }, "api", "warn");
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof EntityConflictError) {
    logAppEvent("entity_conflict", {
      message: error.message,
      code: error.code,
      record_id: error.current_record?.id || "",
    }, "api", "warn");
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      current_record: error.current_record,
    });
    return;
  }

  if (error instanceof AuthError) {
    logAppEvent("auth_error", {
      code: error.code,
      status: error.status,
      message: error.message,
      request_id: String(res.getHeader(REQUEST_ID_HEADER) || ""),
    }, "auth", "warn");
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof AiServiceError) {
    logAppEvent("ai_error", {
      code: error.code,
      status: error.status,
      message: error.message,
      request_id: error.requestId || String(res.getHeader(REQUEST_ID_HEADER) || ""),
    }, "ai", "warn");
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      request_id: error.requestId || String(res.getHeader(REQUEST_ID_HEADER) || ""),
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  logAppEvent("route_error", {
    message,
    request_id: String(res.getHeader(REQUEST_ID_HEADER) || ""),
  }, "api", "error");
  res.status(500).json({
    error: "An unexpected server error occurred.",
    code: "internal_error",
    request_id: String(res.getHeader(REQUEST_ID_HEADER) || ""),
  });
}

function parseBodyWithSchema<T>(rawBody: unknown, schema: z.ZodSchema<T>) {
  const result = schema.safeParse(readJsonObjectBody(rawBody));
  if (!result.success) {
    throw new AuthError(400, "invalid_request", result.error.issues[0]?.message || "Request validation failed.");
  }

  return result.data;
}

function validateEntityMutationPayload(
  entity: string,
  rawBody: unknown,
  previousRecord?: EntityRecord | null,
  options: { requireRowVersion?: boolean } = {}
) {
  const requestBody = readJsonObjectBody(rawBody);
  validateEntityMutationMetadata(requestBody, options);
  const schema = entityMutationSchemas[entity];
  if (!schema) {
    return requestBody;
  }

  const candidate = previousRecord ? { ...previousRecord, ...requestBody } : requestBody;
  const result = schema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    const detail = issue?.message || "Request validation failed.";
    throw new RouteRequestError(400, "invalid_entity_payload", detail);
  }

  return requestBody;
}

function assertInvoiceJobReference(
  requestBody: Record<string, unknown>,
  previousRecord?: EntityRecord | null
) {
  const jobId = requestBody.job_id ?? previousRecord?.job_id;
  if (typeof jobId !== "string" || !jobId.trim()) {
    return;
  }

  if (!getEntityRecord("Job", jobId.trim())) {
    throw new RouteRequestError(400, "invoice_job_not_found", "Invoice job_id must reference an existing job.");
  }
}

function assertPurchaseOrderJobReference(
  requestBody: Record<string, unknown>,
  previousRecord?: EntityRecord | null
) {
  const jobId = requestBody.job_id ?? previousRecord?.job_id;
  if (typeof jobId !== "string" || !jobId.trim()) {
    return;
  }

  if (!getEntityRecord("Job", jobId.trim())) {
    throw new RouteRequestError(400, "purchase_order_job_not_found", "Purchase order job_id must reference an existing job.");
  }
}

function assertPoItemPurchaseOrderReference(
  requestBody: Record<string, unknown>,
  previousRecord?: EntityRecord | null
) {
  const poId = requestBody.po_id ?? previousRecord?.po_id;
  if (typeof poId !== "string" || !poId.trim()) {
    return;
  }

  if (!getEntityRecord("PurchaseOrder", poId.trim())) {
    throw new RouteRequestError(400, "po_item_purchase_order_not_found", "PO item po_id must reference an existing purchase order.");
  }
}

function validateRuntimeConfiguration(
  allowedOrigins: string[],
  authConfig: ReturnType<typeof getAuthConfig>
) {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv !== "production") {
    return;
  }

  if (isTestModeEnabled()) {
    throw new Error("ENABLE_TEST_AUTH must be disabled in production.");
  }

  const publicOrigin = readConfiguredPublicOrigin();
  if (!publicOrigin.rawValue) {
    throw new Error("PUBLIC_API_ORIGIN must be configured in production.");
  }

  if (!publicOrigin.url) {
    throw new Error("PUBLIC_API_ORIGIN must be a valid absolute URL in production.");
  }

  if (publicOrigin.url.protocol !== "https:") {
    throw new Error("PUBLIC_API_ORIGIN must use https:// in production.");
  }

  if (!isOriginOnlyUrl(publicOrigin.url)) {
    throw new Error("PUBLIC_API_ORIGIN must be an origin only with no path, query, or hash in production.");
  }

  if (!authConfig.googleEnabled) {
    throw new Error("GOOGLE_CLIENT_ID must be configured in production.");
  }

  if (!/\.apps\.googleusercontent\.com$/i.test(String(authConfig.googleClientId || ""))) {
    throw new Error("GOOGLE_CLIENT_ID must be a Google web client ID ending in .apps.googleusercontent.com.");
  }

  if (!authConfig.sessionSecretConfigured) {
    throw new Error("AUTH_SESSION_SECRET must be configured in production.");
  }

  const invalidCorsOrigins = allowedOrigins.filter((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol !== "https:" || !isOriginOnlyUrl(url);
    } catch {
      return true;
    }
  });
  if (invalidCorsOrigins.length > 0) {
    throw new Error("CORS_ORIGIN entries must be valid https:// origins with no path, query, or hash in production.");
  }

  if (allowedOrigins.length > 0 && !allowedOrigins.includes(publicOrigin.origin)) {
    throw new Error("CORS_ORIGIN must include PUBLIC_API_ORIGIN when CORS_ORIGIN is configured.");
  }

  if (!authConfig.signInEnabled && authConfig.issues.includes("missing_bootstrap_admins")) {
    throw new Error("Configure AUTH_BOOTSTRAP_ADMIN_EMAILS or create an invited AppUser before starting in production.");
  }

  const sqlitePath = readConfiguredStoragePathInfo("SQLITE_PATH", DEFAULT_SQLITE_PATH);
  if (!sqlitePath.explicitlyConfigured) {
    throw new Error("SQLITE_PATH must be configured explicitly in production.");
  }

  const filesystemRoot = readConfiguredStoragePathInfo("FILESYSTEM_ROOT", DEFAULT_FILESYSTEM_DIRECTORY);
  if (!filesystemRoot.explicitlyConfigured) {
    throw new Error("FILESYSTEM_ROOT must be configured explicitly in production.");
  }

  emitProductionPathWarning("SQLITE_PATH", sqlitePath.resolvedPath, DEFAULT_SQLITE_PATH);
  emitProductionPathWarning("FILESYSTEM_ROOT", filesystemRoot.resolvedPath, DEFAULT_FILESYSTEM_DIRECTORY);
}

function readRequestOrigin(req: Request) {
  return `${req.protocol}://${req.get("host")}`;
}

function getConfiguredTimeclockKioskKey() {
  return String(process.env.TIMECLOCK_KIOSK_KEY || "").trim();
}

function safeConstantTimeCompare(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
