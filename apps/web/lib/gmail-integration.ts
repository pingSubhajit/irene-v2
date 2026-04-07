import {
  countRawDocumentsForUser,
  createJobRun,
  type EmailSyncCursorSelect,
  ensureEmailSyncCursor,
  ensureJobRun,
  getGmailOauthConnectionForUser,
  getLatestCursorForConnection,
  listRecentJobRunsForQueues,
  listRecentRawDocumentsForUser,
} from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  BACKFILL_IMPORT_QUEUE_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  GMAIL_BACKFILL_START_JOB_NAME,
  GMAIL_INCREMENTAL_POLL_JOB_NAME,
  enqueueGmailBackfillStart,
  enqueueGmailIncrementalPoll,
} from "@workspace/workflows"

export const GMAIL_CURSOR_NAME = "finance_primary"
export const GMAIL_BACKFILL_WINDOW_DAYS = 90
export const GMAIL_INCREMENTAL_FALLBACK_WINDOW_HOURS = 24

type TriggerBaseInput = {
  userId: string
  oauthConnectionId: string
  cursorId: string
  source: "web" | "worker" | "cron"
}

export async function triggerGmailBackfill(
  input: TriggerBaseInput & {
    windowDays?: number
    windowStartAt?: Date | null
  },
) {
  const correlationId = createCorrelationId()
  const windowDays = input.windowDays ?? GMAIL_BACKFILL_WINDOW_DAYS
  const jobKey = `${GMAIL_BACKFILL_START_JOB_NAME}:${input.oauthConnectionId}:${windowStartAtKey(input.windowStartAt) ?? windowDays}:${correlationId}`
  const jobRun = await ensureJobRun({
    queueName: BACKFILL_IMPORT_QUEUE_NAME,
    jobName: GMAIL_BACKFILL_START_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      cursorId: input.cursorId,
      source: input.source,
      windowDays,
      windowStartAt: input.windowStartAt?.toISOString() ?? null,
    },
  })

  await enqueueGmailBackfillStart({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    oauthConnectionId: input.oauthConnectionId,
    cursorId: input.cursorId,
    source: input.source,
    windowDays,
    windowStartAt: input.windowStartAt?.toISOString() ?? undefined,
  })

  return {
    jobRun,
  }
}

function windowStartAtKey(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 16) : null
}

export async function triggerGmailIncrementalSync(input: TriggerBaseInput) {
  const correlationId = createCorrelationId()
  const jobKey = `${GMAIL_INCREMENTAL_POLL_JOB_NAME}:${input.oauthConnectionId}:${correlationId}`
  const jobRun = await createJobRun({
    queueName: EMAIL_SYNC_QUEUE_NAME,
    jobName: GMAIL_INCREMENTAL_POLL_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      cursorId: input.cursorId,
      source: input.source,
      fallbackWindowHours: GMAIL_INCREMENTAL_FALLBACK_WINDOW_HOURS,
    },
  })

  await enqueueGmailIncrementalPoll({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    oauthConnectionId: input.oauthConnectionId,
    cursorId: input.cursorId,
    source: input.source,
    fallbackWindowHours: GMAIL_INCREMENTAL_FALLBACK_WINDOW_HOURS,
  })

  return {
    jobRun,
  }
}

function hasExistingGmailSyncState(cursor: EmailSyncCursorSelect) {
  return Boolean(
    cursor.providerCursor ||
      cursor.backfillStartedAt ||
      cursor.backfillCompletedAt ||
      cursor.lastSeenMessageAt,
  )
}

export async function triggerGmailSyncAfterConnect(input: TriggerBaseInput & {
  cursor: EmailSyncCursorSelect
}) {
  if (hasExistingGmailSyncState(input.cursor)) {
    const { jobRun } = await triggerGmailIncrementalSync(input)

    return {
      jobRun,
      mode: "incremental" as const,
    }
  }

  const { jobRun } = await triggerGmailBackfill(input)

  return {
    jobRun,
    mode: "backfill" as const,
  }
}

export async function getGmailIntegrationState(userId: string) {
  const connection = await getGmailOauthConnectionForUser(userId)
  const cursor = connection
    ? await ensureEmailSyncCursor(connection.id, GMAIL_CURSOR_NAME)
    : null

  const [rawDocumentCount, recentRawDocuments, recentJobRuns] = await Promise.all([
    countRawDocumentsForUser(userId),
    listRecentRawDocumentsForUser(userId, 5),
    listRecentJobRunsForQueues([BACKFILL_IMPORT_QUEUE_NAME, EMAIL_SYNC_QUEUE_NAME], 8),
  ])

  return {
    connection,
    cursor,
    rawDocumentCount,
    recentRawDocuments,
    recentJobRuns,
  }
}

export async function requireActiveGmailConnection(userId: string) {
  const connection = await getGmailOauthConnectionForUser(userId)

  if (!connection || connection.status === "revoked") {
    return null
  }

  const cursor =
    (await getLatestCursorForConnection(connection.id)) ??
    (await ensureEmailSyncCursor(connection.id, GMAIL_CURSOR_NAME))

  return {
    connection,
    cursor,
  }
}
