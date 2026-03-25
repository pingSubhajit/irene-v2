import {
  ensureEmailSyncCursor,
  listSyncableGmailOauthConnections,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"

import { GMAIL_CURSOR_NAME, triggerGmailIncrementalSync } from "./gmail-integration"
import { FX_WARM_LOOKBACK_DAYS, triggerFxRateWarmup } from "./fx-valuation"

const emailSyncLogger = createLogger("cron.email-sync")
const fxRatesLogger = createLogger("cron.fx-rates")

export async function enqueueScheduledGmailIncrementalSyncJobs() {
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

  emailSyncLogger.info("Enqueued scheduled Gmail sync jobs", {
    count: results.length,
  })

  return {
    ok: true as const,
    enqueued: results.length,
    results,
  }
}

export async function enqueueScheduledFxRateWarmup() {
  const { jobRun } = await triggerFxRateWarmup(FX_WARM_LOOKBACK_DAYS)

  fxRatesLogger.info("Enqueued scheduled FX warmup job", {
    jobRunId: jobRun.id,
    lookbackDays: FX_WARM_LOOKBACK_DAYS,
  })

  return {
    ok: true as const,
    jobRunId: jobRun.id,
    lookbackDays: FX_WARM_LOOKBACK_DAYS,
  }
}
