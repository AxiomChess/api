import { describe, expect, it } from "vitest"

import {
  DEFAULT_ANALYSIS_RETENTION_DAYS,
  computeExpiresAt,
  parseRetentionDays,
} from "./retention.js"

describe("retention", () => {
  it("defaults to 30 days", () => {
    expect(DEFAULT_ANALYSIS_RETENTION_DAYS).toBe(30)
    expect(parseRetentionDays(undefined)).toBe(30)
    expect(parseRetentionDays("")).toBe(30)
  })

  it("computes expires_at from created_at", () => {
    const created = new Date("2026-01-01T12:00:00.000Z")
    const expires = computeExpiresAt(created, 30)
    expect(expires.toISOString()).toBe("2026-01-31T12:00:00.000Z")
  })
})
