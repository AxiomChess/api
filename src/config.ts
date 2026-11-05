import {
  DEFAULT_ANALYSIS_RETENTION_DAYS,
  parseRetentionDays,
} from "./db/retention.js"

export type AppConfig = {
  port: number
  host: string
  nodeEnv: string
  databaseUrl: string | null
  analysisRetentionDays: number
  apiKeyPepper: string | null
  redisUrl: string | null
}

const DEFAULT_PORT = 3000
const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_NODE_ENV = "development"

export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const portRaw = env.PORT ?? String(DEFAULT_PORT)
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portRaw}`)
  }

  const host = env.HOST?.trim() || DEFAULT_HOST
  if (host.length === 0) {
    throw new Error("Invalid HOST: empty")
  }

  const nodeEnv = env.NODE_ENV?.trim() || DEFAULT_NODE_ENV

  const databaseUrlRaw = env.DATABASE_URL?.trim()
  const databaseUrl =
    databaseUrlRaw && databaseUrlRaw.length > 0 ? databaseUrlRaw : null

  const analysisRetentionDays = parseRetentionDays(env.ANALYSIS_RETENTION_DAYS)

  const pepperRaw = env.API_KEY_PEPPER?.trim()
  const apiKeyPepper = pepperRaw && pepperRaw.length > 0 ? pepperRaw : null

  const redisUrlRaw = env.REDIS_URL?.trim()
  const redisUrl = redisUrlRaw && redisUrlRaw.length > 0 ? redisUrlRaw : null

  return {
    port,
    host,
    nodeEnv,
    databaseUrl,
    analysisRetentionDays,
    apiKeyPepper,
    redisUrl,
  }
}

export const requireDatabaseUrl = (config: AppConfig): string => {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required")
  }
  return config.databaseUrl
}

export { DEFAULT_ANALYSIS_RETENTION_DAYS }
