import { createFeedbackEvent, type FeedbackEventSourceSurface, type FeedbackEventTargetType } from "@workspace/db"

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
  return createFeedbackEvent({
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
}
