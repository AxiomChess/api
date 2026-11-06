import { Hono } from "hono"

import type { AuthVariables } from "../auth/types.js"
import { quotaForAuthKind } from "../auth/quotas.js"
import { computeExpiresAt } from "../db/retention.js"
import { ApiError, toErrorBody } from "../errors.js"
import type { RequestIdVariables } from "../http/request-id.js"
import type { AnalysisJobQueue } from "../queue/types.js"
import {
  applyRateLimitHeaders,
  applyRetryAfterHeader,
  type RateLimiter,
} from "../rate-limit/index.js"
import {
  CACHE_HIT_HEADER,
  DEFAULT_ENGINE_POLICY_ID,
  lookupCompletedAnalysisCache,
} from "../services/analysis-cache.js"
import {
  METRIC_NAMES,
  rootLogger,
  rootMetrics,
} from "../observability/index.js"
import type { IngestService } from "../services/ingest.js"
import { hashNormalizedPgn } from "../services/pgn-hash.js"
import type { AnalysisRecord, AnalysisStore } from "../store/types.js"

export type AnalyzeRoutesDeps = {
  store: AnalysisStore
  queue: AnalysisJobQueue
  ingest: IngestService
  retentionDays: number
  rateLimiter: RateLimiter
  enginePolicyId?: string
}

const readJsonObject = async (
  c: { req: { json: () => Promise<unknown> } },
): Promise<Record<string, unknown>> => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError({
      code: "validation_error",
      message: "Request body must be JSON",
      status: 400,
    })
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError({
      code: "validation_error",
      message: "Request body must be a JSON object",
      status: 400,
    })
  }
  return body as Record<string, unknown>
}

const requireString = (
  body: Record<string, unknown>,
  key: string,
): string => {
  const value = body[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError({
      code: "validation_error",
      message: `Missing or empty string field: ${key}`,
      status: 400,
      details: { field: key },
    })
  }
  return value.trim()
}

const parsePage = (body: Record<string, unknown>): number => {
  if (body.page === undefined) return 1
  const page = Number(body.page)
  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError({
      code: "validation_error",
      message: "page must be an integer >= 1",
      status: 400,
    })
  }
  return page
}

const parsePageSize = (body: Record<string, unknown>): number => {
  if (body.pageSize === undefined) return 10
  const pageSize = Number(body.pageSize)
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ApiError({
      code: "validation_error",
      message: "pageSize must be an integer between 1 and 50",
      status: 400,
    })
  }
  return pageSize
}

type AnalyzeEnv = {
  Variables: RequestIdVariables & AuthVariables
}

const consumeAnalysisQuota = async (
  c: {
    get: <K extends keyof AnalyzeEnv["Variables"]>(
      key: K,
    ) => AnalyzeEnv["Variables"][K]
    header: (name: string, value: string) => void
  },
  deps: AnalyzeRoutesDeps,
  cost: number,
): Promise<void> => {
  const auth = c.get("auth")
  const policy = quotaForAuthKind(auth.kind)
  const decision = await deps.rateLimiter.consume(auth.subjectId, cost, {
    burstLimit: policy.burst.limit,
    burstWindowMs: policy.burst.windowMs,
    dailyLimit: policy.daily.limit,
    dailyWindowMs: policy.daily.windowMs,
  })
  applyRateLimitHeaders(c as never, decision)
  if (!decision.allowed) {
    applyRetryAfterHeader(c as never, decision)
    throw new ApiError({
      code: "rate_limited",
      message: `Analysis quota exceeded (${decision.window} window)`,
      status: 429,
      details: {
        window: decision.window,
        limit: decision.limit,
        resetAt: decision.resetAtUnix,
      },
    })
  }
}

const toQueuedResponse = (record: AnalysisRecord) => {
  return {
    id: record.id,
    status: record.status,
  }
}

const toCacheHitResponse = (record: AnalysisRecord) => {
  return {
    id: record.id,
    status: record.status,
    cache: "hit" as const,
    enginePolicyId: record.enginePolicyId,
    result: record.result,
  }
}

