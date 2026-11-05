import { randomUUID } from "node:crypto"

import type { MiddlewareHandler } from "hono"

export const REQUEST_ID_HEADER = "x-request-id"

export type RequestIdVariables = {
  requestId: string
}

export const requestIdMiddleware = (): MiddlewareHandler<{
  Variables: RequestIdVariables
}> => {
  return async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER)?.trim()
    const requestId =
      incoming && incoming.length > 0 ? incoming : randomUUID()
    c.set("requestId", requestId)
    c.header(REQUEST_ID_HEADER, requestId)
    await next()
  }
}
