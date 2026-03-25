import { Queue, type ConnectionOptions, type Job, type JobsOptions } from "bullmq"

import { getRedisEnv } from "@workspace/config/server"

export const QUEUE_PREFIX = "irene"

type QueueRegistry = {
  system?: Queue
  backfillImport?: Queue
  emailSync?: Queue
  fxValuation?: Queue
  forecasting?: Queue
  advice?: Queue
  memoryLearning?: Queue
  balanceInference?: Queue
  documentNormalization?: Queue
  aiExtraction?: Queue
  reconciliation?: Queue
  recurringDetection?: Queue
  entityResolution?: Queue
  merchantResolution?: Queue
}

const globalForRedis = globalThis as typeof globalThis & {
  __ireneQueues?: QueueRegistry
}

function getQueueRegistry(): QueueRegistry {
  globalForRedis.__ireneQueues ??= {}
  return globalForRedis.__ireneQueues
}

export function getRedisOptions(): ConnectionOptions {
  const env = getRedisEnv()

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

export function toBullJobId(jobKey: string) {
  return jobKey.replaceAll(":", "__")
}

export function createTrackedJobOptions(input: {
  jobId: string
  attempts?: number
  backoffMs?: number
}) {
  const attempts = input.attempts ?? 3

  return {
    jobId: input.jobId,
    attempts,
    backoff: {
      type: "exponential",
      delay: input.backoffMs ?? 15_000,
    },
  } satisfies JobsOptions
}

type CoalescedJobState =
  | "active"
  | "completed"
  | "delayed"
  | "failed"
  | "paused"
  | "prioritized"
  | "unknown"
  | "waiting"
  | "waiting-children"

function isQueuedState(state: CoalescedJobState) {
  return (
    state === "waiting" ||
    state === "delayed" ||
    state === "prioritized" ||
    state === "paused" ||
    state === "waiting-children"
  )
}

async function replaceTerminalJob<T>(
  queue: Queue,
  existingJob: Job<T>,
  jobName: string,
  payload: T,
  options: JobsOptions,
) {
  await existingJob.remove()
  return queue.add(jobName, payload, options)
}

export async function addOrRefreshTrackedJob<T>(input: {
  queue: Queue
  jobName: string
  payload: T
  attempts?: number
  backoffMs?: number
  jobId: string
}) {
  const options = createTrackedJobOptions({
    jobId: input.jobId,
    attempts: input.attempts,
    backoffMs: input.backoffMs,
  })
  const existingJob = await input.queue.getJob(input.jobId)

  if (!existingJob) {
    return input.queue.add(input.jobName, input.payload, options)
  }

  const state = (await existingJob.getState()) as CoalescedJobState

  if (isQueuedState(state)) {
    await existingJob.updateData(input.payload)
    return existingJob
  }

  if (state === "active") {
    return existingJob
  }

  return replaceTerminalJob(
    input.queue,
    existingJob as Job<T>,
    input.jobName,
    input.payload,
    options,
  )
}

export function getOrCreateQueue(name: string, key: keyof QueueRegistry) {
  const registry = getQueueRegistry()
  const existing = registry[key]

  if (existing) {
    return existing
  }

  const queue = new Queue(name, {
    connection: getRedisOptions(),
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    },
  })

  registry[key] = queue
  return queue
}

export async function closeWorkflowConnections() {
  const registry = getQueueRegistry()

  await Promise.all(
    Object.entries(registry).map(async ([key, queue]) => {
      if (!queue) {
        return
      }

      await queue.close()
      delete registry[key as keyof QueueRegistry]
    }),
  )
}
