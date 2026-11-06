import { afterEach, describe, expect, it } from "vitest"

import { createApp, type AppInstance } from "./create-app.js"
import { createLibraryGameAnalyzer } from "./services/game-analyzer.js"
import { createInProcessAnalysisQueue } from "./queue/in-process.js"
import { createAnalysisJobHandler } from "./services/jobs.js"
import { createMemoryAnalysisStore } from "./store/memory.js"
import type { AnalysisRecord } from "./store/types.js"

const SAMPLE_PGN = `[Event "T27"]
[Site "Test"]
[Date "2026.11.06"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 1-0
`

describe("security and privacy (T27)", () => {
  let app: AppInstance

  afterEach(async () => {
    await app?.rateLimiterHandle.close()
  })

  const boot = async () => {
    const store = createMemoryAnalysisStore()
    const analyzer = createLibraryGameAnalyzer()
    const handler = createAnalysisJobHandler({ store, analyzer })
    const queue = createInProcessAnalysisQueue(handler)
    app = await createApp({
      store,
      queue,
      analyzer,
      retentionDays: 30,
      startWorkers: false,
    })
    return store
  }

  it("deletes analysis by id and returns 204", async () => {
    const store = await boot()
    const created = await store.create({
      normalizedPgn: SAMPLE_PGN,
      pgnContentHash: "t27-delete",
      expiresAt: new Date(Date.now() + 86_400_000),
      status: "completed",
    })

    const del = await app.request(`/v1/analyses/${created.id}`, {
      method: "DELETE",
    })
    expect(del.status).toBe(204)
    expect(await store.getById(created.id)).toBeNull()

    const get = await app.request(`/v1/analyses/${created.id}`)
    expect(get.status).toBe(404)
    const body = (await get.json()) as { code: string }
    expect(body.code).toBe("not_found")
  })

  it("returns 404 for DELETE of unknown id", async () => {
    await boot()
    const response = await app.request(
      "/v1/analyses/00000000-0000-4000-8000-000000000000",
      { method: "DELETE" },
    )
    expect(response.status).toBe(404)
  })

  it("hides expired analyses on GET (retention enforcement)", async () => {
    const store = await boot()
    const expired = await store.create({
      normalizedPgn: SAMPLE_PGN,
      pgnContentHash: "t27-expired",
      expiresAt: new Date(Date.now() - 60_000),
      status: "completed",
    })

    const response = await app.request(`/v1/analyses/${expired.id}`)
    expect(response.status).toBe(404)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe("not_found")
  })

  it("still hard-deletes an expired analysis on DELETE", async () => {
    const store = await boot()
    const expired = await store.create({
      normalizedPgn: SAMPLE_PGN,
      pgnContentHash: "t27-expired-del",
      expiresAt: new Date(Date.now() - 60_000),
      status: "completed",
    })

    const del = await app.request(`/v1/analyses/${expired.id}`, {
      method: "DELETE",
    })
    expect(del.status).toBe(204)
    expect(await store.getById(expired.id)).toBeNull()
  })

  it("rejects SSRF hosts on URL analyze", async () => {
    await boot()
    const response = await app.request("/v1/analyze/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://127.0.0.1/game" }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe("ssrf_rejected")
  })

  it("memory store deleteById removes the record", async () => {
    const store = createMemoryAnalysisStore()
    const row: AnalysisRecord = await store.create({
      normalizedPgn: "1. e4 *",
      pgnContentHash: "mem-del",
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect(await store.deleteById(row.id)).toBe(true)
    expect(await store.deleteById(row.id)).toBe(false)
  })
})
