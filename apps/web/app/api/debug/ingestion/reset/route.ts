import { NextResponse } from "next/server"
import { z } from "zod"

import {
  ensureEmailSyncCursor,
  getGmailIngestionArtifactsForConnection,
  getGmailOauthConnectionForUser,
  resetGmailIngestionForConnection,
} from "@workspace/db"
import { deletePrivateObjects } from "@workspace/integrations"
import { createLogger } from "@workspace/observability"

import {
  GMAIL_CURSOR_NAME,
  triggerGmailBackfill,
} from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

const logger = createLogger("api.debug.ingestion.reset")
const resetSchema = z.object({
  confirmation: z.literal("RESET INGESTION"),
})

export async function POST(request: Request) {
  const session = await requireSession()
  const body = await request.json().catch(() => null)
  const parsed = resetSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Confirmation phrase mismatch.",
      },
      {
        status: 400,
      },
    )
  }

  const connection = await getGmailOauthConnectionForUser(session.user.id)

  if (!connection || connection.status === "revoked") {
    return NextResponse.json(
      {
        error: "No active Gmail connection found.",
      },
      {
        status: 404,
      },
    )
  }

  const artifacts = await getGmailIngestionArtifactsForConnection(connection.id)

  await deletePrivateObjects(artifacts.storageKeys)

  const resetResult = await resetGmailIngestionForConnection(connection.id)
  const cursor = await ensureEmailSyncCursor(connection.id, GMAIL_CURSOR_NAME)
  const { jobRun } = await triggerGmailBackfill({
    userId: session.user.id,
    oauthConnectionId: connection.id,
    cursorId: cursor.id,
    source: "web",
  })

  logger.info("Reset Gmail ingestion data and re-enqueued backfill", {
    userId: session.user.id,
    oauthConnectionId: connection.id,
    deletedRawDocuments: resetResult.deletedRawDocuments,
    deletedAttachments: resetResult.deletedAttachments,
    deletedStorageObjects: artifacts.storageKeys.length,
    backfillJobRunId: jobRun.id,
  })

  return NextResponse.json({
    deletedRawDocuments: resetResult.deletedRawDocuments,
    deletedAttachments: resetResult.deletedAttachments,
    deletedStorageObjects: artifacts.storageKeys.length,
    backfillJobRunId: jobRun.id,
  })
}
