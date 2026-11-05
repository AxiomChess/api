import { describe, expect, it } from "vitest"

import { createInProcessAnalysisQueue } from "./in-process.js"

describe("in-process analysis queue", () => {
  it("runs jobs FIFO and reports depth", async () => {
    const seen: string[] = []
    const queue = createInProcessAnalysisQueue(async (id) => {
      seen.push(id)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    await queue.enqueue("a")
    await queue.enqueue("b")
    expect(queue.depth()).toBeGreaterThanOrEqual(1)
    expect(queue.backend).toBe("in-process")

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(seen).toEqual(["a", "b"])
    expect(queue.depth()).toBe(0)
    await queue.close()
  })
})
