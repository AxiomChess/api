import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { Hono } from "hono"

import type { RequestIdVariables } from "../http/request-id.js"

const openApiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../openapi/openapi-v1.json",
)

let cachedDocument: unknown | null = null

const loadOpenApiDocument = (): unknown => {
  if (cachedDocument !== null) return cachedDocument
  cachedDocument = JSON.parse(readFileSync(openApiPath, "utf8")) as unknown
  return cachedDocument
}

export const createOpenApiRoutes = (): Hono<{
  Variables: RequestIdVariables
}> => {
  const app = new Hono<{ Variables: RequestIdVariables }>()

  app.get("/v1/openapi.json", (c) => {
    return c.json(loadOpenApiDocument())
  })

  return app
}

export const PROJECT_SPEC_V1_PATHS = [
  "/v1/health",
  "/v1/analyze/url",
  "/v1/analyze/pgn",
  "/v1/analyze/username",
  "/v1/analyses/{id}",
  "/v1/sites",
] as const
