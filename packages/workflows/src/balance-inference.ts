import { z } from "zod"

import { getOrCreateQueue, toBullJobId } from "./redis"

export const BALANCE_INFERENCE_QUEUE_NAME = "balance-inference"
export const DOCUMENT_INFER_BALANCE_JOB_NAME = "document.infer.balance"

const balanceInferenceBasePayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  rawDocumentId: z.string().uuid(),
  source: z.enum(["worker", "web"]),
})

export const documentInferBalanceJobPayloadSchema =
  balanceInferenceBasePayloadSchema.extend({
    extractionSource: z.enum(["deterministic", "model"]),
    extractionJobRunId: z.string().uuid().optional(),
  })

export type DocumentInferBalanceJobPayload = z.infer<
  typeof documentInferBalanceJobPayloadSchema
>

export function getBalanceInferenceQueue() {
  return getOrCreateQueue(BALANCE_INFERENCE_QUEUE_NAME, "balanceInference")
}

export async function enqueueDocumentInferBalance(
  payload: DocumentInferBalanceJobPayload,
) {
  const parsed = documentInferBalanceJobPayloadSchema.parse(payload)

  return getBalanceInferenceQueue().add(DOCUMENT_INFER_BALANCE_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function getBalanceInferenceQueueStats() {
  return getBalanceInferenceQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
