import { z } from "zod"

import { addOrRefreshTrackedJob, getOrCreateQueue, toBullJobId } from "./redis"

export const FORECASTING_QUEUE_NAME = "forecasting"
export const FORECAST_REFRESH_USER_JOB_NAME = "forecast.refresh.user"
export const FORECAST_REBUILD_USER_JOB_NAME = "forecast.rebuild.user"

const trackedJobFields = {
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  source: z.enum(["worker", "web", "scheduler", "startup"]),
} as const

export const forecastRefreshUserJobPayloadSchema = z.object({
  ...trackedJobFields,
  reason: z
    .enum([
      "financial_event_changed",
      "recurring_changed",
      "review_resolved",
      "balance_anchor_changed",
      "manual_refresh",
    ])
    .default("financial_event_changed"),
})

export const forecastRebuildUserJobPayloadSchema = z.object({
  ...trackedJobFields,
  reason: z
    .enum(["nightly_rebuild", "startup_rebuild", "manual_rebuild", "logic_change"])
    .default("nightly_rebuild"),
})

export type ForecastRefreshUserJobPayload = z.infer<
  typeof forecastRefreshUserJobPayloadSchema
>
export type ForecastRebuildUserJobPayload = z.infer<
  typeof forecastRebuildUserJobPayloadSchema
>

export function getForecastingQueue() {
  return getOrCreateQueue(FORECASTING_QUEUE_NAME, "forecasting")
}

export function getForecastRefreshUserJobKey(userId: string) {
  return `${FORECAST_REFRESH_USER_JOB_NAME}:user:${userId}`
}

export function getForecastRebuildUserJobKey(userId: string) {
  return `${FORECAST_REBUILD_USER_JOB_NAME}:user:${userId}`
}

export async function enqueueForecastRefreshUser(payload: ForecastRefreshUserJobPayload) {
  const parsed = forecastRefreshUserJobPayloadSchema.parse(payload)

  return addOrRefreshTrackedJob({
    queue: getForecastingQueue(),
    jobName: FORECAST_REFRESH_USER_JOB_NAME,
    payload: parsed,
    attempts: 2,
    backoffMs: 30_000,
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueForecastRebuildUser(payload: ForecastRebuildUserJobPayload) {
  const parsed = forecastRebuildUserJobPayloadSchema.parse(payload)

  return addOrRefreshTrackedJob({
    queue: getForecastingQueue(),
    jobName: FORECAST_REBUILD_USER_JOB_NAME,
    payload: parsed,
    attempts: 2,
    backoffMs: 60_000,
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function getForecastingQueueStats() {
  return getForecastingQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
