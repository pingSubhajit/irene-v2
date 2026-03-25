import {
  createFeedbackEvent,
  ensureJobRun,
  type FeedbackEventSourceSurface,
  type FeedbackEventTargetType,
} from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  enqueueFeedbackProcess,
  FEEDBACK_PROCESS_JOB_NAME,
  MEMORY_LEARNING_QUEUE_NAME,
} from "@workspace/workflows"

import { isMemoryLearningEnabled } from "@/lib/feature-flags"

export async function recordFeedbackEvent(input: {
  userId: string
  targetType: FeedbackEventTargetType
  targetId: string
  correctionType: string
  sourceSurface: FeedbackEventSourceSurface
  previousValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}) {
  const feedbackEvent = await createFeedbackEvent({
    userId: input.userId,
    actorUserId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    correctionType: input.correctionType,
    sourceSurface: input.sourceSurface,
    previousValueJson: input.previousValue ?? null,
    newValueJson: input.newValue ?? null,
    metadataJson: input.metadata ?? null,
  })

  if (!isMemoryLearningEnabled()) {
    return feedbackEvent
  }

  const correlationId = createCorrelationId()
  const jobKey = `${FEEDBACK_PROCESS_JOB_NAME}:${feedbackEvent.id}`
  const jobRun = await ensureJobRun({
    queueName: MEMORY_LEARNING_QUEUE_NAME,
    jobName: FEEDBACK_PROCESS_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      feedbackEventId: feedbackEvent.id,
      source: "web",
    },
  })

  await enqueueFeedbackProcess({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    feedbackEventId: feedbackEvent.id,
    source: "web",
  })

  return feedbackEvent
}
