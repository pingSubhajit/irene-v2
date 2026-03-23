import { ensureJobRun } from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  enqueueForecastRefreshUser,
  enqueueForecastRebuildUser,
  FORECAST_REFRESH_USER_JOB_NAME,
  FORECAST_REBUILD_USER_JOB_NAME,
  FORECASTING_QUEUE_NAME,
} from "@workspace/workflows"

export async function triggerUserForecastRefresh(input: {
  userId: string
  reason:
    | "financial_event_changed"
    | "recurring_changed"
    | "review_resolved"
    | "balance_anchor_changed"
    | "manual_refresh"
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${FORECAST_REFRESH_USER_JOB_NAME}:${input.userId}:${input.reason}:${new Date()
    .toISOString()
    .slice(0, 16)}`

  const jobRun = await ensureJobRun({
    queueName: FORECASTING_QUEUE_NAME,
    jobName: FORECAST_REFRESH_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      reason: input.reason,
    },
  })

  await enqueueForecastRefreshUser({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: "web",
    reason: input.reason,
  })

  return jobRun
}

export async function triggerUserForecastRebuild(input: {
  userId: string
  reason: "manual_rebuild" | "logic_change"
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${FORECAST_REBUILD_USER_JOB_NAME}:${input.userId}:${input.reason}:${new Date()
    .toISOString()
    .slice(0, 16)}`

  const jobRun = await ensureJobRun({
    queueName: FORECASTING_QUEUE_NAME,
    jobName: FORECAST_REBUILD_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      reason: input.reason,
    },
  })

  await enqueueForecastRebuildUser({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: "web",
    reason: input.reason,
  })

  return jobRun
}
