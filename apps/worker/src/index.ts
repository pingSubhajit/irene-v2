import { createHash } from "node:crypto"

import type { Job } from "bullmq"
import { Worker } from "bullmq"

import { classifyFinanceRelevance } from "@workspace/ai"
import {
  closeDatabase,
  ensureJobRun,
  getEmailSyncCursorById,
  getOauthConnectionById,
  updateEmailSyncCursor,
  updateJobRun,
  updateOauthConnection,
  upsertDocumentAttachment,
  upsertRawDocument,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"
import {
  downloadGmailAttachment,
  encryptSecret,
  getGmailMessage,
  getGmailMessageMetadata,
  listGmailHistory,
  listGmailMessageIds,
  type GmailMessageMetadata,
  type GmailNormalizedMessage,
  type GmailAttachmentBlob,
  buildFinanceSearchQuery,
  uploadPrivateObject,
} from "@workspace/integrations"
import {
  BACKFILL_IMPORT_QUEUE_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  GMAIL_BACKFILL_PAGE_JOB_NAME,
  GMAIL_BACKFILL_START_JOB_NAME,
  GMAIL_INCREMENTAL_POLL_JOB_NAME,
  GMAIL_MESSAGE_INGEST_JOB_NAME,
  QUEUE_PREFIX,
  SYSTEM_HEALTHCHECK_JOB_NAME,
  SYSTEM_QUEUE_NAME,
  closeWorkflowConnections,
  createWorkerRedisConnection,
  enqueueGmailBackfillPage,
  enqueueGmailMessageIngest,
  gmailBackfillPageJobPayloadSchema,
  gmailBackfillStartJobPayloadSchema,
  gmailIncrementalPollJobPayloadSchema,
  gmailMessageIngestJobPayloadSchema,
  systemHealthcheckJobPayloadSchema,
} from "@workspace/workflows"

const logger = createLogger("worker")

const workerConnection = createWorkerRedisConnection()

type TrackedPayload = {
  correlationId: string
  jobRunId: string
  jobKey: string
  requestedAt: string
}

function getAttemptCount(job: Job) {
  return job.attemptsMade + 1
}

async function markJobRunning(job: Job, payload: TrackedPayload) {
  await updateJobRun(payload.jobRunId, {
    status: "running",
    attemptCount: getAttemptCount(job),
    startedAt: new Date(),
    errorMessage: null,
  })
}

async function markJobSucceeded(
  job: Job,
  payload: TrackedPayload,
  resultPayload?: Record<string, unknown>,
) {
  await updateJobRun(payload.jobRunId, {
    status: "succeeded",
    attemptCount: getAttemptCount(job),
    completedAt: new Date(),
    errorMessage: null,
    payloadJson: resultPayload ? { ...job.data, ...resultPayload } : job.data,
  })
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").toLowerCase()
}

function getLatestHistoryId(current: string | null, candidate: string | null) {
  if (!candidate) {
    return current
  }

  if (!current) {
    return candidate
  }

  return BigInt(candidate) > BigInt(current) ? candidate : current
}

function createTokenPersister(connectionId: string) {
  return async (tokenUpdate: {
    accessToken?: string | null
    refreshToken?: string | null
    expiryDate?: Date | null
    scope?: string | null
  }) => {
    if (!tokenUpdate.accessToken && !tokenUpdate.refreshToken && !tokenUpdate.expiryDate) {
      return
    }

    await updateOauthConnection(connectionId, {
      accessTokenEncrypted: tokenUpdate.accessToken
        ? encryptSecret(tokenUpdate.accessToken)
        : undefined,
      refreshTokenEncrypted: tokenUpdate.refreshToken
        ? encryptSecret(tokenUpdate.refreshToken)
        : undefined,
      tokenExpiresAt: tokenUpdate.expiryDate,
      scope: tokenUpdate.scope ?? undefined,
      status: "active",
    })
  }
}

function metadataToClassifierInput(message: GmailMessageMetadata) {
  return {
    sender: message.fromAddress,
    subject: message.subject,
    snippet: message.snippet,
    labelIds: message.labelIds,
    timestamp: message.internalDate?.toISOString() ?? null,
    attachmentNames: message.attachmentNames,
  }
}

async function enqueueTrackedMessageIngest(input: {
  userId: string
  oauthConnectionId: string
  cursorId: string
  correlationId: string
  providerMessageId: string
  sourceKind: "backfill" | "incremental"
  historyId?: string | null
}) {
  const jobKey = `${GMAIL_MESSAGE_INGEST_JOB_NAME}:${input.oauthConnectionId}:${input.providerMessageId}`
  const jobRun = await ensureJobRun({
    queueName: EMAIL_SYNC_QUEUE_NAME,
    jobName: GMAIL_MESSAGE_INGEST_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      cursorId: input.cursorId,
      providerMessageId: input.providerMessageId,
      source: "worker",
      sourceKind: input.sourceKind,
      historyId: input.historyId ?? null,
    },
  })

  await enqueueGmailMessageIngest({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    oauthConnectionId: input.oauthConnectionId,
    cursorId: input.cursorId,
    providerMessageId: input.providerMessageId,
    source: "worker",
    sourceKind: input.sourceKind,
    historyId: input.historyId ?? undefined,
  })
}

