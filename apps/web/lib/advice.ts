import { ensureJobRun } from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  ADVICE_QUEUE_NAME,
  ADVICE_REFRESH_USER_JOB_NAME,
  ADVICE_REBUILD_USER_JOB_NAME,
  enqueueAdviceRefreshUser,
  enqueueAdviceRebuildUser,
} from "@workspace/workflows"

export async function triggerUserAdviceRefresh(input: {
  userId: string
  reason: "forecast_changed" | "goals_changed" | "manual_refresh"
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${ADVICE_REFRESH_USER_JOB_NAME}:${input.userId}:${input.reason}:${new Date()
    .toISOString()
    .slice(0, 16)}`

  const jobRun = await ensureJobRun({
    queueName: ADVICE_QUEUE_NAME,
    jobName: ADVICE_REFRESH_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      reason: input.reason,
    },
  })

  await enqueueAdviceRefreshUser({
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

export async function triggerUserAdviceRebuild(input: {
  userId: string
  reason: "manual_rebuild" | "logic_change"
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${ADVICE_REBUILD_USER_JOB_NAME}:${input.userId}:${input.reason}:${new Date()
    .toISOString()
    .slice(0, 16)}`

  const jobRun = await ensureJobRun({
    queueName: ADVICE_QUEUE_NAME,
    jobName: ADVICE_REBUILD_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      reason: input.reason,
    },
  })

  await enqueueAdviceRebuildUser({
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
