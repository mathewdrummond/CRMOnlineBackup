import type { Express, Request, Response } from "express";
import { z } from "zod";
import { generateStructured } from "../ai/aiClient";
import { buildAiDiagnostics } from "../ai/aiDiagnostics";
import { checkAiHealth } from "../ai/aiHealth";
import { buildJsonOnlyPrompt } from "../ai/promptTemplates";
import { aiTestResponseSchema } from "../ai/structuredOutput";
import { getIndexStats } from "../ai/embeddings/embeddingIndex";
import { processEmbeddingQueue } from "../ai/embeddings/embeddingQueue";
import { findSimilarEntity, semanticSearch, semanticSearchSchema } from "../ai/embeddings/semanticSearch";
import { getVectorStoreDiagnostics, processVectorSyncQueue } from "../ai/vectorStore";
import {
  createKnowledgeSource,
  deleteKnowledgeSource,
  getKnowledgeSource,
  getKnowledgeStats,
  listKnowledgeQueueSummary,
  listKnowledgeSources,
  updateKnowledgeSource,
} from "../ai/knowledge/chunkStorage";
import {
  isKnowledgeQueuePaused,
  processKnowledgeQueueBatch,
  scheduleKnowledgeQueue,
  setKnowledgeQueuePaused,
  triggerKnowledgeReindex,
} from "../ai/knowledge/indexingQueue";
import { browseKnowledgeFolders, listKnowledgeBrowserRoots } from "../ai/knowledge/folderBrowser";
import { ensureKnowledgePathAllowed } from "../ai/knowledge/knowledgePermissions";
import { knowledgeSearchSchema, searchKnowledge } from "../ai/knowledge/retrievalEngine";
import { runUnifiedSearch } from "../search/unifiedSearch";
import { unifiedSearchSchema } from "../search/searchContext";
import {
  getQuoteInsights,
  getQuoteRiskAnalysis,
  getSimilarHistoricalJobs,
} from "../ai/historicalJobIntelligence";
import { AiDocumentDraftKind, generateAiDocumentDraft } from "../ai/documents/documentDraftGenerator";
import { getModuleConfig } from "../appModules";
import { getEntityRecord, listEntityRecords } from "../db";
import { RouteRequestError } from "../routeError";
import type { LocalUser } from "../types";

const documentDraftRequestSchema = z.object({
  kind: z.enum(["quote_summary", "variation_draft", "install_update", "workshop_handover", "procurement_summary", "client_communication"]),
  quote_id: z.string().trim().min(1).max(128).optional(),
  job_id: z.string().trim().min(1).max(128).optional(),
  audience: z.string().trim().max(120).optional(),
}).strict();

const aiTestRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000).optional(),
}).strict();

const similarJobsRequestSchema = z.object({
  job_id: z.string().trim().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(25).optional(),
}).strict();

const similarQuotesRequestSchema = z.object({
  quote_id: z.string().trim().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(25).optional(),
}).strict();

const knowledgeSourceCreateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  root_path: z.string().trim().min(1).max(600),
  enabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  allowed_extensions: z.array(z.string().trim().min(1).max(20)).max(40).optional(),
  excluded_patterns: z.array(z.string().trim().min(1).max(260)).max(200).optional(),
  max_file_size_bytes: z.coerce.number().int().min(256 * 1024).max(250 * 1024 * 1024).optional(),
  chunk_size: z.coerce.number().int().min(300).max(5000).optional(),
  chunk_overlap: z.coerce.number().int().min(0).max(1000).optional(),
  scan_interval_minutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
}).strict();

const knowledgeSourceUpdateSchema = knowledgeSourceCreateSchema.partial();

const knowledgeReindexSchema = z.object({
  source_id: z.string().trim().min(1).max(120).optional(),
}).strict();

const knowledgePauseSchema = z.object({
  paused: z.boolean(),
}).strict();

const knowledgeBrowseQuerySchema = z.object({
  path: z.string().trim().min(1).max(600),
  query: z.string().trim().max(120).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
}).strict();

