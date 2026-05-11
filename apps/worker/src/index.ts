import { createHash } from "node:crypto"

import type { Job } from "bullmq"
import { Worker } from "bullmq"
import { getFeatureFlagsEnv } from "@workspace/config"

import {
  aiModels,
  aiPromptVersions,
  classifyFinanceRelevance,
  extractMerchantHint,
  extractStructuredSignals,
  inferDocumentBalanceContext,
  routeDocumentForExtraction,
} from "@workspace/ai"
import {
  createExtractedSignals,
  createModelRun,
  closeDatabase,
  createReviewQueueItem,
  ensureCoalescedJobRun,
  ensureJobRun,
  getEmailSyncCursorById,
  getLatestGoogleAccountForUser,
  getGmailMessageRelevanceCache,
  getMemoryBundleForUser,
  getOauthConnectionById,
  getRawDocumentForConnectionMessage,
  listRecentPaymentInstrumentsForUser,
  listExtractedSignalsForRawDocumentIds,
  getRawDocumentById,
  getUserSettings,
  hasExtractedSignalsForRawDocument,
  listUserIdsForAdvice,
  listUserIdsWithActiveAdvice,
  listUserIdsForForecasting,
  listUserIdsForInstrumentRepair,
  listUserIdsForMemoryLearning,
  updateExtractedSignal,
  updateEmailSyncCursor,
  updateJobRun,
  updateModelRun,
  updateOauthConnection,
  upsertDocumentAttachment,
  upsertGmailMessageRelevanceCache,
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
  type GmailAttachmentBlob,
  buildFinanceSearchQuery,
  buildFinanceSearchQuerySince,
  uploadPrivateObject,
} from "@workspace/integrations"
import {
  ADVICE_QUEUE_NAME,
  ADVICE_RANK_USER_JOB_NAME,
  ADVICE_REBUILD_USER_JOB_NAME,
  ADVICE_REFRESH_USER_JOB_NAME,
  AI_EXTRACTION_QUEUE_NAME,
  BALANCE_INFERENCE_QUEUE_NAME,
  BACKFILL_IMPORT_QUEUE_NAME,
  DOCUMENT_INFER_BALANCE_JOB_NAME,
  DOCUMENT_EXTRACT_ROUTE_JOB_NAME,
  DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME,
  DOCUMENT_NORMALIZATION_QUEUE_NAME,
  DOCUMENT_NORMALIZE_JOB_NAME,
  ENTITY_RESOLUTION_QUEUE_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  FORECASTING_QUEUE_NAME,
  FORECAST_REBUILD_USER_JOB_NAME,
  FORECAST_REFRESH_USER_JOB_NAME,
  EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME,
  EVENT_EXTRACT_MERCHANT_OBSERVATION_JOB_NAME,
  GMAIL_BACKFILL_PAGE_JOB_NAME,
  GMAIL_BACKFILL_START_JOB_NAME,
  GMAIL_INCREMENTAL_POLL_JOB_NAME,
  GMAIL_MESSAGE_INGEST_JOB_NAME,
  FX_EVENT_REFRESH_JOB_NAME,
  FX_QUEUE_NAME,
  FX_RATE_WARM_JOB_NAME,
  FX_USER_BACKFILL_JOB_NAME,
  INSTRUMENT_REPAIR_BACKFILL_JOB_NAME,
  INSTRUMENT_RESOLVE_JOB_NAME,
  MERCHANT_REPAIR_BACKFILL_JOB_NAME,
  MERCHANT_RESOLUTION_QUEUE_NAME,
  MERCHANT_RESOLVE_JOB_NAME,
  MEMORY_DECAY_SCAN_JOB_NAME,
  MEMORY_LEARNING_QUEUE_NAME,
  MEMORY_REBUILD_USER_JOB_NAME,
  memoryDecayScanJobPayloadSchema,
  memoryRebuildUserJobPayloadSchema,
  FEEDBACK_PROCESS_JOB_NAME,
  feedbackProcessJobPayloadSchema,
  enqueueMemoryDecayScan,
  enqueueMemoryRebuildUser,
  getAdviceRankUserJobKey,
  getAdviceRebuildUserJobKey,
  getAdviceRefreshUserJobKey,
  getForecastRebuildUserJobKey,
  getForecastRefreshUserJobKey,
  getMemoryRebuildUserJobKey,
  enqueueReconciliationRepairBatch,
  RECONCILIATION_MODEL_RETRY_JOB_NAME,
  RECONCILIATION_REPAIR_BATCH_JOB_NAME,
  RECONCILIATION_QUEUE_NAME,
  QUEUE_PREFIX,
  SIGNAL_RECONCILE_JOB_NAME,
  SYSTEM_HEALTHCHECK_JOB_NAME,
  SYSTEM_QUEUE_NAME,
  closeWorkflowConnections,
  createWorkerRedisConnection,
  adviceRefreshUserJobPayloadSchema,
  adviceRebuildUserJobPayloadSchema,
  adviceRankUserJobPayloadSchema,
  documentInferBalanceJobPayloadSchema,
  documentExtractRouteJobPayloadSchema,
  documentExtractStructuredJobPayloadSchema,
  documentNormalizeJobPayloadSchema,
  enqueueAdviceRebuildUser,
  enqueueAdviceRefreshUser,
  enqueueAdviceRankUser,
  forecastRefreshUserJobPayloadSchema,
  forecastRebuildUserJobPayloadSchema,
  enqueueForecastRefreshUser,
  enqueueForecastRebuildUser,
  enqueueEventExtractInstrumentObservation,
  enqueueEventExtractMerchantObservation,
  enqueueDocumentExtractRoute,
  enqueueDocumentExtractStructured,
  enqueueDocumentInferBalance,
  enqueueDocumentNormalize,
  enqueueGmailBackfillPage,
  enqueueGmailMessageIngest,
  enqueueFxEventRefresh,
  enqueueIncomeStreamDetection,
  enqueueEventResolveCategory,
  enqueueInstrumentRepairBackfill,
  enqueueInstrumentResolve,
  enqueueMerchantRepairBackfill,
  enqueueMerchantResolve,
  enqueueRecurringObligationDetection,
  enqueueSignalReconcile,
  eventExtractMerchantObservationJobPayloadSchema,
  eventResolveCategoryJobPayloadSchema,
  eventExtractInstrumentObservationJobPayloadSchema,
  fxEventRefreshJobPayloadSchema,
  fxRateWarmJobPayloadSchema,
  fxUserBackfillJobPayloadSchema,
  gmailBackfillPageJobPayloadSchema,
  gmailBackfillStartJobPayloadSchema,
  gmailIncrementalPollJobPayloadSchema,
  gmailMessageIngestJobPayloadSchema,
  incomeStreamDetectionJobPayloadSchema,
  incomeStreamRefreshJobPayloadSchema,
  instrumentRepairBackfillJobPayloadSchema,
  instrumentResolveJobPayloadSchema,
  merchantRepairBackfillJobPayloadSchema,
  merchantResolveJobPayloadSchema,
  EVENT_DETECT_INCOME_STREAM_JOB_NAME,
  EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME,
  EVENT_RESOLVE_CATEGORY_JOB_NAME,
  INCOME_STREAM_REFRESH_JOB_NAME,
  obligationRefreshJobPayloadSchema,
  OBLIGATION_REFRESH_JOB_NAME,
  RECURRING_DETECTION_QUEUE_NAME,
  reconciliationRepairBatchJobPayloadSchema,
  reconciliationModelRetryJobPayloadSchema,
  reconciliationJobPayloadSchema,
  recurringObligationDetectionJobPayloadSchema,
  systemHealthcheckJobPayloadSchema,
} from "@workspace/workflows"

import { rankAdviceForUser, refreshAdviceForUser } from "./advice"
import {
  inferAccountsAndPromoteBalancesForEvent,
  inferAccountsAndPromoteBalancesForRawDocument,
  inferAccountsAndPromoteStandaloneBalanceEvidence,
  refreshForecastForUser,
} from "./forecast"
import {
  buildNormalizedExtractionDocument,
  runDeterministicExtraction,
  type WorkerExtractedSignal,
} from "./extraction"
import {
  backfillFinancialEventValuationsForUser,
  refreshFinancialEventValuation,
  warmRecentFxRates,
} from "./fx"
import {
  extractInstrumentObservationsFromEvent,
  resolveInstrumentCluster,
  runInstrumentRepairBackfill,
} from "./instrument-resolution"
import {
  extractMerchantObservationsFromEvent,
  listUsersForMerchantRepair,
  resolveEventCategory,
  resolveMerchantCluster,
  runMerchantRepairBackfill,
} from "./merchant-resolution"
import {
  processFeedbackMemory,
  rebuildMemoryForUser,
  runMemoryDecayScan,
} from "./memory-learning"
import {
  linkAcceptedRelevanceModelRun,
  processCandidateMessageRelevance,
} from "./relevance-classification"
import {
  detectIncomeStreamFromEvent,
  detectRecurringObligationFromEvent,
  refreshIncomeStream,
  refreshRecurringObligation,
} from "./recurring"
import {
  reconcileExtractedSignal,
  repairReconciliationBatch,
  retryFailedAiReconciliationResolution,
} from "./reconciliation"
import {
  RECONCILIATION_REPAIR_DELAY_MS,
  shouldScheduleReconciliationRepair,
} from "./reconciliation-repair"

const logger = createLogger("worker")
const featureFlags = getFeatureFlagsEnv()
const adviceEnabled = featureFlags.ENABLE_ADVICE
const memoryLearningEnabled = featureFlags.ENABLE_MEMORY_LEARNING

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

function getMaxAttempts(job: Job) {
  return Math.max(1, job.opts.attempts ?? 1)
}

function getRetryable(job: Job) {
  return getMaxAttempts(job) > 1
}

function getRecoveryGroupKey(job: Job) {
  const userId = typeof job.data?.userId === "string" ? job.data.userId : "unknown"
  return `${job.queueName}:${job.name}:${userId}`
}

