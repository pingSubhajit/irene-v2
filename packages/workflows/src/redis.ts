import { Queue, type ConnectionOptions } from "bullmq"

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
