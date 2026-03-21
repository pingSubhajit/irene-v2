import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./auth"
import { extractedSignals } from "./extraction"
import { rawDocuments } from "./ingestion"
import { financialInstitutions } from "./instrument-resolution"
import { paymentProcessors } from "./merchant-resolution"

export type MerchantType =
  | "merchant"
  | "bank"
  | "employer"
  | "platform"
  | "individual"
  | "unknown"

export type PaymentInstrumentType =
  | "credit_card"
  | "debit_card"
  | "bank_account"
  | "upi"
  | "wallet"
  | "unknown"

export type PaymentInstrumentStatus = "active" | "inactive"

export type CategoryKind =
  | "income"
  | "expense"
  | "transfer"
  | "refund"
  | "debt"
  | "uncategorized"

export type FinancialEventType =
  | "purchase"
  | "income"
  | "subscription_charge"
  | "emi_payment"
  | "bill_payment"
  | "refund"
  | "transfer"

export type FinancialEventStatus =
  | "confirmed"
  | "needs_review"
  | "ignored"
  | "reversed"

export type FinancialEventDirection = "inflow" | "outflow" | "neutral"

export type ReviewQueueItemType =
  | "signal_reconciliation"
  | "duplicate_match"
  | "merchant_conflict"
  | "instrument_conflict"
  | "payment_instrument_resolution"
  | "merchant_resolution"
  | "category_resolution"
  | "recurring_obligation_ambiguity"
  | "emi_plan_ambiguity"
  | "income_stream_ambiguity"

export type ReviewQueueItemStatus = "open" | "resolved" | "ignored"

export const merchants = pgTable(
  "merchant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    logoUrl: text("logo_url"),
    normalizedName: text("normalized_name").notNull(),
    defaultCategory: text("default_category"),
    merchantType: text("merchant_type").$type<MerchantType>().notNull().default("unknown"),
    countryCode: text("country_code"),
    isSubscriptionProne: boolean("is_subscription_prone").notNull().default(false),
    isEmiLender: boolean("is_emi_lender").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("merchant_user_normalized_name_unique").on(
      table.userId,
      table.normalizedName,
    ),
    index("merchant_user_type_idx").on(table.userId, table.merchantType),
    index("merchant_last_seen_at_idx").on(table.lastSeenAt),
    check(
      "merchant_type_check",
      sql`${table.merchantType} in ('merchant', 'bank', 'employer', 'platform', 'individual', 'unknown')`,
    ),
    check(
      "merchant_country_code_check",
      sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
  ],
)

