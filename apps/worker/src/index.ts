import { createHash } from "node:crypto"

import type { Job } from "bullmq"
import { Worker } from "bullmq"

import {
  aiModels,
  aiPromptVersions,
  classifyFinanceRelevance,
  extractStructuredSignals,
  routeDocumentForExtraction,
} from "@workspace/ai"
import {
  createExtractedSignals,
  createModelRun,
  closeDatabase,
  ensureJobRun,
  getEmailSyncCursorById,
  getOauthConnectionById,
  getRawDocumentById,
  hasExtractedSignalsForRawDocument,
  updateEmailSyncCursor,
  updateJobRun,
  updateModelRun,
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
  type GmailAttachmentBlob,
  buildFinanceSearchQuery,
  uploadPrivateObject,
} from "@workspace/integrations"
import {
  AI_EXTRACTION_QUEUE_NAME,
  BACKFILL_IMPORT_QUEUE_NAME,
  DOCUMENT_EXTRACT_ROUTE_JOB_NAME,
  DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME,
  DOCUMENT_NORMALIZATION_QUEUE_NAME,
  DOCUMENT_NORMALIZE_JOB_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  GMAIL_BACKFILL_PAGE_JOB_NAME,
  GMAIL_BACKFILL_START_JOB_NAME,
  GMAIL_INCREMENTAL_POLL_JOB_NAME,
  GMAIL_MESSAGE_INGEST_JOB_NAME,
  RECONCILIATION_QUEUE_NAME,
  QUEUE_PREFIX,
  SIGNAL_RECONCILE_JOB_NAME,
  SYSTEM_HEALTHCHECK_JOB_NAME,
  SYSTEM_QUEUE_NAME,
  closeWorkflowConnections,
  createWorkerRedisConnection,
  documentExtractRouteJobPayloadSchema,
  documentExtractStructuredJobPayloadSchema,
  documentNormalizeJobPayloadSchema,
  enqueueDocumentExtractRoute,
  enqueueDocumentExtractStructured,
  enqueueDocumentNormalize,
  enqueueGmailBackfillPage,
  enqueueGmailMessageIngest,
  enqueueSignalReconcile,
  gmailBackfillPageJobPayloadSchema,
  gmailBackfillStartJobPayloadSchema,
  gmailIncrementalPollJobPayloadSchema,
  gmailMessageIngestJobPayloadSchema,
  reconciliationJobPayloadSchema,
  systemHealthcheckJobPayloadSchema,
} from "@workspace/workflows"

import {
  buildNormalizedExtractionDocument,
  runDeterministicExtraction,
  type WorkerExtractedSignal,
} from "./extraction"
import { reconcileExtractedSignal } from "./reconciliation"

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
  relevanceLabel: "transactional_finance" | "obligation_finance"
  relevanceStage: "heuristic" | "model"
  relevanceScore: number
  relevanceReasons: string[]
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
      relevanceLabel: input.relevanceLabel,
      relevanceStage: input.relevanceStage,
      relevanceScore: input.relevanceScore,
      relevanceReasons: input.relevanceReasons,
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
    relevanceLabel: input.relevanceLabel,
    relevanceStage: input.relevanceStage,
    relevanceScore: input.relevanceScore,
    relevanceReasons: input.relevanceReasons,
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

async function enqueueTrackedDocumentNormalize(input: {
  userId: string
  rawDocumentId: string
  correlationId: string
}) {
  const jobKey = `${DOCUMENT_NORMALIZE_JOB_NAME}:${input.rawDocumentId}`
  const jobRun = await ensureJobRun({
    queueName: DOCUMENT_NORMALIZATION_QUEUE_NAME,
    jobName: DOCUMENT_NORMALIZE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      source: "worker",
    },
  })

  await enqueueDocumentNormalize({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    rawDocumentId: input.rawDocumentId,
    source: "worker",
  })
}

