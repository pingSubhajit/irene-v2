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
import { financialEvents, paymentInstruments } from "./ledger"

export type ObservationSourceKind =
  | "bank_alert"
  | "statement"
  | "merchant_receipt"
  | "merchant_order"
  | "subscription_notice"
  | "other"

export type ObservationResolutionStatus = "pending" | "linked" | "needs_review" | "ignored"

export const financialInstitutions = pgTable(
  "financial_institution",
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
    uniqueIndex("financial_institution_user_normalized_name_unique").on(
      table.userId,
      table.normalizedName,
    ),
    index("financial_institution_user_display_name_idx").on(table.userId, table.displayName),
  ],
)

export const financialInstitutionAliases = pgTable(
  "financial_institution_alias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    financialInstitutionId: uuid("financial_institution_id")
      .notNull()
      .references(() => financialInstitutions.id, { onDelete: "cascade" }),
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
    uniqueIndex("financial_institution_alias_unique").on(
      table.financialInstitutionId,
      table.aliasHash,
    ),
    index("financial_institution_alias_hash_idx").on(table.aliasHash),
    check(
      "financial_institution_alias_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
)

export const paymentInstrumentObservations = pgTable(
  "payment_instrument_observation",
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
    paymentInstrumentId: uuid("payment_instrument_id").references(() => paymentInstruments.id, {
      onDelete: "set null",
    }),
    observationSourceKind: text("observation_source_kind")
      .$type<ObservationSourceKind>()
      .notNull(),
    maskedIdentifier: text("masked_identifier"),
    instrumentTypeHint: text("instrument_type_hint"),
    issuerHint: text("issuer_hint"),
    issuerAliasHint: text("issuer_alias_hint"),
    counterpartyHint: text("counterparty_hint"),
    networkHint: text("network_hint"),
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
      .$type<ObservationResolutionStatus>()
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
    index("payment_instrument_observation_user_masked_status_idx").on(
      table.userId,
      table.maskedIdentifier,
      table.resolutionStatus,
    ),
    index("payment_instrument_observation_financial_event_idx").on(table.financialEventId),
    index("payment_instrument_observation_raw_document_idx").on(table.rawDocumentId),
    index("payment_instrument_observation_extracted_signal_idx").on(table.extractedSignalId),
    index("payment_instrument_observation_payment_instrument_idx").on(table.paymentInstrumentId),
    check(
      "payment_instrument_observation_source_kind_check",
      sql`${table.observationSourceKind} in ('bank_alert', 'statement', 'merchant_receipt', 'merchant_order', 'subscription_notice', 'other')`,
    ),
    check(
      "payment_instrument_observation_resolution_status_check",
      sql`${table.resolutionStatus} in ('pending', 'linked', 'needs_review', 'ignored')`,
    ),
    check(
      "payment_instrument_observation_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "payment_instrument_observation_reference_check",
      sql`${table.financialEventId} IS NOT NULL OR ${table.rawDocumentId} IS NOT NULL OR ${table.extractedSignalId} IS NOT NULL`,
    ),
  ],
)

export type FinancialInstitutionInsert = typeof financialInstitutions.$inferInsert
export type FinancialInstitutionSelect = typeof financialInstitutions.$inferSelect
export type FinancialInstitutionAliasInsert = typeof financialInstitutionAliases.$inferInsert
export type FinancialInstitutionAliasSelect = typeof financialInstitutionAliases.$inferSelect
export type PaymentInstrumentObservationInsert =
  typeof paymentInstrumentObservations.$inferInsert
export type PaymentInstrumentObservationSelect =
  typeof paymentInstrumentObservations.$inferSelect
