import pg from "pg"

export type DbPool = pg.Pool

export const createPool = (databaseUrl: string): DbPool => {
  if (databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is empty")
  }

  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
  })
}

export const closePool = async (pool: DbPool): Promise<void> => {
  await pool.end()
}
