import { z } from "zod"

import { getOrCreateQueue, toBullJobId } from "./redis"

export const FX_QUEUE_NAME = "fx-valuation"

export const FX_EVENT_REFRESH_JOB_NAME = "fx.event.refresh"
export const FX_USER_BACKFILL_JOB_NAME = "fx.user.backfill"
export const FX_RATE_WARM_JOB_NAME = "fx.rate.warm"

const fxBasePayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
})

export const fxEventRefreshJobPayloadSchema = fxBasePayloadSchema.extend({
  userId: z.string().min(1),
  financialEventId: z.string().uuid(),
  targetCurrency: z.string().length(3),
})

export const fxUserBackfillJobPayloadSchema = fxBasePayloadSchema.extend({
  userId: z.string().min(1),
  targetCurrency: z.string().length(3),
})

export const fxRateWarmJobPayloadSchema = fxBasePayloadSchema.extend({
  lookbackDays: z.number().int().positive().default(7),
})

export type FxEventRefreshJobPayload = z.infer<typeof fxEventRefreshJobPayloadSchema>
export type FxUserBackfillJobPayload = z.infer<typeof fxUserBackfillJobPayloadSchema>
export type FxRateWarmJobPayload = z.infer<typeof fxRateWarmJobPayloadSchema>

export function getFxQueue() {
  return getOrCreateQueue(FX_QUEUE_NAME, "fxValuation")
}

export async function enqueueFxEventRefresh(payload: FxEventRefreshJobPayload) {
  const parsed = fxEventRefreshJobPayloadSchema.parse(payload)

  return getFxQueue().add(FX_EVENT_REFRESH_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueFxUserBackfill(payload: FxUserBackfillJobPayload) {
  const parsed = fxUserBackfillJobPayloadSchema.parse(payload)

  return getFxQueue().add(FX_USER_BACKFILL_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueFxRateWarm(payload: FxRateWarmJobPayload) {
  const parsed = fxRateWarmJobPayloadSchema.parse(payload)

  return getFxQueue().add(FX_RATE_WARM_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}