async function enqueueTrackedBackfillPage(input: {
  userId: string
  oauthConnectionId: string
  cursorId: string
  correlationId: string
  query: string
  windowDays: number
  pageToken?: string
}) {
  const jobKey = `${GMAIL_BACKFILL_PAGE_JOB_NAME}:${input.oauthConnectionId}:${input.correlationId}:${input.pageToken ?? "first"}`
  const jobRun = await ensureJobRun({
    queueName: BACKFILL_IMPORT_QUEUE_NAME,
    jobName: GMAIL_BACKFILL_PAGE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      cursorId: input.cursorId,
      query: input.query,
      pageToken: input.pageToken ?? null,
      source: "worker",
      windowDays: input.windowDays,
    },
  })

  await enqueueGmailBackfillPage({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    oauthConnectionId: input.oauthConnectionId,
    cursorId: input.cursorId,
    source: "worker",
    windowDays: input.windowDays,
    pageToken: input.pageToken,
    query: input.query,
  })
}

async function processCandidateMessages(input: {
  job: Job
  userId: string
  oauthConnectionId: string
  cursorId: string
  correlationId: string
  sourceKind: "backfill" | "incremental"
  messageIds: string[]
}) {
  const connection = await getOauthConnectionById(input.oauthConnectionId)

  if (!connection || connection.status === "revoked") {
    return {
      acceptedCount: 0,
      skippedCount: input.messageIds.length,
      lastSeenMessageAt: null as Date | null,
      latestHistoryId: null as string | null,
    }
  }

  const onTokenUpdate = createTokenPersister(connection.id)
  let acceptedCount = 0
  let skippedCount = 0
  let latestHistoryId: string | null = null
  let lastSeenMessageAt: Date | null = null

  for (const messageId of input.messageIds) {
    const metadata = await getGmailMessageMetadata(connection, messageId, onTokenUpdate)
    latestHistoryId = getLatestHistoryId(latestHistoryId, metadata.historyId)

    if (metadata.internalDate) {
      lastSeenMessageAt =
        !lastSeenMessageAt ||
        metadata.internalDate.getTime() > lastSeenMessageAt.getTime()
          ? metadata.internalDate
          : lastSeenMessageAt
    }

    try {
      const decision = await classifyFinanceRelevance(metadataToClassifierInput(metadata))

      if (decision.decision === "accept") {
        acceptedCount += 1
        await enqueueTrackedMessageIngest({
          userId: input.userId,
          oauthConnectionId: input.oauthConnectionId,
          cursorId: input.cursorId,
          correlationId: input.correlationId,
          providerMessageId: metadata.id,
          sourceKind: input.sourceKind,
          historyId: metadata.historyId,
        })
        continue
      }

      skippedCount += 1
    } catch (error) {
      if (getAttemptCount(input.job) >= ((input.job.opts.attempts as number | undefined) ?? 3)) {
        logger.warn("Skipping borderline Gmail message after classifier retries exhausted", {
          jobId: input.job.id,
          messageId,
        })
        skippedCount += 1
        continue
      }

      throw error
    }
  }

  return {
    acceptedCount,
    skippedCount,
    lastSeenMessageAt,
    latestHistoryId,
  }
}

function isHistoryExpiredError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number" &&
    error.code === 404
  )
}

