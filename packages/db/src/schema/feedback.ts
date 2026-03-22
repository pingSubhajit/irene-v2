import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./auth"

export type FeedbackEventTargetType =
  | "financial_event"
  | "merchant"
  | "payment_instrument"
  | "balance_anchor"
  | "balance_observation"
  | "recurring_obligation"
  | "income_stream"
  | "emi_plan"
  | "review_queue_item"

export type FeedbackEventSourceSurface =
  | "activity_detail"
  | "activity_recurring"
  | "review"
  | "settings"
  | "system"

export const feedbackEvents = pgTable(
  "feedback_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<FeedbackEventTargetType>().notNull(),
    targetId: text("target_id").notNull(),
    correctionType: text("correction_type").notNull(),
    sourceSurface: text("source_surface").$type<FeedbackEventSourceSurface>().notNull(),
    previousValueJson: jsonb("previous_value_json").$type<Record<string, unknown> | null>(),
    newValueJson: jsonb("new_value_json").$type<Record<string, unknown> | null>(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("feedback_event_user_target_idx").on(table.userId, table.targetType, table.targetId),
    index("feedback_event_user_created_at_idx").on(table.userId, table.createdAt),
    check(
      "feedback_event_target_type_check",
      sql`${table.targetType} in (
        'financial_event',
        'merchant',
        'payment_instrument',
        'balance_anchor',
        'balance_observation',
        'recurring_obligation',
        'income_stream',
        'emi_plan',
        'review_queue_item'
      )`,
    ),
    check(
      "feedback_event_source_surface_check",
      sql`${table.sourceSurface} in ('activity_detail', 'activity_recurring', 'review', 'settings', 'system')`,
    ),
  ],
)

export type FeedbackEventInsert = typeof feedbackEvents.$inferInsert
export type FeedbackEventSelect = typeof feedbackEvents.$inferSelect
