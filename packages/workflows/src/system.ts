import { z } from "zod"

import { getOrCreateQueue, toBullJobId } from "./redis"

export const SYSTEM_QUEUE_NAME = "system"
export const SYSTEM_HEALTHCHECK_JOB_NAME = "system.healthcheck"

export const systemHealthcheckJobPayloadSchema = z.object({
  correlationId: z.string().min(1),
  source: z.enum(["web", "script", "worker"]),
  triggeredByUserId: z.string().min(1).optional(),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
})

export type SystemHealthcheckJobPayload = z.infer<
  typeof systemHealthcheckJobPayloadSchema
>

export function getSystemQueue() {
  return getOrCreateQueue(SYSTEM_QUEUE_NAME, "system")
}

export async function enqueueSystemHealthcheck(payload: SystemHealthcheckJobPayload) {
  const parsed = systemHealthcheckJobPayloadSchema.parse(payload)

  return getSystemQueue().add(SYSTEM_HEALTHCHECK_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function getSystemQueueStats() {
  return getSystemQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
