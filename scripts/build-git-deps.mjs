#!/usr/bin/env node
/**
 * Git dependencies ship source only. Build dist/ for @axiomchess/* packages
 * when missing (Vercel install and fresh local clones).
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const root = join(import.meta.dirname, "..")
const packages = ["adapters", "analyzer"]

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

for (const name of packages) {
  const dir = join(root, "node_modules", "@axiomchess", name)
  if (!existsSync(dir)) {
    console.warn(`skip @axiomchess/${name}: not installed`)
    continue
  }
  if (existsSync(join(dir, "dist", "index.js"))) {
    console.log(`ok @axiomchess/${name}: dist present`)
    continue
  }
  console.log(`build @axiomchess/${name}`)
  run("pnpm", ["install", "--ignore-workspace"], dir)
  run("pnpm", ["run", "build"], dir)
}
