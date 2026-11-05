import { SITE_ADAPTERS } from "@axiomchess/adapters"
import { Hono } from "hono"

import { authMiddleware } from "./auth/middleware.js"
import type { ApiKeyVerifier, AuthVariables } from "./auth/types.js"
import { ApiError, toErrorBody } from "./errors.js"
import {
  requestIdMiddleware,
  type RequestIdVariables,
} from "./http/request-id.js"
import {
  createAnalysisQueue,
  createInProcessAnalysisQueue,
  type AnalysisJobQueue,
} from "./queue/index.js"
import {
  createRateLimiter,
  type RateLimiter,
  type RateLimiterHandle,
} from "./rate-limit/index.js"
import { createAnalysesRoutes } from "./routes/analyses.js"
import { createAnalyzeRoutes } from "./routes/analyze.js"
import { createOpenApiRoutes } from "./routes/openapi.js"
import { createSitesRoutes } from "./routes/sites.js"
import {
  createLibraryGameAnalyzer,
  type GameAnalyzer,
} from "./services/game-analyzer.js"
import { createIngestService, type IngestService } from "./services/ingest.js"
import { createAnalysisJobHandler } from "./services/jobs.js"
import { createMemoryAnalysisStore } from "./store/memory.js"
import type { AnalysisStore } from "./store/types.js"
import type { SiteAdapterRegistry } from "./services/ingest.js"

export type HealthResponse = {
  status: "ok"
  service: "axiomchess-api"
  apiVersion: "v1"
}

export type CreateAppOptions = {
  store?: AnalysisStore
  queue?: AnalysisJobQueue
  analyzer?: GameAnalyzer
  ingest?: IngestService
  adapters?: SiteAdapterRegistry
  retentionDays?: number
  redisUrl?: string | null
  apiKeyVerifier?: ApiKeyVerifier | null
  rateLimiter?: RateLimiter
  /**
   * When true, builds an in-process queue wired to the analyzer.
   * Ignored when `queue` is provided.
   */
  startWorkers?: boolean
}

type AppVariables = RequestIdVariables & AuthVariables

export type AppInstance = Hono<{ Variables: AppVariables }> & {
  queue: AnalysisJobQueue
  store: AnalysisStore
  rateLimiterHandle: RateLimiterHandle
}

export const createApp = async (
  options: CreateAppOptions = {},
): Promise<AppInstance> => {
  const store = options.store ?? createMemoryAnalysisStore()
  const analyzer = options.analyzer ?? createLibraryGameAnalyzer()
  const adapters = options.adapters ?? SITE_ADAPTERS
  const ingest = options.ingest ?? createIngestService(adapters)
  const retentionDays = options.retentionDays ?? 30

  const handler = createAnalysisJobHandler({ store, analyzer })

  const queue =
    options.queue ??
    (options.startWorkers === false
      ? createInProcessAnalysisQueue(handler)
      : await createAnalysisQueue({
          handler,
          redisUrl: options.redisUrl ?? null,
        }))

  const rateLimiterHandle: RateLimiterHandle =
    options.rateLimiter !== undefined
      ? {
          limiter: options.rateLimiter,
          backend: "memory",
          close: async () => undefined,
        }
      : await createRateLimiter({
          redisUrl: options.redisUrl ?? null,
        })

  const rateLimiter = rateLimiterHandle.limiter

  const app = new Hono<{ Variables: AppVariables }>()
  app.use("*", requestIdMiddleware())
  app.use(
    "*",
    authMiddleware({
      verifier: options.apiKeyVerifier ?? null,
    }),
  )

  app.get("/v1/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: "axiomchess-api",
      apiVersion: "v1",
    }
    return c.json(body)
  })

  app.route("/", createOpenApiRoutes())
  app.route("/", createSitesRoutes())
  app.route(
    "/",
    createAnalyzeRoutes({
      store,
      queue,
      ingest,
      retentionDays,
      rateLimiter,
    }),
  )
  app.route("/", createAnalysesRoutes(store))

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? "unknown"
    if (error instanceof ApiError) {
      return c.json(
        toErrorBody(error, requestId),
        error.status as 400 | 401 | 404 | 429 | 500,
      )
    }
    const wrapped = new ApiError({
      code: "internal_error",
      message: "Internal server error",
      status: 500,
    })
    return c.json(toErrorBody(wrapped, requestId), 500)
  })

  const instance = app as AppInstance
  instance.queue = queue
  instance.store = store
  instance.rateLimiterHandle = rateLimiterHandle
  return instance
}