async function enqueueTrackedDocumentExtractRoute(input: {
  userId: string
  rawDocumentId: string
  correlationId: string
  normalizationJobRunId?: string
}) {
  const jobKey = `${DOCUMENT_EXTRACT_ROUTE_JOB_NAME}:${input.rawDocumentId}`
  const jobRun = await ensureJobRun({
    queueName: AI_EXTRACTION_QUEUE_NAME,
    jobName: DOCUMENT_EXTRACT_ROUTE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      source: "worker",
      normalizationJobRunId: input.normalizationJobRunId ?? null,
    },
  })

  await enqueueDocumentExtractRoute({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    rawDocumentId: input.rawDocumentId,
    source: "worker",
    normalizationJobRunId: input.normalizationJobRunId,
  })
}

async function enqueueTrackedDocumentExtractStructured(input: {
  userId: string
  rawDocumentId: string
  correlationId: string
  routeJobRunId: string
  routeModelRunId?: string
  routeLabel:
    | "purchase"
    | "income"
    | "subscription_charge"
    | "emi_payment"
    | "bill_payment"
    | "refund"
    | "transfer"
    | "generic_finance"
  routeConfidence: number
  routeReasons: string[]
}) {
  const jobKey = `${DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME}:${input.rawDocumentId}`
  const jobRun = await ensureJobRun({
    queueName: AI_EXTRACTION_QUEUE_NAME,
    jobName: DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      source: "worker",
      routeJobRunId: input.routeJobRunId,
      routeModelRunId: input.routeModelRunId ?? null,
      routeLabel: input.routeLabel,
      routeConfidence: input.routeConfidence,
      routeReasons: input.routeReasons,
    },
  })

  await enqueueDocumentExtractStructured({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    rawDocumentId: input.rawDocumentId,
    source: "worker",
    routeJobRunId: input.routeJobRunId,
    routeModelRunId: input.routeModelRunId,
    routeLabel: input.routeLabel,
    routeConfidence: input.routeConfidence,
    routeReasons: input.routeReasons,
  })
}

async function enqueueTrackedSignalReconcile(input: {
  userId: string
  extractedSignalId: string
  rawDocumentId: string
  correlationId: string
}) {
  const jobKey = `${SIGNAL_RECONCILE_JOB_NAME}:${input.extractedSignalId}`
  const jobRun = await ensureJobRun({
    queueName: RECONCILIATION_QUEUE_NAME,
    jobName: SIGNAL_RECONCILE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      extractedSignalId: input.extractedSignalId,
      rawDocumentId: input.rawDocumentId,
      source: "worker",
    },
  })

  await enqueueSignalReconcile({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    extractedSignalId: input.extractedSignalId,
    rawDocumentId: input.rawDocumentId,
    source: "worker",
  })
}

