import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import pg from "pg"
import type { Pool, PoolClient } from "pg"

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
)

export const defaultMigrationsDir = path.join(packageRoot, "migrations")

const listMigrationFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir)
  return entries
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
}

const migrateWithClient = async (
  client: PoolClient,
  migrationsDir: string,
): Promise<string[]> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const applied = await client.query<{ id: string }>(
    "SELECT id FROM schema_migrations ORDER BY id ASC",
  )
  const appliedIds = new Set(applied.rows.map((row) => row.id))
  const files = await listMigrationFiles(migrationsDir)
  const ran: string[] = []

  for (const file of files) {
    const id = file.replace(/\.sql$/u, "")
    if (appliedIds.has(id)) {
      continue
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8")
    await client.query("BEGIN")
    try {
      await client.query(sql)
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id])
      await client.query("COMMIT")
      ran.push(id)
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  }

  return ran
}

export const migrateUp = async (
  db: Pool | PoolClient,
  migrationsDir: string = defaultMigrationsDir,
): Promise<string[]> => {
  if (db instanceof pg.Pool) {
    const client = await db.connect()
    try {
      return await migrateWithClient(client, migrationsDir)
    } finally {
      client.release()
    }
  }

  return migrateWithClient(db, migrationsDir)
}
