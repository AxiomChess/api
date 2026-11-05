import { serve } from "@hono/node-server"

import { createApp } from "./app.js"
import { loadConfig, requireDatabaseUrl } from "./config.js"
import { createPool, closePool } from "./db/pool.js"
import { createPostgresAnalysisStore } from "./store/postgres.js"

const config = loadConfig()

const pool = config.databaseUrl
  ? createPool(requireDatabaseUrl(config))
  : null

const app = await createApp({
  ...(pool ? { store: createPostgresAnalysisStore(pool) } : {}),
  retentionDays: config.analysisRetentionDays,
  redisUrl: config.redisUrl,
})

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(
      `AxiomChess API listening on http://${info.address}:${info.port} (${config.nodeEnv}); queue=${app.queue.backend}`,
    )
  },
)

const shutdown = async (code: number) => {
  server.close()
  await app.queue.close()
  if (pool) {
    await closePool(pool)
  }
  process.exit(code)
}

process.on("SIGINT", () => {
  void shutdown(0)
})

process.on("SIGTERM", () => {
  void shutdown(0)
})
