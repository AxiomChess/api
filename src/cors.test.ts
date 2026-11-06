import { describe, expect, it } from "vitest"
import { createApp } from "./create-app.js"

describe("CORS for browser web app", () => {
  it("allows local Next.js origins on preflight and GET health", async () => {
    const app = await createApp({ startWorkers: false })

    const preflight = await app.request("/v1/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:3010",
        "Access-Control-Request-Method": "GET",
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:3010",
    )

    const health = await app.request("/v1/health", {
      headers: { Origin: "http://localhost:3010" },
    })
    expect(health.status).toBe(200)
    expect(health.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3010",
    )

    await app.queue.close()
    await app.rateLimiterHandle.close()
  })
})
