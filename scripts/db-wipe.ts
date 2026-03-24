import { spawnSync } from "node:child_process"

import pg from "pg"

import { getDatabaseEnv } from "@workspace/config/server"

const CONFIRMATION = "WIPE_DATABASE"

type CliOptions = {
  confirmed: boolean
  skipMigrate: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let confirmed = false
  let skipMigrate = false

  for (const arg of argv) {
    if (arg === `--confirm=${CONFIRMATION}`) {
      confirmed = true
      continue
    }

    if (arg === "--skip-migrate") {
      skipMigrate = true
      continue
    }
  }

  return {
    confirmed,
    skipMigrate,
  }
}

function printUsage() {
  console.error(
    [
      "This command deletes the entire public schema for the configured database.",
      "",
      "Usage:",
      `  pnpm exec tsx scripts/db-wipe.ts --confirm=${CONFIRMATION}`,
      `  pnpm exec tsx scripts/db-wipe.ts --confirm=${CONFIRMATION} --skip-migrate`,
    ].join("\n"),
  )
}

async function wipeDatabase() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.confirmed) {
    printUsage()
    process.exitCode = 1
    return
  }

  const env = getDatabaseEnv()
  const connectionString = env.DATABASE_URL_DIRECT
  const client = new pg.Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  console.log("Wiping database schemas...")

  await client.connect()

  try {
    await client.query("drop schema if exists drizzle cascade")
    await client.query("drop schema if exists public cascade")
    await client.query("create schema public")
    await client.query("grant all on schema public to current_user")
    await client.query("grant all on schema public to public")
  } finally {
    await client.end()
  }

  console.log("Database schemas wiped.")

  if (options.skipMigrate) {
    console.log("Skipped migrations.")
    return
  }

  console.log("Reapplying migrations...")

  const result = spawnSync(
    "pnpm",
    ["db:migrate"],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    },
  )

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    return
  }

  console.log("Database wiped and migrations reapplied.")
}

wipeDatabase().catch((error: unknown) => {
  console.error("Failed to wipe database.")
  console.error(error)
  process.exitCode = 1
})
