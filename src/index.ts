import { Hono } from "hono"

import { createApp } from "./create-app.js"

/**
 * Vercel / Web Standards entry: default-export the Hono app.
 * Local Node listen lives in serve.ts (`pnpm start`).
 */
const app = await createApp({
  startWorkers: true,
})

// Ensure the framework entry statically imports hono (Vercel entry detection).
void Hono

export default app
