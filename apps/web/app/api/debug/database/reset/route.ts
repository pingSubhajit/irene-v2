import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getPrivateStorageArtifactsForUser,
  resetUserDatabaseState,
} from "@workspace/db"
import { deletePrivateObjects } from "@workspace/integrations"
import { createLogger } from "@workspace/observability"

import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

const logger = createLogger("api.debug.database.reset")
const resetSchema = z.object({
  confirmation: z.literal("RESET DATABASE"),
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

  const artifacts = await getPrivateStorageArtifactsForUser(session.user.id)
  await deletePrivateObjects(artifacts.storageKeys)
  const resetResult = await resetUserDatabaseState({
    userId: session.user.id,
  })

  logger.warn("Reset Irene database state without re-enqueueing sync", {
    userId: session.user.id,
    deletedRawDocuments: resetResult.deletedRawDocuments,
    deletedAttachments: resetResult.deletedAttachments,
    deletedStorageObjects: artifacts.storageKeys.length,
    deletedFinancialEvents: resetResult.deletedFinancialEvents,
    deletedExtractedSignals: resetResult.deletedExtractedSignals,
    deletedReviewItems: resetResult.deletedReviewItems,
    deletedRecurringObligations: resetResult.deletedRecurringObligations,
    deletedIncomeStreams: resetResult.deletedIncomeStreams,
    deletedModelRuns: resetResult.deletedModelRuns,
    deletedJobRuns: resetResult.deletedJobRuns,
  })

  return NextResponse.json(resetResult)
}
