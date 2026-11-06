import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "../create-app.js"
import { SiteAdapterError } from "@axiomchess/adapters"
import { createInProcessAnalysisQueue } from "../queue/in-process.js"
import { createAnalysisJobHandler } from "../services/jobs.js"
import { createMockGameAnalyzer } from "../services/game-analyzer.js"
import { createMemoryAnalysisStore } from "../store/memory.js"
import {
  buildAnalysisResultV1,
  extractFeatures,
} from "@axiomchess/analyzer"
import { createIngestService } from "../services/ingest.js"
import { createLogger } from "./logger.js"
import {
  createMetricsRegistry,
  METRIC_NAMES,
  rootMetrics,
} from "./metrics.js"

afterEach(() => {
  rootMetrics.reset()
})

describe("structured logger", () => {
  it("emits JSON with requestId and strips PGN at info", () => {
    const lines: string[] = []
    const logger = createLogger({
      write: (line) => lines.push(line),
    })

    logger.info("safe_event", {
      requestId: "req-1",
      pgnContentHash: "abc",
      pgn: "1. e4 e5",
      normalizedPgn: "1. e4 e5",
    })

    expect(lines).toHaveLength(1)
    const record = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>
    expect(record.level).toBe("info")
    expect(record.service).toBe("axiomchess-api")
    expect(record.requestId).toBe("req-1")
    expect(record.pgnContentHash).toBe("abc")
    expect(record.pgn).toBeUndefined()
    expect(record.normalizedPgn).toBeUndefined()
    expect(JSON.stringify(record)).not.toContain("1. e4 e5")
  })
})

describe("metrics registry", () => {
  it("tracks cache hit ratio, request rate, and durations", () => {
    const metrics = createMetricsRegistry()
    metrics.increment(METRIC_NAMES.httpRequestsTotal)
    metrics.increment(METRIC_NAMES.httpRequestsTotal)
    metrics.increment(METRIC_NAMES.cacheHitsTotal)
    metrics.increment(METRIC_NAMES.cacheMissesTotal)
    metrics.increment(METRIC_NAMES.cacheMissesTotal)
    metrics.setGauge(METRIC_NAMES.queueDepth, 3)
    metrics.observeDurationMs(METRIC_NAMES.engineJobDurationMs, 12.5)

    const snap = metrics.snapshot()
    expect(snap.derived.requestRatePerMinute).toBe(2)
    expect(snap.derived.cacheHitRatio).toBeCloseTo(1 / 3, 9)
    expect(snap.gauges.find((g) => g.name === METRIC_NAMES.queueDepth)?.value).toBe(
      3,
    )
    const duration = snap.durations.find(
      (d) => d.name === METRIC_NAMES.engineJobDurationMs,
    )
    expect(duration?.count).toBe(1)
    expect(duration?.lastMs).toBe(12.5)
  })
})

describe("api observability wiring", () => {
  it("logs requestId on HTTP and records engine job duration without PGN", async () => {
    const lines: string[] = []
    const logger = createLogger({
      write: (line) => lines.push(line),
    })
    const metrics = createMetricsRegistry()
    const store = createMemoryAnalysisStore()
    const result = buildAnalysisResultV1({
      features: extractFeatures([]),
      depth: 18,
      analyzedAt: "2026-11-06T00:00:00.000Z",
    })
    const analyzer = createMockGameAnalyzer(result)
    const handler = createAnalysisJobHandler({
      store,
      analyzer,
      logger,
      metrics,
      queueDepth: () => queue.depth(),
    })
    const queue = createInProcessAnalysisQueue(handler)

    const app = await createApp({
      store,
      queue,
      analyzer,
      startWorkers: false,
    })

    const health = await app.request("/v1/health", {
      headers: { "x-request-id": "obs-req-1" },
    })
    expect(health.status).toBe(200)
    expect(health.headers.get("x-request-id")).toBe("obs-req-1")

    const record = await store.create({
      normalizedPgn: "1. e4 e5 1-0",
      pgnContentHash: "hash-obs-1",
      enginePolicyId: "engine-v1",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      status: "queued",
    })
    await queue.enqueue(record.id)
    let completed = await store.getById(record.id)
    for (
      let i = 0;
      i < 40 &&
      completed !== null &&
      (completed.status === "queued" || completed.status === "running");
      i += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      completed = await store.getById(record.id)
    }
    expect(completed?.status).toBe("completed")

    const jobLines = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((row) => String(row.message).startsWith("analysis_job_"))
    expect(jobLines.length).toBeGreaterThanOrEqual(2)
    for (const row of jobLines) {
      expect(row.pgnContentHash).toBe("hash-obs-1")
      expect(row.pgn).toBeUndefined()
      expect(row.normalizedPgn).toBeUndefined()
      expect(JSON.stringify(row)).not.toContain("1. e4 e5")
    }

    const duration = metrics
      .snapshot()
      .durations.find((d) => d.name === METRIC_NAMES.engineJobDurationMs)
    expect(duration?.count).toBe(1)
    expect(duration?.lastMs).not.toBeNull()

    await app.queue.close()
  })

  it("increments upstream_429_total on adapter rate limits", async () => {
    const ingest = createIngestService({
      lichess: {
        id: "lichess",
        parseUrl: () => null,
        fetchGame: async () => {
          throw new SiteAdapterError({
            code: "rate_limited",
            message: "slow down",
            details: { retryAfterMs: 60_000 },
          })
        },
        listRecentGames: async () => [],
        toNormalizedGame: (raw) => raw as never,
      },
    })

    rootMetrics.reset()
    await expect(
      ingest.fetchGameFromUrl("https://lichess.org/abcd1234"),
    ).rejects.toMatchObject({ code: "rate_limited" })

    const count =
      rootMetrics
        .snapshot()
        .counters.find((c) => c.name === METRIC_NAMES.upstream429Total)
        ?.value ?? 0
    expect(count).toBe(1)
  })
})
