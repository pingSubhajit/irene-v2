import { sql } from "drizzle-orm"
import {
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
import { extractedSignals } from "./extraction"
import { rawDocuments } from "./ingestion"
import { financialEvents, merchants } from "./ledger"

export type PaymentProcessorAliasResolutionStatus =
  | "pending"
  | "linked"
  | "needs_review"
  | "ignored"

export type MerchantObservationSourceKind =
  | "bank_alert"
  | "statement"
  | "merchant_receipt"
  | "merchant_order"
  | "subscription_notice"
  | "processor_receipt"
  | "other"

export const paymentProcessors = pgTable(
  "payment_processor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_processor_user_normalized_name_unique").on(
      table.userId,
      table.normalizedName,
    ),
    index("payment_processor_user_display_name_idx").on(table.userId, table.displayName),
  ],
)

export const paymentProcessorAliases = pgTable(
  "payment_processor_alias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentProcessorId: uuid("payment_processor_id")
      .notNull()
      .references(() => paymentProcessors.id, { onDelete: "cascade" }),
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
    uniqueIndex("payment_processor_alias_unique").on(
      table.paymentProcessorId,
      table.aliasHash,
    ),
    index("payment_processor_alias_hash_idx").on(table.aliasHash),
    check(
      "payment_processor_alias_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
)

export const merchantObservations = pgTable(
  "merchant_observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    financialEventId: uuid("financial_event_id").references(() => financialEvents.id, {
      onDelete: "set null",
    }),
    rawDocumentId: uuid("raw_document_id").references(() => rawDocuments.id, {
      onDelete: "set null",
    }),
    extractedSignalId: uuid("extracted_signal_id").references(() => extractedSignals.id, {
      onDelete: "set null",
    }),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    paymentProcessorId: uuid("payment_processor_id").references(() => paymentProcessors.id, {
      onDelete: "set null",
    }),
    observationSourceKind: text("observation_source_kind")
      .$type<MerchantObservationSourceKind>()
      .notNull(),
    issuerHint: text("issuer_hint"),
    merchantDescriptorRaw: text("merchant_descriptor_raw"),
    merchantNameHint: text("merchant_name_hint"),
    processorNameHint: text("processor_name_hint"),
    senderAliasHint: text("sender_alias_hint"),
    channelHint: text("channel_hint"),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0),
    evidenceJson: jsonb("evidence_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    resolutionStatus: text("resolution_status")
      .$type<PaymentProcessorAliasResolutionStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("merchant_observation_user_status_idx").on(table.userId, table.resolutionStatus),
    index("merchant_observation_financial_event_idx").on(table.financialEventId),
    index("merchant_observation_raw_document_idx").on(table.rawDocumentId),
    index("merchant_observation_extracted_signal_idx").on(table.extractedSignalId),
    index("merchant_observation_merchant_idx").on(table.merchantId),
    index("merchant_observation_payment_processor_idx").on(table.paymentProcessorId),
    check(
      "merchant_observation_source_kind_check",
      sql`${table.observationSourceKind} in ('bank_alert', 'statement', 'merchant_receipt', 'merchant_order', 'subscription_notice', 'processor_receipt', 'other')`,
    ),
    check(
      "merchant_observation_resolution_status_check",
      sql`${table.resolutionStatus} in ('pending', 'linked', 'needs_review', 'ignored')`,
    ),
    check(
      "merchant_observation_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "merchant_observation_channel_hint_check",
      sql`${table.channelHint} IS NULL OR ${table.channelHint} in ('card', 'wallet', 'upi', 'bank_transfer', 'other')`,
    ),
    check(
      "merchant_observation_reference_check",
      sql`${table.financialEventId} IS NOT NULL OR ${table.rawDocumentId} IS NOT NULL OR ${table.extractedSignalId} IS NOT NULL`,
    ),
  ],
)

export type PaymentProcessorInsert = typeof paymentProcessors.$inferInsert
export type PaymentProcessorSelect = typeof paymentProcessors.$inferSelect
export type PaymentProcessorAliasInsert = typeof paymentProcessorAliases.$inferInsert
export type PaymentProcessorAliasSelect = typeof paymentProcessorAliases.$inferSelect
export type MerchantObservationInsert = typeof merchantObservations.$inferInsert
export type MerchantObservationSelect = typeof merchantObservations.$inferSelect
