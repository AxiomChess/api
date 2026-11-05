/**
 * Accepted API key headers (v1):
 * - Authorization: Bearer <key>
 * - X-API-Key: <key>
 */

export const extractRawApiKey = (headers: {
  get: (name: string) => string | undefined
}): string | null => {
  const explicit = headers.get("x-api-key")?.trim()
  if (explicit && explicit.length > 0) {
    return explicit
  }

  const authorization = headers.get("authorization")?.trim()
  if (!authorization) return null

  const match = /^Bearer\s+(.+)$/iu.exec(authorization)
  if (!match?.[1]) return null
  const token = match[1].trim()
  return token.length > 0 ? token : null
}

export const resolveClientIp = (headers: {
  get: (name: string) => string | undefined
}): string => {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded && forwarded.length > 0) return forwarded

  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp && realIp.length > 0) return realIp

  return "unknown"
}
