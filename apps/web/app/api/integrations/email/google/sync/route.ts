import { NextResponse } from "next/server"

import { createLogger } from "@workspace/observability"

import {
  requireActiveGmailConnection,
  triggerGmailIncrementalSync,
} from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

const logger = createLogger("api.integrations.email.google.sync")

export async function POST() {
  const session = await requireSession()
  const integration = await requireActiveGmailConnection(session.user.id)

  if (!integration) {
    return NextResponse.json(
      {
        error: "No active Gmail connection found.",
      },
      {
        status: 404,
      },
    )
  }

  const { jobRun } = await triggerGmailIncrementalSync({
    userId: session.user.id,
    oauthConnectionId: integration.connection.id,
    cursorId: integration.cursor.id,
    source: "web",
  })

  logger.info("Enqueued manual Gmail sync", {
    userId: session.user.id,
    jobRunId: jobRun.id,
    oauthConnectionId: integration.connection.id,
  })

  return NextResponse.json({
    jobRunId: jobRun.id,
  })
}
