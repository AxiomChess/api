import { createApp } from "./app.js"

/**
 * Vercel / Web Standards entry: default-export the Hono app.
 * Local Node listen lives in serve.ts (`pnpm start`).
 */
export default await createApp({
  startWorkers: true,
})
