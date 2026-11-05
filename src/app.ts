import { SITE_ADAPTERS } from "@axiomchess/adapters"
import { Hono } from "hono"

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
import { createAnalysesRoutes } from "./routes/analyses.js"
import { createAnalyzeRoutes } from "./routes/analyze.js"
import { createOpenApiRoutes } from "./routes/openapi.js"
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
  /**
   * When true, builds an in-process queue wired to the analyzer.
   * Ignored when `queue` is provided.
   */
  startWorkers?: boolean
}

export type AppInstance = Hono<{ Variables: RequestIdVariables }> & {
  queue: AnalysisJobQueue
  store: AnalysisStore
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

  const app = new Hono<{ Variables: RequestIdVariables }>()
  app.use("*", requestIdMiddleware())

  app.get("/v1/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: "axiomchess-api",
      apiVersion: "v1",
    }
    return c.json(body)
  })

  app.route("/", createOpenApiRoutes())
  app.route(
    "/",
    createAnalyzeRoutes({
      store,
      queue,
      ingest,
      retentionDays,
    }),
  )
  app.route("/", createAnalysesRoutes(store))

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? "unknown"
    if (error instanceof ApiError) {
      return c.json(
        toErrorBody(error, requestId),
        error.status as 400 | 404 | 429 | 500,
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
  return instance
}
