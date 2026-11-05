import { describe, expect, it } from "vitest"

import { createRedisAnalysisQueue } from "./redis.js"

type FakeRedis = {
  store: string[]
  lPop: () => Promise<string | null>
  rPush: (_key: string, id: string) => Promise<number>
  quit: () => Promise<void>
  destroy: () => void
  on: () => FakeRedis
  connect: () => Promise<void>
}

const createFakeRedis = (): FakeRedis => {
  const store: string[] = []
  return {
    store,
    lPop: async () => store.shift() ?? null,
    rPush: async (_key, id) => {
      store.push(id)
      return store.length
    },
    quit: async () => undefined,
    destroy: () => undefined,
    on: () => createFakeRedis(),
    connect: async () => undefined,
  }
}

describe("redis analysis queue", () => {
  it("enqueues and drains via injected client", async () => {
    const seen: string[] = []
    const fake = createFakeRedis()
    const queue = await createRedisAnalysisQueue({
      url: "redis://test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: fake as any,
      pollIntervalMs: 10,
      handler: async (id) => {
        seen.push(id)
      },
    })

    expect(queue.backend).toBe("redis")
    await queue.enqueue("job-1")
    await queue.enqueue("job-2")

    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(seen).toEqual(["job-1", "job-2"])
    await queue.close()
  })
})
