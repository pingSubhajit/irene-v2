import Redis, { type RedisOptions } from "ioredis"

import { getRedisEnv } from "@workspace/config/server"
import { closeDatabase, pool } from "@workspace/db"
import {
  ADVICE_QUEUE_NAME,
  AI_EXTRACTION_QUEUE_NAME,
  BALANCE_INFERENCE_QUEUE_NAME,
  BACKFILL_IMPORT_QUEUE_NAME,
  DOCUMENT_NORMALIZATION_QUEUE_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  ENTITY_RESOLUTION_QUEUE_NAME,
  FORECASTING_QUEUE_NAME,
  FX_QUEUE_NAME,
  MEMORY_LEARNING_QUEUE_NAME,
  MERCHANT_RESOLUTION_QUEUE_NAME,
  QUEUE_PREFIX,
  RECONCILIATION_QUEUE_NAME,
  RECURRING_DETECTION_QUEUE_NAME,
  SYSTEM_QUEUE_NAME,
} from "@workspace/workflows"

const queueNames = [
  SYSTEM_QUEUE_NAME,
  BACKFILL_IMPORT_QUEUE_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  FX_QUEUE_NAME,
  DOCUMENT_NORMALIZATION_QUEUE_NAME,
  AI_EXTRACTION_QUEUE_NAME,
  BALANCE_INFERENCE_QUEUE_NAME,
  RECONCILIATION_QUEUE_NAME,
  RECURRING_DETECTION_QUEUE_NAME,
  FORECASTING_QUEUE_NAME,
  ADVICE_QUEUE_NAME,
  MEMORY_LEARNING_QUEUE_NAME,
  ENTITY_RESOLUTION_QUEUE_NAME,
  MERCHANT_RESOLUTION_QUEUE_NAME,
] as const

type RedisResult = [Error | null, unknown]

function key(queueName: string, suffix: string) {
  return `${QUEUE_PREFIX}:${queueName}:${suffix}`
}

function numericResult(results: RedisResult[], index: number) {
  const [error, value] = results[index] ?? []

  if (error) {
    return `error:${error.message}`
  }

  return Number(value ?? 0)
}

async function inspectRedisQueues(redis: Redis) {
  const rows = []

  for (const queueName of queueNames) {
    const results = (await redis
      .pipeline()
      .llen(key(queueName, "wait"))
      .llen(key(queueName, "active"))
      .llen(key(queueName, "paused"))
      .zcard(key(queueName, "delayed"))
      .zcard(key(queueName, "prioritized"))
      .zcard(key(queueName, "marker"))
      .scard(key(queueName, "stalled"))
      .xlen(key(queueName, "events"))
      .get(key(queueName, "stalled-check"))
      .exec()) as RedisResult[]

    rows.push({
      queueName,
      wait: numericResult(results, 0),
      active: numericResult(results, 1),
      paused: numericResult(results, 2),
      delayed: numericResult(results, 3),
      prioritized: numericResult(results, 4),
      marker: numericResult(results, 5),
      stalled: numericResult(results, 6),
      events: numericResult(results, 7),
      stalledCheck: results[8]?.[1] ?? null,
    })
  }

  return rows
}

async function inspectDatabase() {
  const [jobStatus, recentActivity, stuckJobs] = await Promise.all([
    pool.query(`
      select
        queue_name,
        job_name,
        status,
        count(*)::int as count,
        max(created_at) as newest_created_at,
        max(started_at) as newest_started_at,
        max(completed_at) as newest_completed_at
      from job_run
      where created_at >= now() - interval '5 days'
      group by queue_name, job_name, status
      order by queue_name, job_name, status
    `),
    pool.query(`
      select 'raw_document' as table_name, count(*)::int as count, max(created_at) as newest_created_at
      from raw_document
      where created_at >= now() - interval '5 days'
      union all
      select 'financial_event' as table_name, count(*)::int as count, max(created_at) as newest_created_at
      from financial_event
      where created_at >= now() - interval '5 days'
      union all
      select 'extracted_signal' as table_name, count(*)::int as count, max(created_at) as newest_created_at
      from extracted_signal
      where created_at >= now() - interval '5 days'
    `),
    pool.query(`
      select
        id,
        queue_name,
        job_name,
        status,
        attempt_count,
        max_attempts,
        created_at,
        started_at,
        last_error_code,
        left(coalesce(error_message, ''), 240) as error_message
      from job_run
      where status in ('queued', 'running', 'failed', 'dead_lettered')
      order by created_at asc
      limit 50
    `),
  ])

  return {
    jobStatusLastFiveDays: jobStatus.rows,
    recentIngestionLastFiveDays: recentActivity.rows,
    oldestUnfinishedOrFailedJobs: stuckJobs.rows,
  }
}

async function main() {
  const env = getRedisEnv()
  const redisOptions: RedisOptions = {
    host: env.UPSTASH_REDIS_HOST,
    port: env.UPSTASH_REDIS_PORT,
    password: env.UPSTASH_REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
  }
  const redis = new Redis(redisOptions)

  try {
    const [queues, database] = await Promise.all([
      inspectRedisQueues(redis),
      inspectDatabase(),
    ])

    console.log(
      JSON.stringify(
        {
          inspectedAt: new Date().toISOString(),
          queuePrefix: QUEUE_PREFIX,
          queues,
          database,
        },
        null,
        2,
      ),
    )
  } finally {
    redis.disconnect()
    await closeDatabase()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
