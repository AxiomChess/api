import { describe, expect, it } from "vitest"

import { DEFAULT_ANALYSIS_RETENTION_DAYS, loadConfig } from "./config.js"

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const config = loadConfig({})
    expect(config).toEqual({
      port: 3000,
      host: "0.0.0.0",
      nodeEnv: "development",
      databaseUrl: null,
      analysisRetentionDays: DEFAULT_ANALYSIS_RETENTION_DAYS,
      apiKeyPepper: null,
      redisUrl: null,
    })
  })

  it("reads PORT HOST NODE_ENV and DB settings", () => {
    const config = loadConfig({
      PORT: "8787",
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      ANALYSIS_RETENTION_DAYS: "14",
      API_KEY_PEPPER: "test-pepper",
      REDIS_URL: "redis://127.0.0.1:6379",
    })
    expect(config).toEqual({
      port: 8787,
      host: "127.0.0.1",
      nodeEnv: "test",
      databaseUrl: "postgres://u:p@localhost:5432/db",
      analysisRetentionDays: 14,
      apiKeyPepper: "test-pepper",
      redisUrl: "redis://127.0.0.1:6379",
    })
  })


  it("rejects invalid PORT", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(/Invalid PORT/)
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/)
  })

  it("rejects invalid ANALYSIS_RETENTION_DAYS", () => {
    expect(() => loadConfig({ ANALYSIS_RETENTION_DAYS: "0" })).toThrow(
      /Invalid ANALYSIS_RETENTION_DAYS/,
    )
    expect(() => loadConfig({ ANALYSIS_RETENTION_DAYS: "1.5" })).toThrow(
      /Invalid ANALYSIS_RETENTION_DAYS/,
    )
  })

  it("defaults retention to 30 days", () => {
    expect(DEFAULT_ANALYSIS_RETENTION_DAYS).toBe(30)
    expect(loadConfig({}).analysisRetentionDays).toBe(30)
  })
})
