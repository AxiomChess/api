import { describe, expect, it } from "vitest"

import { createMemoryRateLimiter } from "./memory.js"

describe("createMemoryRateLimiter", () => {
  it("allows within burst then denies", async () => {
    let nowMs = 1_000_000
    const limiter = createMemoryRateLimiter(() => nowMs)
    const limits = {
      burstLimit: 2,
      burstWindowMs: 60_000,
      dailyLimit: 10,
      dailyWindowMs: 86_400_000,
    }

    const first = await limiter.consume("ip:1.1.1.1", 1, limits)
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(1)

    const second = await limiter.consume("ip:1.1.1.1", 1, limits)
    expect(second.allowed).toBe(true)
    expect(second.remaining).toBe(0)

    const third = await limiter.consume("ip:1.1.1.1", 1, limits)
    expect(third.allowed).toBe(false)
    expect(third.window).toBe("burst")
    expect(third.remaining).toBe(0)

    nowMs += 60_000
    const afterReset = await limiter.consume("ip:1.1.1.1", 1, limits)
    expect(afterReset.allowed).toBe(true)
  })

  it("partitions subjects independently", async () => {
    const limiter = createMemoryRateLimiter(() => 5_000_000)
    const limits = {
      burstLimit: 1,
      burstWindowMs: 60_000,
      dailyLimit: 10,
      dailyWindowMs: 86_400_000,
    }
    expect((await limiter.consume("ip:a", 1, limits)).allowed).toBe(true)
    expect((await limiter.consume("ip:b", 1, limits)).allowed).toBe(true)
    expect((await limiter.consume("ip:a", 1, limits)).allowed).toBe(false)
  })
})
