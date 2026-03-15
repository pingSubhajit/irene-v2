import { Queue, type ConnectionOptions } from "bullmq"
import { z } from "zod"

import { getServerEnv } from "@workspace/config/server"

export const QUEUE_PREFIX = "irene"
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

const globalForRedis = globalThis as typeof globalThis & {
  __ireneSystemQueue?: Queue
}

function getRedisOptions(): ConnectionOptions {
  const env = getServerEnv()

  return {
    host: env.UPSTASH_REDIS_HOST,
    port: env.UPSTASH_REDIS_PORT,
    password: env.UPSTASH_REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
  } as const
}

export function createWorkerRedisConnection() {
  return getRedisOptions()
}

export function getSystemQueue() {
  const queue =
    globalForRedis.__ireneSystemQueue ??
    new Queue(SYSTEM_QUEUE_NAME, {
      connection: getRedisOptions(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 100,
        removeOnFail: false,
      },
    })

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.__ireneSystemQueue = queue
  }

  return queue
}

export async function enqueueSystemHealthcheck(payload: SystemHealthcheckJobPayload) {
  const parsed = systemHealthcheckJobPayloadSchema.parse(payload)

  return getSystemQueue().add(SYSTEM_HEALTHCHECK_JOB_NAME, parsed, {
    jobId: parsed.jobKey,
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

export async function checkRedisHealth() {
  const client = await getSystemQueue().client
  const result = await client.ping()

  return {
    ok: result === "PONG",
  }
}

export async function closeWorkflowConnections() {
  const queue = globalForRedis.__ireneSystemQueue

  if (queue) {
    await queue.close()
    globalForRedis.__ireneSystemQueue = undefined
  }
}
