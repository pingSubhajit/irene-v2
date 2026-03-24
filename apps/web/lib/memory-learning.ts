import { ensureJobRun } from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  enqueueMemoryRebuildUser,
  MEMORY_LEARNING_QUEUE_NAME,
  MEMORY_REBUILD_USER_JOB_NAME,
} from "@workspace/workflows"

export async function triggerUserMemoryRebuild(input: {
  userId: string
  reason: "manual_refresh"
  sourceReferenceId?: string
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${MEMORY_REBUILD_USER_JOB_NAME}:${input.userId}:${input.reason}:${input.sourceReferenceId ?? new Date().toISOString().slice(0, 16)}`

  const jobRun = await ensureJobRun({
    queueName: MEMORY_LEARNING_QUEUE_NAME,
    jobName: MEMORY_REBUILD_USER_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      reason: input.reason,
      sourceReferenceId: input.sourceReferenceId ?? null,
      source: "web",
    },
  })

  await enqueueMemoryRebuildUser({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    reason: input.reason,
    sourceReferenceId: input.sourceReferenceId,
    source: "web",
  })

  return jobRun
}
