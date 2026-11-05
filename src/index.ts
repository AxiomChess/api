import { serve } from "@hono/node-server"

import { createApp } from "./app.js"
import { loadConfig } from "./config.js"

const config = loadConfig()
const app = createApp()

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(
      `AxiomChess API listening on http://${info.address}:${info.port} (${config.nodeEnv})`,
    )
  },
)

process.on("SIGINT", () => {
  server.close()
  process.exit(0)
})

process.on("SIGTERM", () => {
  server.close((err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    process.exit(0)
  })
})
