import { z } from "zod"

import { createTrackedJobOptions, getOrCreateQueue, toBullJobId } from "./redis"

export const BACKFILL_IMPORT_QUEUE_NAME = "backfill-import"
export const EMAIL_SYNC_QUEUE_NAME = "email-sync"

export const GMAIL_BACKFILL_START_JOB_NAME = "gmail.backfill.start"
export const GMAIL_BACKFILL_PAGE_JOB_NAME = "gmail.backfill.page"
export const GMAIL_INCREMENTAL_POLL_JOB_NAME = "gmail.incremental.poll"
export const GMAIL_MESSAGE_INGEST_JOB_NAME = "gmail.message.ingest"

const gmailBasePayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  oauthConnectionId: z.string().uuid(),
  cursorId: z.string().uuid(),
  source: z.enum(["web", "worker", "cron"]),
})

export const gmailBackfillStartJobPayloadSchema = gmailBasePayloadSchema.extend({
  windowDays: z.number().int().positive().default(90),
  windowStartAt: z.string().datetime().optional(),
})

export const gmailBackfillPageJobPayloadSchema = gmailBasePayloadSchema.extend({
  windowDays: z.number().int().positive().default(90),
  windowStartAt: z.string().datetime().optional(),
  pageToken: z.string().min(1).optional(),
  query: z.string().min(1),
})

export const gmailIncrementalPollJobPayloadSchema = gmailBasePayloadSchema.extend({
  fallbackWindowHours: z.number().int().positive().default(24),
})

export const gmailMessageIngestJobPayloadSchema = gmailBasePayloadSchema.extend({
  providerMessageId: z.string().min(1),
  sourceKind: z.enum(["backfill", "incremental"]),
  historyId: z.string().min(1).optional(),
  relevanceModelRunId: z.string().uuid().nullish(),
  relevanceLabel: z.enum([
    "transactional_finance",
    "obligation_finance",
    "marketing_finance",
    "non_finance",
  ]),
  relevanceStage: z.enum(["heuristic", "model"]),
  relevanceScore: z.number().int(),
  relevanceReasons: z.array(z.string()),
})

export type GmailBackfillStartJobPayload = z.infer<
  typeof gmailBackfillStartJobPayloadSchema
>
export type GmailBackfillPageJobPayload = z.infer<
  typeof gmailBackfillPageJobPayloadSchema
>
export type GmailIncrementalPollJobPayload = z.infer<
  typeof gmailIncrementalPollJobPayloadSchema
>
export type GmailMessageIngestJobPayload = z.infer<
  typeof gmailMessageIngestJobPayloadSchema
>

export function getBackfillImportQueue() {
  return getOrCreateQueue(BACKFILL_IMPORT_QUEUE_NAME, "backfillImport")
}

export function getEmailSyncQueue() {
  return getOrCreateQueue(EMAIL_SYNC_QUEUE_NAME, "emailSync")
}

export async function enqueueGmailBackfillStart(
  payload: GmailBackfillStartJobPayload,
) {
  const parsed = gmailBackfillStartJobPayloadSchema.parse(payload)

  return getBackfillImportQueue().add(GMAIL_BACKFILL_START_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 60_000,
    }),
  })
}

export async function enqueueGmailBackfillPage(payload: GmailBackfillPageJobPayload) {
  const parsed = gmailBackfillPageJobPayloadSchema.parse(payload)

  return getBackfillImportQueue().add(GMAIL_BACKFILL_PAGE_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 60_000,
    }),
  })
}

export async function enqueueGmailIncrementalPoll(
  payload: GmailIncrementalPollJobPayload,
) {
  const parsed = gmailIncrementalPollJobPayloadSchema.parse(payload)

  return getEmailSyncQueue().add(GMAIL_INCREMENTAL_POLL_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 3,
      backoffMs: 45_000,
    }),
  })
}

export async function enqueueGmailMessageIngest(
  payload: GmailMessageIngestJobPayload,
) {
  const parsed = gmailMessageIngestJobPayloadSchema.parse(payload)

  return getEmailSyncQueue().add(GMAIL_MESSAGE_INGEST_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 20_000,
    }),
  })
}

export async function getEmailSyncQueueStats() {
  return getEmailSyncQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}

export async function getBackfillImportQueueStats() {
  return getBackfillImportQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
