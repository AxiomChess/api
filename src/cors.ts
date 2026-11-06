import { cors } from "hono/cors"

/**
 * Browser clients (web app) call the API cross-origin in local and hosted setups.
 * Allow common local Next.js origins plus same-origin requests.
 */
export const corsMiddleware = () =>
  cors({
    origin: (origin) => {
      if (!origin) return "*"
      if (
        origin === "http://127.0.0.1:3000" ||
        origin === "http://localhost:3000" ||
        origin === "http://127.0.0.1:3010" ||
        origin === "http://localhost:3010" ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://localhost:")
      ) {
        return origin
      }
      return null
    },
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "Accept"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "Retry-After",
      "X-Cache",
      "X-Request-Id",
    ],
    maxAge: 600,
  })
