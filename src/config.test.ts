import { describe, expect, it } from "vitest"

import { loadConfig } from "./config.js"

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const config = loadConfig({})
    expect(config).toEqual({
      port: 3000,
      host: "0.0.0.0",
      nodeEnv: "development",
    })
  })

  it("reads PORT HOST NODE_ENV", () => {
    const config = loadConfig({
      PORT: "8787",
      HOST: "127.0.0.1",
      NODE_ENV: "test",
    })
    expect(config).toEqual({
      port: 8787,
      host: "127.0.0.1",
      nodeEnv: "test",
    })
  })

  it("rejects invalid PORT", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(/Invalid PORT/)
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/)
  })
})