async function persistExtractedSignals(input: {
  userId: string
  rawDocumentId: string
  modelRunId?: string | null
  source: "deterministic" | "model"
  parserNameOrPrompt: string
  routeLabel:
    | "purchase"
    | "income"
    | "subscription_charge"
    | "emi_payment"
    | "bill_payment"
    | "refund"
    | "transfer"
    | "generic_finance"
    | null
  routeConfidence: number | null
  routeReasons: string[]
  attachmentIds: string[]
  signals: WorkerExtractedSignal[]
}) {
  const createdSignals = await createExtractedSignals(
    input.signals.map((signal) => ({
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      modelRunId: input.modelRunId ?? null,
      signalType: signal.signalType,
      candidateEventType: signal.candidateEventType,
      amountMinor: signal.amountMinor ?? null,
      currency: signal.currency ?? null,
      eventDate: signal.eventDate ?? null,
      merchantRaw: signal.merchantRaw ?? null,
      merchantHint: signal.merchantHint ?? null,
      paymentInstrumentHint: signal.paymentInstrumentHint ?? null,
      categoryHint: signal.categoryHint ?? null,
      isRecurringHint: signal.isRecurringHint,
      isEmiHint: signal.isEmiHint,
      confidence: signal.confidence,
      evidenceJson: {
        source: input.source,
        parserOrPrompt: input.parserNameOrPrompt,
        snippets: signal.evidenceSnippets,
        explanation: signal.explanation,
        attachmentIds: input.attachmentIds,
        route:
          input.routeLabel !== null
            ? {
                label: input.routeLabel,
                confidence: input.routeConfidence,
                reasons: input.routeReasons,
              }
            : null,
      },
      status: "pending",
    })),
  )

  await Promise.all(
    createdSignals.map((signal) =>
      enqueueTrackedSignalReconcile({
        userId: input.userId,
        extractedSignalId: signal.id,
        rawDocumentId: input.rawDocumentId,
        correlationId: `${input.rawDocumentId}:${signal.id}`,
      }),
    ),
  )

  return createdSignals
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
      acceptedTransactionalCount: 0,
      acceptedObligationCount: 0,
      skippedMarketingCount: 0,
      skippedNonFinanceCount: input.messageIds.length,
      lastSeenMessageAt: null as Date | null,
      latestHistoryId: null as string | null,
    }
  }

  const onTokenUpdate = createTokenPersister(connection.id)
  let acceptedTransactionalCount = 0
  let acceptedObligationCount = 0
  let skippedMarketingCount = 0
  let skippedNonFinanceCount = 0
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
        if (decision.classification === "transactional_finance") {
          acceptedTransactionalCount += 1
        } else if (decision.classification === "obligation_finance") {
          acceptedObligationCount += 1
        } else {
          skippedNonFinanceCount += 1
          continue
        }
        await enqueueTrackedMessageIngest({
          userId: input.userId,
          oauthConnectionId: input.oauthConnectionId,
          cursorId: input.cursorId,
          correlationId: input.correlationId,
          providerMessageId: metadata.id,
          sourceKind: input.sourceKind,
          historyId: metadata.historyId,
          relevanceLabel: decision.classification,
          relevanceStage: decision.stage,
          relevanceScore: decision.score,
          relevanceReasons: decision.reasons,
        })
        continue
      }

      if (decision.classification === "marketing_finance") {
        skippedMarketingCount += 1
      } else {
        skippedNonFinanceCount += 1
      }
    } catch (error) {
      if (getAttemptCount(input.job) >= ((input.job.opts.attempts as number | undefined) ?? 3)) {
        logger.warn("Skipping borderline Gmail message after classifier retries exhausted", {
          jobId: input.job.id,
          messageId,
        })
        skippedNonFinanceCount += 1
        continue
      }

      throw error
    }
  }

  return {
    acceptedTransactionalCount,
    acceptedObligationCount,
    skippedMarketingCount,
    skippedNonFinanceCount,
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
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    nextPageToken: page.nextPageToken ?? null,
  })

  return {
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
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
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    usedFallback,
    processedCount: messageIds.length,
  })

  return {
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    usedFallback,
    processedCount: messageIds.length,
  }
}