async function handleSystemJob(job: Job) {
  const payload = systemHealthcheckJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  logger.info("Processing system healthcheck job", {
    jobId: job.id,
    correlationId: payload.correlationId,
    jobRunId: payload.jobRunId,
  })

  await markJobSucceeded(job, payload, {
    ok: true,
    processedAt: new Date().toISOString(),
  })

  return {
    ok: true,
  }
}

async function handleGmailBackfillStart(job: Job) {
  const payload = gmailBackfillStartJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const cursor = await getEmailSyncCursorById(payload.cursorId)

  if (!cursor) {
    throw new Error(`Missing email sync cursor ${payload.cursorId}`)
  }

  await updateEmailSyncCursor(cursor.id, {
    backfillStartedAt: new Date(),
    backfillCompletedAt: null,
  })

  const query = buildFinanceSearchQuery(payload.windowDays)

  await enqueueTrackedBackfillPage({
    userId: payload.userId,
    oauthConnectionId: payload.oauthConnectionId,
    cursorId: payload.cursorId,
    correlationId: payload.correlationId,
    query,
    windowDays: payload.windowDays,
  })

  await markJobSucceeded(job, payload, {
    query,
  })

  return {
    query,
  }
}

async function handleGmailBackfillPage(job: Job) {
  const payload = gmailBackfillPageJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const connection = await getOauthConnectionById(payload.oauthConnectionId)

  if (!connection || connection.status === "revoked") {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "connection_unavailable",
    })
    return {
      skipped: true,
    }
  }

  const onTokenUpdate = createTokenPersister(connection.id)
  const page = await listGmailMessageIds(
    connection,
    {
      query: payload.query,
      pageToken: payload.pageToken,
    },
    onTokenUpdate,
  )

  const processed = await processCandidateMessages({
    job,
    userId: payload.userId,
    oauthConnectionId: payload.oauthConnectionId,
    cursorId: payload.cursorId,
    correlationId: payload.correlationId,
    sourceKind: "backfill",
    messageIds: page.messages.map((message) => message.id),
  })

  const cursor = await getEmailSyncCursorById(payload.cursorId)

  if (!cursor) {
    throw new Error(`Missing email sync cursor ${payload.cursorId}`)
  }

  await updateEmailSyncCursor(cursor.id, {
    providerCursor: processed.latestHistoryId ?? cursor.providerCursor ?? null,
    lastSeenMessageAt: processed.lastSeenMessageAt ?? cursor.lastSeenMessageAt ?? null,
    backfillCompletedAt: page.nextPageToken ? null : new Date(),
  })

  if (page.nextPageToken) {
    await enqueueTrackedBackfillPage({
      userId: payload.userId,
      oauthConnectionId: payload.oauthConnectionId,
      cursorId: payload.cursorId,
      correlationId: payload.correlationId,
      query: payload.query,
      windowDays: payload.windowDays,
      pageToken: page.nextPageToken,
    })
  }

  await updateOauthConnection(connection.id, {
    lastSuccessfulSyncAt: new Date(),
    status: "active",
  })

  await markJobSucceeded(job, payload, {
    acceptedCount: processed.acceptedCount,
    skippedCount: processed.skippedCount,
    nextPageToken: page.nextPageToken ?? null,
  })

  return {
    acceptedCount: processed.acceptedCount,
    skippedCount: processed.skippedCount,
    nextPageToken: page.nextPageToken ?? null,
  }
}

