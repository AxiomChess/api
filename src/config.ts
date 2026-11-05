export type AppConfig = {
  port: number
  host: string
  nodeEnv: string
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

  return {
    port,
    host,
    nodeEnv,
  }
}
