import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db } from "./client"
import { feedbackEvents, type FeedbackEventInsert, type FeedbackEventTargetType } from "./schema"

export async function createFeedbackEvent(input: FeedbackEventInsert) {
  const [row] = await db.insert(feedbackEvents).values(input).returning()

  if (!row) {
    throw new Error("Failed to create feedback event")
  }

  return row
}

export async function getFeedbackEventById(feedbackEventId: string) {
  const [row] = await db
    .select()
    .from(feedbackEvents)
    .where(eq(feedbackEvents.id, feedbackEventId))
    .limit(1)

  return row ?? null
}

export async function listFeedbackEventsForTarget(input: {
  userId: string
  targetType: FeedbackEventTargetType
  targetId: string
  limit?: number
}) {
  return db
    .select()
    .from(feedbackEvents)
    .where(
      and(
        eq(feedbackEvents.userId, input.userId),
        eq(feedbackEvents.targetType, input.targetType),
        eq(feedbackEvents.targetId, input.targetId),
      ),
    )
    .orderBy(desc(feedbackEvents.createdAt))
    .limit(input.limit ?? 20)
}

export async function listFeedbackEventsForTargets(input: {
  userId: string
  targetType: FeedbackEventTargetType
  targetIds: string[]
}) {
  if (input.targetIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(feedbackEvents)
    .where(
      and(
        eq(feedbackEvents.userId, input.userId),
        eq(feedbackEvents.targetType, input.targetType),
        inArray(feedbackEvents.targetId, input.targetIds),
      ),
    )
    .orderBy(asc(feedbackEvents.targetId), desc(feedbackEvents.createdAt))
}
