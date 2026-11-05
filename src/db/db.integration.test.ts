import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  deleteAnalysisById,
  getAnalysisById,
  insertAnalysis,
  purgeExpiredAnalyses,
} from "./analyses.js"
import {
  deleteApiKeyById,
  getApiKeyByHash,
  hashApiKey,
  insertApiKey,
  revokeApiKeyById,
} from "./api-keys.js"
import { migrateUp } from "./migrate.js"
import { closePool, createPool, type DbPool } from "./pool.js"
import { computeExpiresAt } from "./retention.js"

const databaseUrl = process.env.DATABASE_URL

const describeDb = databaseUrl ? describe : describe.skip

describeDb("postgres models (integration)", () => {
  let pool: DbPool

  beforeAll(async () => {
    if (!databaseUrl) {
      return
    }
    pool = createPool(databaseUrl)
    await migrateUp(pool)
  })

  afterAll(async () => {
    if (pool) {
      await closePool(pool)
    }
  })

  beforeEach(async () => {
    await pool.query("DELETE FROM analyses")
    await pool.query("DELETE FROM api_keys")
  })

  it("migrates and stores an analysis with retention expiry", async () => {
    const createdAt = new Date("2026-11-05T10:00:00.000Z")
    const expiresAt = computeExpiresAt(createdAt, 30)

    const row = await insertAnalysis(pool, {
      normalizedPgn: '[Event "Test"]\n\n1. e4 e5 *',
      pgnContentHash: "abc123",
      expiresAt,
      status: "completed",
      resultJson: { version: "v1", band: "low" },
    })

    expect(row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
    )
    expect(row.expires_at.toISOString()).toBe(expiresAt.toISOString())

    const loaded = await getAnalysisById(pool, row.id)
    expect(loaded?.normalized_pgn).toContain("1. e4 e5")
    expect(loaded?.result_json).toEqual({ version: "v1", band: "low" })
  })

  it("deletes analysis by id", async () => {
    const row = await insertAnalysis(pool, {
      normalizedPgn: "1. d4 *",
      pgnContentHash: "hash-del",
      expiresAt: computeExpiresAt(new Date(), 30),
    })

    expect(await deleteAnalysisById(pool, row.id)).toBe(true)
    expect(await getAnalysisById(pool, row.id)).toBeNull()
    expect(await deleteAnalysisById(pool, row.id)).toBe(false)
  })

  it("purges expired analyses only", async () => {
    const now = new Date("2026-11-05T12:00:00.000Z")

    await insertAnalysis(pool, {
      normalizedPgn: "expired",
      pgnContentHash: "e1",
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    })
    const keep = await insertAnalysis(pool, {
      normalizedPgn: "keep",
      pgnContentHash: "k1",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    })

    const purged = await purgeExpiredAnalyses(pool, now)
    expect(purged).toBe(1)
    expect(await getAnalysisById(pool, keep.id)).not.toBeNull()
  })

  it("stores API key hashes and supports revoke/delete", async () => {
    const pepper = "integration-pepper"
    const keyHash = hashApiKey("axc_test_raw_key", pepper)
    const row = await insertApiKey(pool, {
      keyHash,
      label: "ops",
    })

    expect(await getApiKeyByHash(pool, keyHash)).toMatchObject({
      id: row.id,
      label: "ops",
      revoked_at: null,
    })

    expect(await revokeApiKeyById(pool, row.id)).toBe(true)
    const revoked = await getApiKeyByHash(pool, keyHash)
    expect(revoked?.revoked_at).not.toBeNull()

    expect(await deleteApiKeyById(pool, row.id)).toBe(true)
    expect(await getApiKeyByHash(pool, keyHash)).toBeNull()
  })

})

describe("hashApiKey", () => {
  it("is stable and pepper-sensitive", () => {
    const a = hashApiKey("secret", "pepper-a")
    const b = hashApiKey("secret", "pepper-a")
    const c = hashApiKey("secret", "pepper-b")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[a-f0-9]{64}$/u)
  })
})
