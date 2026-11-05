import { sitesManifestToJson, type SitesManifest } from "@axiomchess/adapters"
import { Hono } from "hono"

import type { RequestIdVariables } from "../http/request-id.js"

export type SitesResponse = SitesManifest

export const createSitesRoutes = (): Hono<{
  Variables: RequestIdVariables
}> => {
  const app = new Hono<{ Variables: RequestIdVariables }>()

  app.get("/v1/sites", (c) => {
    const body: SitesResponse = sitesManifestToJson()
    return c.json(body)
  })

  return app
}