async function handleGmailIncrementalPoll(job: Job) {
  const payload = gmailIncrementalPollJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const connection = await getOauthConnectionById(payload.oauthConnectionId)
  const cursor = await getEmailSyncCursorById(payload.cursorId)

  if (!connection || !cursor || connection.status === "revoked") {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "connection_or_cursor_unavailable",
    })
    return {
      skipped: true,
    }
  }

  const onTokenUpdate = createTokenPersister(connection.id)
  let messageIds: string[] = []
  let latestHistoryId = cursor.providerCursor
  let usedFallback = false

  if (cursor.providerCursor) {
    try {
      let nextPageToken: string | null | undefined = undefined

      do {
        const historyPage = await listGmailHistory(
          connection,
          {
            startHistoryId: cursor.providerCursor,
            pageToken: nextPageToken ?? undefined,
          },
          onTokenUpdate,
        )

        latestHistoryId = historyPage.historyId ?? latestHistoryId
        messageIds.push(...historyPage.messages.map((message) => message.id))
        nextPageToken = historyPage.nextPageToken
      } while (nextPageToken)
    } catch (error) {
      if (!isHistoryExpiredError(error)) {
        throw error
      }

      usedFallback = true
      logger.warn("Falling back to recent-window Gmail query after invalid history cursor", {
        cursorId: cursor.id,
        oauthConnectionId: connection.id,
      })
    }
  } else {
    usedFallback = true
  }

  if (usedFallback) {
    const fallbackWindowDays = Math.max(1, Math.ceil(payload.fallbackWindowHours / 24))
    const recentQuery = buildFinanceSearchQuery(fallbackWindowDays)
    let nextPageToken: string | null | undefined = undefined

    do {
      const recentPage = await listGmailMessageIds(
        connection,
        {
          query: recentQuery,
          pageToken: nextPageToken ?? undefined,
        },
        onTokenUpdate,
      )

      messageIds.push(...recentPage.messages.map((message) => message.id))
      nextPageToken = recentPage.nextPageToken
    } while (nextPageToken)
  }

  messageIds = [...new Set(messageIds)]

  const processed = await processCandidateMessages({
    job,
    userId: payload.userId,
    oauthConnectionId: payload.oauthConnectionId,
    cursorId: payload.cursorId,
    correlationId: payload.correlationId,
    sourceKind: "incremental",
    messageIds,
  })

  await updateEmailSyncCursor(cursor.id, {
    providerCursor: processed.latestHistoryId ?? latestHistoryId ?? cursor.providerCursor ?? null,
    lastSeenMessageAt: processed.lastSeenMessageAt ?? cursor.lastSeenMessageAt ?? null,
  })
  await updateOauthConnection(connection.id, {
    lastSuccessfulSyncAt: new Date(),
    status: "active",
  })

  await markJobSucceeded(job, payload, {
    acceptedCount: processed.acceptedCount,
    skippedCount: processed.skippedCount,
    usedFallback,
    processedCount: messageIds.length,
  })

  return {
    acceptedCount: processed.acceptedCount,
    skippedCount: processed.skippedCount,
    usedFallback,
    processedCount: messageIds.length,
  }
}

async function uploadRawHtml(input: {
  userId: string
  oauthConnectionId: string
  message: GmailNormalizedMessage
}) {
  if (!input.message.bodyHtml) {
    return null
  }

  const storageKey = `gmail/raw-html/${input.userId}/${input.oauthConnectionId}/${input.message.providerMessageId}.html`

  await uploadPrivateObject({
    storageKey,
    body: input.message.bodyHtml,
    contentType: "text/html; charset=utf-8",
  })

  return storageKey
}

async function storeAttachments(input: {
  connectionId: string
  messageId: string
  rawDocumentId: string
  attachments: GmailAttachmentBlob[]
}) {
  const connection = await getOauthConnectionById(input.connectionId)

  if (!connection) {
    throw new Error(`Missing oauth connection ${input.connectionId}`)
  }

  const onTokenUpdate = createTokenPersister(connection.id)
  let storedCount = 0

  for (const attachment of input.attachments) {
    const buffer = await downloadGmailAttachment(
      connection,
      {
        messageId: input.messageId,
        attachmentId: attachment.attachmentId,
      },
      onTokenUpdate,
    )

    const sha256Hash = createHash("sha256").update(buffer).digest("hex")
    const storageKey = `gmail/attachments/${connection.userId}/${input.rawDocumentId}/${sha256Hash}-${sanitizeFilename(attachment.filename)}`

    await uploadPrivateObject({
      storageKey,
      body: buffer,
      contentType: attachment.mimeType,
    })

    await upsertDocumentAttachment({
      rawDocumentId: input.rawDocumentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      storageKey,
      sizeBytes: attachment.sizeBytes,
      sha256Hash,
      parseStatus: "pending",
    })
    storedCount += 1
  }

  return storedCount
}

