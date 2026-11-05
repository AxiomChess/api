import type { MiddlewareHandler } from "hono"

import { ApiError } from "../errors.js"
import type { RequestIdVariables } from "../http/request-id.js"
import { extractRawApiKey, resolveClientIp } from "./extract-api-key.js"
import type { ApiKeyVerifier, AuthVariables } from "./types.js"

export type AuthMiddlewareOptions = {
  verifier: ApiKeyVerifier | null
}

export const authMiddleware = (
  options: AuthMiddlewareOptions,
): MiddlewareHandler<{
  Variables: RequestIdVariables & AuthVariables
}> => {
  return async (c, next) => {
    const ip = resolveClientIp({
      get: (name) => c.req.header(name),
    })
    const rawKey = extractRawApiKey({
      get: (name) => c.req.header(name),
    })

    if (rawKey === null) {
      c.set("auth", {
        kind: "anonymous",
        subjectId: `ip:${ip}`,
        apiKeyId: null,
        label: null,
      })
      await next()
      return
    }

    if (!options.verifier) {
      throw new ApiError({
        code: "auth_unavailable",
        message: "API key auth is not configured on this server",
        status: 401,
      })
    }

    const verified = await options.verifier.verify(rawKey)
    if (!verified) {
      throw new ApiError({
        code: "invalid_api_key",
        message: "API key is invalid or revoked",
        status: 401,
      })
    }

    c.set("auth", {
      kind: "api_key",
      subjectId: `key:${verified.id}`,
      apiKeyId: verified.id,
      label: verified.label,
    })
    await next()
  }
}
