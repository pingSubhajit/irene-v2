import { z } from "zod"

import { getOrCreateQueue, toBullJobId } from "./redis"

export const RECURRING_DETECTION_QUEUE_NAME = "recurring-detection"
export const EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME = "event.detect.recurring_obligation"
export const EVENT_DETECT_INCOME_STREAM_JOB_NAME = "event.detect.income_stream"
export const OBLIGATION_REFRESH_JOB_NAME = "obligation.refresh"
export const INCOME_STREAM_REFRESH_JOB_NAME = "income_stream.refresh"

const trackedJobFields = {
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  source: z.enum(["worker", "web"]),
} as const

export const recurringObligationDetectionJobPayloadSchema = z.object({
  ...trackedJobFields,
  financialEventId: z.string().uuid(),
})

export const incomeStreamDetectionJobPayloadSchema = z.object({
  ...trackedJobFields,
  financialEventId: z.string().uuid(),
})

export const obligationRefreshJobPayloadSchema = z.object({
  ...trackedJobFields,
  recurringObligationId: z.string().uuid(),
})

export const incomeStreamRefreshJobPayloadSchema = z.object({
  ...trackedJobFields,
  incomeStreamId: z.string().uuid(),
})

export type RecurringObligationDetectionJobPayload = z.infer<
  typeof recurringObligationDetectionJobPayloadSchema
>
export type IncomeStreamDetectionJobPayload = z.infer<
  typeof incomeStreamDetectionJobPayloadSchema
>
export type ObligationRefreshJobPayload = z.infer<typeof obligationRefreshJobPayloadSchema>
export type IncomeStreamRefreshJobPayload = z.infer<typeof incomeStreamRefreshJobPayloadSchema>

export function getRecurringDetectionQueue() {
  return getOrCreateQueue(RECURRING_DETECTION_QUEUE_NAME, "recurringDetection")
}

export async function enqueueRecurringObligationDetection(
  payload: RecurringObligationDetectionJobPayload,
) {
  const parsed = recurringObligationDetectionJobPayloadSchema.parse(payload)

  return getRecurringDetectionQueue().add(EVENT_DETECT_RECURRING_OBLIGATION_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueIncomeStreamDetection(
  payload: IncomeStreamDetectionJobPayload,
) {
  const parsed = incomeStreamDetectionJobPayloadSchema.parse(payload)

  return getRecurringDetectionQueue().add(EVENT_DETECT_INCOME_STREAM_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueObligationRefresh(payload: ObligationRefreshJobPayload) {
  const parsed = obligationRefreshJobPayloadSchema.parse(payload)

  return getRecurringDetectionQueue().add(OBLIGATION_REFRESH_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueIncomeStreamRefresh(payload: IncomeStreamRefreshJobPayload) {
  const parsed = incomeStreamRefreshJobPayloadSchema.parse(payload)

  return getRecurringDetectionQueue().add(INCOME_STREAM_REFRESH_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function getRecurringDetectionQueueStats() {
  return getRecurringDetectionQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
