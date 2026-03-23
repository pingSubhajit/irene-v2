import { z } from "zod"

import { createTrackedJobOptions, getOrCreateQueue, toBullJobId } from "./redis"

export const MERCHANT_RESOLUTION_QUEUE_NAME = "merchant-resolution"
export const EVENT_EXTRACT_MERCHANT_OBSERVATION_JOB_NAME =
  "event.extract.merchant_observation"
export const MERCHANT_RESOLVE_JOB_NAME = "merchant.resolve"
export const MERCHANT_REPAIR_BACKFILL_JOB_NAME = "merchant.repair.backfill"
export const EVENT_RESOLVE_CATEGORY_JOB_NAME = "event.resolve.category"

const trackedJobFields = {
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  source: z.enum(["worker", "web", "startup"]),
} as const

export const eventExtractMerchantObservationJobPayloadSchema = z.object({
  ...trackedJobFields,
  financialEventId: z.string().uuid(),
})

export const merchantResolveJobPayloadSchema = z.object({
  ...trackedJobFields,
  financialEventId: z.string().uuid(),
  observationClusterKey: z.string().min(1),
})

export const merchantRepairBackfillJobPayloadSchema = z.object({
  ...trackedJobFields,
})

export const eventResolveCategoryJobPayloadSchema = z.object({
  ...trackedJobFields,
  financialEventId: z.string().uuid(),
})

export type EventExtractMerchantObservationJobPayload = z.infer<
  typeof eventExtractMerchantObservationJobPayloadSchema
>
export type MerchantResolveJobPayload = z.infer<typeof merchantResolveJobPayloadSchema>
export type MerchantRepairBackfillJobPayload = z.infer<
  typeof merchantRepairBackfillJobPayloadSchema
>
export type EventResolveCategoryJobPayload = z.infer<
  typeof eventResolveCategoryJobPayloadSchema
>

export function getMerchantResolutionQueue() {
  return getOrCreateQueue(MERCHANT_RESOLUTION_QUEUE_NAME, "merchantResolution")
}

export async function enqueueEventExtractMerchantObservation(
  payload: EventExtractMerchantObservationJobPayload,
) {
  const parsed = eventExtractMerchantObservationJobPayloadSchema.parse(payload)
  return getMerchantResolutionQueue().add(EVENT_EXTRACT_MERCHANT_OBSERVATION_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 20_000,
    }),
  })
}

export async function enqueueMerchantResolve(payload: MerchantResolveJobPayload) {
  const parsed = merchantResolveJobPayloadSchema.parse(payload)
  return getMerchantResolutionQueue().add(MERCHANT_RESOLVE_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 30_000,
    }),
  })
}

export async function enqueueMerchantRepairBackfill(
  payload: MerchantRepairBackfillJobPayload,
) {
  const parsed = merchantRepairBackfillJobPayloadSchema.parse(payload)
  return getMerchantResolutionQueue().add(MERCHANT_REPAIR_BACKFILL_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 1,
      backoffMs: 30_000,
    }),
  })
}

export async function enqueueEventResolveCategory(payload: EventResolveCategoryJobPayload) {
  const parsed = eventResolveCategoryJobPayloadSchema.parse(payload)
  return getMerchantResolutionQueue().add(EVENT_RESOLVE_CATEGORY_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 30_000,
    }),
  })
}

export async function getMerchantResolutionQueueStats() {
  return getMerchantResolutionQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
