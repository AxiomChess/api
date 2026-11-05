import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildAnalysisResultV1,
  extractFeatures,
  type AnalysisResultV1,
  type MoveEvalInput,
} from "@axiomchess/analyzer"
import type {
  NormalizedGame,
  ParsedGameRef,
  SiteAdapter,
} from "@axiomchess/adapters"
import { afterEach, describe, expect, it } from "vitest"

import { createApp, type AppInstance } from "./app.js"
import { PROJECT_SPEC_V1_PATHS } from "./routes/openapi.js"
import { createMockGameAnalyzer } from "./services/game-analyzer.js"
import { createInProcessAnalysisQueue } from "./queue/in-process.js"
import { createAnalysisJobHandler } from "./services/jobs.js"
import { createMemoryAnalysisStore } from "./store/memory.js"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")

const SAMPLE_PGN = `[Event "T18 Contract"]
[Site "Test"]
[Date "2026.11.05"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
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

const fixtureGame = (ref: ParsedGameRef): NormalizedGame => {
  return {
    pgn: SAMPLE_PGN,
    site: ref.site,
    siteGameId: ref.gameId,
    players: {
      white: { username: "Alice" },
      black: { username: "Bob" },
    },
    variant: "standard",
    sourceUrl: ref.sourceUrl,
    fetchedAt: "2026-11-05T20:00:00.000Z",
  }
}

const createFixtureAdapters = (): Record<string, SiteAdapter> => {
  const games = new Map<string, ParsedGameRef>([
    [
      "lichess:abcd1234",
      {
        site: "lichess",
        gameId: "abcd1234",
        sourceUrl: "https://lichess.org/abcd1234",
      },
    ],
    [
      "chesscom:alice/2024/01/123",
      {
        site: "chesscom",
        gameId: "alice/2024/01/123",
        sourceUrl: "https://www.chess.com/game/live/123",
      },
    ],
  ])

  const recent: ParsedGameRef[] = [
    games.get("lichess:abcd1234")!,
    {
      site: "lichess",
      gameId: "efgh5678",
      sourceUrl: "https://lichess.org/efgh5678",
    },
    {
      site: "lichess",
      gameId: "ijkl9012",
      sourceUrl: "https://lichess.org/ijkl9012",
    },
  ]

  const makeAdapter = (id: string): SiteAdapter => {
    return {
      id,
      parseUrl: (url: string) => {
        if (id === "lichess" && url.includes("lichess.org/abcd1234")) {
          return games.get("lichess:abcd1234") ?? null
        }
        if (id === "chesscom" && url.includes("chess.com")) {
          return games.get("chesscom:alice/2024/01/123") ?? null
        }
        return null
      },
      fetchGame: async (ref: ParsedGameRef) => {
        if (ref.gameId === "missing") {
          const { SiteAdapterError } = await import("@axiomchess/adapters")
          throw new SiteAdapterError({
            code: "not_found",
            message: "game not found",
          })
        }
        return fixtureGame(ref)
      },
      listRecentGames: async (_username, options) => {
        const max = options?.maxGames ?? recent.length
        return recent.slice(0, max)
      },
      toNormalizedGame: (raw: unknown) => raw as NormalizedGame,
    }
  }

  return {
    lichess: makeAdapter("lichess"),
    chesscom: makeAdapter("chesscom"),
  }
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

describe("T18 analyze contracts", () => {
  let app: AppInstance

  afterEach(async () => {
    if (app) {
      await app.queue.close()
      await app.rateLimiterHandle.close()
    }
  })

  const boot = async () => {
    const store = createMemoryAnalysisStore()
    const mockResult = loadMockResult()
    const analyzer = createMockGameAnalyzer(mockResult)
    const handler = createAnalysisJobHandler({ store, analyzer })
    const queue = createInProcessAnalysisQueue(handler)
    app = await createApp({
      store,
      queue,
      analyzer,
      adapters: createFixtureAdapters(),
      retentionDays: 30,
    })
    return { mockResult }
  }

  it("OpenAPI path list matches PROJECT_SPEC.md routes", async () => {
    await boot()
    const response = await app.request("/v1/openapi.json")
    expect(response.status).toBe(200)
    const doc = (await response.json()) as {
      paths: Record<string, unknown>
    }
    for (const path of PROJECT_SPEC_V1_PATHS) {
      expect(doc.paths[path]).toBeTruthy()
    }
    expect(doc.paths["/v1/analyze/url"]).toBeTruthy()
    expect(doc.paths["/v1/analyze/pgn"]).toBeTruthy()
    expect(doc.paths["/v1/analyze/username"]).toBeTruthy()
    expect(doc.paths["/v1/analyses/{id}"]).toBeTruthy()
  })

  it("rejects SSRF / non-allowlisted URL hosts", async () => {
    await boot()
    const response = await app.request("/v1/analyze/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://evil.example/game/1" }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.code).toBe("ssrf_rejected")
    expect(body.requestId).toBeTruthy()
  })

  it("analyzes PGN via mocked analyzer and returns completed result", async () => {
    const { mockResult } = await boot()
    const create = await app.request("/v1/analyze/pgn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pgn: SAMPLE_PGN }),
    })
    expect(create.status).toBe(202)
    const created = (await create.json()) as { id: string; status: string }
    expect(created.status).toBe("queued")

    const done = await waitForStatus(app, created.id, "completed")
    expect(done.status).toBe("completed")
    expect(done.result).toEqual(mockResult)
    expect(JSON.stringify(done).toLowerCase()).not.toContain("cheater")
  })

  it("analyzes allowlisted URL via fixture adapter", async () => {
    await boot()
    const create = await app.request("/v1/analyze/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://lichess.org/abcd1234" }),
    })
    expect(create.status).toBe(202)
    const created = (await create.json()) as {
      id: string
      site: string
      siteGameId: string
    }
    expect(created.site).toBe("lichess")
    expect(created.siteGameId).toBe("abcd1234")

    const done = await waitForStatus(app, created.id, "completed")
    expect(done.status).toBe("completed")
  })

  it("lists username games paged and can queue analyses", async () => {
    await boot()
    const list = await app.request("/v1/analyze/username", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site: "lichess",
        username: "alice",
        page: 1,
        pageSize: 2,
      }),
    })
    expect(list.status).toBe(200)
    const listed = (await list.json()) as {
      games: { gameId: string }[]
      hasMore: boolean
    }
    expect(listed.games).toHaveLength(2)
    expect(listed.games[0]?.gameId).toBe("abcd1234")
    expect(listed.hasMore).toBe(true)

    const queued = await app.request("/v1/analyze/username", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site: "lichess",
        username: "alice",
        page: 1,
        pageSize: 1,
        analyze: true,
      }),
    })
    expect(queued.status).toBe(202)
    const body = (await queued.json()) as {
      analyses: { id: string; gameId: string }[]
    }
    expect(body.analyses).toHaveLength(1)
    const done = await waitForStatus(app, body.analyses[0]!.id, "completed")
    expect(done.status).toBe("completed")
  })

  it("returns 404 for unknown analysis id", async () => {
    await boot()
    const response = await app.request(
      "/v1/analyses/00000000-0000-4000-8000-000000000000",
    )
    expect(response.status).toBe(404)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe("not_found")
  })
})