export const createAnalyzeRoutes = (deps: AnalyzeRoutesDeps): Hono<{
  Variables: RequestIdVariables & AuthVariables
}> => {
  const app = new Hono<{ Variables: RequestIdVariables & AuthVariables }>()
  const enginePolicyId = deps.enginePolicyId ?? DEFAULT_ENGINE_POLICY_ID

  const enqueueFromPgn = async (
    c: {
      get: <K extends keyof AnalyzeEnv["Variables"]>(
        key: K,
      ) => AnalyzeEnv["Variables"][K]
      header: (name: string, value: string) => void
    },
    normalizedPgn: string,
  ): Promise<{ record: AnalysisRecord; cacheHit: boolean }> => {
    const requestId = c.get("requestId")
    const pgnContentHash = hashNormalizedPgn(normalizedPgn)
    const cached = await lookupCompletedAnalysisCache(deps.store, {
      pgnContentHash,
      enginePolicyId,
    })
    if (cached.hit) {
      c.header(CACHE_HIT_HEADER, "HIT")
      rootMetrics.increment(METRIC_NAMES.cacheHitsTotal)
      rootMetrics.setGauge(METRIC_NAMES.queueDepth, deps.queue.depth())
      rootLogger.info("analysis_cache_hit", {
        requestId,
        pgnContentHash,
        analysisId: cached.record.id,
        enginePolicyId,
      })
      await consumeAnalysisQuota(c, deps, 1)
      return { record: cached.record, cacheHit: true }
    }

    await consumeAnalysisQuota(c, deps, 1)
    c.header(CACHE_HIT_HEADER, "MISS")
    rootMetrics.increment(METRIC_NAMES.cacheMissesTotal)
    const record = await deps.store.create({
      normalizedPgn,
      pgnContentHash,
      enginePolicyId,
      expiresAt: computeExpiresAt(new Date(), deps.retentionDays),
      status: "queued",
    })
    await deps.queue.enqueue(record.id)
    rootMetrics.setGauge(METRIC_NAMES.queueDepth, deps.queue.depth())
    rootLogger.info("analysis_enqueued", {
      requestId,
      pgnContentHash,
      analysisId: record.id,
      enginePolicyId,
      queueDepth: deps.queue.depth(),
    })
    return { record, cacheHit: false }
  }

  app.post("/v1/analyze/url", async (c) => {
    const requestId = c.get("requestId")
    try {
      const body = await readJsonObject(c)
      const url = requireString(body, "url")
      const game = await deps.ingest.fetchGameFromUrl(url)
      const normalizedPgn = deps.ingest.normalizePgnText(game.pgn)
      const { record, cacheHit } = await enqueueFromPgn(c, normalizedPgn)
      if (cacheHit) {
        return c.json(
          {
            ...toCacheHitResponse(record),
            sourceUrl: game.sourceUrl,
            site: game.site,
            siteGameId: game.siteGameId,
          },
          200,
        )
      }
      return c.json(
        {
          ...toQueuedResponse(record),
          sourceUrl: game.sourceUrl,
          site: game.site,
          siteGameId: game.siteGameId,
        },
        202,
      )
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json(
          toErrorBody(error, requestId),
          error.status as 400 | 401 | 429,
        )
      }
      throw error
    }
  })

  app.post("/v1/analyze/pgn", async (c) => {
    const requestId = c.get("requestId")
    try {
      const body = await readJsonObject(c)
      const pgn = requireString(body, "pgn")
      const normalizedPgn = deps.ingest.normalizePgnText(pgn)
      const { record, cacheHit } = await enqueueFromPgn(c, normalizedPgn)
      if (cacheHit) {
        return c.json(toCacheHitResponse(record), 200)
      }
      return c.json(toQueuedResponse(record), 202)
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json(
          toErrorBody(error, requestId),
          error.status as 400 | 401 | 429,
        )
      }
      throw error
    }
  })

  app.post("/v1/analyze/username", async (c) => {
    const requestId = c.get("requestId")
    try {
      const body = await readJsonObject(c)
      const site = requireString(body, "site")
      const username = requireString(body, "username")
      const page = parsePage(body)
      const pageSize = parsePageSize(body)
      const analyze = body.analyze === true

      const fetchLimit = page * pageSize
      const refs = await deps.ingest.listRecentGames(site, username, fetchLimit)
      const start = (page - 1) * pageSize
      const pageRefs = refs.slice(start, start + pageSize)
      const hasMore = refs.length > start + pageSize || refs.length >= fetchLimit

      const analyses: {
        id: string
        status: string
        gameId: string
        cache?: "hit"
      }[] = []
      if (analyze) {
        for (const ref of pageRefs) {
          const game = await deps.ingest.fetchGameByRef(ref)
          const normalizedPgn = deps.ingest.normalizePgnText(game.pgn)
          const { record, cacheHit } = await enqueueFromPgn(c, normalizedPgn)
          analyses.push({
            id: record.id,
            status: record.status,
            gameId: ref.gameId,
            ...(cacheHit ? { cache: "hit" as const } : {}),
          })
        }
      }

      const payload = {
        site,
        username,
        page,
        pageSize,
        hasMore,
        games: pageRefs.map((ref) => ({
          site: ref.site,
          gameId: ref.gameId,
          sourceUrl: ref.sourceUrl,
        })),
        analyses: analyze ? analyses : undefined,
      }

      return c.json(payload, analyze ? 202 : 200)
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json(
          toErrorBody(error, requestId),
          error.status as 400 | 401 | 429,
        )
      }
      throw error
    }
  })

  return app
}
