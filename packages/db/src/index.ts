import { Pool } from "pg"
import { and, desc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"

import { getDatabaseEnv } from "@workspace/config/server"

import { jobRuns, schema, userSettings } from "./schema"

const globalForDb = globalThis as typeof globalThis & {
  __irenePool?: Pool
}

function createPool() {
  const env = getDatabaseEnv()

  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    ssl: {
      rejectUnauthorized: false,
    },
  })
}

export const pool = globalForDb.__irenePool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalForDb.__irenePool = pool
}

export const db = drizzle(pool, { schema })

export async function checkDatabaseHealth() {
  await pool.query("select 1")

  return {
    ok: true,
  }
}

export async function upsertUserSettings(userId: string) {
  await db
    .insert(userSettings)
    .values({
      userId,
    })
    .onConflictDoNothing()
}

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

type UpdateJobRunInput = {
  status: "queued" | "running" | "succeeded" | "failed"
  attemptCount?: number
  startedAt?: Date | null
  completedAt?: Date | null
  errorMessage?: string | null
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
    })
    .where(eq(jobRuns.id, jobRunId))
    .returning()

  return jobRun ?? null
}

export async function listRecentJobRuns(limit = 20) {
  return db.select().from(jobRuns).orderBy(desc(jobRuns.createdAt)).limit(limit)
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

export async function closeDatabase() {
  await pool.end()
}

export { authSchema, jobRuns, userSettings, users } from "./schema"
