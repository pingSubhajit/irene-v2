import { z } from "zod"

import { getOrCreateQueue, toBullJobId } from "./redis"

export const ADVICE_QUEUE_NAME = "advice"
export const ADVICE_REFRESH_USER_JOB_NAME = "advice.refresh.user"
export const ADVICE_REBUILD_USER_JOB_NAME = "advice.rebuild.user"

const basePayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  source: z.enum(["worker", "web", "scheduler", "startup"]),
})

export const adviceRefreshUserJobPayloadSchema = basePayloadSchema.extend({
  reason: z.enum(["forecast_changed", "goals_changed", "manual_refresh"]).default(
    "forecast_changed",
  ),
})

export const adviceRebuildUserJobPayloadSchema = basePayloadSchema.extend({
  reason: z
    .enum(["nightly_rebuild", "startup_rebuild", "manual_rebuild", "logic_change"])
    .default("nightly_rebuild"),
})

export type AdviceRefreshUserJobPayload = z.infer<
  typeof adviceRefreshUserJobPayloadSchema
>
export type AdviceRebuildUserJobPayload = z.infer<
  typeof adviceRebuildUserJobPayloadSchema
>

export function getAdviceQueue() {
  return getOrCreateQueue(ADVICE_QUEUE_NAME, "advice")
}

export async function enqueueAdviceRefreshUser(payload: AdviceRefreshUserJobPayload) {
  const parsed = adviceRefreshUserJobPayloadSchema.parse(payload)

  return getAdviceQueue().add(ADVICE_REFRESH_USER_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueAdviceRebuildUser(payload: AdviceRebuildUserJobPayload) {
  const parsed = adviceRebuildUserJobPayloadSchema.parse(payload)

  return getAdviceQueue().add(ADVICE_REBUILD_USER_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function getAdviceQueueStats() {
  return getAdviceQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
