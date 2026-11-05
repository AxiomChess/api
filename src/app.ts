import { Hono } from "hono"

export type HealthResponse = {
  status: "ok"
  service: "axiomchess-api"
  apiVersion: "v1"
}

export const createApp = (): Hono => {
  const app = new Hono()

  app.get("/v1/health", (c) => {
    const body: HealthResponse = {
      status: "ok",
      service: "axiomchess-api",
      apiVersion: "v1",
    }
    return c.json(body)
  })

  return app
}