async function uploadRawHtml(input: {
  userId: string
  oauthConnectionId: string
  message: {
    providerMessageId: string
    bodyHtml: string | null
  }
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
    relevanceLabel: payload.relevanceLabel,
    relevanceStage: payload.relevanceStage,
    relevanceScore: payload.relevanceScore,
    relevanceReasonsJson: payload.relevanceReasons,
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

  await enqueueTrackedDocumentNormalize({
    userId: payload.userId,
    rawDocumentId: rawDocument.id,
    correlationId: payload.correlationId,
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

async function handleDocumentNormalize(job: Job) {
  const payload = documentNormalizeJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const rawDocument = await getRawDocumentById(payload.rawDocumentId)

  if (!rawDocument) {
    throw new Error(`Missing raw document ${payload.rawDocumentId}`)
  }

  if (await hasExtractedSignalsForRawDocument(rawDocument.id)) {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "already_extracted",
    })
    return {
      skipped: true,
    }
  }

  const normalizedDocument = await buildNormalizedExtractionDocument(rawDocument)
  const deterministic = runDeterministicExtraction(normalizedDocument)

  if (deterministic) {
    const attachmentIds = normalizedDocument.attachmentTexts.map(
      (attachment) => attachment.attachmentId,
    )
    const signals = await persistExtractedSignals({
      userId: payload.userId,
      rawDocumentId: rawDocument.id,
      source: "deterministic",
      parserNameOrPrompt: deterministic.parserName,
      routeLabel: null,
      routeConfidence: null,
      routeReasons: [],
      attachmentIds,
      signals: deterministic.signals,
    })

    await markJobSucceeded(job, payload, {
      extractionSource: "deterministic",
      signalCount: signals.length,
      parserName: deterministic.parserName,
      rawDocumentId: rawDocument.id,
      attachmentIds,
    })

    return {
      extractionSource: "deterministic",
      signalCount: signals.length,
    }
  }

  await enqueueTrackedDocumentExtractRoute({
    userId: payload.userId,
    rawDocumentId: rawDocument.id,
    correlationId: payload.correlationId,
    normalizationJobRunId: payload.jobRunId,
  })

  await markJobSucceeded(job, payload, {
    extractionSource: "model",
    normalizedAttachmentCount: normalizedDocument.attachmentTexts.length,
    bodyTextPresent: Boolean(normalizedDocument.bodyText),
    rawDocumentId: rawDocument.id,
  })

  return {
    extractionSource: "model",
  }
}

async function handleDocumentExtractRoute(job: Job) {
  const payload = documentExtractRouteJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const rawDocument = await getRawDocumentById(payload.rawDocumentId)

  if (!rawDocument) {
    throw new Error(`Missing raw document ${payload.rawDocumentId}`)
  }

  if (await hasExtractedSignalsForRawDocument(rawDocument.id)) {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "already_extracted",
    })
    return {
      skipped: true,
    }
  }

  const normalizedDocument = await buildNormalizedExtractionDocument(rawDocument)
  const modelRun = await createModelRun({
    userId: payload.userId,
    rawDocumentId: rawDocument.id,
    taskType: "classification_support",
    provider: "ai-gateway",
    modelName: aiModels.financeDocumentRouter,
    promptVersion: aiPromptVersions.financeDocumentRouter,
    status: "running",
  })

  try {
    const routed = await routeDocumentForExtraction(normalizedDocument)

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: routed.metadata.provider,
      modelName: routed.metadata.modelName,
      promptVersion: routed.metadata.promptVersion,
      inputTokens: routed.metadata.inputTokens,
      outputTokens: routed.metadata.outputTokens,
      latencyMs: routed.metadata.latencyMs,
      requestId: routed.metadata.requestId,
    })

    await enqueueTrackedDocumentExtractStructured({
      userId: payload.userId,
      rawDocumentId: rawDocument.id,
      correlationId: payload.correlationId,
      routeJobRunId: payload.jobRunId,
      routeModelRunId: modelRun.id,
      routeLabel: routed.route.routeLabel,
      routeConfidence: routed.route.confidence,
      routeReasons: routed.route.reasons,
    })

    await markJobSucceeded(job, payload, {
      routeLabel: routed.route.routeLabel,
      routeConfidence: routed.route.confidence,
      routeReasons: routed.route.reasons,
      modelRunId: modelRun.id,
    })

    return {
      routeLabel: routed.route.routeLabel,
    }
  } catch (error) {
    await updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown route failure",
    })
    throw error
  }
}

