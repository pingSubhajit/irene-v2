import { z } from "zod"

import { createTrackedJobOptions, getOrCreateQueue, toBullJobId } from "./redis"

export const RECONCILIATION_QUEUE_NAME = "reconciliation"
export const SIGNAL_RECONCILE_JOB_NAME = "signal.reconcile"
export const RECONCILIATION_MODEL_RETRY_JOB_NAME = "reconciliation.retry-model-run"
export const RECONCILIATION_REPAIR_BATCH_JOB_NAME = "reconciliation.repair.batch"

const reconciliationJobPayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  extractedSignalId: z.string().uuid(),
  rawDocumentId: z.string().uuid(),
  source: z.enum(["worker", "web"]),
})

export type SignalReconcileJobPayload = z.infer<typeof reconciliationJobPayloadSchema>

const reconciliationModelRetryJobPayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  modelRunId: z.string().uuid(),
  extractedSignalId: z.string().uuid(),
  rawDocumentId: z.string().uuid(),
  source: z.enum(["worker", "web"]),
})

export type ReconciliationModelRetryJobPayload = z.infer<
  typeof reconciliationModelRetryJobPayloadSchema
>

const reconciliationRepairBatchJobPayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  cursorId: z.string().uuid(),
  sourceKind: z.enum(["backfill", "incremental"]),
  source: z.enum(["worker", "web"]),
})

export type ReconciliationRepairBatchJobPayload = z.infer<
  typeof reconciliationRepairBatchJobPayloadSchema
>

export function getReconciliationQueue() {
  return getOrCreateQueue(RECONCILIATION_QUEUE_NAME, "reconciliation")
}

export async function enqueueSignalReconcile(payload: SignalReconcileJobPayload) {
  const parsed = reconciliationJobPayloadSchema.parse(payload)

  return getReconciliationQueue().add(SIGNAL_RECONCILE_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 45_000,
    }),
  })
}

export async function enqueueReconciliationModelRetry(
  payload: ReconciliationModelRetryJobPayload,
) {
  const parsed = reconciliationModelRetryJobPayloadSchema.parse(payload)

  return getReconciliationQueue().add(RECONCILIATION_MODEL_RETRY_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 45_000,
    }),
  })
}

export async function enqueueReconciliationRepairBatch(
  payload: ReconciliationRepairBatchJobPayload,
  input?: { delayMs?: number },
) {
  const parsed = reconciliationRepairBatchJobPayloadSchema.parse(payload)

  return getReconciliationQueue().add(RECONCILIATION_REPAIR_BATCH_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 45_000,
    }),
    delay: input?.delayMs,
  })
}

export async function getReconciliationQueueStats() {
  return getReconciliationQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}

export { reconciliationJobPayloadSchema, reconciliationModelRetryJobPayloadSchema }
export { reconciliationRepairBatchJobPayloadSchema }
