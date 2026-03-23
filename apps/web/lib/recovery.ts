import {
  createJobRun,
  type JobRunSelect,
} from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  ADVICE_QUEUE_NAME,
  ADVICE_RANK_USER_JOB_NAME,
  ADVICE_REFRESH_USER_JOB_NAME,
  ADVICE_REBUILD_USER_JOB_NAME,
  AI_EXTRACTION_QUEUE_NAME,
  BALANCE_INFERENCE_QUEUE_NAME,
  DOCUMENT_EXTRACT_ROUTE_JOB_NAME,
  DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME,
  DOCUMENT_INFER_BALANCE_JOB_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  ENTITY_RESOLUTION_QUEUE_NAME,
  EVENT_RESOLVE_CATEGORY_JOB_NAME,
  FEEDBACK_PROCESS_JOB_NAME,
  FORECASTING_QUEUE_NAME,
  FORECAST_REBUILD_USER_JOB_NAME,
  FORECAST_REFRESH_USER_JOB_NAME,
  GMAIL_INCREMENTAL_POLL_JOB_NAME,
  INSTRUMENT_RESOLVE_JOB_NAME,
  MEMORY_LEARNING_QUEUE_NAME,
  MEMORY_REBUILD_USER_JOB_NAME,
  MERCHANT_RESOLUTION_QUEUE_NAME,
  MERCHANT_RESOLVE_JOB_NAME,
  RECONCILIATION_MODEL_RETRY_JOB_NAME,
  RECONCILIATION_QUEUE_NAME,
  SIGNAL_RECONCILE_JOB_NAME,
  enqueueAdviceRankUser,
  enqueueAdviceRefreshUser,
  enqueueAdviceRebuildUser,
  enqueueDocumentExtractRoute,
  enqueueDocumentExtractStructured,
  enqueueDocumentInferBalance,
  enqueueEventResolveCategory,
  enqueueFeedbackProcess,
  enqueueForecastRebuildUser,
  enqueueForecastRefreshUser,
  enqueueGmailIncrementalPoll,
  enqueueInstrumentResolve,
  enqueueMemoryRebuildUser,
  enqueueMerchantResolve,
  enqueueReconciliationModelRetry,
  enqueueSignalReconcile,
} from "@workspace/workflows"

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asUuid(value: unknown) {
  return asString(value)
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getRecoveryGroupKey(jobRun: JobRunSelect, userId: string) {
  return jobRun.recoveryGroupKey ?? `${jobRun.queueName}:${jobRun.jobName}:${userId}`
}

async function createReplayJobRun(input: {
  original: JobRunSelect
  userId: string
  payloadJson: Record<string, unknown>
  jobKey: string
}) {
  return createJobRun({
    queueName: input.original.queueName,
    jobName: input.original.jobName,
    jobKey: input.jobKey,
    payloadJson: input.payloadJson,
    maxAttempts: input.original.maxAttempts,
    retryable: input.original.retryable,
    replayedFromJobRunId: input.original.id,
    recoveryGroupKey: getRecoveryGroupKey(input.original, input.userId),
  })
}

export function isJobRunOwnedByUser(jobRun: JobRunSelect, userId: string) {
  return asString(jobRun.payloadJson?.userId) === userId
}

export function isRecoverableJobRun(jobRun: JobRunSelect) {
  return (
    jobRun.retryable &&
    (jobRun.status === "failed" || jobRun.status === "dead_lettered")
  )
}

export async function replayRecoverableJobRun(jobRun: JobRunSelect) {
  const userId = asString(jobRun.payloadJson?.userId)

  if (!userId) {
    throw new Error("Job run is missing user scope")
  }

  if (!isRecoverableJobRun(jobRun)) {
    throw new Error("Job run is not replayable")
  }

  const correlationId = createCorrelationId()
  const requestedAt = new Date().toISOString()
  const replayKeyBase = `${jobRun.jobName}:replay:${jobRun.id}:${correlationId}`

  if (jobRun.queueName === ADVICE_QUEUE_NAME && jobRun.jobName === ADVICE_REFRESH_USER_JOB_NAME) {
    const reason =
      asString(jobRun.payloadJson?.reason) === "goals_changed"
        ? "goals_changed"
        : asString(jobRun.payloadJson?.reason) === "manual_refresh"
          ? "manual_refresh"
          : "forecast_changed"
    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: { correlationId, userId, source: "web", reason },
    })

    await enqueueAdviceRefreshUser({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      source: "web",
      reason,
    })

    return replayJobRun
  }

  if (jobRun.queueName === ADVICE_QUEUE_NAME && jobRun.jobName === ADVICE_REBUILD_USER_JOB_NAME) {
    const reason =
      asString(jobRun.payloadJson?.reason) === "logic_change"
        ? "logic_change"
        : "manual_rebuild"
    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: { correlationId, userId, source: "web", reason },
    })

    await enqueueAdviceRebuildUser({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      source: "web",
      reason,
    })

    return replayJobRun
  }

  if (jobRun.queueName === ADVICE_QUEUE_NAME && jobRun.jobName === ADVICE_RANK_USER_JOB_NAME) {
    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: { correlationId, userId, source: "web", reason: "manual_rank" },
    })

    await enqueueAdviceRankUser({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      source: "web",
      reason: "manual_rank",
    })

    return replayJobRun
  }

  if (jobRun.queueName === FORECASTING_QUEUE_NAME && jobRun.jobName === FORECAST_REFRESH_USER_JOB_NAME) {
    const reason =
      asString(jobRun.payloadJson?.reason) === "recurring_changed"
        ? "recurring_changed"
        : asString(jobRun.payloadJson?.reason) === "review_resolved"
          ? "review_resolved"
          : asString(jobRun.payloadJson?.reason) === "balance_anchor_changed"
            ? "balance_anchor_changed"
            : asString(jobRun.payloadJson?.reason) === "manual_refresh"
              ? "manual_refresh"
              : "financial_event_changed"
    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: { correlationId, userId, source: "web", reason },
    })

    await enqueueForecastRefreshUser({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      source: "web",
      reason,
    })

    return replayJobRun
  }

  if (jobRun.queueName === FORECASTING_QUEUE_NAME && jobRun.jobName === FORECAST_REBUILD_USER_JOB_NAME) {
    const reason =
      asString(jobRun.payloadJson?.reason) === "logic_change"
        ? "logic_change"
        : "manual_rebuild"
    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: { correlationId, userId, source: "web", reason },
    })

    await enqueueForecastRebuildUser({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      source: "web",
      reason,
    })

    return replayJobRun
  }

  if (jobRun.queueName === EMAIL_SYNC_QUEUE_NAME && jobRun.jobName === GMAIL_INCREMENTAL_POLL_JOB_NAME) {
    const oauthConnectionId = asUuid(jobRun.payloadJson?.oauthConnectionId)
    const cursorId = asUuid(jobRun.payloadJson?.cursorId)
    const fallbackWindowHours = asNumber(jobRun.payloadJson?.fallbackWindowHours) ?? 24

    if (!oauthConnectionId || !cursorId) {
      throw new Error("Sync replay is missing oauth connection context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        oauthConnectionId,
        cursorId,
        source: "web",
        fallbackWindowHours,
      },
    })

    await enqueueGmailIncrementalPoll({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      oauthConnectionId,
      cursorId,
      source: "web",
      fallbackWindowHours,
    })

    return replayJobRun
  }

  if (jobRun.queueName === AI_EXTRACTION_QUEUE_NAME && jobRun.jobName === DOCUMENT_EXTRACT_ROUTE_JOB_NAME) {
    const rawDocumentId = asUuid(jobRun.payloadJson?.rawDocumentId)
    const normalizationJobRunId = asUuid(jobRun.payloadJson?.normalizationJobRunId)

    if (!rawDocumentId) {
      throw new Error("Extraction replay is missing raw document")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        rawDocumentId,
        source: "web",
        normalizationJobRunId,
      },
    })

    await enqueueDocumentExtractRoute({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      rawDocumentId,
      source: "web",
      normalizationJobRunId: normalizationJobRunId ?? undefined,
    })

    return replayJobRun
  }

  if (jobRun.queueName === AI_EXTRACTION_QUEUE_NAME && jobRun.jobName === DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME) {
    const rawDocumentId = asUuid(jobRun.payloadJson?.rawDocumentId)
    const routeJobRunId = asUuid(jobRun.payloadJson?.routeJobRunId)
    const routeModelRunId = asUuid(jobRun.payloadJson?.routeModelRunId)
    const routeLabel = asString(jobRun.payloadJson?.routeLabel)
    const routeConfidence = asNumber(jobRun.payloadJson?.routeConfidence)
    const routeReasons = Array.isArray(jobRun.payloadJson?.routeReasons)
      ? jobRun.payloadJson?.routeReasons.filter((value): value is string => typeof value === "string")
      : []

    if (!rawDocumentId || !routeJobRunId || !routeLabel || typeof routeConfidence !== "number") {
      throw new Error("Structured extraction replay is missing route context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        rawDocumentId,
        routeJobRunId,
        routeModelRunId,
        routeLabel,
        routeConfidence,
        routeReasons,
        source: "web",
      },
    })

    await enqueueDocumentExtractStructured({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      rawDocumentId,
      routeJobRunId,
      routeModelRunId: routeModelRunId ?? undefined,
      routeLabel: routeLabel as
        | "purchase"
        | "income"
        | "subscription_charge"
        | "emi_payment"
        | "bill_payment"
        | "refund"
        | "transfer"
        | "generic_finance",
      routeConfidence,
      routeReasons,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === BALANCE_INFERENCE_QUEUE_NAME && jobRun.jobName === DOCUMENT_INFER_BALANCE_JOB_NAME) {
    const rawDocumentId = asUuid(jobRun.payloadJson?.rawDocumentId)
    const extractionSource = asString(jobRun.payloadJson?.extractionSource)
    const extractionJobRunId = asUuid(jobRun.payloadJson?.extractionJobRunId)

    if (!rawDocumentId || !extractionSource) {
      throw new Error("Balance inference replay is missing extraction context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        rawDocumentId,
        extractionSource,
        extractionJobRunId,
        source: "web",
      },
    })

    await enqueueDocumentInferBalance({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      rawDocumentId,
      extractionSource: extractionSource as "deterministic" | "model",
      extractionJobRunId: extractionJobRunId ?? undefined,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === MERCHANT_RESOLUTION_QUEUE_NAME && jobRun.jobName === MERCHANT_RESOLVE_JOB_NAME) {
    const financialEventId = asUuid(jobRun.payloadJson?.financialEventId)
    const observationClusterKey = asString(jobRun.payloadJson?.observationClusterKey)

    if (!financialEventId || !observationClusterKey) {
      throw new Error("Merchant replay is missing event context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        financialEventId,
        observationClusterKey,
        source: "web",
      },
    })

    await enqueueMerchantResolve({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      financialEventId,
      observationClusterKey,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === MERCHANT_RESOLUTION_QUEUE_NAME && jobRun.jobName === EVENT_RESOLVE_CATEGORY_JOB_NAME) {
    const financialEventId = asUuid(jobRun.payloadJson?.financialEventId)

    if (!financialEventId) {
      throw new Error("Category replay is missing event context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        financialEventId,
        source: "web",
      },
    })

    await enqueueEventResolveCategory({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      financialEventId,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === ENTITY_RESOLUTION_QUEUE_NAME && jobRun.jobName === INSTRUMENT_RESOLVE_JOB_NAME) {
    const maskedIdentifier = asString(jobRun.payloadJson?.maskedIdentifier)
    const triggerObservationId = asUuid(jobRun.payloadJson?.triggerObservationId)

    if (!maskedIdentifier) {
      throw new Error("Instrument replay is missing masked identifier")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        maskedIdentifier,
        triggerObservationId,
        source: "web",
      },
    })

    await enqueueInstrumentResolve({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      maskedIdentifier,
      triggerObservationId: triggerObservationId ?? undefined,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === RECONCILIATION_QUEUE_NAME && jobRun.jobName === SIGNAL_RECONCILE_JOB_NAME) {
    const extractedSignalId = asUuid(jobRun.payloadJson?.extractedSignalId)
    const rawDocumentId = asUuid(jobRun.payloadJson?.rawDocumentId)

    if (!extractedSignalId || !rawDocumentId) {
      throw new Error("Reconciliation replay is missing signal context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        extractedSignalId,
        rawDocumentId,
        source: "web",
      },
    })

    await enqueueSignalReconcile({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      extractedSignalId,
      rawDocumentId,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === RECONCILIATION_QUEUE_NAME && jobRun.jobName === RECONCILIATION_MODEL_RETRY_JOB_NAME) {
    const modelRunId = asUuid(jobRun.payloadJson?.modelRunId)
    const extractedSignalId = asUuid(jobRun.payloadJson?.extractedSignalId)
    const rawDocumentId = asUuid(jobRun.payloadJson?.rawDocumentId)

    if (!modelRunId || !extractedSignalId || !rawDocumentId) {
      throw new Error("Reconciliation model replay is missing signal context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        modelRunId,
        extractedSignalId,
        rawDocumentId,
        source: "web",
      },
    })

    await enqueueReconciliationModelRetry({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      modelRunId,
      extractedSignalId,
      rawDocumentId,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === MEMORY_LEARNING_QUEUE_NAME && jobRun.jobName === FEEDBACK_PROCESS_JOB_NAME) {
    const feedbackEventId = asUuid(jobRun.payloadJson?.feedbackEventId)

    if (!feedbackEventId) {
      throw new Error("Feedback replay is missing feedback event context")
    }

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        feedbackEventId,
        source: "web",
      },
    })

    await enqueueFeedbackProcess({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      feedbackEventId,
      source: "web",
    })

    return replayJobRun
  }

  if (jobRun.queueName === MEMORY_LEARNING_QUEUE_NAME && jobRun.jobName === MEMORY_REBUILD_USER_JOB_NAME) {
    const reason =
      asString(jobRun.payloadJson?.reason) === "review_resolution"
        ? "review_resolution"
        : asString(jobRun.payloadJson?.reason) === "automation_refresh"
          ? "automation_refresh"
          : asString(jobRun.payloadJson?.reason) === "startup_rebuild"
            ? "startup_rebuild"
            : "manual_refresh"
    const sourceReferenceId = asUuid(jobRun.payloadJson?.sourceReferenceId)

    const replayJobRun = await createReplayJobRun({
      original: jobRun,
      userId,
      jobKey: replayKeyBase,
      payloadJson: {
        correlationId,
        userId,
        reason,
        sourceReferenceId,
        source: "web",
      },
    })

    await enqueueMemoryRebuildUser({
      correlationId,
      jobRunId: replayJobRun.id,
      jobKey: replayKeyBase,
      requestedAt,
      userId,
      reason,
      sourceReferenceId: sourceReferenceId ?? undefined,
      source: "web",
    })

    return replayJobRun
  }

  throw new Error(`Unsupported recovery job: ${jobRun.jobName}`)
}

export async function retryDocumentExtraction(input: {
  userId: string
  rawDocumentId: string
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${DOCUMENT_EXTRACT_ROUTE_JOB_NAME}:manual:${input.rawDocumentId}:${correlationId}`
  const jobRun = await createJobRun({
    queueName: AI_EXTRACTION_QUEUE_NAME,
    jobName: DOCUMENT_EXTRACT_ROUTE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      source: "web",
    },
    recoveryGroupKey: `${AI_EXTRACTION_QUEUE_NAME}:${DOCUMENT_EXTRACT_ROUTE_JOB_NAME}:${input.userId}`,
  })

  await enqueueDocumentExtractRoute({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    rawDocumentId: input.rawDocumentId,
    source: "web",
  })

  return jobRun
}

export async function retryBalanceInference(input: {
  userId: string
  rawDocumentId: string
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${DOCUMENT_INFER_BALANCE_JOB_NAME}:manual:${input.rawDocumentId}:${correlationId}`
  const jobRun = await createJobRun({
    queueName: BALANCE_INFERENCE_QUEUE_NAME,
    jobName: DOCUMENT_INFER_BALANCE_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      rawDocumentId: input.rawDocumentId,
      extractionSource: "model",
      source: "web",
    },
    recoveryGroupKey: `${BALANCE_INFERENCE_QUEUE_NAME}:${DOCUMENT_INFER_BALANCE_JOB_NAME}:${input.userId}`,
  })

  await enqueueDocumentInferBalance({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    rawDocumentId: input.rawDocumentId,
    extractionSource: "model",
    source: "web",
  })

  return jobRun
}

export async function retryCategoryResolution(input: {
  userId: string
  financialEventId: string
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${EVENT_RESOLVE_CATEGORY_JOB_NAME}:manual:${input.financialEventId}:${correlationId}`
  const jobRun = await createJobRun({
    queueName: MERCHANT_RESOLUTION_QUEUE_NAME,
    jobName: EVENT_RESOLVE_CATEGORY_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      source: "web",
    },
    recoveryGroupKey: `${MERCHANT_RESOLUTION_QUEUE_NAME}:${EVENT_RESOLVE_CATEGORY_JOB_NAME}:${input.userId}`,
  })

  await enqueueEventResolveCategory({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    source: "web",
  })

  return jobRun
}
