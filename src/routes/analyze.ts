import { Hono } from "hono"

import { ApiError, toErrorBody } from "../errors.js"
import type { RequestIdVariables } from "../http/request-id.js"
import type { AnalysisJobQueue } from "../queue/types.js"
import { computeExpiresAt } from "../db/retention.js"
import type { IngestService } from "../services/ingest.js"
import { hashNormalizedPgn } from "../services/pgn-hash.js"
import type { AnalysisStore } from "../store/types.js"

export type AnalyzeRoutesDeps = {
  store: AnalysisStore
  queue: AnalysisJobQueue
  ingest: IngestService
  retentionDays: number
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

export const createAnalyzeRoutes = (deps: AnalyzeRoutesDeps): Hono<{
  Variables: RequestIdVariables
}> => {
  const app = new Hono<{ Variables: RequestIdVariables }>()

  const enqueueFromPgn = async (normalizedPgn: string) => {
    const record = await deps.store.create({
      normalizedPgn,
      pgnContentHash: hashNormalizedPgn(normalizedPgn),
      expiresAt: computeExpiresAt(new Date(), deps.retentionDays),
      status: "queued",
    })
    await deps.queue.enqueue(record.id)
    return record
  }

  app.post("/v1/analyze/url", async (c) => {
    const requestId = c.get("requestId")
    try {
      const body = await readJsonObject(c)
      const url = requireString(body, "url")
      const game = await deps.ingest.fetchGameFromUrl(url)
      const normalizedPgn = deps.ingest.normalizePgnText(game.pgn)
      const record = await enqueueFromPgn(normalizedPgn)
      return c.json(
        {
          id: record.id,
          status: record.status,
          sourceUrl: game.sourceUrl,
          site: game.site,
          siteGameId: game.siteGameId,
        },
        202,
      )
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json(toErrorBody(error, requestId), error.status as 400)
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
      const record = await enqueueFromPgn(normalizedPgn)
      return c.json(
        {
          id: record.id,
          status: record.status,
        },
        202,
      )
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json(toErrorBody(error, requestId), error.status as 400)
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

      const analyses: { id: string; status: string; gameId: string }[] = []
      if (analyze) {
        for (const ref of pageRefs) {
          const game = await deps.ingest.fetchGameByRef(ref)
          const normalizedPgn = deps.ingest.normalizePgnText(game.pgn)
          const record = await enqueueFromPgn(normalizedPgn)
          analyses.push({
            id: record.id,
            status: record.status,
            gameId: ref.gameId,
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
        return c.json(toErrorBody(error, requestId), error.status as 400)
      }
      throw error
    }
  })

  return app
}
