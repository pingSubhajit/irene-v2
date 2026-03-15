import { NextResponse } from "next/server"

import { checkDatabaseHealth } from "@workspace/db"
import { checkRedisHealth } from "@workspace/workflows"

export const runtime = "nodejs"

export async function GET() {
  const [database, redis] = await Promise.allSettled([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ])

  const databaseReady = database.status === "fulfilled" && database.value.ok
  const redisReady = redis.status === "fulfilled" && redis.value.ok
  const ready = databaseReady && redisReady

  return NextResponse.json(
    {
      ok: ready,
      checks: {
        database: databaseReady,
        redis: redisReady,
      },
    },
    {
      status: ready ? 200 : 503,
    },
  )
}
