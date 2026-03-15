import { headers } from "next/headers"
import { NextResponse } from "next/server"

import {
  ensureEmailSyncCursor,
  listSyncableGmailOauthConnections,
} from "@workspace/db"
import { getCronEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import {
  GMAIL_CURSOR_NAME,
  triggerGmailIncrementalSync,
} from "@/lib/gmail-integration"

export const runtime = "nodejs"

const logger = createLogger("api.cron.email-sync")

export async function GET() {
  const env = getCronEnv()

  if (!env.CRON_SECRET) {
    return NextResponse.json(
      {
        error: "CRON_SECRET is not configured.",
      },
      {
        status: 503,
      },
    )
  }

  const authorization = (await headers()).get("authorization")

  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    )
  }

  const connections = await listSyncableGmailOauthConnections()

  const results = await Promise.all(
    connections.map(async (connection) => {
      const cursor = await ensureEmailSyncCursor(connection.id, GMAIL_CURSOR_NAME)
      const { jobRun } = await triggerGmailIncrementalSync({
        userId: connection.userId,
        oauthConnectionId: connection.id,
        cursorId: cursor.id,
        source: "cron",
      })

      return {
        oauthConnectionId: connection.id,
        jobRunId: jobRun.id,
      }
    }),
  )

  logger.info("Enqueued cron-driven Gmail sync jobs", {
    count: results.length,
  })

  return NextResponse.json({
    ok: true,
    enqueued: results.length,
    results,
  })
}
