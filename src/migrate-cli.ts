import { loadConfig, requireDatabaseUrl } from "./config.js"
import { migrateUp } from "./db/migrate.js"
import { closePool, createPool } from "./db/pool.js"

const main = async (): Promise<void> => {
  const config = loadConfig()
  const databaseUrl = requireDatabaseUrl(config)
  const pool = createPool(databaseUrl)

  try {
    const ran = await migrateUp(pool)
    if (ran.length === 0) {
      console.log("No pending migrations")
      return
    }
    console.log(`Applied migrations: ${ran.join(", ")}`)
  } finally {
    await closePool(pool)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