async function markJobRunning(job: Job, payload: TrackedPayload) {
  await updateJobRun(payload.jobRunId, {
    status: "running",
    attemptCount: getAttemptCount(job),
    maxAttempts: getMaxAttempts(job),
    retryable: getRetryable(job),
    startedAt: new Date(),
    errorMessage: null,
    lastErrorCode: null,
    lastErrorAt: null,
    deadLetteredAt: null,
    recoveryGroupKey: getRecoveryGroupKey(job),
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
    maxAttempts: getMaxAttempts(job),
    retryable: getRetryable(job),
    completedAt: new Date(),
    errorMessage: null,
    lastErrorCode: null,
    lastErrorAt: null,
    deadLetteredAt: null,
    recoveryGroupKey: getRecoveryGroupKey(job),
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

function isGmailNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number" &&
    error.code === 404
  )
}

function isGoogleInvalidGrantError(error: unknown) {
  if (error instanceof Error && error.message === "invalid_grant") {
    return true
  }

  if (typeof error !== "object" || error === null) {
    return false
  }

  const response =
    "response" in error && typeof error.response === "object" && error.response !== null
      ? error.response
      : null
  const responseData =
    response && "data" in response && typeof response.data === "object" && response.data !== null
      ? response.data
      : null
  const providerError =
    responseData && "error" in responseData && typeof responseData.error === "string"
      ? responseData.error
      : null
  const message =
    "message" in error && typeof error.message === "string" ? error.message : null
  const code = "code" in error && typeof error.code === "number" ? error.code : null

  return providerError === "invalid_grant" || message === "invalid_grant" || code === 400
}

function parseGrantedScopes(scope: string | null | undefined) {
  if (!scope) {
    return []
  }

  return scope
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

type GmailOauthConnection = NonNullable<Awaited<ReturnType<typeof getOauthConnectionById>>>

async function recoverGmailConnectionFromGoogleAccount(input: {
  userId: string
  connectionId: string
}) {
  const googleAccount = await getLatestGoogleAccountForUser(input.userId)

  if (!googleAccount?.accessToken || !googleAccount.refreshToken) {
    return null
  }

  const grantedScopes = parseGrantedScopes(googleAccount.scope)

  if (!grantedScopes.includes(GMAIL_READONLY_SCOPE)) {
    return null
  }

  return updateOauthConnection(input.connectionId, {
    accessTokenEncrypted: encryptSecret(googleAccount.accessToken),
    refreshTokenEncrypted: encryptSecret(googleAccount.refreshToken),
    tokenExpiresAt: googleAccount.accessTokenExpiresAt ?? null,
    scope: googleAccount.scope ?? undefined,
    status: "active",
  })
}

async function runGmailOperationWithRecovery<T>(input: {
  userId: string
  connection: GmailOauthConnection
  operation: (connection: GmailOauthConnection) => Promise<T>
  logContext: Record<string, unknown>
}) {
  try {
    return {
      result: await input.operation(input.connection),
      connection: input.connection,
      revoked: false as const,
    }
  } catch (error) {
    if (!isGoogleInvalidGrantError(error)) {
      throw error
    }

    logger.warn("Encountered invalid Gmail grant, attempting token recovery", {
      ...input.logContext,
      oauthConnectionId: input.connection.id,
      userId: input.userId,
    })

    const recoveredConnection = await recoverGmailConnectionFromGoogleAccount({
      userId: input.userId,
      connectionId: input.connection.id,
    })

    if (!recoveredConnection) {
      await updateOauthConnection(input.connection.id, {
        lastFailedSyncAt: new Date(),
        status: "revoked",
      })

      logger.warn("Revoked Gmail connection after invalid grant with no recovery token", {
        ...input.logContext,
        oauthConnectionId: input.connection.id,
        userId: input.userId,
      })

      return {
        result: null,
        connection: input.connection,
        revoked: true as const,
      }
    }

    try {
      return {
        result: await input.operation(recoveredConnection),
        connection: recoveredConnection,
        revoked: false as const,
      }
    } catch (retryError) {
      if (!isGoogleInvalidGrantError(retryError)) {
        throw retryError
      }

      await updateOauthConnection(input.connection.id, {
        lastFailedSyncAt: new Date(),
        status: "revoked",
      })

      logger.warn("Revoked Gmail connection after invalid grant persisted post-recovery", {
        ...input.logContext,
        oauthConnectionId: input.connection.id,
        userId: input.userId,
      })

      return {
        result: null,
        connection: recoveredConnection,
        revoked: true as const,
      }
    }
  }
}

type GmailFallbackAnchor =
  | {
      source:
        | "last_seen_message_at"
        | "backfill_completed_at"
        | "last_successful_sync_at"
        | "bootstrap_window"
      timestamp: string | null
    }
  | null

function resolveIncrementalFallbackAnchor(input: {
  cursor: {
    lastSeenMessageAt: Date | null
    backfillCompletedAt: Date | null
  }
  connection: {
    lastSuccessfulSyncAt: Date | null
  }
}) {
  if (input.cursor.lastSeenMessageAt) {
    return {
      anchor: input.cursor.lastSeenMessageAt,
      fallbackAnchor: {
        source: "last_seen_message_at",
        timestamp: input.cursor.lastSeenMessageAt.toISOString(),
      } satisfies NonNullable<GmailFallbackAnchor>,
    }
  }

  if (input.cursor.backfillCompletedAt) {
    return {
      anchor: input.cursor.backfillCompletedAt,
      fallbackAnchor: {
        source: "backfill_completed_at",
        timestamp: input.cursor.backfillCompletedAt.toISOString(),
      } satisfies NonNullable<GmailFallbackAnchor>,
    }
  }

  if (input.connection.lastSuccessfulSyncAt) {
    return {
      anchor: input.connection.lastSuccessfulSyncAt,
      fallbackAnchor: {
        source: "last_successful_sync_at",
        timestamp: input.connection.lastSuccessfulSyncAt.toISOString(),
      } satisfies NonNullable<GmailFallbackAnchor>,
    }
  }

  return {
    anchor: null,
    fallbackAnchor: {
      source: "bootstrap_window",
      timestamp: null,
    } satisfies NonNullable<GmailFallbackAnchor>,
  }
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

async function enqueueTrackedMessageIngest(input: {
  userId: string
  oauthConnectionId: string
  cursorId: string
  correlationId: string
  providerMessageId: string
  sourceKind: "backfill" | "incremental"
  historyId?: string | null
  relevanceModelRunId?: string | null
  relevanceLabel: "transactional_finance" | "obligation_finance"
  relevanceStage: "model"
  relevanceScore: number
  relevanceReasons: string[]
}) {
  const jobKey = `${GMAIL_MESSAGE_INGEST_JOB_NAME}:${input.oauthConnectionId}:${input.correlationId}:${input.providerMessageId}`
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
      relevanceModelRunId: input.relevanceModelRunId ?? null,
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
    relevanceModelRunId: input.relevanceModelRunId ?? null,
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
  windowStartAt?: Date
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
      windowStartAt: input.windowStartAt?.toISOString() ?? null,
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
    windowStartAt: input.windowStartAt?.toISOString(),
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

async function enqueueTrackedDocumentInferBalance(input: {
  userId: string
  rawDocumentId: string
  correlationId: string
  extractionSource: "deterministic" | "model"
  extractionJobRunId?: string
}) {
  const jobKey = `${DOCUMENT_INFER_BALANCE_JOB_NAME}:${input.rawDocumentId}`
  const jobRun = await ensureJobRun({
    queueName: BALANCE_INFERENCE_QUEUE_NAME,
    jobName: DOCUMENT_INFER_BALANCE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      source: "worker",
      extractionSource: input.extractionSource,
      extractionJobRunId: input.extractionJobRunId ?? null,
    },
  })

  await enqueueDocumentInferBalance({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    rawDocumentId: input.rawDocumentId,
    source: "worker",
    extractionSource: input.extractionSource,
    extractionJobRunId: input.extractionJobRunId,
  })
}

async function enqueueTrackedRecurringObligationDetection(input: {
  userId: string
  financialEventId: string
  correlationId: string
}) {
  const jobKey = `${EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME}:${input.financialEventId}`
  const jobRun = await ensureJobRun({
    queueName: RECURRING_DETECTION_QUEUE_NAME,
    jobName: EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: "worker",
    },
  })

  await enqueueRecurringObligationDetection({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: "worker",
  })
}

async function enqueueTrackedFxEventRefresh(input: {
  userId: string
  financialEventId: string
  targetCurrency: string
  correlationId: string
}) {
  const jobKey = `${FX_EVENT_REFRESH_JOB_NAME}:${input.financialEventId}:${input.targetCurrency}`
  const jobRun = await ensureJobRun({
    queueName: FX_QUEUE_NAME,
    jobName: FX_EVENT_REFRESH_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      targetCurrency: input.targetCurrency,
    },
  })

  await enqueueFxEventRefresh({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    targetCurrency: input.targetCurrency,
  })
}

async function enqueueTrackedIncomeStreamDetection(input: {
  userId: string
  financialEventId: string
  correlationId: string
}) {
  const jobKey = `${EVENT_DETECT_INCOME_STREAM_JOB_NAME}:${input.financialEventId}`
  const jobRun = await ensureJobRun({
    queueName: RECURRING_DETECTION_QUEUE_NAME,
    jobName: EVENT_DETECT_INCOME_STREAM_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: "worker",
    },
  })

  await enqueueIncomeStreamDetection({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: "worker",
  })
}

async function enqueueTrackedInstrumentObservationExtraction(input: {
  userId: string
  financialEventId: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME}:${input.financialEventId}:${input.correlationId}`
  const jobRun = await ensureJobRun({
    queueName: ENTITY_RESOLUTION_QUEUE_NAME,
    jobName: EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: input.source,
    },
  })

  await enqueueEventExtractInstrumentObservation({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: input.source,
  })
}

async function enqueueTrackedInstrumentResolve(input: {
  userId: string
  maskedIdentifier: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${INSTRUMENT_RESOLVE_JOB_NAME}:${input.userId}:${input.maskedIdentifier}:${input.correlationId}`
  const jobRun = await ensureJobRun({
    queueName: ENTITY_RESOLUTION_QUEUE_NAME,
    jobName: INSTRUMENT_RESOLVE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      maskedIdentifier: input.maskedIdentifier,
      source: input.source,
    },
  })

  await enqueueInstrumentResolve({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    maskedIdentifier: input.maskedIdentifier,
    source: input.source,
  })
}

async function enqueueTrackedInstrumentRepairBackfill(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${INSTRUMENT_REPAIR_BACKFILL_JOB_NAME}:${input.userId}:v1`
  const jobRun = await ensureJobRun({
    queueName: ENTITY_RESOLUTION_QUEUE_NAME,
    jobName: INSTRUMENT_REPAIR_BACKFILL_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
    },
  })

  await enqueueInstrumentRepairBackfill({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
  })
}

async function enqueueTrackedMerchantObservationExtraction(input: {
  userId: string
  financialEventId: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${EVENT_EXTRACT_MERCHANT_OBSERVATION_JOB_NAME}:${input.financialEventId}:${input.correlationId}`
  const jobRun = await ensureJobRun({
    queueName: MERCHANT_RESOLUTION_QUEUE_NAME,
    jobName: EVENT_EXTRACT_MERCHANT_OBSERVATION_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: input.source,
    },
  })

  await enqueueEventExtractMerchantObservation({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: input.source,
  })
}

async function enqueueTrackedMerchantResolve(input: {
  userId: string
  financialEventId: string
  observationClusterKey: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${MERCHANT_RESOLVE_JOB_NAME}:${input.userId}:${input.financialEventId}:${input.observationClusterKey}:${input.correlationId}`
  const jobRun = await ensureJobRun({
    queueName: MERCHANT_RESOLUTION_QUEUE_NAME,
    jobName: MERCHANT_RESOLVE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      observationClusterKey: input.observationClusterKey,
      source: input.source,
    },
  })

  await enqueueMerchantResolve({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    observationClusterKey: input.observationClusterKey,
    source: input.source,
  })
}

async function enqueueTrackedMerchantRepairBackfill(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${MERCHANT_REPAIR_BACKFILL_JOB_NAME}:${input.userId}:v1`
  const jobRun = await ensureJobRun({
    queueName: MERCHANT_RESOLUTION_QUEUE_NAME,
    jobName: MERCHANT_REPAIR_BACKFILL_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
    },
  })

  await enqueueMerchantRepairBackfill({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
  })
}

