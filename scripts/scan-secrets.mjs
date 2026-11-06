#!/usr/bin/env node
/**
 * Fail CI when high-confidence secret patterns appear in tracked files.
 * Practical gate only; not a substitute for human review or platform secret scanning.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const root = process.cwd()

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  "vendor",
])

const SKIP_FILE_NAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  ".env.example",
])

const PATTERNS = [
  {
    name: "OpenSSH/PEM private key",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "GitHub personal access token (ghp_)",
    re: /\bghp_[A-Za-z0-9]{36,}\b/,
  },
  {
    name: "GitHub server token (ghs_)",
    re: /\bghs_[A-Za-z0-9]{36,}\b/,
  },
  {
    name: "GitHub fine-grained PAT",
    re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: "AWS access key id (AKIA)",
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "Slack token (xox)",
    re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  },
  {
    name: "Stripe live secret key",
    re: /\bsk_live_[0-9A-Za-z]{16,}\b/,
  },
]

const listTrackedFiles = () => {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return out
      .toString("utf8")
      .split("\0")
      .filter((path) => path.length > 0)
  } catch {
    return walkFiles(root)
  }
}

const walkFiles = (dir) => {
  const results = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      results.push(...walkFiles(full))
      continue
    }
    results.push(relative(root, full).split(sep).join("/"))
  }
  return results
}

const shouldSkipPath = (relPath) => {
  const parts = relPath.split("/")
  if (parts.some((part) => SKIP_DIR_NAMES.has(part))) return true
  const base = parts[parts.length - 1] ?? ""
  if (SKIP_FILE_NAMES.has(base)) return true
  if (base === "scan-secrets.mjs") return true
  return false
}

const isForbiddenEnvPath = (relPath) => {
  const base = relPath.split("/").pop() ?? ""
  if (base === ".env" || base.startsWith(".env.")) {
    return base !== ".env.example"
  }
  return false
}

const hits = []

for (const relPath of listTrackedFiles()) {
  if (shouldSkipPath(relPath)) continue

  if (isForbiddenEnvPath(relPath)) {
    hits.push(`${relPath}: tracked secret env file (use .env.example only)`)
    continue
  }

  const full = join(root, relPath)
  if (!existsSync(full) || !statSync(full).isFile()) continue

  let text
  try {
    text = readFileSync(full, "utf8")
  } catch {
    continue
  }

  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) {
      hits.push(`${relPath}: matched ${pattern.name}`)
    }
  }
}

if (hits.length > 0) {
  console.error("FAIL secret pattern scan")
  for (const hit of hits) {
    console.error(`  ${hit}`)
  }
  process.exit(1)
}

console.log("PASS secret pattern scan (0 hits)")