export const merchantAliases = pgTable(
  "merchant_alias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    aliasText: text("alias_text").notNull(),
    aliasHash: text("alias_hash").notNull(),
    source: text("source").notNull(),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("merchant_alias_merchant_alias_hash_unique").on(
      table.merchantId,
      table.aliasHash,
    ),
    index("merchant_alias_hash_idx").on(table.aliasHash),
    check(
      "merchant_alias_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
)

export const paymentInstruments = pgTable(
  "payment_instrument",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    financialInstitutionId: uuid("financial_institution_id").references(
      () => financialInstitutions.id,
      { onDelete: "set null" },
    ),
    instrumentType: text("instrument_type")
      .$type<PaymentInstrumentType>()
      .notNull(),
    providerName: text("provider_name"),
    displayName: text("display_name").notNull(),
    maskedIdentifier: text("masked_identifier"),
    billingCycleDay: integer("billing_cycle_day"),
    paymentDueDay: integer("payment_due_day"),
    creditLimitMinor: bigint("credit_limit_minor", { mode: "number" }),
    currency: text("currency").notNull(),
    status: text("status").$type<PaymentInstrumentStatus>().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payment_instrument_user_type_status_idx").on(
      table.userId,
      table.instrumentType,
      table.status,
    ),
    uniqueIndex("payment_instrument_user_identity_unique").on(
      table.userId,
      table.financialInstitutionId,
      table.instrumentType,
      table.maskedIdentifier,
    ),
    check(
      "payment_instrument_type_check",
      sql`${table.instrumentType} in ('credit_card', 'debit_card', 'bank_account', 'upi', 'wallet', 'unknown')`,
    ),
    check(
      "payment_instrument_status_check",
      sql`${table.status} in ('active', 'inactive')`,
    ),
    check(
      "payment_instrument_billing_cycle_day_check",
      sql`${table.billingCycleDay} IS NULL OR ${table.billingCycleDay} BETWEEN 1 AND 31`,
    ),
    check(
      "payment_instrument_payment_due_day_check",
      sql`${table.paymentDueDay} IS NULL OR ${table.paymentDueDay} BETWEEN 1 AND 31`,
    ),
    check(
      "payment_instrument_credit_limit_minor_check",
      sql`${table.creditLimitMinor} IS NULL OR ${table.creditLimitMinor} >= 0`,
    ),
    check(
      "payment_instrument_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
)

export const categories = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCategoryId: uuid("parent_category_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: text("kind").$type<CategoryKind>().notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("category_user_slug_unique").on(table.userId, table.slug),
    index("category_user_kind_idx").on(table.userId, table.kind),
    index("category_parent_idx").on(table.parentCategoryId),
    check(
      "category_kind_check",
      sql`${table.kind} in ('income', 'expense', 'transfer', 'refund', 'debt', 'uncategorized')`,
    ),
  ],
)

export const financialEvents = pgTable(
  "financial_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").$type<FinancialEventType>().notNull(),
    status: text("status").$type<FinancialEventStatus>().notNull().default("confirmed"),
    direction: text("direction").$type<FinancialEventDirection>().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    eventOccurredAt: timestamp("event_occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    paymentInstrumentId: uuid("payment_instrument_id").references(
      () => paymentInstruments.id,
      { onDelete: "set null" },
    ),
    paymentProcessorId: uuid("payment_processor_id").references(
      () => paymentProcessors.id,
      { onDelete: "set null" },
    ),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    merchantDescriptorRaw: text("merchant_descriptor_raw"),
    description: text("description"),
    notes: text("notes"),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(1),
    needsReview: boolean("needs_review").notNull().default(false),
    isRecurringCandidate: boolean("is_recurring_candidate").notNull().default(false),
    isTransfer: boolean("is_transfer").notNull().default(false),
    sourceCount: integer("source_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("financial_event_user_occurred_at_idx").on(
      table.userId,
      table.eventOccurredAt,
    ),
    index("financial_event_user_type_occurred_at_idx").on(
      table.userId,
      table.eventType,
      table.eventOccurredAt,
    ),
    index("financial_event_merchant_occurred_at_idx").on(
      table.merchantId,
      table.eventOccurredAt,
    ),
    index("financial_event_payment_instrument_occurred_at_idx").on(
      table.paymentInstrumentId,
      table.eventOccurredAt,
    ),
    index("financial_event_payment_processor_occurred_at_idx").on(
      table.paymentProcessorId,
      table.eventOccurredAt,
    ),
    index("financial_event_category_occurred_at_idx").on(
      table.categoryId,
      table.eventOccurredAt,
    ),
    index("financial_event_status_needs_review_idx").on(table.status, table.needsReview),
    check(
      "financial_event_type_check",
      sql`${table.eventType} in ('purchase', 'income', 'subscription_charge', 'emi_payment', 'bill_payment', 'refund', 'transfer')`,
    ),
    check(
      "financial_event_status_check",
      sql`${table.status} in ('confirmed', 'needs_review', 'ignored', 'reversed')`,
    ),
    check(
      "financial_event_direction_check",
      sql`${table.direction} in ('inflow', 'outflow', 'neutral')`,
    ),
    check(
      "financial_event_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "financial_event_source_count_check",
      sql`${table.sourceCount} >= 0`,
    ),
    check(
      "financial_event_amount_minor_check",
      sql`${table.amountMinor} >= 0`,
    ),
    check(
      "financial_event_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
)

