import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "./client"
import { jobRuns } from "./schema"

type CreateJobRunInput = {
  queueName: string
  jobName: string
  jobKey?: string
  payloadJson?: Record<string, unknown>
}

export async function createJobRun(input: CreateJobRunInput) {
  const [jobRun] = await db
    .insert(jobRuns)
    .values({
      queueName: input.queueName,
      jobName: input.jobName,
      jobKey: input.jobKey,
      payloadJson: input.payloadJson ?? null,
      status: "queued",
    })
    .returning()

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
  status: "queued" | "running" | "succeeded" | "failed"
  attemptCount?: number
  startedAt?: Date | null
  completedAt?: Date | null
  errorMessage?: string | null
  payloadJson?: Record<string, unknown> | null
}

export async function updateJobRun(jobRunId: string, input: UpdateJobRunInput) {
  const [jobRun] = await db
    .update(jobRuns)
    .set({
      status: input.status,
      attemptCount: input.attemptCount,
      startedAt: input.startedAt ?? undefined,
      completedAt: input.completedAt ?? undefined,
      errorMessage: input.errorMessage ?? undefined,
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