async function enqueueTrackedCategoryResolve(input: {
  userId: string
  financialEventId: string
  correlationId: string
  source: "worker" | "web" | "startup"
}) {
  const jobKey = `${EVENT_RESOLVE_CATEGORY_JOB_NAME}:${input.financialEventId}:${input.correlationId}`
  const jobRun = await ensureJobRun({
    queueName: MERCHANT_RESOLUTION_QUEUE_NAME,
    jobName: EVENT_RESOLVE_CATEGORY_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: input.source,
    },
  })

  await enqueueEventResolveCategory({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: input.source,
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

async function enqueueTrackedReconciliationRepairBatch(input: {
  userId: string
  cursorId: string
  correlationId: string
  sourceKind: "backfill" | "incremental"
}) {
  const jobKey = `${RECONCILIATION_REPAIR_BATCH_JOB_NAME}:${input.cursorId}:${input.sourceKind}:${input.correlationId}`
  const jobRun = await ensureJobRun({
    queueName: RECONCILIATION_QUEUE_NAME,
    jobName: RECONCILIATION_REPAIR_BATCH_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      cursorId: input.cursorId,
      sourceKind: input.sourceKind,
      source: "worker",
    },
  })

  await enqueueReconciliationRepairBatch(
    {
      correlationId: input.correlationId,
      jobRunId: jobRun.id,
      jobKey,
      requestedAt: new Date().toISOString(),
      userId: input.userId,
      cursorId: input.cursorId,
      sourceKind: input.sourceKind,
      source: "worker",
    },
    {
      delayMs: RECONCILIATION_REPAIR_DELAY_MS,
    },
  )
}

async function enqueueTrackedSignalReconcilesForSignals(input: {
  userId: string
  rawDocumentId: string
  signals: Array<{ id: string }>
}) {
  await Promise.all(
    input.signals.map((signal) =>
      enqueueTrackedSignalReconcile({
        userId: input.userId,
        extractedSignalId: signal.id,
        rawDocumentId: input.rawDocumentId,
        correlationId: `${input.rawDocumentId}:${signal.id}`,
      }),
    ),
  )
}

function selectBalanceInferenceTargetSignalIndex(input: {
  signals: Array<{
    instrumentLast4Hint: string | null
    balanceInstrumentLast4Hint: string | null
    backingAccountLast4Hint: string | null
  }>
  balance: {
    balanceInstrumentLast4Hint: string | null
    backingAccountLast4Hint: string | null
  }
}) {
  const identifiers = [
    input.balance.balanceInstrumentLast4Hint,
    input.balance.backingAccountLast4Hint,
  ].filter((value): value is string => Boolean(value))

  if (identifiers.length === 0) {
    return 0
  }

  const matchedIndex = input.signals.findIndex((signal) =>
    identifiers.some(
      (identifier) =>
        signal.instrumentLast4Hint === identifier ||
        signal.balanceInstrumentLast4Hint === identifier ||
        signal.backingAccountLast4Hint === identifier,
    ),
  )

  return matchedIndex >= 0 ? matchedIndex : 0
}

async function applyBalanceInferenceToSignals(input: {
  signals: Awaited<ReturnType<typeof listExtractedSignalsForRawDocumentIds>>
  balance: Awaited<ReturnType<typeof inferDocumentBalanceContext>>["object"]
}) {
  if (input.signals.length === 0) {
    return []
  }

  if (
    typeof input.balance.availableBalanceMinor !== "number" &&
    typeof input.balance.availableCreditLimitMinor !== "number"
  ) {
    return input.signals
  }

  const targetIndex = selectBalanceInferenceTargetSignalIndex({
    signals: input.signals,
    balance: {
      balanceInstrumentLast4Hint: input.balance.balanceInstrumentLast4Hint ?? null,
      backingAccountLast4Hint: input.balance.backingAccountLast4Hint ?? null,
    },
  })

  const updatedSignals = [...input.signals]
  const target = updatedSignals[targetIndex]

  if (!target) {
    return input.signals
  }

  const evidenceJson =
    target.evidenceJson && typeof target.evidenceJson === "object"
      ? {
          ...target.evidenceJson,
          balanceInference: {
            reason: input.balance.reason ?? null,
            institutionIssued: input.balance.institutionIssued,
          },
        }
      : {
          balanceInference: {
            reason: input.balance.reason ?? null,
            institutionIssued: input.balance.institutionIssued,
          },
        }

  const updated = await updateExtractedSignal(target.id, {
    issuerNameHint: target.issuerNameHint ?? null,
    instrumentLast4Hint:
      target.instrumentLast4Hint ?? input.balance.balanceInstrumentLast4Hint ?? null,
    availableBalanceMinor:
      target.availableBalanceMinor ?? input.balance.availableBalanceMinor ?? null,
    availableCreditLimitMinor:
      target.availableCreditLimitMinor ?? input.balance.availableCreditLimitMinor ?? null,
    balanceAsOfDate: target.balanceAsOfDate ?? input.balance.balanceAsOfDate ?? null,
    balanceInstrumentLast4Hint:
      target.balanceInstrumentLast4Hint ?? input.balance.balanceInstrumentLast4Hint ?? null,
    backingAccountLast4Hint:
      target.backingAccountLast4Hint ?? input.balance.backingAccountLast4Hint ?? null,
    backingAccountNameHint:
      target.backingAccountNameHint ?? input.balance.backingAccountNameHint ?? null,
    accountRelationshipHint:
      target.accountRelationshipHint ?? input.balance.accountRelationshipHint ?? null,
    balanceEvidenceStrength:
      target.balanceEvidenceStrength ?? input.balance.balanceEvidenceStrength ?? null,
    evidenceJson,
  })

  if (updated) {
    updatedSignals[targetIndex] = updated
  }

  return updatedSignals
}

async function enqueueTrackedForecastRefresh(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "scheduler" | "startup"
  reason:
    | "financial_event_changed"
    | "recurring_changed"
    | "review_resolved"
    | "balance_anchor_changed"
    | "manual_refresh"
}) {
  const jobKey = getForecastRefreshUserJobKey(input.userId)
  const jobRun = await ensureCoalescedJobRun({
    queueName: FORECASTING_QUEUE_NAME,
    jobName: FORECAST_REFRESH_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    },
  })

  await enqueueForecastRefreshUser({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
    reason: input.reason,
  })
}

async function enqueueTrackedAdviceRefresh(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "scheduler" | "startup"
  reason: "forecast_changed" | "goals_changed" | "manual_refresh"
}) {
  if (!adviceEnabled) {
    logger.info("Skipping advice refresh enqueue because advice is disabled", {
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    })
    return null
  }

  const jobKey = getAdviceRefreshUserJobKey(input.userId)
  const jobRun = await ensureCoalescedJobRun({
    queueName: ADVICE_QUEUE_NAME,
    jobName: ADVICE_REFRESH_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    },
  })

  await enqueueAdviceRefreshUser({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
    reason: input.reason,
  })
}

async function enqueueTrackedAdviceRebuild(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "scheduler" | "startup"
  reason: "nightly_rebuild" | "startup_rebuild" | "manual_rebuild" | "logic_change"
}) {
  if (!adviceEnabled) {
    logger.info("Skipping advice rebuild enqueue because advice is disabled", {
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    })
    return null
  }

  const jobKey = getAdviceRebuildUserJobKey(input.userId)
  const jobRun = await ensureCoalescedJobRun({
    queueName: ADVICE_QUEUE_NAME,
    jobName: ADVICE_REBUILD_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    },
  })

  await enqueueAdviceRebuildUser({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
    reason: input.reason,
  })
}

async function enqueueTrackedAdviceRank(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "scheduler" | "startup"
  reason: "hourly_rank" | "post_refresh_rank" | "manual_rank"
}) {
  if (!adviceEnabled) {
    logger.info("Skipping advice rank enqueue because advice is disabled", {
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    })
    return null
  }

  const jobKey = getAdviceRankUserJobKey(input.userId)
  const jobRun = await ensureCoalescedJobRun({
    queueName: ADVICE_QUEUE_NAME,
    jobName: ADVICE_RANK_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    },
  })

  await enqueueAdviceRankUser({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
    reason: input.reason,
  })
}

async function enqueueTrackedForecastRebuild(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "scheduler" | "startup"
  reason: "nightly_rebuild" | "startup_rebuild" | "manual_rebuild" | "logic_change"
}) {
  const jobKey = getForecastRebuildUserJobKey(input.userId)
  const jobRun = await ensureCoalescedJobRun({
    queueName: FORECASTING_QUEUE_NAME,
    jobName: FORECAST_REBUILD_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
    },
  })

  await enqueueForecastRebuildUser({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
    reason: input.reason,
  })
}

async function enqueueTrackedMemoryRebuild(input: {
  userId: string
  correlationId: string
  source: "worker" | "web" | "startup"
  reason:
    | "feedback"
    | "review_resolution"
    | "automation_refresh"
    | "manual_refresh"
    | "startup_rebuild"
  sourceReferenceId?: string
}) {
  if (!memoryLearningEnabled) {
    logger.info("Skipping memory rebuild enqueue because memory learning is disabled", {
      userId: input.userId,
      source: input.source,
      reason: input.reason,
      sourceReferenceId: input.sourceReferenceId ?? null,
    })
    return null
  }

  const jobKey = getMemoryRebuildUserJobKey({
    userId: input.userId,
    reason: input.reason,
    sourceReferenceId: input.sourceReferenceId,
    correlationId: input.correlationId,
  })
  const jobRun =
    input.reason === "automation_refresh" || input.reason === "startup_rebuild"
      ? await ensureCoalescedJobRun({
          queueName: MEMORY_LEARNING_QUEUE_NAME,
          jobName: MEMORY_REBUILD_USER_JOB_NAME,
          jobKey,
          payloadJson: {
            correlationId: input.correlationId,
            userId: input.userId,
            source: input.source,
            reason: input.reason,
            sourceReferenceId: input.sourceReferenceId ?? null,
          },
        })
      : await ensureJobRun({
    queueName: MEMORY_LEARNING_QUEUE_NAME,
    jobName: MEMORY_REBUILD_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      userId: input.userId,
      source: input.source,
      reason: input.reason,
      sourceReferenceId: input.sourceReferenceId ?? null,
    },
  })

  await enqueueMemoryRebuildUser({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: input.source,
    reason: input.reason,
    sourceReferenceId: input.sourceReferenceId,
  })
}

