import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getUserSettings,
  resetGmailIngestionWindowForConnection,
} from "@workspace/db"
import { deletePrivateObjects } from "@workspace/integrations"
import { createLogger } from "@workspace/observability"

import {
  getDateRangeForResetBackfillPreset,
  type ResetBackfillPreset,
} from "@/lib/date-format"
import { isAdviceEnabled, isMemoryLearningEnabled } from "@/lib/feature-flags"
import {
  GMAIL_CURSOR_NAME,
  requireActiveGmailConnection,
  triggerGmailBackfill,
} from "@/lib/gmail-integration"
import { triggerUserMerchantRepairBackfill } from "@/lib/merchant-resolution"
import { triggerUserMemoryRebuild } from "@/lib/memory-learning"
import { requireSession } from "@/lib/session"
import { triggerUserAdviceRebuild } from "@/lib/advice"
import { triggerUserForecastRebuild } from "@/lib/forecasting"

export const runtime = "nodejs"

const logger = createLogger("api.settings.data.reset-backfill")

const PRESET_CONFIRMATION = "RESET & BACKFILL"

const resetBackfillSchema = z.object({
  preset: z.enum([
    "last_24_hours",
    "last_3_days",
    "last_week",
    "last_2_weeks",
    "last_month",
    "last_quarter",
  ] satisfies [ResetBackfillPreset, ...ResetBackfillPreset[]]),
  confirmation: z.literal(PRESET_CONFIRMATION),
})

const PRESET_WINDOW_DAYS: Record<ResetBackfillPreset, number> = {
  last_24_hours: 1,
  last_3_days: 3,
  last_week: 7,
  last_2_weeks: 14,
  last_month: 30,
  last_quarter: 90,
}

export async function POST(request: Request) {
  const session = await requireSession()
  const body = await request.json().catch(() => null)
  const parsed = resetBackfillSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Confirmation phrase mismatch.",
      },
      { status: 400 },
    )
  }

  const connectionState = await requireActiveGmailConnection(session.user.id)

  if (!connectionState) {
    return NextResponse.json(
      {
        error: "No active Gmail connection found.",
      },
      { status: 404 },
    )
  }

  const settings = await getUserSettings(session.user.id)
  const { dateFrom, dateTo } = getDateRangeForResetBackfillPreset(
    parsed.data.preset,
    settings.timeZone,
  )

  const resetResult = await resetGmailIngestionWindowForConnection({
    oauthConnectionId: connectionState.connection.id,
    userId: session.user.id,
    dateFrom,
    dateTo,
  })

  await deletePrivateObjects(resetResult.storageKeys)

  const { jobRun } = await triggerGmailBackfill({
    userId: session.user.id,
    oauthConnectionId: connectionState.connection.id,
    cursorId: connectionState.cursor.id,
    source: "web",
    windowDays: PRESET_WINDOW_DAYS[parsed.data.preset],
    windowStartAt: dateFrom,
  })

  const rebuildJobs = (
    await Promise.all([
      triggerUserMerchantRepairBackfill({ userId: session.user.id }),
      isMemoryLearningEnabled()
        ? triggerUserMemoryRebuild({ userId: session.user.id, reason: "manual_refresh" })
        : Promise.resolve(null),
      triggerUserForecastRebuild({ userId: session.user.id, reason: "manual_rebuild" }),
      isAdviceEnabled()
        ? triggerUserAdviceRebuild({ userId: session.user.id, reason: "manual_rebuild" })
        : Promise.resolve(null),
    ])
  ).filter((job): job is NonNullable<typeof job> => job !== null)

  logger.info("Reset scoped ingestion window and queued backfill", {
    userId: session.user.id,
    oauthConnectionId: connectionState.connection.id,
    cursorName: GMAIL_CURSOR_NAME,
    preset: parsed.data.preset,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    deletedRawDocuments: resetResult.deletedRawDocuments,
    deletedAttachments: resetResult.deletedAttachments,
    deletedFinancialEvents: resetResult.deletedFinancialEvents,
    deletedReviewItems: resetResult.deletedReviewItems,
    deletedFeedbackEvents: resetResult.deletedFeedbackEvents,
    backfillJobRunId: jobRun.id,
    rebuildJobRunIds: rebuildJobs.map((row) => row.id),
  })

  return NextResponse.json({
    preset: parsed.data.preset,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    deletedRawDocuments: resetResult.deletedRawDocuments,
    deletedAttachments: resetResult.deletedAttachments,
    deletedExtractedSignals: resetResult.deletedExtractedSignals,
    deletedFinancialEvents: resetResult.deletedFinancialEvents,
    deletedReviewItems: resetResult.deletedReviewItems,
    deletedFeedbackEvents: resetResult.deletedFeedbackEvents,
    deletedRecurringObligations: resetResult.deletedRecurringObligations,
    deletedMerchantAliases: resetResult.deletedMerchantAliases,
    deletedFinancialInstitutionAliases: resetResult.deletedFinancialInstitutionAliases,
    deletedPaymentProcessorAliases: resetResult.deletedPaymentProcessorAliases,
    deletedMemoryFacts: resetResult.deletedMemoryFacts,
    deletedPaymentInstrumentObservations: resetResult.deletedPaymentInstrumentObservations,
    deletedStorageObjects: resetResult.storageKeys.length,
    backfillJobRunId: jobRun.id,
  })
}
