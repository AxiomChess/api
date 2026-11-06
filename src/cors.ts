import { cors } from "hono/cors"

/**
 * Browser clients (web app) call the API cross-origin in local and hosted setups.
 * Allow common local Next.js origins plus same-origin requests.
 */
const isAllowedOrigin = (origin: string): boolean => {
  if (
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("http://localhost:")
  ) {
    return true
  }
  try {
    const host = new URL(origin).hostname
    if (host === "axiomchess.vercel.app") return true
    if (host.endsWith(".vercel.app") && host.includes("axiomchess")) return true
    return false
  } catch {
    return false
  }
}

export const corsMiddleware = () =>
  cors({
    origin: (origin) => {
      if (!origin) return "*"
      if (isAllowedOrigin(origin)) return origin
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
