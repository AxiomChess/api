import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildAnalysisResultV1,
  extractFeatures,
  type AnalysisResultV1,
  type MoveEvalInput,
} from "@axiomchess/analyzer"
import { afterEach, describe, expect, it } from "vitest"

import { createApp, type AppInstance } from "./create-app.js"
import { createMemoryApiKeyStore } from "./auth/memory-api-keys.js"
import { ANONYMOUS_QUOTA, API_KEY_QUOTA } from "./auth/quotas.js"
import { hashApiKey } from "./db/api-keys.js"
import {
  RATE_LIMIT_LIMIT_HEADER,
  RATE_LIMIT_REMAINING_HEADER,
  RATE_LIMIT_RESET_HEADER,
  RETRY_AFTER_HEADER,
  createMemoryRateLimiter,
} from "./rate-limit/index.js"
import { createInProcessAnalysisQueue } from "./queue/in-process.js"
import { createAnalysisJobHandler } from "./services/jobs.js"
import { createMockGameAnalyzer } from "./services/game-analyzer.js"
import { createMemoryAnalysisStore } from "./store/memory.js"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")

const SAMPLE_PGN = `[Event "T19 Quotas"]
[Site "Test"]
[Date "2026.11.05"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
`

const OTHER_PGN = `[Event "T19 Other"]
[Site "Test"]
[Date "2026.11.05"]
[Round "2"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1
`

const loadMockResult = (): AnalysisResultV1 => {
  const fixturePath = join(
    rootDir,
    "../analyzer/fixtures/v1/a1-amateur-blunders.json",
  )
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    moves: MoveEvalInput[]
  }
  return buildAnalysisResultV1({
    features: extractFeatures(fixture.moves),
    depth: 18,
    analyzedAt: "2026-11-05T20:00:00.000Z",
  })
}

const waitForStatus = async (
  app: AppInstance,
  id: string,
  status: string,
  attempts = 40,
): Promise<Record<string, unknown>> => {
  for (let i = 0; i < attempts; i += 1) {
    const response = await app.request(`/v1/analyses/${id}`)
    const body = (await response.json()) as Record<string, unknown>
    if (body.status === status) return body
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for analysis ${id} status=${status}`)
}

describe("T19 auth quotas rate limits cache", () => {
  let app: AppInstance

  afterEach(async () => {
    if (app) {
      await app.queue.close()
      await app.rateLimiterHandle.close()
    }
  })

  const boot = async (input?: {
    rateLimiter?: ReturnType<typeof createMemoryRateLimiter>
    pepper?: string
  }) => {
    const pepper = input?.pepper ?? "test-pepper-t19"
    const keys = createMemoryApiKeyStore(pepper)
    const store = createMemoryAnalysisStore()
    const mockResult = loadMockResult()
    const analyzer = createMockGameAnalyzer(mockResult)
    const handler = createAnalysisJobHandler({ store, analyzer })
    const queue = createInProcessAnalysisQueue(handler)
    const rateLimiter = input?.rateLimiter ?? createMemoryRateLimiter()
    app = await createApp({
      store,
      queue,
      analyzer,
      retentionDays: 30,
      apiKeyVerifier: keys,
      rateLimiter,
    })
    return { keys, mockResult, pepper }
  }

  it("emits rate-limit headers on analyze responses", async () => {
    await boot()
    const response = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(response.status).toBe(202)
    expect(response.headers.get(RATE_LIMIT_LIMIT_HEADER)).toBe(
      String(ANONYMOUS_QUOTA.burst.limit),
    )
    expect(response.headers.get(RATE_LIMIT_REMAINING_HEADER)).toBe("1")
    expect(response.headers.get(RATE_LIMIT_RESET_HEADER)).toMatch(/^\d+$/u)
  })

  it("enforces anonymous burst quota with 429 + Retry-After", async () => {
    await boot()
    const headers = {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.20",
    }
    expect(
      (
        await app.request("/v1/analyze/pgn", {
          method: "POST",
          headers,
          body: JSON.stringify({ pgn: SAMPLE_PGN }),
        })
      ).status,
    ).toBe(202)
    expect(
      (
        await app.request("/v1/analyze/pgn", {
          method: "POST",
          headers,
          body: JSON.stringify({ pgn: OTHER_PGN }),
        })
      ).status,
    ).toBe(202)

    const limited = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers,
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get(RETRY_AFTER_HEADER)).toMatch(/^\d+$/u)
    expect(limited.headers.get(RATE_LIMIT_LIMIT_HEADER)).toBe(
      String(ANONYMOUS_QUOTA.burst.limit),
    )
    const body = (await limited.json()) as { code: string }
    expect(body.code).toBe("rate_limited")
  })

  it("hashes API keys at rest and grants higher quota", async () => {
    const { keys, pepper } = await boot()
    const minted = keys.mint({ label: "ops" })

    expect(keys.storedHashes()).toEqual([minted.keyHash])
    expect(keys.storedHashes()[0]).toBe(hashApiKey(minted.rawKey, pepper))
    expect(JSON.stringify(keys.storedHashes())).not.toContain(minted.rawKey)

    const bad = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "axc_not_a_real_key",
        "x-forwarded-for": "203.0.113.30",
      },
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(bad.status).toBe(401)
    expect(((await bad.json()) as { code: string }).code).toBe("invalid_api_key")

    const ok = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${minted.rawKey}`,
        "x-forwarded-for": "203.0.113.30",
      },
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(ok.status).toBe(202)
    expect(ok.headers.get(RATE_LIMIT_LIMIT_HEADER)).toBe(
      String(API_KEY_QUOTA.burst.limit),
    )
    expect(ok.headers.get(RATE_LIMIT_REMAINING_HEADER)).toBe(
      String(API_KEY_QUOTA.burst.limit - 1),
    )
  })

  it("returns cache hit for identical PGN + policy without re-queue", async () => {
    const { mockResult } = await boot()
    const headers = {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.40",
    }

    const create = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers,
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(create.status).toBe(202)
    expect(create.headers.get("x-cache")).toBe("MISS")
    const created = (await create.json()) as { id: string }
    await waitForStatus(app, created.id, "completed")

    const cached = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers,
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(cached.status).toBe(200)
    expect(cached.headers.get("x-cache")).toBe("HIT")
    expect(cached.headers.get(RATE_LIMIT_LIMIT_HEADER)).toBeTruthy()
    const body = (await cached.json()) as {
      id: string
      status: string
      cache: string
      result: AnalysisResultV1
    }
    expect(body.id).toBe(created.id)
    expect(body.status).toBe("completed")
    expect(body.cache).toBe("hit")
    expect(body.result).toEqual(mockResult)
  })
})