async function handleDocumentExtractStructured(job: Job) {
  const payload = documentExtractStructuredJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const rawDocument = await getRawDocumentById(payload.rawDocumentId)

  if (!rawDocument) {
    throw new Error(`Missing raw document ${payload.rawDocumentId}`)
  }

  if (await hasExtractedSignalsForRawDocument(rawDocument.id)) {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "already_extracted",
    })
    return {
      skipped: true,
    }
  }

  const normalizedDocument = await buildNormalizedExtractionDocument(rawDocument)
  const attachmentIds = normalizedDocument.attachmentTexts.map(
    (attachment) => attachment.attachmentId,
  )
  const modelRun = await createModelRun({
    userId: payload.userId,
    rawDocumentId: rawDocument.id,
    taskType: "document_extraction",
    provider: "ai-gateway",
    modelName: aiModels.financeSignalExtractor,
    promptVersion: aiPromptVersions.financeSignalExtractor,
    status: "running",
  })

  try {
    const extracted = await extractStructuredSignals({
      normalizedDocument,
      routeLabel: payload.routeLabel,
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: extracted.metadata.provider,
      modelName: extracted.metadata.modelName,
      promptVersion: extracted.metadata.promptVersion,
      inputTokens: extracted.metadata.inputTokens,
      outputTokens: extracted.metadata.outputTokens,
      latencyMs: extracted.metadata.latencyMs,
      requestId: extracted.metadata.requestId,
    })

    const signalPayload: WorkerExtractedSignal[] =
      extracted.extraction.signals.length > 0
        ? extracted.extraction.signals.map((signal) => ({
            signalType: signal.signalType,
            candidateEventType: signal.candidateEventType ?? null,
            amountMinor: signal.amountMinor ?? null,
            currency: signal.currency ?? null,
            eventDate: signal.eventDate ?? null,
            merchantRaw: signal.merchantRaw ?? null,
            merchantHint: signal.merchantHint ?? null,
            paymentInstrumentHint: signal.paymentInstrumentHint ?? null,
            categoryHint: signal.categoryHint ?? null,
            isRecurringHint: signal.isRecurringHint,
            isEmiHint: signal.isEmiHint,
            confidence: signal.confidence,
            evidenceSnippets: signal.evidenceSnippets,
            explanation: signal.explanation ?? "Model extracted a structured finance signal.",
          }))
        : [
            {
              signalType: "generic_finance_signal" as const,
              candidateEventType: null,
              amountMinor: null,
              currency: null,
              eventDate: rawDocument.messageTimestamp.toISOString().slice(0, 10),
              merchantRaw: rawDocument.fromAddress,
              merchantHint: rawDocument.fromAddress,
              paymentInstrumentHint: null,
              categoryHint: null,
              isRecurringHint: false,
              isEmiHint: false,
              confidence: 0.35,
              evidenceSnippets: [rawDocument.subject, rawDocument.snippet]
                .filter((value): value is string => Boolean(value))
                .slice(0, 2),
              explanation: "Model could not produce a typed signal.",
            },
          ]

    const signals = await persistExtractedSignals({
      userId: payload.userId,
      rawDocumentId: rawDocument.id,
      modelRunId: modelRun.id,
      source: "model",
      parserNameOrPrompt: payload.routeLabel,
      routeLabel: payload.routeLabel,
      routeConfidence: payload.routeConfidence,
      routeReasons: payload.routeReasons,
      attachmentIds,
      signals: signalPayload,
    })

    await markJobSucceeded(job, payload, {
      signalCount: signals.length,
      modelRunId: modelRun.id,
      routeLabel: payload.routeLabel,
    })

    return {
      signalCount: signals.length,
    }
  } catch (error) {
    await updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown extraction failure",
    })
    throw error
  }
}

async function handleSignalReconcile(job: Job) {
  const payload = reconciliationJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await reconcileExtractedSignal({
    userId: payload.userId,
    extractedSignalId: payload.extractedSignalId,
    rawDocumentId: payload.rawDocumentId,
  })

  await markJobSucceeded(job, payload, outcome)

  return outcome
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

const documentNormalizationWorker = new Worker(
  DOCUMENT_NORMALIZATION_QUEUE_NAME,
  async (job) => {
    if (job.name !== DOCUMENT_NORMALIZE_JOB_NAME) {
      throw new Error(`Unsupported job: ${job.name}`)
    }

    return handleDocumentNormalize(job)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 3,
  },
)

const aiExtractionWorker = new Worker(
  AI_EXTRACTION_QUEUE_NAME,
  async (job) => {
    if (job.name === DOCUMENT_EXTRACT_ROUTE_JOB_NAME) {
      return handleDocumentExtractRoute(job)
    }

    if (job.name === DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME) {
      return handleDocumentExtractStructured(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 3,
  },
)

const reconciliationWorker = new Worker(
  RECONCILIATION_QUEUE_NAME,
  async (job) => {
    if (job.name !== SIGNAL_RECONCILE_JOB_NAME) {
      throw new Error(`Unsupported job: ${job.name}`)
    }

    return handleSignalReconcile(job)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 3,
  },
)

for (const [queueName, worker] of [
  [SYSTEM_QUEUE_NAME, systemWorker],
  [BACKFILL_IMPORT_QUEUE_NAME, backfillWorker],
  [EMAIL_SYNC_QUEUE_NAME, emailSyncWorker],
  [DOCUMENT_NORMALIZATION_QUEUE_NAME, documentNormalizationWorker],
  [AI_EXTRACTION_QUEUE_NAME, aiExtractionWorker],
  [RECONCILIATION_QUEUE_NAME, reconciliationWorker],
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
    documentNormalizationWorker.close(),
    aiExtractionWorker.close(),
    reconciliationWorker.close(),
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
