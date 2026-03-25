import { z } from "zod"

import {
  addOrRefreshTrackedJob,
  createTrackedJobOptions,
  getOrCreateQueue,
  toBullJobId,
} from "./redis"

export const MEMORY_LEARNING_QUEUE_NAME = "memory-learning"
export const FEEDBACK_PROCESS_JOB_NAME = "feedback.process"
export const MEMORY_REBUILD_USER_JOB_NAME = "memory.rebuild.user"
export const MEMORY_DECAY_SCAN_JOB_NAME = "memory.decay.scan"

const basePayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  source: z.enum(["worker", "web", "startup", "scheduler"]),
})

export const feedbackProcessJobPayloadSchema = basePayloadSchema.extend({
  userId: z.string().min(1),
  feedbackEventId: z.string().uuid(),
})

export const memoryRebuildUserJobPayloadSchema = basePayloadSchema.extend({
  userId: z.string().min(1),
  reason: z.enum([
    "feedback",
    "review_resolution",
    "automation_refresh",
    "manual_refresh",
    "startup_rebuild",
  ]),
  sourceReferenceId: z.string().uuid().optional(),
})

export const memoryDecayScanJobPayloadSchema = basePayloadSchema.extend({
  reason: z.enum(["startup_scan", "nightly_scan"]),
})

export type FeedbackProcessJobPayload = z.infer<typeof feedbackProcessJobPayloadSchema>
export type MemoryRebuildUserJobPayload = z.infer<typeof memoryRebuildUserJobPayloadSchema>
export type MemoryDecayScanJobPayload = z.infer<typeof memoryDecayScanJobPayloadSchema>

export function getMemoryLearningQueue() {
  return getOrCreateQueue(MEMORY_LEARNING_QUEUE_NAME, "memoryLearning")
}

export function isBackgroundMemoryRebuildReason(
  reason: MemoryRebuildUserJobPayload["reason"],
) {
  return reason === "automation_refresh" || reason === "startup_rebuild"
}

export function getMemoryRebuildUserJobKey(input: {
  userId: string
  reason: MemoryRebuildUserJobPayload["reason"]
  sourceReferenceId?: string
  correlationId?: string
}) {
  if (isBackgroundMemoryRebuildReason(input.reason)) {
    return `${MEMORY_REBUILD_USER_JOB_NAME}:user:${input.userId}:${input.reason}`
  }

  return `${MEMORY_REBUILD_USER_JOB_NAME}:user:${input.userId}:${input.reason}:${input.sourceReferenceId ?? "explicit"}:${input.correlationId ?? "manual"}`
}

export async function enqueueFeedbackProcess(payload: FeedbackProcessJobPayload) {
  const parsed = feedbackProcessJobPayloadSchema.parse(payload)

  return getMemoryLearningQueue().add(FEEDBACK_PROCESS_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 30_000,
    }),
  })
}

export async function enqueueMemoryRebuildUser(payload: MemoryRebuildUserJobPayload) {
  const parsed = memoryRebuildUserJobPayloadSchema.parse(payload)

  if (isBackgroundMemoryRebuildReason(parsed.reason)) {
    return addOrRefreshTrackedJob({
      queue: getMemoryLearningQueue(),
      jobName: MEMORY_REBUILD_USER_JOB_NAME,
      payload: parsed,
      attempts: 2,
      backoffMs: 60_000,
      jobId: toBullJobId(parsed.jobKey),
    })
  }

  return getMemoryLearningQueue().add(MEMORY_REBUILD_USER_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 60_000,
    }),
  })
}

export async function enqueueMemoryDecayScan(payload: MemoryDecayScanJobPayload) {
  const parsed = memoryDecayScanJobPayloadSchema.parse(payload)

  return getMemoryLearningQueue().add(MEMORY_DECAY_SCAN_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 1,
      backoffMs: 15_000,
    }),
  })
}

export async function getMemoryLearningQueueStats() {
  return getMemoryLearningQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
