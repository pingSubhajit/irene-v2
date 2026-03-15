import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"

import { getDatabaseEnv } from "@workspace/config/server"

import { schema } from "./schema"

const globalForDb = globalThis as typeof globalThis & {
  __irenePool?: Pool
}

function createPool() {
  const env = getDatabaseEnv()

  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    ssl: {
      rejectUnauthorized: false,
    },
  })
}

export const pool = globalForDb.__irenePool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalForDb.__irenePool = pool
}

export const db = drizzle(pool, { schema })

export async function checkDatabaseHealth() {
  await pool.query("select 1")

  return {
    ok: true,
  }
}

export async function closeDatabase() {
  await pool.end()
}