export const financialEventSources = pgTable(
  "financial_event_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    financialEventId: uuid("financial_event_id")
      .notNull()
      .references(() => financialEvents.id, { onDelete: "cascade" }),
    rawDocumentId: uuid("raw_document_id").references(() => rawDocuments.id, {
      onDelete: "set null",
    }),
    extractedSignalId: uuid("extracted_signal_id").references(() => extractedSignals.id, {
      onDelete: "set null",
    }),
    linkReason: text("link_reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("financial_event_source_event_idx").on(table.financialEventId),
    index("financial_event_source_raw_document_idx").on(table.rawDocumentId),
    index("financial_event_source_extracted_signal_idx").on(table.extractedSignalId),
    check(
      "financial_event_source_reference_check",
      sql`${table.rawDocumentId} IS NOT NULL OR ${table.extractedSignalId} IS NOT NULL`,
    ),
  ],
)

export const reviewQueueItems = pgTable(
  "review_queue_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemType: text("item_type").$type<ReviewQueueItemType>().notNull(),
    status: text("status").$type<ReviewQueueItemStatus>().notNull().default("open"),
    priority: integer("priority").notNull().default(3),
    rawDocumentId: uuid("raw_document_id").references(() => rawDocuments.id, {
      onDelete: "set null",
    }),
    extractedSignalId: uuid("extracted_signal_id").references(() => extractedSignals.id, {
      onDelete: "set null",
    }),
    financialEventId: uuid("financial_event_id").references(() => financialEvents.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    proposedResolutionJson: jsonb("proposed_resolution_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("review_queue_item_user_status_priority_created_at_idx").on(
      table.userId,
      table.status,
      table.priority,
      table.createdAt,
    ),
    index("review_queue_item_raw_document_idx").on(table.rawDocumentId),
    index("review_queue_item_extracted_signal_idx").on(table.extractedSignalId),
    index("review_queue_item_financial_event_idx").on(table.financialEventId),
    check(
      "review_queue_item_type_check",
      sql`${table.itemType} in ('signal_reconciliation', 'duplicate_match', 'merchant_conflict', 'instrument_conflict', 'payment_instrument_resolution', 'merchant_resolution', 'category_resolution', 'recurring_obligation_ambiguity', 'emi_plan_ambiguity', 'income_stream_ambiguity')`,
    ),
    check(
      "review_queue_item_status_check",
      sql`${table.status} in ('open', 'resolved', 'ignored')`,
    ),
    check(
      "review_queue_item_priority_check",
      sql`${table.priority} BETWEEN 1 AND 5`,
    ),
    check(
      "review_queue_item_reference_check",
      sql`${table.rawDocumentId} IS NOT NULL OR ${table.extractedSignalId} IS NOT NULL OR ${table.financialEventId} IS NOT NULL`,
    ),
  ],
)

export type MerchantInsert = typeof merchants.$inferInsert
export type MerchantSelect = typeof merchants.$inferSelect
export type MerchantAliasInsert = typeof merchantAliases.$inferInsert
export type MerchantAliasSelect = typeof merchantAliases.$inferSelect
export type PaymentInstrumentInsert = typeof paymentInstruments.$inferInsert
export type PaymentInstrumentSelect = typeof paymentInstruments.$inferSelect
export type CategoryInsert = typeof categories.$inferInsert
export type CategorySelect = typeof categories.$inferSelect
export type FinancialEventInsert = typeof financialEvents.$inferInsert
export type FinancialEventSelect = typeof financialEvents.$inferSelect
export type FinancialEventSourceInsert = typeof financialEventSources.$inferInsert
export type FinancialEventSourceSelect = typeof financialEventSources.$inferSelect
export type ReviewQueueItemInsert = typeof reviewQueueItems.$inferInsert
export type ReviewQueueItemSelect = typeof reviewQueueItems.$inferSelect
