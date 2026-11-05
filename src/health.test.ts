import { describe, expect, it } from "vitest"

import { createApp } from "./app.js"

describe("GET /v1/health", () => {
  it("returns liveness summary", async () => {
    const app = await createApp({ startWorkers: false })
    const response = await app.request("/v1/health")

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(/application\/json/)

    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({
      status: "ok",
      service: "axiomchess-api",
      apiVersion: "v1",
    })

    await app.queue.close()
  })
})
