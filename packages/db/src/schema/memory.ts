import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./auth"

export type MemoryFactType =
  | "merchant_category_default"
  | "merchant_alias"
  | "merchant_recurring_hint"
  | "merchant_preferred_processor"
  | "merchant_preferred_event_type"
  | "sender_institution_alias"
  | "instrument_type_preference"
  | "instrument_backing_account_link"
  | "income_timing_expectation"

export type MemoryFactSubjectType =
  | "merchant"
  | "payment_instrument"
  | "financial_institution"
  | "sender_alias"
  | "income_stream"
  | "user"

export type MemoryFactSource =
  | "feedback"
  | "review"
  | "automation"
  | "system_rebuild"

export const memoryFacts = pgTable(
  "memory_fact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    factType: text("fact_type").$type<MemoryFactType>().notNull(),
    subjectType: text("subject_type").$type<MemoryFactSubjectType>().notNull(),
    subjectId: uuid("subject_id"),
    key: text("key").notNull(),
    summaryText: text("summary_text").notNull().default(""),
    detailText: text("detail_text"),
    authoredText: text("authored_text"),
    valueJson: jsonb("value_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(1),
    source: text("source").$type<MemoryFactSource>().notNull(),
    sourceReferenceId: uuid("source_reference_id"),
    isUserPinned: boolean("is_user_pinned").notNull().default(false),
    firstObservedAt: timestamp("first_observed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastConfirmedAt: timestamp("last_confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_fact_user_fact_type_key_unique").on(
      table.userId,
      table.factType,
      table.key,
    ),
    index("memory_fact_user_fact_type_key_idx").on(
      table.userId,
      table.factType,
      table.key,
    ),
    index("memory_fact_subject_idx").on(table.subjectType, table.subjectId),
    index("memory_fact_user_pinned_expiry_idx").on(
      table.userId,
      table.isUserPinned,
      table.expiresAt,
    ),
    check(
      "memory_fact_fact_type_check",
      sql`${table.factType} in (
        'merchant_category_default',
        'merchant_alias',
        'merchant_recurring_hint',
        'merchant_preferred_processor',
        'merchant_preferred_event_type',
        'sender_institution_alias',
        'instrument_type_preference',
        'instrument_backing_account_link',
        'income_timing_expectation'
      )`,
    ),
    check(
      "memory_fact_subject_type_check",
      sql`${table.subjectType} in (
        'merchant',
        'payment_instrument',
        'financial_institution',
        'sender_alias',
        'income_stream',
        'user'
      )`,
    ),
    check(
      "memory_fact_source_check",
      sql`${table.source} in ('feedback', 'review', 'automation', 'system_rebuild')`,
    ),
    check(
      "memory_fact_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
)

export type MemoryFactInsert = typeof memoryFacts.$inferInsert
export type MemoryFactSelect = typeof memoryFacts.$inferSelect