async function handleGmailMessageIngest(job: Job) {
  const payload = gmailMessageIngestJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const connection = await getOauthConnectionById(payload.oauthConnectionId)
  const cursor = await getEmailSyncCursorById(payload.cursorId)

  if (!connection || !cursor || connection.status === "revoked") {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "connection_or_cursor_unavailable",
    })
    return {
      skipped: true,
    }
  }

  const onTokenUpdate = createTokenPersister(connection.id)
  const message = await getGmailMessage(connection, payload.providerMessageId, onTokenUpdate)
  const bodyHtmlStorageKey = await uploadRawHtml({
    userId: payload.userId,
    oauthConnectionId: payload.oauthConnectionId,
    message,
  })
  const { rawDocument, created } = await upsertRawDocument({
    userId: payload.userId,
    oauthConnectionId: payload.oauthConnectionId,
    sourceType: "email",
    providerMessageId: message.providerMessageId,
    threadId: message.threadId,
    messageTimestamp: message.messageTimestamp,
    fromAddress: message.fromAddress,
    toAddress: message.toAddress,
    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtmlStorageKey,
    snippet: message.snippet,
    hasAttachments: message.hasAttachments,
    documentHash: message.documentHash,
  })

  const attachmentCount = await storeAttachments({
    connectionId: connection.id,
    messageId: message.providerMessageId,
    rawDocumentId: rawDocument.id,
    attachments: message.attachments,
  })

  await updateEmailSyncCursor(cursor.id, {
    providerCursor: message.historyId ?? payload.historyId ?? cursor.providerCursor ?? null,
    lastSeenMessageAt: message.messageTimestamp,
  })
  await updateOauthConnection(connection.id, {
    lastSuccessfulSyncAt: new Date(),
    status: "active",
  })

  await markJobSucceeded(job, payload, {
    rawDocumentId: rawDocument.id,
    rawDocumentCreated: created,
    attachmentCount,
  })

  return {
    rawDocumentId: rawDocument.id,
    rawDocumentCreated: created,
    attachmentCount,
  }
}

const systemWorker = new Worker(
  SYSTEM_QUEUE_NAME,
  async (job) => {
    if (job.name !== SYSTEM_HEALTHCHECK_JOB_NAME) {
      throw new Error(`Unsupported job: ${job.name}`)
    }

    return handleSystemJob(job)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 5,
  },
)

const backfillWorker = new Worker(
  BACKFILL_IMPORT_QUEUE_NAME,
  async (job) => {
    if (job.name === GMAIL_BACKFILL_START_JOB_NAME) {
      return handleGmailBackfillStart(job)
    }

    if (job.name === GMAIL_BACKFILL_PAGE_JOB_NAME) {
      return handleGmailBackfillPage(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

const emailSyncWorker = new Worker(
  EMAIL_SYNC_QUEUE_NAME,
  async (job) => {
    if (job.name === GMAIL_INCREMENTAL_POLL_JOB_NAME) {
      return handleGmailIncrementalPoll(job)
    }

    if (job.name === GMAIL_MESSAGE_INGEST_JOB_NAME) {
      return handleGmailMessageIngest(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 4,
  },
)

for (const [queueName, worker] of [
  [SYSTEM_QUEUE_NAME, systemWorker],
  [BACKFILL_IMPORT_QUEUE_NAME, backfillWorker],
  [EMAIL_SYNC_QUEUE_NAME, emailSyncWorker],
] as const) {
  worker.on("ready", () => {
    logger.info("Worker ready", { queueName })
  })

  worker.on("failed", async (job, error) => {
    logger.errorWithCause("Worker job failed", error, {
      queueName,
      jobId: job?.id,
      jobName: job?.name,
    })

    const jobRunId = job?.data?.jobRunId

    if (typeof jobRunId === "string") {
      await updateJobRun(jobRunId, {
        status: "failed",
        attemptCount: job?.attemptsMade ?? 0,
        completedAt: new Date(),
        errorMessage: error.message,
        payloadJson: job?.data,
      })
    }

    const oauthConnectionId = job?.data?.oauthConnectionId

    if (typeof oauthConnectionId === "string") {
      await updateOauthConnection(oauthConnectionId, {
        lastFailedSyncAt: new Date(),
        status: "error",
      })
    }
  })
}

async function shutdown(signal: string) {
  logger.info("Shutting down worker", { signal })

  await Promise.all([
    systemWorker.close(),
    backfillWorker.close(),
    emailSyncWorker.close(),
  ])
  await closeWorkflowConnections()
  await closeDatabase()
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        logger.errorWithCause("Worker shutdown failed", error, { signal })
        process.exit(1)
      })
  })
}
