import {
  SITES_MANIFEST,
  SITES_MANIFEST_VERSION,
  sitesManifestToJson,
} from "@axiomchess/adapters"
import { describe, expect, it } from "vitest"

import { createApp } from "./create-app.js"

describe("GET /v1/sites", () => {
  it("returns adapters sites manifest", async () => {
    const app = await createApp({ startWorkers: false })
    const response = await app.request("/v1/sites")

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(/application\/json/)

    const body = (await response.json()) as {
      version: number
      sites: { id: string }[]
    }
    expect(body).toEqual(sitesManifestToJson())
    expect(body.version).toBe(SITES_MANIFEST_VERSION)
    expect(body.sites.map((site) => site.id)).toEqual(
      SITES_MANIFEST.sites.map((site) => site.id),
    )
    expect(body.sites.map((site) => site.id).sort()).toEqual([
      "chesscom",
      "lichess",
    ])

    await app.queue.close()
    await app.rateLimiterHandle.close()
  })
})
