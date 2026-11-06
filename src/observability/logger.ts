export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogFields = {
  readonly requestId?: string
  readonly analysisId?: string
  readonly pgnContentHash?: string
  readonly [key: string]: unknown
}

export type StructuredLogger = {
  debug: (message: string, fields?: LogFields) => void
  info: (message: string, fields?: LogFields) => void
  warn: (message: string, fields?: LogFields) => void
  error: (message: string, fields?: LogFields) => void
  child: (baseFields: LogFields) => StructuredLogger
}

export type CreateLoggerOptions = {
  readonly service?: string
  readonly minLevel?: LogLevel
  readonly write?: (line: string) => void
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const FORBIDDEN_INFO_KEYS = new Set([
  "pgn",
  "normalizedPgn",
  "pgnBody",
  "rawPgn",
])

const scrubFields = (
  level: LogLevel,
  fields: LogFields | undefined,
): Record<string, unknown> => {
  if (!fields) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (
      level === "info" &&
      FORBIDDEN_INFO_KEYS.has(key) &&
      typeof value === "string"
    ) {
      continue
    }
    out[key] = value
  }
  return out
}

export const createLogger = (
  options: CreateLoggerOptions = {},
): StructuredLogger => {
  const service = options.service ?? "axiomchess-api"
  const minLevel = options.minLevel ?? "info"
  const write =
    options.write ??
    ((line: string) => {
      process.stdout.write(`${line}\n`)
    })

  const emit = (
    level: LogLevel,
    message: string,
    fields?: LogFields,
  ): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
    const record = {
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...scrubFields(level, fields),
    }
    write(JSON.stringify(record))
  }

  const logger: StructuredLogger = {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (baseFields) => {
      const merge = (fields?: LogFields): LogFields => ({
        ...baseFields,
        ...fields,
      })
      return {
        debug: (message, fields) => emit("debug", message, merge(fields)),
        info: (message, fields) => emit("info", message, merge(fields)),
        warn: (message, fields) => emit("warn", message, merge(fields)),
        error: (message, fields) => emit("error", message, merge(fields)),
        child: (more) => logger.child({ ...baseFields, ...more }),
      }
    },
  }

  return logger
}

export const rootLogger = createLogger()
