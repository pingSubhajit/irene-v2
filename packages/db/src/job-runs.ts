import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { db } from "./client"
import { jobRuns } from "./schema"

type CreateJobRunInput = {
  queueName: string
  jobName: string
  jobKey?: string
  payloadJson?: Record<string, unknown>
  maxAttempts?: number
  retryable?: boolean
  replayedFromJobRunId?: string | null
  recoveryGroupKey?: string | null
}

export async function createJobRun(input: CreateJobRunInput) {
  const rows = await db
    .insert(jobRuns)
    .values({
      queueName: input.queueName,
      jobName: input.jobName,
      jobKey: input.jobKey,
      payloadJson: input.payloadJson ?? null,
      status: "queued",
      maxAttempts: input.maxAttempts ?? 1,
      retryable: input.retryable ?? true,
      replayedFromJobRunId: input.replayedFromJobRunId ?? null,
      recoveryGroupKey: input.recoveryGroupKey ?? null,
    })
    .returning()
  const jobRun = rows[0]

  if (!jobRun) {
    throw new Error("Failed to create job_run record")
  }

  return jobRun
}

export async function ensureJobRun(input: CreateJobRunInput) {
  if (input.jobKey) {
    const [existing] = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobKey, input.jobKey))
      .orderBy(desc(jobRuns.createdAt))
      .limit(1)

    if (existing) {
      return existing
    }
  }

  return createJobRun(input)
}

type UpdateJobRunInput = {
  status: "queued" | "running" | "succeeded" | "failed" | "dead_lettered"
  attemptCount?: number
  maxAttempts?: number
  retryable?: boolean
  startedAt?: Date | null
  completedAt?: Date | null
  errorMessage?: string | null
  lastErrorCode?: string | null
  lastErrorAt?: Date | null
  deadLetteredAt?: Date | null
  replayedFromJobRunId?: string | null
  recoveryGroupKey?: string | null
  payloadJson?: Record<string, unknown> | null
}

export async function updateJobRun(jobRunId: string, input: UpdateJobRunInput) {
  const [jobRun] = await db
    .update(jobRuns)
    .set({
      status: input.status,
      attemptCount: input.attemptCount,
      maxAttempts: input.maxAttempts,
      retryable: input.retryable,
      startedAt: input.startedAt ?? undefined,
      completedAt: input.completedAt ?? undefined,
      errorMessage: input.errorMessage ?? undefined,
      lastErrorCode: input.lastErrorCode ?? undefined,
      lastErrorAt: input.lastErrorAt ?? undefined,
      deadLetteredAt: input.deadLetteredAt ?? undefined,
      replayedFromJobRunId: input.replayedFromJobRunId ?? undefined,
      recoveryGroupKey: input.recoveryGroupKey ?? undefined,
      payloadJson: input.payloadJson,
    })
    .where(eq(jobRuns.id, jobRunId))
    .returning()

  return jobRun ?? null
}

export async function listRecentJobRuns(limit = 20) {
  return db.select().from(jobRuns).orderBy(desc(jobRuns.createdAt)).limit(limit)
}

export async function listRecentJobRunsForQueues(queueNames: string[], limit = 20) {
  if (queueNames.length === 0) {
    return []
  }

  return db
    .select()
    .from(jobRuns)
    .where(inArray(jobRuns.queueName, queueNames))
    .orderBy(desc(jobRuns.createdAt))
    .limit(limit)
}

export async function getLatestJobRun(queueName?: string, jobName?: string) {
  const conditions = []

  if (queueName) {
    conditions.push(eq(jobRuns.queueName, queueName))
  }

  if (jobName) {
    conditions.push(eq(jobRuns.jobName, jobName))
  }

  const query = db.select().from(jobRuns).orderBy(desc(jobRuns.createdAt)).limit(1)

  const results =
    conditions.length > 0 ? await query.where(and(...conditions)) : await query

  return results[0] ?? null
}

export async function getJobRunById(jobRunId: string) {
  const [jobRun] = await db
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.id, jobRunId))
    .limit(1)

  return jobRun ?? null
}

function userIdPayloadCondition(userId: string) {
  return sql<boolean>`(${jobRuns.payloadJson} ->> 'userId') = ${userId}`
}

export async function getLatestJobRunForUser(input: {
  userId: string
  queueName?: string
  jobNames?: string[]
}) {
  const conditions = [
    userIdPayloadCondition(input.userId),
    input.queueName ? eq(jobRuns.queueName, input.queueName) : undefined,
    input.jobNames?.length ? inArray(jobRuns.jobName, input.jobNames) : undefined,
  ].filter(Boolean)

  const [jobRun] = await db
    .select()
    .from(jobRuns)
    .where(and(...conditions))
    .orderBy(desc(jobRuns.createdAt))
    .limit(1)

  return jobRun ?? null
}

export async function listRecoverableJobRunsForUser(input: {
  userId: string
  limit?: number
}) {
  return db
    .select()
    .from(jobRuns)
    .where(
      and(
        userIdPayloadCondition(input.userId),
        inArray(jobRuns.status, ["failed", "dead_lettered"]),
        eq(jobRuns.retryable, true),
        isNull(jobRuns.replayedFromJobRunId),
        sql<boolean>`not exists (
          select 1
          from job_run replay
          where replay.replayed_from_job_run_id = ${jobRuns.id}
        )`,
      ),
    )
    .orderBy(desc(jobRuns.createdAt))
    .limit(input.limit ?? 30)
}

export async function listReplayedJobRunsForUser(input: {
  userId: string
  limit?: number
}) {
  return db
    .select()
    .from(jobRuns)
    .where(
      and(
        userIdPayloadCondition(input.userId),
        isNotNull(jobRuns.replayedFromJobRunId),
      ),
    )
    .orderBy(desc(jobRuns.createdAt))
    .limit(input.limit ?? 20)
}
