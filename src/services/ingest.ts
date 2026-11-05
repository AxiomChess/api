import {
  getSiteAdapter,
  isAllowedSiteUrl,
  normalizePgn,
  parseGameUrl,
  SiteAdapterError,
  type NormalizedGame,
  type ParsedGameRef,
  type SiteAdapter,
} from "@axiomchess/adapters"

import { ApiError } from "../errors.js"

export const MAX_PGN_BYTES = 512_000

export type SiteAdapterRegistry = Readonly<Record<string, SiteAdapter>>

export type IngestService = {
  normalizePgnText: (pgn: string) => string
  fetchGameFromUrl: (url: string) => Promise<NormalizedGame>
  listRecentGames: (
    site: string,
    username: string,
    maxGames: number,
  ) => Promise<ParsedGameRef[]>
  fetchGameByRef: (ref: ParsedGameRef) => Promise<NormalizedGame>
}

const mapAdapterError = (error: unknown): never => {
  if (error instanceof SiteAdapterError) {
    const status =
      error.code === "not_found" || error.code === "private_or_unavailable"
        ? 404
        : error.code === "rate_limited"
          ? 429
          : 400
    throw new ApiError({
      code: error.code,
      message: error.message,
      status,
      details: error.details,
    })
  }
  throw error
}

export const createIngestService = (
  adapters: SiteAdapterRegistry,
): IngestService => {
  const resolveAdapter = (siteId: string): SiteAdapter => {
    const adapter = adapters[siteId] ?? getSiteAdapter(siteId)
    if (!adapter) {
      throw new ApiError({
        code: "validation_error",
        message: `Unsupported site: ${siteId}`,
        status: 400,
        details: { site: siteId },
      })
    }
    return adapter
  }

  return {
    normalizePgnText: (pgn: string): string => {
      const byteLength = Buffer.byteLength(pgn, "utf8")
      if (byteLength > MAX_PGN_BYTES) {
        throw new ApiError({
          code: "payload_too_large",
          message: `PGN exceeds maximum size of ${MAX_PGN_BYTES} bytes`,
          status: 400,
          details: { byteLength, maxBytes: MAX_PGN_BYTES },
        })
      }
      try {
        return normalizePgn(pgn).pgn
      } catch (error) {
        return mapAdapterError(error)
      }
    },

    fetchGameFromUrl: async (url: string): Promise<NormalizedGame> => {
      if (!isAllowedSiteUrl(url)) {
        throw new ApiError({
          code: "ssrf_rejected",
          message:
            "URL host is not on the allowlist of public chess site hosts",
          status: 400,
        })
      }

      const ref = parseGameUrl(url)
      if (ref === null) {
        throw new ApiError({
          code: "validation_error",
          message: "URL could not be parsed as a supported public game",
          status: 400,
        })
      }

      return fetchByRef(resolveAdapter(ref.site), ref)
    },

    listRecentGames: async (
      site: string,
      username: string,
      maxGames: number,
    ): Promise<ParsedGameRef[]> => {
      const adapter = resolveAdapter(site)
      try {
        return await adapter.listRecentGames(username, { maxGames })
      } catch (error) {
        return mapAdapterError(error)
      }
    },

    fetchGameByRef: async (ref: ParsedGameRef): Promise<NormalizedGame> => {
      return fetchByRef(resolveAdapter(ref.site), ref)
    },
  }
}

const fetchByRef = async (
  adapter: SiteAdapter,
  ref: ParsedGameRef,
): Promise<NormalizedGame> => {
  try {
    const raw = await adapter.fetchGame(ref)
    return adapter.toNormalizedGame(raw)
  } catch (error) {
    return mapAdapterError(error)
  }
}