async function enqueueTrackedMemoryDecayScan(input: {
  correlationId: string
  source: "startup" | "scheduler"
  reason: "startup_scan" | "nightly_scan"
}) {
  if (!memoryLearningEnabled) {
    logger.info("Skipping memory decay scan enqueue because memory learning is disabled", {
      source: input.source,
      reason: input.reason,
    })
    return null
  }

  const today = new Date().toISOString().slice(0, 10)
  const jobKey = `${MEMORY_DECAY_SCAN_JOB_NAME}:${input.reason}:${today}`
  const jobRun = await ensureJobRun({
    queueName: MEMORY_LEARNING_QUEUE_NAME,
    jobName: MEMORY_DECAY_SCAN_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId: input.correlationId,
      source: input.source,
      reason: input.reason,
    },
  })

  await enqueueMemoryDecayScan({
    correlationId: input.correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    source: input.source,
    reason: input.reason,
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
  return createExtractedSignals(
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
      issuerNameHint: signal.issuerNameHint ?? null,
      instrumentLast4Hint: signal.instrumentLast4Hint ?? null,
      availableBalanceMinor: signal.availableBalanceMinor ?? null,
      availableCreditLimitMinor: signal.availableCreditLimitMinor ?? null,
      balanceAsOfDate: signal.balanceAsOfDate ?? null,
      balanceInstrumentLast4Hint: signal.balanceInstrumentLast4Hint ?? null,
      backingAccountLast4Hint: signal.backingAccountLast4Hint ?? null,
      backingAccountNameHint: signal.backingAccountNameHint ?? null,
      accountRelationshipHint: signal.accountRelationshipHint ?? null,
      balanceEvidenceStrength: signal.balanceEvidenceStrength ?? null,
      merchantDescriptorRaw: signal.merchantDescriptorRaw ?? null,
      merchantNameCandidate: signal.merchantNameCandidate ?? null,
      processorNameCandidate: signal.processorNameCandidate ?? null,
      channelHint: signal.channelHint ?? null,
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
}

function mergeMerchantHintIntoSignals(input: {
  signals: WorkerExtractedSignal[]
  merchantHint: Awaited<ReturnType<typeof extractMerchantHint>>["merchantHint"]
}) {
  return input.signals.map((signal) => ({
    ...signal,
    merchantDescriptorRaw: input.merchantHint.merchantDescriptorRaw ?? null,
    merchantNameCandidate: input.merchantHint.merchantNameCandidate ?? null,
    merchantHint: input.merchantHint.merchantHint ?? null,
    merchantRaw: input.merchantHint.merchantRaw ?? null,
    processorNameCandidate: input.merchantHint.processorNameCandidate ?? null,
    confidence: Math.max(signal.confidence, input.merchantHint.confidence ?? 0),
    evidenceSnippets:
      input.merchantHint.evidenceSnippets.length > 0
        ? input.merchantHint.evidenceSnippets
        : signal.evidenceSnippets,
    explanation: input.merchantHint.explanation || signal.explanation,
  }))
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
  let skippedMissingCount = 0
  let latestHistoryId: string | null = null
  let lastSeenMessageAt: Date | null = null
  const currentAttempt = getAttemptCount(input.job)
  const maxAttempts = (input.job.opts.attempts as number | undefined) ?? 3

  for (const messageId of input.messageIds) {
    let metadata: Awaited<ReturnType<typeof getGmailMessageMetadata>>

    try {
      metadata = await getGmailMessageMetadata(connection, messageId, onTokenUpdate)
    } catch (error) {
      if (!isGmailNotFoundError(error)) {
        throw error
      }

      skippedMissingCount += 1
      logger.warn("Skipping Gmail message after metadata lookup returned not found", {
        jobId: input.job.id,
        cursorId: input.cursorId,
        oauthConnectionId: input.oauthConnectionId,
        sourceKind: input.sourceKind,
        messageId,
      })
      continue
    }

    latestHistoryId = getLatestHistoryId(latestHistoryId, metadata.historyId)

    if (metadata.internalDate) {
      lastSeenMessageAt =
        !lastSeenMessageAt ||
        metadata.internalDate.getTime() > lastSeenMessageAt.getTime()
          ? metadata.internalDate
          : lastSeenMessageAt
    }

    const outcome = await processCandidateMessageRelevance(
      {
        userId: input.userId,
        oauthConnectionId: input.oauthConnectionId,
        cursorId: input.cursorId,
        correlationId: input.correlationId,
        sourceKind: input.sourceKind,
        metadata,
        currentAttempt,
        maxAttempts,
        jobId: input.job.id ?? "unknown-job",
      },
      {
        createModelRun,
        updateModelRun,
        classifyFinanceRelevance: async (classifierInput) => {
          const memory = await getMemoryBundleForUser({
            userId: input.userId,
            senderHints: [classifierInput.sender],
            merchantHints: [classifierInput.subject, classifierInput.snippet],
          })
          return classifyFinanceRelevance({
            ...classifierInput,
            memorySummary: memory.summaryLines,
          })
        },
        enqueueMessageIngest: enqueueTrackedMessageIngest,
        getRelevanceCache: async (lookup) => {
          const row = await getGmailMessageRelevanceCache(lookup)
          if (!row || row.stage !== "model") {
            return null
          }

          return {
            inputHash: row.inputHash,
            classification: row.classification as
              | "transactional_finance"
              | "obligation_finance"
              | "marketing_finance"
              | "non_finance",
            stage: "model" as const,
            score: row.score,
            reasonsJson: row.reasonsJson,
            promptVersion: row.promptVersion,
            modelName: row.modelName,
            provider: row.provider,
            modelRunId: row.modelRunId ?? null,
          }
        },
        upsertRelevanceCache: upsertGmailMessageRelevanceCache,
        getExistingRawDocument: getRawDocumentForConnectionMessage,
        info: (message, context) => logger.info(message, context),
        warn: (message, context) => logger.warn(message, context),
      },
    )

    if (outcome === "accepted_transactional") {
      acceptedTransactionalCount += 1
      continue
    }

    if (outcome === "accepted_obligation") {
      acceptedObligationCount += 1
      continue
    }

    if (outcome === "skipped_marketing") {
      skippedMarketingCount += 1
      continue
    }

    skippedNonFinanceCount += 1
  }

  return {
    acceptedTransactionalCount,
    acceptedObligationCount,
    skippedMarketingCount,
    skippedNonFinanceCount,
    skippedMissingCount,
    lastSeenMessageAt,
    latestHistoryId,
  }
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

  const query = payload.windowStartAt
    ? buildFinanceSearchQuerySince({
        since: new Date(payload.windowStartAt),
        overlapHours: 0,
      })
    : buildFinanceSearchQuery(payload.windowDays)

  await enqueueTrackedBackfillPage({
    userId: payload.userId,
    oauthConnectionId: payload.oauthConnectionId,
    cursorId: payload.cursorId,
    correlationId: payload.correlationId,
    query,
    windowDays: payload.windowDays,
    windowStartAt: payload.windowStartAt ? new Date(payload.windowStartAt) : undefined,
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

  const startingCursor = await getEmailSyncCursorById(payload.cursorId)

  if (!startingCursor) {
    throw new Error(`Missing email sync cursor ${payload.cursorId}`)
  }

  if (startingCursor.backfillCompletedAt) {
    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "backfill_completed",
    })
    return {
      skipped: true,
      reason: "backfill_completed",
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

  const externallyCompleted = Boolean(cursor.backfillCompletedAt)

  await updateEmailSyncCursor(cursor.id, {
    providerCursor: processed.latestHistoryId ?? cursor.providerCursor ?? null,
    lastSeenMessageAt: processed.lastSeenMessageAt ?? cursor.lastSeenMessageAt ?? null,
    backfillCompletedAt: externallyCompleted
      ? cursor.backfillCompletedAt
      : page.nextPageToken
        ? null
        : new Date(),
  })

  if (page.nextPageToken && !externallyCompleted) {
    await enqueueTrackedBackfillPage({
      userId: payload.userId,
      oauthConnectionId: payload.oauthConnectionId,
      cursorId: payload.cursorId,
      correlationId: payload.correlationId,
      query: payload.query,
      windowDays: payload.windowDays,
      windowStartAt: payload.windowStartAt ? new Date(payload.windowStartAt) : undefined,
      pageToken: page.nextPageToken,
    })
  } else if (!externallyCompleted && shouldScheduleReconciliationRepair(processed)) {
    await enqueueTrackedReconciliationRepairBatch({
      userId: payload.userId,
      cursorId: payload.cursorId,
      correlationId: payload.correlationId,
      sourceKind: "backfill",
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
    skippedMissingCount: processed.skippedMissingCount,
    nextPageToken: page.nextPageToken ?? null,
    externallyCompleted,
  })

  return {
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    skippedMissingCount: processed.skippedMissingCount,
    nextPageToken: page.nextPageToken ?? null,
    externallyCompleted,
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
  let activeConnection: GmailOauthConnection = connection
  let messageIds: string[] = []
  let latestHistoryId = cursor.providerCursor
  let usedFallback = false
  let fallbackAnchor: GmailFallbackAnchor = null

  if (cursor.providerCursor) {
    const startHistoryId = cursor.providerCursor

    try {
      let nextPageToken: string | null | undefined = undefined

      do {
        const historyResult = await runGmailOperationWithRecovery({
          userId: payload.userId,
          connection: activeConnection,
          operation: (candidateConnection) =>
            listGmailHistory(
              candidateConnection,
              {
                startHistoryId,
                pageToken: nextPageToken ?? undefined,
              },
              onTokenUpdate,
            ),
          logContext: {
            cursorId: cursor.id,
            jobName: GMAIL_INCREMENTAL_POLL_JOB_NAME,
          },
        })

        if (historyResult.revoked) {
          await markJobSucceeded(job, payload, {
            skipped: true,
            reason: "gmail_reconnect_required",
          })

          return {
            skipped: true,
            reason: "gmail_reconnect_required",
          }
        }

        activeConnection = historyResult.connection
        const historyPage = historyResult.result

        latestHistoryId = historyPage.historyId ?? latestHistoryId
        messageIds.push(...historyPage.messages.map((message) => message.id))
        nextPageToken = historyPage.nextPageToken
      } while (nextPageToken)
    } catch (error) {
      if (!isGmailNotFoundError(error)) {
        throw error
      }

      usedFallback = true
      logger.warn(
        "Falling back to checkpoint-anchored Gmail query after invalid history cursor",
        {
        cursorId: cursor.id,
        oauthConnectionId: connection.id,
        },
      )
    }
  } else {
    usedFallback = true
  }

  if (usedFallback) {
    const fallback = resolveIncrementalFallbackAnchor({
      cursor,
      connection,
    })
    fallbackAnchor = fallback.fallbackAnchor
    const recentQuery = fallback.anchor
      ? buildFinanceSearchQuerySince({
          since: fallback.anchor,
        })
      : buildFinanceSearchQuery(Math.max(1, Math.ceil(payload.fallbackWindowHours / 24)))
    let nextPageToken: string | null | undefined = undefined

    logger.info("Using fallback Gmail query for incremental sync", {
      cursorId: cursor.id,
      oauthConnectionId: connection.id,
      fallbackAnchor,
    })

    do {
      const recentResult = await runGmailOperationWithRecovery({
        userId: payload.userId,
        connection: activeConnection,
        operation: (candidateConnection) =>
          listGmailMessageIds(
            candidateConnection,
            {
              query: recentQuery,
              pageToken: nextPageToken ?? undefined,
            },
            onTokenUpdate,
          ),
        logContext: {
          cursorId: cursor.id,
          jobName: GMAIL_INCREMENTAL_POLL_JOB_NAME,
        },
      })

      if (recentResult.revoked) {
        await markJobSucceeded(job, payload, {
          skipped: true,
          reason: "gmail_reconnect_required",
        })

        return {
          skipped: true,
          reason: "gmail_reconnect_required",
        }
      }

      activeConnection = recentResult.connection
      const recentPage = recentResult.result

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

  if (shouldScheduleReconciliationRepair(processed)) {
    await enqueueTrackedReconciliationRepairBatch({
      userId: payload.userId,
      cursorId: payload.cursorId,
      correlationId: payload.correlationId,
      sourceKind: "incremental",
    })
  }

  await markJobSucceeded(job, payload, {
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    skippedMissingCount: processed.skippedMissingCount,
    usedFallback,
    fallbackAnchor,
    processedCount: messageIds.length,
  })

  logger.info("Completed Gmail incremental poll", {
    cursorId: cursor.id,
    oauthConnectionId: connection.id,
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    skippedMissingCount: processed.skippedMissingCount,
    usedFallback,
    fallbackAnchor,
    processedCount: messageIds.length,
  })

  return {
    acceptedTransactionalCount: processed.acceptedTransactionalCount,
    acceptedObligationCount: processed.acceptedObligationCount,
    skippedMarketingCount: processed.skippedMarketingCount,
    skippedNonFinanceCount: processed.skippedNonFinanceCount,
    skippedMissingCount: processed.skippedMissingCount,
    usedFallback,
    fallbackAnchor,
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
  let message: Awaited<ReturnType<typeof getGmailMessage>>

  try {
    message = await getGmailMessage(connection, payload.providerMessageId, onTokenUpdate)
  } catch (error) {
    if (!isGmailNotFoundError(error)) {
      throw error
    }

    logger.warn("Skipping Gmail message ingest after message fetch returned not found", {
      cursorId: cursor.id,
      oauthConnectionId: connection.id,
      providerMessageId: payload.providerMessageId,
    })

    await markJobSucceeded(job, payload, {
      skipped: true,
      reason: "message_not_found",
    })

    return {
      skipped: true,
      reason: "message_not_found",
    }
  }

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

  await linkAcceptedRelevanceModelRun(
    {
      relevanceModelRunId: payload.relevanceModelRunId,
      rawDocumentId: rawDocument.id,
    },
    {
      updateModelRun,
      warn: (message, context) => logger.warn(message, context),
    },
  )

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
    const merchantHintModelRun = await createModelRun({
      userId: payload.userId,
      rawDocumentId: rawDocument.id,
      taskType: "merchant_hint_extraction",
      provider: "ai-gateway",
      modelName: aiModels.financeMerchantHintExtractor,
      promptVersion: aiPromptVersions.financeMerchantHintExtractor,
      status: "running",
    })
    const attachmentIds = normalizedDocument.attachmentTexts.map(
      (attachment) => attachment.attachmentId,
    )

    try {
      const merchantHint = await extractMerchantHint({
        normalizedDocument,
      })

      await updateModelRun(merchantHintModelRun.id, {
        status: "succeeded",
        provider: merchantHint.metadata.provider,
        modelName: merchantHint.metadata.modelName,
        promptVersion: merchantHint.metadata.promptVersion,
        inputTokens: merchantHint.metadata.inputTokens,
        outputTokens: merchantHint.metadata.outputTokens,
        latencyMs: merchantHint.metadata.latencyMs,
        requestId: merchantHint.metadata.requestId,
        resultJson: {
          merchantHint: merchantHint.merchantHint,
          recovery: merchantHint.recovery,
        },
      })

      const signals = await persistExtractedSignals({
        userId: payload.userId,
        rawDocumentId: rawDocument.id,
        modelRunId: merchantHintModelRun.id,
        source: "deterministic",
        parserNameOrPrompt: deterministic.parserName,
        routeLabel: null,
        routeConfidence: null,
        routeReasons: [],
        attachmentIds,
        signals: mergeMerchantHintIntoSignals({
          signals: deterministic.signals,
          merchantHint: merchantHint.merchantHint,
        }),
      })

      await enqueueTrackedDocumentInferBalance({
        userId: payload.userId,
        rawDocumentId: rawDocument.id,
        correlationId: payload.correlationId,
        extractionSource: "deterministic",
        extractionJobRunId: payload.jobRunId,
      })

      await markJobSucceeded(job, payload, {
        extractionSource: "deterministic",
        signalCount: signals.length,
        parserName: deterministic.parserName,
        rawDocumentId: rawDocument.id,
        attachmentIds,
        merchantHintModelRunId: merchantHintModelRun.id,
      })

      return {
        extractionSource: "deterministic",
        signalCount: signals.length,
      }
    } catch (error) {
      await updateModelRun(merchantHintModelRun.id, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown merchant hint extraction failure",
      })
      throw error
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
  const memory = await getMemoryBundleForUser({
    userId: payload.userId,
    senderHints: [normalizedDocument.sender],
    merchantHints: [normalizedDocument.subject, normalizedDocument.snippet],
  })
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
    const routed = await routeDocumentForExtraction({
      ...normalizedDocument,
      memorySummary: memory.summaryLines,
    })

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
  const memory = await getMemoryBundleForUser({
    userId: payload.userId,
    senderHints: [normalizedDocument.sender],
    merchantHints: [normalizedDocument.subject, normalizedDocument.snippet],
  })
  const attachmentIds = normalizedDocument.attachmentTexts.map(
    (attachment) => attachment.attachmentId,
  )
  const merchantHintModelRun = await createModelRun({
    userId: payload.userId,
    rawDocumentId: rawDocument.id,
    taskType: "merchant_hint_extraction",
    provider: "ai-gateway",
    modelName: aiModels.financeMerchantHintExtractor,
    promptVersion: aiPromptVersions.financeMerchantHintExtractor,
    status: "running",
  })
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
      memorySummary: memory.summaryLines,
    })
    const merchantHint = await extractMerchantHint({
      normalizedDocument,
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
      resultJson: {
        extractionSummary: extracted.extraction.extractionSummary ?? null,
        recovery: extracted.recovery,
      },
    })
    await updateModelRun(merchantHintModelRun.id, {
      status: "succeeded",
      provider: merchantHint.metadata.provider,
      modelName: merchantHint.metadata.modelName,
      promptVersion: merchantHint.metadata.promptVersion,
      inputTokens: merchantHint.metadata.inputTokens,
      outputTokens: merchantHint.metadata.outputTokens,
      latencyMs: merchantHint.metadata.latencyMs,
      requestId: merchantHint.metadata.requestId,
      resultJson: {
        merchantHint: merchantHint.merchantHint,
        recovery: merchantHint.recovery,
      },
    })

    const signalPayload: WorkerExtractedSignal[] =
      extracted.extraction.signals.length > 0
        ? mergeMerchantHintIntoSignals({
            signals: extracted.extraction.signals.map((signal) => ({
            signalType: signal.signalType,
            candidateEventType: signal.candidateEventType ?? null,
            amountMinor: signal.amountMinor ?? null,
            currency: signal.currency ?? null,
            eventDate: signal.eventDate ?? null,
            merchantRaw: signal.merchantRaw ?? null,
            merchantHint: signal.merchantHint ?? null,
            issuerNameHint: signal.issuerNameHint ?? null,
            instrumentLast4Hint: signal.instrumentLast4Hint ?? null,
            availableBalanceMinor: signal.availableBalanceMinor ?? null,
            availableCreditLimitMinor: signal.availableCreditLimitMinor ?? null,
            balanceAsOfDate: signal.balanceAsOfDate ?? null,
            balanceInstrumentLast4Hint: signal.balanceInstrumentLast4Hint ?? null,
            backingAccountLast4Hint: signal.backingAccountLast4Hint ?? null,
            backingAccountNameHint: signal.backingAccountNameHint ?? null,
            accountRelationshipHint: signal.accountRelationshipHint ?? null,
            balanceEvidenceStrength: signal.balanceEvidenceStrength ?? null,
            merchantDescriptorRaw: signal.merchantDescriptorRaw ?? null,
            merchantNameCandidate: signal.merchantNameCandidate ?? null,
            processorNameCandidate: signal.processorNameCandidate ?? null,
            channelHint: signal.channelHint ?? null,
            paymentInstrumentHint: signal.paymentInstrumentHint ?? null,
            categoryHint: signal.categoryHint ?? null,
            isRecurringHint: signal.isRecurringHint,
            isEmiHint: signal.isEmiHint,
            confidence: signal.confidence,
            evidenceSnippets: signal.evidenceSnippets,
            explanation: signal.explanation ?? "Model extracted a structured finance signal.",
          })),
            merchantHint: merchantHint.merchantHint,
          })
        : [
            {
              signalType: "generic_finance_signal" as const,
              candidateEventType: null,
              amountMinor: null,
              currency: null,
              eventDate: rawDocument.messageTimestamp.toISOString().slice(0, 10),
              merchantRaw: null,
              merchantHint: null,
              issuerNameHint: null,
              instrumentLast4Hint: null,
              availableBalanceMinor: null,
              availableCreditLimitMinor: null,
              balanceAsOfDate: null,
              balanceInstrumentLast4Hint: null,
              backingAccountLast4Hint: null,
              backingAccountNameHint: null,
              accountRelationshipHint: null,
              balanceEvidenceStrength: null,
              merchantDescriptorRaw: null,
              merchantNameCandidate: null,
              processorNameCandidate: null,
              channelHint: null,
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
          ].map((signal) =>
            mergeMerchantHintIntoSignals({
              signals: [signal],
              merchantHint: merchantHint.merchantHint,
            })[0]!,
          )

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

    if (extracted.recovery.mode === "fallback") {
      await createReviewQueueItem({
        userId: payload.userId,
        itemType: "signal_reconciliation",
        rawDocumentId: rawDocument.id,
        priority: 2,
        title: "Review degraded extraction",
        explanation:
          "Irene recovered from an invalid model response and saved a generic finance signal. This document should be reviewed before it is treated as truth.",
        proposedResolutionJson: {
          kind: "degraded_extraction",
          modelRunId: modelRun.id,
          recovery: extracted.recovery,
          routeLabel: payload.routeLabel,
          signalIds: signals.map((signal) => signal.id),
        },
      })
    }

    await enqueueTrackedDocumentInferBalance({
      userId: payload.userId,
      rawDocumentId: rawDocument.id,
      correlationId: payload.correlationId,
      extractionSource: "model",
      extractionJobRunId: payload.jobRunId,
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
    await updateModelRun(merchantHintModelRun.id, {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Unknown merchant hint extraction failure",
    })
    throw error
  }
}

function hasBalanceInferencePayload(
  result: Awaited<ReturnType<typeof inferDocumentBalanceContext>>["object"],
) {
  return (
    typeof result.availableBalanceMinor === "number" ||
    typeof result.availableCreditLimitMinor === "number" ||
    Boolean(result.balanceInstrumentLast4Hint) ||
    Boolean(result.backingAccountLast4Hint)
  )
}

function hasExistingSignalBalancePayload(
  signals: Awaited<ReturnType<typeof listExtractedSignalsForRawDocumentIds>>,
) {
  return signals.some(
    (signal) =>
      typeof signal.availableBalanceMinor === "number" ||
      typeof signal.availableCreditLimitMinor === "number" ||
      Boolean(signal.balanceInstrumentLast4Hint) ||
      Boolean(signal.backingAccountLast4Hint),
  )
}

function shouldRunBalanceInference(input: {
  normalizedDocument: Awaited<ReturnType<typeof buildNormalizedExtractionDocument>>
  signals: Awaited<ReturnType<typeof listExtractedSignalsForRawDocumentIds>>
}) {
  if (hasExistingSignalBalancePayload(input.signals)) {
    return false
  }

  const combinedText = [
    input.normalizedDocument.subject,
    input.normalizedDocument.snippet,
    input.normalizedDocument.bodyText,
    ...input.normalizedDocument.attachmentTexts.map((attachment) => attachment.parsedText),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return /\b(available balance|available credit|credit limit|available limit|current balance|closing balance|ledger balance|account balance|balance is|balance of|outstanding balance|account ending|account no|account number|linked account)\b/.test(
    combinedText,
  )
}

async function handleDocumentInferBalance(job: Job) {
  const payload = documentInferBalanceJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const rawDocument = await getRawDocumentById(payload.rawDocumentId)

  if (!rawDocument) {
    throw new Error(`Missing raw document ${payload.rawDocumentId}`)
  }

  const normalizedDocument = await buildNormalizedExtractionDocument(rawDocument)
  const signals = await listExtractedSignalsForRawDocumentIds([rawDocument.id])
  const knownInstruments = await listRecentPaymentInstrumentsForUser(payload.userId)
  const shouldCallBalanceModel = shouldRunBalanceInference({
    normalizedDocument,
    signals,
  })

  if (!shouldCallBalanceModel) {
    const balanceOutcome =
      signals.length > 0
        ? await inferAccountsAndPromoteBalancesForRawDocument({
            userId: payload.userId,
            rawDocumentId: rawDocument.id,
          })
        : {
            createdObservationIds: [],
            promotedAnchorIds: [],
            linkedInstrumentIds: [],
            updatedEventIds: [],
            updatedInstrumentIds: [],
          }

    if (signals.length > 0) {
      await enqueueTrackedSignalReconcilesForSignals({
        userId: payload.userId,
        rawDocumentId: rawDocument.id,
        signals,
      })
    }

    if (balanceOutcome.promotedAnchorIds.length > 0) {
      await enqueueTrackedForecastRefresh({
        userId: payload.userId,
        correlationId: payload.correlationId,
        source: "worker",
        reason: "balance_anchor_changed",
      })
    }

    await markJobSucceeded(job, payload, {
      rawDocumentId: rawDocument.id,
      modelRunId: null,
      signalCount: signals.length,
      balanceInferenceApplied: false,
      balanceInferenceSkipped: true,
      balanceInferenceError: null,
      observationCount: balanceOutcome.createdObservationIds.length,
      promotedAnchorCount: balanceOutcome.promotedAnchorIds.length,
    })

    return {
      signalCount: signals.length,
      promotedAnchorCount: balanceOutcome.promotedAnchorIds.length,
    }
  }

  const memory = await getMemoryBundleForUser({
    userId: payload.userId,
    senderHints: [normalizedDocument.sender],
    merchantHints: [
      normalizedDocument.subject,
      normalizedDocument.snippet,
      ...signals.flatMap((signal) => [
        signal.merchantHint,
        signal.merchantRaw,
        signal.merchantDescriptorRaw,
      ]),
    ],
    instrumentHints: signals.flatMap((signal) => [
      signal.instrumentLast4Hint,
      signal.balanceInstrumentLast4Hint,
      signal.backingAccountLast4Hint,
    ]),
  })
  const modelRun = await createModelRun({
    userId: payload.userId,
    rawDocumentId: rawDocument.id,
    taskType: "balance_inference",
    provider: "ai-gateway",
    modelName: aiModels.financeBalanceExtractor,
    promptVersion: aiPromptVersions.financeBalanceExtractor,
    status: "running",
  })

  let balanceInference:
    | Awaited<ReturnType<typeof inferDocumentBalanceContext>>
    | undefined
  let modelError: Error | null = null

  try {
    balanceInference = await inferDocumentBalanceContext({
      normalizedDocument,
      signals: signals.map((signal) => ({
        signalType: signal.signalType,
        candidateEventType: signal.candidateEventType ?? null,
        instrumentLast4Hint: signal.instrumentLast4Hint ?? null,
        balanceInstrumentLast4Hint: signal.balanceInstrumentLast4Hint ?? null,
        backingAccountLast4Hint: signal.backingAccountLast4Hint ?? null,
        amountMinor: signal.amountMinor ?? null,
        currency: signal.currency ?? null,
      })),
      existingInstruments: knownInstruments.map((entry) => ({
        displayName: entry.instrument.displayName,
        instrumentType: entry.instrument.instrumentType,
        maskedIdentifier: entry.instrument.maskedIdentifier ?? null,
        institutionName: entry.institution?.displayName ?? null,
      })),
      memorySummary: memory.summaryLines,
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: balanceInference.metadata.provider,
      modelName: balanceInference.metadata.modelName,
      promptVersion: balanceInference.metadata.promptVersion,
      inputTokens: balanceInference.metadata.inputTokens,
      outputTokens: balanceInference.metadata.outputTokens,
      latencyMs: balanceInference.metadata.latencyMs,
      requestId: balanceInference.metadata.requestId,
      resultJson: {
        recovery: balanceInference.recovery,
        result: balanceInference.object,
      },
    })
  } catch (error) {
    modelError = error instanceof Error ? error : new Error("Unknown balance inference failure")
    await updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: modelError.message,
    })
  }

  let enrichedSignals = signals

  if (balanceInference && hasBalanceInferencePayload(balanceInference.object) && signals.length > 0) {
    enrichedSignals = await applyBalanceInferenceToSignals({
      signals,
      balance: balanceInference.object,
    })
  }

  const balanceOutcome =
    signals.length > 0
      ? await inferAccountsAndPromoteBalancesForRawDocument({
          userId: payload.userId,
          rawDocumentId: rawDocument.id,
        })
      : balanceInference && hasBalanceInferencePayload(balanceInference.object)
        ? await inferAccountsAndPromoteStandaloneBalanceEvidence({
            userId: payload.userId,
            rawDocumentId: rawDocument.id,
            rawDocumentTimestamp: rawDocument.messageTimestamp,
            rawDocumentSender: rawDocument.fromAddress,
            rawDocumentSubject: rawDocument.subject,
            evidence: balanceInference.object,
          })
        : {
            createdObservationIds: [],
            promotedAnchorIds: [],
            linkedInstrumentIds: [],
            updatedEventIds: [],
            updatedInstrumentIds: [],
          }

  if (signals.length > 0) {
    await enqueueTrackedSignalReconcilesForSignals({
      userId: payload.userId,
      rawDocumentId: rawDocument.id,
      signals: enrichedSignals,
    })
  }

  if (balanceOutcome.promotedAnchorIds.length > 0) {
    await enqueueTrackedForecastRefresh({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "balance_anchor_changed",
    })
  }

  await markJobSucceeded(job, payload, {
    rawDocumentId: rawDocument.id,
    modelRunId: modelRun.id,
    signalCount: signals.length,
    balanceInferenceApplied: balanceInference
      ? hasBalanceInferencePayload(balanceInference.object)
      : false,
    balanceInferenceError: modelError?.message ?? null,
    observationCount: balanceOutcome.createdObservationIds.length,
    promotedAnchorCount: balanceOutcome.promotedAnchorIds.length,
  })

  return {
    signalCount: signals.length,
    promotedAnchorCount: balanceOutcome.promotedAnchorIds.length,
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

  if (
    (outcome.action === "created" || outcome.action === "merged") &&
    "financialEventId" in outcome &&
    outcome.financialEventId
  ) {
    const settings = await getUserSettings(payload.userId)
    await inferAccountsAndPromoteBalancesForEvent({
      userId: payload.userId,
      financialEventId: outcome.financialEventId,
    })

    await Promise.all([
      enqueueTrackedFxEventRefresh({
        userId: payload.userId,
        financialEventId: outcome.financialEventId,
        targetCurrency: settings.reportingCurrency,
        correlationId: payload.correlationId,
      }),
      enqueueTrackedRecurringObligationDetection({
        userId: payload.userId,
        financialEventId: outcome.financialEventId,
        correlationId: payload.correlationId,
      }),
      enqueueTrackedIncomeStreamDetection({
        userId: payload.userId,
        financialEventId: outcome.financialEventId,
        correlationId: payload.correlationId,
      }),
      enqueueTrackedInstrumentObservationExtraction({
        userId: payload.userId,
        financialEventId: outcome.financialEventId,
        correlationId: payload.correlationId,
        source: "worker",
      }),
      enqueueTrackedMerchantObservationExtraction({
        userId: payload.userId,
        financialEventId: outcome.financialEventId,
        correlationId: payload.correlationId,
        source: "worker",
      }),
      enqueueTrackedForecastRefresh({
        userId: payload.userId,
        correlationId: payload.correlationId,
        source: "worker",
        reason: "financial_event_changed",
      }),
    ])
  }

  await markJobSucceeded(job, payload, outcome)

  return outcome
}

async function handleReconciliationModelRetry(job: Job) {
  const payload = reconciliationModelRetryJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  logger.info("Retrying failed reconciliation model run", {
    modelRunId: payload.modelRunId,
    extractedSignalId: payload.extractedSignalId,
    rawDocumentId: payload.rawDocumentId,
    source: payload.source,
  })

  const outcome = await retryFailedAiReconciliationResolution({
    userId: payload.userId,
    extractedSignalId: payload.extractedSignalId,
    rawDocumentId: payload.rawDocumentId,
    previousModelRunId: payload.modelRunId,
  })

  await markJobSucceeded(job, payload, outcome)

  return outcome
}

async function handleReconciliationRepairBatch(job: Job) {
  const payload = reconciliationRepairBatchJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await repairReconciliationBatch({
    userId: payload.userId,
    correlationId: payload.correlationId,
    cursorId: payload.cursorId,
    sourceKind: payload.sourceKind,
  })

  await markJobSucceeded(job, payload, outcome)

  return outcome
}

async function handleEventExtractInstrumentObservation(job: Job) {
  const payload = eventExtractInstrumentObservationJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await extractInstrumentObservationsFromEvent(payload.financialEventId)

  if (outcome.action === "observed") {
    await Promise.all(
      (outcome.maskedIdentifiers ?? []).map((maskedIdentifier) =>
        enqueueTrackedInstrumentResolve({
          userId: payload.userId,
          maskedIdentifier,
          correlationId: `${payload.correlationId}:${maskedIdentifier}`,
          source: "worker",
        }),
      ),
    )
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleInstrumentResolve(job: Job) {
  const payload = instrumentResolveJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await resolveInstrumentCluster({
    userId: payload.userId,
    maskedIdentifier: payload.maskedIdentifier,
  })

  if (
    outcome.action === "created" ||
    outcome.action === "merged" ||
    outcome.action === "updated" ||
    outcome.action === "linked"
  ) {
    await Promise.all(
      (outcome.financialEventIds ?? []).map((financialEventId) =>
        inferAccountsAndPromoteBalancesForEvent({
          userId: payload.userId,
          financialEventId,
        }),
      ),
    )

    await enqueueTrackedForecastRefresh({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "financial_event_changed",
    })

    await enqueueTrackedMemoryRebuild({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "automation_refresh",
      sourceReferenceId: outcome.paymentInstrumentId ?? undefined,
    })
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleInstrumentRepairBackfill(job: Job) {
  const payload = instrumentRepairBackfillJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await runInstrumentRepairBackfill(payload.userId)

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleEventExtractMerchantObservation(job: Job) {
  const payload = eventExtractMerchantObservationJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await extractMerchantObservationsFromEvent(payload.financialEventId)

  if (outcome.action === "observed") {
    await Promise.all(
      (outcome.clusterKeys ?? []).map((observationClusterKey) =>
        enqueueTrackedMerchantResolve({
          userId: payload.userId,
          financialEventId: payload.financialEventId,
          observationClusterKey,
          correlationId: `${payload.correlationId}:${observationClusterKey}`,
          source: "worker",
        }),
      ),
    )
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleMerchantResolve(job: Job) {
  const payload = merchantResolveJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await resolveMerchantCluster({
    userId: payload.userId,
    financialEventId: payload.financialEventId,
    observationClusterKey: payload.observationClusterKey,
  })

  if (
    (outcome.action === "linked" ||
      outcome.action === "created" ||
      outcome.action === "updated" ||
      outcome.action === "merged") &&
    !outcome.categoryId
  ) {
    await enqueueTrackedCategoryResolve({
      userId: payload.userId,
      financialEventId: payload.financialEventId,
      correlationId: payload.correlationId,
      source: "worker",
    })
  }

  if (
    outcome.action === "linked" ||
    outcome.action === "created" ||
    outcome.action === "updated" ||
    outcome.action === "merged"
  ) {
    await enqueueTrackedForecastRefresh({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "financial_event_changed",
    })

    await enqueueTrackedMemoryRebuild({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "automation_refresh",
      sourceReferenceId: outcome.merchantId ?? undefined,
    })
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleMerchantRepairBackfill(job: Job) {
  const payload = merchantRepairBackfillJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await runMerchantRepairBackfill(payload.userId)

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleEventResolveCategory(job: Job) {
  const payload = eventResolveCategoryJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await resolveEventCategory({
    userId: payload.userId,
    financialEventId: payload.financialEventId,
  })

  if (outcome.action === "updated") {
    await enqueueTrackedForecastRefresh({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "financial_event_changed",
    })

    await enqueueTrackedMemoryRebuild({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "automation_refresh",
      sourceReferenceId: payload.financialEventId,
    })
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleRecurringObligationDetection(job: Job) {
  const payload = recurringObligationDetectionJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await detectRecurringObligationFromEvent(payload.financialEventId)

  if (
    outcome.action === "created" ||
    outcome.action === "updated" ||
    outcome.action === "review"
  ) {
    await enqueueTrackedForecastRefresh({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "recurring_changed",
    })

    await enqueueTrackedMemoryRebuild({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "automation_refresh",
      sourceReferenceId:
        "recurringObligationId" in outcome ? outcome.recurringObligationId : undefined,
    })
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleIncomeStreamDetection(job: Job) {
  const payload = incomeStreamDetectionJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await detectIncomeStreamFromEvent(payload.financialEventId)

  if (
    outcome.action === "created" ||
    outcome.action === "updated" ||
    outcome.action === "review"
  ) {
    await enqueueTrackedForecastRefresh({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "recurring_changed",
    })

    await enqueueTrackedMemoryRebuild({
      userId: payload.userId,
      correlationId: payload.correlationId,
      source: "worker",
      reason: "automation_refresh",
      sourceReferenceId:
        "incomeStreamId" in outcome ? outcome.incomeStreamId : undefined,
    })
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleObligationRefresh(job: Job) {
  const payload = obligationRefreshJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await refreshRecurringObligation(payload.recurringObligationId)

  await enqueueTrackedForecastRefresh({
    userId: payload.userId,
    correlationId: payload.correlationId,
    source: "worker",
    reason: "recurring_changed",
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleIncomeStreamRefresh(job: Job) {
  const payload = incomeStreamRefreshJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await refreshIncomeStream(payload.incomeStreamId)

  await enqueueTrackedForecastRefresh({
    userId: payload.userId,
    correlationId: payload.correlationId,
    source: "worker",
    reason: "recurring_changed",
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleForecastRefresh(job: Job) {
  const payload = forecastRefreshUserJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await refreshForecastForUser({
    userId: payload.userId,
    reason: payload.reason,
  })

  await enqueueTrackedAdviceRefresh({
    userId: payload.userId,
    correlationId: payload.correlationId,
    source: "worker",
    reason: "forecast_changed",
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleForecastRebuild(job: Job) {
  const payload = forecastRebuildUserJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await refreshForecastForUser({
    userId: payload.userId,
    reason: payload.reason,
  })

  await enqueueTrackedAdviceRebuild({
    userId: payload.userId,
    correlationId: payload.correlationId,
    source: "worker",
    reason: payload.reason,
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleAdviceRefresh(job: Job) {
  const payload = adviceRefreshUserJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  if (!adviceEnabled) {
    const outcome = {
      skipped: true,
      skipReason: "advice_disabled",
    }
    await markJobSucceeded(job, payload, outcome)
    return outcome
  }

  const outcome = await refreshAdviceForUser({
    userId: payload.userId,
    reason: payload.reason,
  })

  await enqueueTrackedAdviceRank({
    userId: payload.userId,
    correlationId: payload.correlationId,
    source: "worker",
    reason: "post_refresh_rank",
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleAdviceRebuild(job: Job) {
  const payload = adviceRebuildUserJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  if (!adviceEnabled) {
    const outcome = {
      skipped: true,
      skipReason: "advice_disabled",
    }
    await markJobSucceeded(job, payload, outcome)
    return outcome
  }

  const outcome = await refreshAdviceForUser({
    userId: payload.userId,
    reason: payload.reason,
  })

  await enqueueTrackedAdviceRank({
    userId: payload.userId,
    correlationId: payload.correlationId,
    source: "worker",
    reason: "post_refresh_rank",
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleAdviceRank(job: Job) {
  const payload = adviceRankUserJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  if (!adviceEnabled) {
    const outcome = {
      skipped: true,
      skipReason: "advice_disabled",
    }
    await markJobSucceeded(job, payload, outcome)
    return outcome
  }

  const outcome = await rankAdviceForUser({
    userId: payload.userId,
    reason: payload.reason,
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleFeedbackProcess(job: Job) {
  const payload = feedbackProcessJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  if (!memoryLearningEnabled) {
    const outcome = {
      skipped: true,
      skipReason: "memory_learning_disabled",
    }
    await markJobSucceeded(job, payload, outcome)
    return outcome
  }

  const outcome = await processFeedbackMemory(payload.feedbackEventId)

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleMemoryRebuild(job: Job) {
  const payload = memoryRebuildUserJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  if (!memoryLearningEnabled) {
    const outcome = {
      skipped: true,
      skipReason: "memory_learning_disabled",
    }
    await markJobSucceeded(job, payload, outcome)
    return outcome
  }

  const outcome = await rebuildMemoryForUser({
    userId: payload.userId,
    reason: payload.reason,
    sourceReferenceId: payload.sourceReferenceId,
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleMemoryDecayScan(job: Job) {
  const payload = memoryDecayScanJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  if (!memoryLearningEnabled) {
    const outcome = {
      skipped: true,
      skipReason: "memory_learning_disabled",
      reason: payload.reason,
    }
    await markJobSucceeded(job, payload, outcome)
    return outcome
  }

  const outcome = await runMemoryDecayScan()

  await markJobSucceeded(job, payload, {
    ...outcome,
    reason: payload.reason,
  })
  return outcome
}

async function handleFxEventRefresh(job: Job) {
  const payload = fxEventRefreshJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const valuation = await refreshFinancialEventValuation({
    financialEventId: payload.financialEventId,
    targetCurrency: payload.targetCurrency,
  })
  const outcome = {
    financialEventId: payload.financialEventId,
    targetCurrency: payload.targetCurrency,
    valuationId: valuation.id,
    valuationKind: valuation.valuationKind,
  }

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleFxUserBackfill(job: Job) {
  const payload = fxUserBackfillJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await backfillFinancialEventValuationsForUser({
    userId: payload.userId,
    targetCurrency: payload.targetCurrency,
  })

  await markJobSucceeded(job, payload, outcome)
  return outcome
}

async function handleFxRateWarm(job: Job) {
  const payload = fxRateWarmJobPayloadSchema.parse(job.data)
  await markJobRunning(job, payload)

  const outcome = await warmRecentFxRates({
    lookbackDays: payload.lookbackDays,
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

const fxWorker = new Worker(
  FX_QUEUE_NAME,
  async (job) => {
    if (job.name === FX_EVENT_REFRESH_JOB_NAME) {
      return handleFxEventRefresh(job)
    }

    if (job.name === FX_USER_BACKFILL_JOB_NAME) {
      return handleFxUserBackfill(job)
    }

    if (job.name === FX_RATE_WARM_JOB_NAME) {
      return handleFxRateWarm(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
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

const balanceInferenceWorker = new Worker(
  BALANCE_INFERENCE_QUEUE_NAME,
  async (job) => {
    if (job.name !== DOCUMENT_INFER_BALANCE_JOB_NAME) {
      throw new Error(`Unsupported job: ${job.name}`)
    }

    return handleDocumentInferBalance(job)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

const reconciliationWorker = new Worker(
  RECONCILIATION_QUEUE_NAME,
  async (job) => {
    if (job.name === SIGNAL_RECONCILE_JOB_NAME) {
      return handleSignalReconcile(job)
    }

    if (job.name === RECONCILIATION_MODEL_RETRY_JOB_NAME) {
      return handleReconciliationModelRetry(job)
    }

    if (job.name === RECONCILIATION_REPAIR_BATCH_JOB_NAME) {
      return handleReconciliationRepairBatch(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 3,
  },
)

const recurringDetectionWorker = new Worker(
  RECURRING_DETECTION_QUEUE_NAME,
  async (job) => {
    if (job.name === EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME) {
      return handleRecurringObligationDetection(job)
    }

    if (job.name === EVENT_DETECT_INCOME_STREAM_JOB_NAME) {
      return handleIncomeStreamDetection(job)
    }

    if (job.name === OBLIGATION_REFRESH_JOB_NAME) {
      return handleObligationRefresh(job)
    }

    if (job.name === INCOME_STREAM_REFRESH_JOB_NAME) {
      return handleIncomeStreamRefresh(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 3,
  },
)

const forecastingWorker = new Worker(
  FORECASTING_QUEUE_NAME,
  async (job) => {
    if (job.name === FORECAST_REFRESH_USER_JOB_NAME) {
      return handleForecastRefresh(job)
    }

    if (job.name === FORECAST_REBUILD_USER_JOB_NAME) {
      return handleForecastRebuild(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

const adviceWorker = new Worker(
  ADVICE_QUEUE_NAME,
  async (job) => {
    if (job.name === ADVICE_REFRESH_USER_JOB_NAME) {
      return handleAdviceRefresh(job)
    }

    if (job.name === ADVICE_REBUILD_USER_JOB_NAME) {
      return handleAdviceRebuild(job)
    }

    if (job.name === ADVICE_RANK_USER_JOB_NAME) {
      return handleAdviceRank(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

const memoryLearningWorker = new Worker(
  MEMORY_LEARNING_QUEUE_NAME,
  async (job) => {
    if (job.name === FEEDBACK_PROCESS_JOB_NAME) {
      return handleFeedbackProcess(job)
    }

    if (job.name === MEMORY_REBUILD_USER_JOB_NAME) {
      return handleMemoryRebuild(job)
    }

    if (job.name === MEMORY_DECAY_SCAN_JOB_NAME) {
      return handleMemoryDecayScan(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

const entityResolutionWorker = new Worker(
  ENTITY_RESOLUTION_QUEUE_NAME,
  async (job) => {
    if (job.name === EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME) {
      return handleEventExtractInstrumentObservation(job)
    }

    if (job.name === INSTRUMENT_RESOLVE_JOB_NAME) {
      return handleInstrumentResolve(job)
    }

    if (job.name === INSTRUMENT_REPAIR_BACKFILL_JOB_NAME) {
      return handleInstrumentRepairBackfill(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

const merchantResolutionWorker = new Worker(
  MERCHANT_RESOLUTION_QUEUE_NAME,
  async (job) => {
    if (job.name === EVENT_EXTRACT_MERCHANT_OBSERVATION_JOB_NAME) {
      return handleEventExtractMerchantObservation(job)
    }

    if (job.name === MERCHANT_RESOLVE_JOB_NAME) {
      return handleMerchantResolve(job)
    }

    if (job.name === MERCHANT_REPAIR_BACKFILL_JOB_NAME) {
      return handleMerchantRepairBackfill(job)
    }

    if (job.name === EVENT_RESOLVE_CATEGORY_JOB_NAME) {
      return handleEventResolveCategory(job)
    }

    throw new Error(`Unsupported job: ${job.name}`)
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 2,
  },
)

for (const [queueName, worker] of [
  [SYSTEM_QUEUE_NAME, systemWorker],
  [BACKFILL_IMPORT_QUEUE_NAME, backfillWorker],
  [EMAIL_SYNC_QUEUE_NAME, emailSyncWorker],
  [FX_QUEUE_NAME, fxWorker],
  [DOCUMENT_NORMALIZATION_QUEUE_NAME, documentNormalizationWorker],
  [AI_EXTRACTION_QUEUE_NAME, aiExtractionWorker],
  [BALANCE_INFERENCE_QUEUE_NAME, balanceInferenceWorker],
  [RECONCILIATION_QUEUE_NAME, reconciliationWorker],
  [RECURRING_DETECTION_QUEUE_NAME, recurringDetectionWorker],
  [FORECASTING_QUEUE_NAME, forecastingWorker],
  [ADVICE_QUEUE_NAME, adviceWorker],
  [MEMORY_LEARNING_QUEUE_NAME, memoryLearningWorker],
  [ENTITY_RESOLUTION_QUEUE_NAME, entityResolutionWorker],
  [MERCHANT_RESOLUTION_QUEUE_NAME, merchantResolutionWorker],
] as const) {
  worker.on("ready", () => {
    logger.info("Worker ready", { queueName })
  })

  worker.on("error", (error) => {
    logger.errorWithCause("Worker transport error", error, { queueName })
  })

  worker.on("stalled", (jobId, previous) => {
    logger.warn("Worker job stalled", {
      queueName,
      jobId,
      previous,
    })
  })

  worker.on("failed", async (job, error) => {
    logger.errorWithCause("Worker job failed", error, {
      queueName,
      jobId: job?.id,
      jobName: job?.name,
    })

    const jobRunId = job?.data?.jobRunId

    if (typeof jobRunId === "string") {
      const attemptCount = job ? getAttemptCount(job) : 1
      const maxAttempts = job ? getMaxAttempts(job) : 1
      const isDeadLettered = attemptCount >= maxAttempts
      const errorCode =
        typeof (error as Error & { code?: string }).code === "string"
          ? (error as Error & { code?: string }).code
          : error.name

      await updateJobRun(jobRunId, {
        status: isDeadLettered ? "dead_lettered" : "failed",
        attemptCount,
        maxAttempts,
        retryable: maxAttempts > 1,
        completedAt: new Date(),
        errorMessage: error.message,
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
        deadLetteredAt: isDeadLettered ? new Date() : null,
        recoveryGroupKey: job ? getRecoveryGroupKey(job) : undefined,
        payloadJson: job?.data,
      })
    }

    const oauthConnectionId = job?.data?.oauthConnectionId

    if (typeof oauthConnectionId === "string") {
      await updateOauthConnection(oauthConnectionId, {
        lastFailedSyncAt: new Date(),
        status: isGoogleInvalidGrantError(error) ? "revoked" : "error",
      })
    }
  })
}

async function shutdown(signal: string) {
  logger.info("Shutting down worker", { signal })
  clearInterval(forecastNightlyScheduler)
  clearInterval(adviceNightlyScheduler)
  clearInterval(adviceRankingScheduler)
  clearInterval(memoryDecayScheduler)

  await Promise.all([
    systemWorker.close(),
    backfillWorker.close(),
    emailSyncWorker.close(),
    fxWorker.close(),
    documentNormalizationWorker.close(),
    aiExtractionWorker.close(),
    reconciliationWorker.close(),
    recurringDetectionWorker.close(),
    forecastingWorker.close(),
    adviceWorker.close(),
    memoryLearningWorker.close(),
    entityResolutionWorker.close(),
    merchantResolutionWorker.close(),
  ])
  await closeWorkflowConnections()
  await closeDatabase()
}

let lastNightlyForecastRebuildDate: string | null = null
let lastNightlyAdviceRebuildDate: string | null = null
let lastHourlyAdviceRankHour: string | null = null
let lastMemoryDecayScanDate: string | null = null

async function scheduleNightlyForecastRebuildIfDue() {
  const today = new Date().toISOString().slice(0, 10)
  if (lastNightlyForecastRebuildDate === today) {
    return
  }

  lastNightlyForecastRebuildDate = today
  const userIds = await listUserIdsForForecasting()

  await Promise.all(
    userIds.map((userId) =>
      enqueueTrackedForecastRebuild({
        userId,
        correlationId: `scheduler:${today}:${userId}`,
        source: "scheduler",
        reason: "nightly_rebuild",
      }),
    ),
  )

  logger.info("Scheduled nightly forecast rebuilds", {
    date: today,
    userCount: userIds.length,
  })
}

const forecastNightlyScheduler = setInterval(() => {
  scheduleNightlyForecastRebuildIfDue().catch((error) => {
    logger.errorWithCause("Failed to schedule nightly forecast rebuilds", error)
  })
}, 60 * 60 * 1000)

async function scheduleNightlyAdviceRebuildIfDue() {
  if (!adviceEnabled) {
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  if (lastNightlyAdviceRebuildDate === today) {
    return
  }

  lastNightlyAdviceRebuildDate = today
  const userIds = await listUserIdsForAdvice()

  await Promise.all(
    userIds.map((userId) =>
      enqueueTrackedAdviceRebuild({
        userId,
        correlationId: `scheduler:${today}:${userId}`,
        source: "scheduler",
        reason: "nightly_rebuild",
      }),
    ),
  )

  logger.info("Scheduled nightly advice rebuilds", {
    date: today,
    userCount: userIds.length,
  })
}

const adviceNightlyScheduler = setInterval(() => {
  scheduleNightlyAdviceRebuildIfDue().catch((error) => {
    logger.errorWithCause("Failed to schedule nightly advice rebuilds", error)
  })
}, 60 * 60 * 1000)

async function scheduleHourlyAdviceRankingIfDue() {
  if (!adviceEnabled) {
    return
  }

  const hourKey = new Date().toISOString().slice(0, 13)
  if (lastHourlyAdviceRankHour === hourKey) {
    return
  }

  lastHourlyAdviceRankHour = hourKey
  const userIds = await listUserIdsWithActiveAdvice()

  await Promise.all(
    userIds.map((userId) =>
      enqueueTrackedAdviceRank({
        userId,
        correlationId: `scheduler:${hourKey}:${userId}`,
        source: "scheduler",
        reason: "hourly_rank",
      }),
    ),
  )

  logger.info("Scheduled hourly advice ranking", {
    hour: hourKey,
    userCount: userIds.length,
  })
}

const adviceRankingScheduler = setInterval(() => {
  scheduleHourlyAdviceRankingIfDue().catch((error) => {
    logger.errorWithCause("Failed to schedule hourly advice ranking", error)
  })
}, 60 * 60 * 1000)

async function scheduleMemoryDecayScanIfDue() {
  if (!memoryLearningEnabled) {
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  if (lastMemoryDecayScanDate === today) {
    return
  }

  lastMemoryDecayScanDate = today

  await enqueueTrackedMemoryDecayScan({
    correlationId: `scheduler:${today}`,
    source: "scheduler",
    reason: "nightly_scan",
  })
}

const memoryDecayScheduler = setInterval(() => {
  scheduleMemoryDecayScanIfDue().catch((error) => {
    logger.errorWithCause("Failed to schedule memory decay scan", error)
  })
}, 60 * 60 * 1000)

void (async () => {
  const [instrumentUserIds, merchantUserIds, forecastUserIds, adviceUserIds, memoryUserIds] = await Promise.all([
    listUserIdsForInstrumentRepair(),
    listUsersForMerchantRepair(),
    listUserIdsForForecasting(),
    adviceEnabled ? listUserIdsForAdvice() : Promise.resolve([]),
    memoryLearningEnabled ? listUserIdsForMemoryLearning() : Promise.resolve([]),
  ])

  await Promise.all(
    instrumentUserIds.map((userId) =>
      enqueueTrackedInstrumentRepairBackfill({
        userId,
        correlationId: `startup:${userId}`,
        source: "startup",
      }),
    ),
  )

  await Promise.all(
    merchantUserIds.map((userId) =>
      enqueueTrackedMerchantRepairBackfill({
        userId,
        correlationId: `startup:${userId}`,
        source: "startup",
      }),
    ),
  )

  await Promise.all(
    forecastUserIds.map((userId) =>
      enqueueTrackedForecastRebuild({
        userId,
        correlationId: `startup:${userId}`,
        source: "startup",
        reason: "startup_rebuild",
      }),
    ),
  )

  if (adviceEnabled) {
    await Promise.all(
      adviceUserIds.map((userId) =>
        enqueueTrackedAdviceRebuild({
          userId,
          correlationId: `startup:${userId}`,
          source: "startup",
          reason: "startup_rebuild",
        }),
      ),
    )
  }

  if (memoryLearningEnabled) {
    await Promise.all(
      memoryUserIds.map((userId) =>
        enqueueTrackedMemoryRebuild({
          userId,
          correlationId: `startup:${userId}`,
          source: "startup",
          reason: "startup_rebuild",
        }),
      ),
    )

    await enqueueTrackedMemoryDecayScan({
      correlationId: "startup:memory-decay",
      source: "startup",
      reason: "startup_scan",
    })
  }

  lastNightlyForecastRebuildDate = new Date().toISOString().slice(0, 10)
  if (adviceEnabled) {
    lastNightlyAdviceRebuildDate = new Date().toISOString().slice(0, 10)
  }
  if (memoryLearningEnabled) {
    lastMemoryDecayScanDate = new Date().toISOString().slice(0, 10)
  }
})().catch((error) => {
  logger.errorWithCause("Failed to schedule startup repair backfills", error)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        logger.errorWithCause("Worker shutdown failed", error, { signal })
        clearInterval(forecastNightlyScheduler)
        clearInterval(adviceNightlyScheduler)
        clearInterval(adviceRankingScheduler)
        clearInterval(memoryDecayScheduler)
        process.exit(1)
      })
  })
}