export type AiRouteRegistrationContext = {
  enforceAiRateLimit: (req: Request, res: Response) => boolean;
  enforceMutationRateLimit: (req: Request, res: Response) => boolean;
  requireJsonMutation: (req: Request) => void;
  requireAuthenticatedApiUser: (req: Request) => LocalUser;
  requireAdminApiUser: (req: Request) => LocalUser;
  parseBodyWithSchema: <T>(rawBody: unknown, schema: z.ZodSchema<T>) => T;
  readRouteParam: (value: string | string[]) => string;
  handleRouteError: (error: unknown, res: Response) => void;
  requestIdHeader: string;
};

export function registerAiRoutes(app: Express, context: AiRouteRegistrationContext) {
  app.get("/api/ai/health", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      const health = await checkAiHealth();
      res.status(health.status === "offline" ? 503 : 200).json({
        ...health,
        diagnostics: buildAiDiagnostics(),
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/document-drafts", (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAuthenticatedApiUser(req);
      const body = context.parseBodyWithSchema(req.body, documentDraftRequestSchema);
      if (!body.quote_id && !body.job_id) {
        throw new RouteRequestError(400, "document_context_required", "Provide a quote_id or job_id.");
      }

      const quote = body.quote_id ? getEntityRecord("Quote", body.quote_id) : null;
      const job = body.job_id
        ? getEntityRecord("Job", body.job_id)
        : quote
          ? listEntityRecords("Job", { filters: { quote_id: quote.id }, limit: 1 })[0] || null
          : null;
      if (body.quote_id && !quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
      if (body.job_id && !job) throw new RouteRequestError(404, "job_not_found", "Job was not found.");

      const quoteId = String(quote?.id || body.quote_id || "");
      const jobId = String(job?.id || body.job_id || "");
      const draft = generateAiDocumentDraft(body.kind as AiDocumentDraftKind, {
        quote,
        job,
        quoteItems: quoteId ? listEntityRecords("QuoteItem", { filters: { quote_id: quoteId }, sort: "sort_order", limit: 1000 }) : [],
        jobOperations: jobId
          ? listEntityRecords("JobOperation", { filters: { job_id: jobId }, sort: "sort_order", limit: 1000 })
          : quoteId
            ? listEntityRecords("JobOperation", { filters: { quote_id: quoteId }, sort: "sort_order", limit: 1000 })
            : [],
        pricingItems: quoteId ? listEntityRecords("PricingQuoteItem", { filters: { quote_id: quoteId }, sort: "sort_order", limit: 1000 }) : [],
        siteMeasures: quoteId ? listEntityRecords("SiteMeasure", { filters: { quote_id: quoteId }, sort: "-measure_date", limit: 50 }) : [],
        purchaseOrders: jobId ? listEntityRecords("PurchaseOrder", { filters: { job_id: jobId }, sort: "-updated_date", limit: 100 }) : [],
        notes: [
          ...listEntityRecords("Note", { filters: { related_id: quoteId }, sort: "-created_date", limit: 20 }),
          ...listEntityRecords("Note", { filters: { related_id: jobId }, sort: "-created_date", limit: 20 }),
        ],
        audience: body.audience,
      });
      res.json({
        draft,
        review_required: true,
        auto_commit: false,
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/test", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAdminApiUser(req);
      const body = context.parseBodyWithSchema(req.body, aiTestRequestSchema);
      const result = await generateStructured({
        modelRole: "fast",
        requestId: String(res.getHeader(context.requestIdHeader) || ""),
        prompt: buildJsonOnlyPrompt(
          "Return a short diagnostic response confirming the local AI service can produce structured JSON.",
          "{ ok: boolean, summary: string, recommended_next_step: string }",
          {
            prompt: body.prompt || "JoinerFlow AI infrastructure test",
            safety_rule: "Do not mutate business records.",
          }
        ),
        schema: aiTestResponseSchema,
        schemaName: "AiTestResponse",
      });
      res.json({
        ok: true,
        request_id: result.requestId,
        model: result.model,
        duration_ms: result.durationMs,
        prompt_tokens_estimate: result.promptTokensEstimate,
        response_tokens_estimate: result.responseTokensEstimate,
        data: result.data,
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/search", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAuthenticatedApiUser(req);
      const body = context.parseBodyWithSchema(req.body, semanticSearchSchema);
      await processEmbeddingQueue({ maxItems: 100 });
      const result = await semanticSearch(body);
      res.json({
        ...result,
        index: getIndexStats(),
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/search/unified", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      const user = context.requireAuthenticatedApiUser(req);
      const body = context.parseBodyWithSchema(req.body, unifiedSearchSchema);
      const requestId = String(res.getHeader(context.requestIdHeader) || "");
      res.json(await runUnifiedSearch(body, { user, requestId }));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/similar-jobs", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAuthenticatedApiUser(req);
      const body = context.parseBodyWithSchema(req.body, similarJobsRequestSchema);
      await processEmbeddingQueue({ maxItems: 100 });
      res.json(await findSimilarEntity("Job", body.job_id, body.limit || 8));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/similar-quotes", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAuthenticatedApiUser(req);
      const body = context.parseBodyWithSchema(req.body, similarQuotesRequestSchema);
      await processEmbeddingQueue({ maxItems: 100 });
      res.json(await findSimilarEntity("Quote", body.quote_id, body.limit || 8));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/quote-insights/:quoteId", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAuthenticatedApiUser(req);
      const quoteId = context.readRouteParam(req.params.quoteId);
      const quote = getEntityRecord("Quote", quoteId);
      if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
      await processEmbeddingQueue({ maxItems: 120 });
      res.json(await getQuoteInsights(quoteId));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/quote-risk-analysis/:quoteId", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAuthenticatedApiUser(req);
      const quoteId = context.readRouteParam(req.params.quoteId);
      const quote = getEntityRecord("Quote", quoteId);
      if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
      await processEmbeddingQueue({ maxItems: 120 });
      res.json(await getQuoteRiskAnalysis(quoteId));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/similar-historical-jobs/:quoteId", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAuthenticatedApiUser(req);
      const quoteId = context.readRouteParam(req.params.quoteId);
      const quote = getEntityRecord("Quote", quoteId);
      if (!quote) throw new RouteRequestError(404, "quote_not_found", "Quote was not found.");
      const limit = Math.max(1, Math.min(12, Number.parseInt(String(req.query.limit || "8"), 10) || 8));
      await processEmbeddingQueue({ maxItems: 120 });
      res.json(await getSimilarHistoricalJobs(quoteId, limit));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/knowledge/sources", (req: Request, res: Response) => {
    try {
      context.requireAdminApiUser(req);
      const stats = getKnowledgeStats();
      const bySource = new Map((stats.by_source || []).map((entry) => [entry.source_id, entry]));
      const sources = listKnowledgeSources().map((source) => ({
        ...source,
        stats: bySource.get(source.id) || {
          source_id: source.id,
          file_count: 0,
          chunk_count: 0,
          embedding_count: 0,
          total_bytes: 0,
          latest_indexed_date: null,
        },
      }));
      res.json({
        sources,
        queue: listKnowledgeQueueSummary(),
        paused: isKnowledgeQueuePaused(),
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/knowledge/roots", (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      res.json({
        roots: listKnowledgeBrowserRoots(),
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/knowledge/browse", (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      const query = context.parseBodyWithSchema(req.query, knowledgeBrowseQuerySchema);
      res.json(browseKnowledgeFolders(query));
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/knowledge/sources", (req: Request, res: Response) => {
    try {
      if (!context.enforceMutationRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAdminApiUser(req);
      const body = context.parseBodyWithSchema(req.body, knowledgeSourceCreateSchema);
      const rootPath = ensureKnowledgePathAllowed(body.root_path);
      if (listKnowledgeSources().some((source) => source.root_path === rootPath)) {
        throw new RouteRequestError(409, "knowledge_source_duplicate_path", "This folder is already configured for indexing.");
      }
      const created = createKnowledgeSource({
        ...body,
        root_path: rootPath,
      });
      if (!created) {
        throw new RouteRequestError(500, "knowledge_source_create_failed", "Knowledge source could not be created.");
      }
      triggerKnowledgeReindex(created.id);
      res.status(201).json(created);
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.put("/api/ai/knowledge/sources/:sourceId", (req: Request, res: Response) => {
    try {
      if (!context.enforceMutationRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAdminApiUser(req);
      const sourceId = context.readRouteParam(req.params.sourceId);
      const body = context.parseBodyWithSchema(req.body, knowledgeSourceUpdateSchema);
      const rootPath = body.root_path ? ensureKnowledgePathAllowed(body.root_path) : undefined;
      if (rootPath && listKnowledgeSources().some((source) => source.id !== sourceId && source.root_path === rootPath)) {
        throw new RouteRequestError(409, "knowledge_source_duplicate_path", "This folder is already configured for indexing.");
      }
      const patch = {
        ...body,
        root_path: rootPath,
      };
      const updated = updateKnowledgeSource(sourceId, patch);
      if (!updated) {
        throw new RouteRequestError(404, "knowledge_source_not_found", "Knowledge source was not found.");
      }
      if (body.enabled === true && body.paused !== true) {
        triggerKnowledgeReindex(updated.id);
      }
      res.json(updated);
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.delete("/api/ai/knowledge/sources/:sourceId", (req: Request, res: Response) => {
    try {
      if (!context.enforceMutationRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      const sourceId = context.readRouteParam(req.params.sourceId);
      if (!getKnowledgeSource(sourceId)) {
        throw new RouteRequestError(404, "knowledge_source_not_found", "Knowledge source was not found.");
      }
      deleteKnowledgeSource(sourceId);
      res.status(204).send();
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/knowledge/reindex", (req: Request, res: Response) => {
    try {
      if (!context.enforceMutationRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAdminApiUser(req);
      const body = context.parseBodyWithSchema(req.body, knowledgeReindexSchema);
      if (body.source_id) {
        if (!getKnowledgeSource(body.source_id)) {
          throw new RouteRequestError(404, "knowledge_source_not_found", "Knowledge source was not found.");
        }
        triggerKnowledgeReindex(body.source_id);
      } else {
        listKnowledgeSources()
          .filter((source) => source.enabled)
          .filter((source) => !source.paused)
          .forEach((source) => triggerKnowledgeReindex(source.id));
      }
      res.status(202).json({
        queued: true,
        source_id: body.source_id || "",
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/knowledge/search", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      const user = context.requireAuthenticatedApiUser(req);
      const body = context.parseBodyWithSchema(req.body, knowledgeSearchSchema);
      await processKnowledgeQueueBatch({ maxItems: 8 });
      const moduleConfig = getModuleConfig();
      const enabledModules = new Set(
        Object.entries(moduleConfig?.enabled || {})
          .filter(([, enabled]) => enabled === true)
          .map(([moduleKey]) => moduleKey)
      );
      const result = await searchKnowledge(body, {
        user,
        enabledModules,
      });
      res.json(result);
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/knowledge/status", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      const queue = await processKnowledgeQueueBatch({ maxItems: 1 });
      res.json({
        paused: isKnowledgeQueuePaused(),
        queue,
        sources: listKnowledgeSources().map((source) => ({
          id: source.id,
          label: source.label,
          enabled: source.enabled,
          paused: source.paused,
          last_indexed_date: source.last_indexed_date,
          last_error: source.last_error,
        })),
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/vector/status", async (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      const queue = await processVectorSyncQueue({ maxItems: 25 });
      res.json({
        backend: getVectorStoreDiagnostics(),
        queue,
      });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.get("/api/ai/knowledge/stats", (req: Request, res: Response) => {
    try {
      if (!context.enforceAiRateLimit(req, res)) return;
      context.requireAdminApiUser(req);
      res.json(getKnowledgeStats());
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });

  app.post("/api/ai/knowledge/pause", (req: Request, res: Response) => {
    try {
      if (!context.enforceMutationRateLimit(req, res)) return;
      context.requireJsonMutation(req);
      context.requireAdminApiUser(req);
      const body = context.parseBodyWithSchema(req.body, knowledgePauseSchema);
      setKnowledgeQueuePaused(body.paused);
      if (!body.paused) {
        scheduleKnowledgeQueue(250);
      }
      res.json({ paused: isKnowledgeQueuePaused() });
    } catch (error) {
      context.handleRouteError(error, res);
    }
  });
}
