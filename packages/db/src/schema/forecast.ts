import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  date,
  index,
  integer,
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
import { paymentInstruments } from "./ledger"

export type ForecastRunType = "anchored" | "net_only"
export type ForecastRunStatus = "queued" | "running" | "succeeded" | "failed"
export type BalanceObservationKind = "available_balance" | "available_credit_limit"
export type BalanceObservationSource = "email" | "manual"

export const forecastRuns = pgTable(
  "forecast_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runType: text("run_type").$type<ForecastRunType>().notNull(),
    horizonDays: integer("horizon_days").notNull(),
    baselineDate: date("baseline_date", { mode: "string" }).notNull(),
    status: text("status").$type<ForecastRunStatus>().notNull(),
    inputsHash: text("inputs_hash").notNull(),
    explanation: text("explanation"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("forecast_run_user_created_at_idx").on(table.userId, table.createdAt),
    index("forecast_run_user_status_created_at_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("forecast_run_user_run_type_baseline_hash_unique").on(
      table.userId,
      table.runType,
      table.baselineDate,
      table.inputsHash,
    ),
    check("forecast_run_type_check", sql`${table.runType} in ('anchored', 'net_only')`),
    check(
      "forecast_run_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
    check("forecast_run_horizon_positive", sql`${table.horizonDays} > 0`),
  ],
)

export const forecastSnapshots = pgTable(
  "forecast_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    forecastRunId: uuid("forecast_run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    projectedBalanceMinor: bigint("projected_balance_minor", { mode: "number" }),
    projectedIncomeMinor: bigint("projected_income_minor", { mode: "number" })
      .notNull()
      .default(0),
    projectedFixedOutflowMinor: bigint("projected_fixed_outflow_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    projectedVariableOutflowMinor: bigint("projected_variable_outflow_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    projectedEmiOutflowMinor: bigint("projected_emi_outflow_minor", { mode: "number" })
      .notNull()
      .default(0),
    safeToSpendMinor: bigint("safe_to_spend_minor", { mode: "number" }),
    confidenceBandLowMinor: bigint("confidence_band_low_minor", { mode: "number" }),
    confidenceBandHighMinor: bigint("confidence_band_high_minor", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forecast_snapshot_run_date_unique").on(
      table.forecastRunId,
      table.snapshotDate,
    ),
    index("forecast_snapshot_date_idx").on(table.snapshotDate),
  ],
)

export const balanceObservations = pgTable(
  "balance_observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentInstrumentId: uuid("payment_instrument_id")
      .notNull()
      .references(() => paymentInstruments.id, { onDelete: "cascade" }),
    observationKind: text("observation_kind").$type<BalanceObservationKind>().notNull(),
    source: text("source").$type<BalanceObservationSource>().notNull().default("email"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    rawDocumentId: uuid("raw_document_id").references(() => rawDocuments.id, {
      onDelete: "set null",
    }),
    extractedSignalId: uuid("extracted_signal_id").references(() => extractedSignals.id, {
      onDelete: "set null",
    }),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0.5),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("balance_observation_user_instrument_observed_at_idx").on(
      table.userId,
      table.paymentInstrumentId,
      table.observedAt,
    ),
    check(
      "balance_observation_kind_check",
      sql`${table.observationKind} in ('available_balance', 'available_credit_limit')`,
    ),
    check(
      "balance_observation_source_check",
      sql`${table.source} in ('email', 'manual')`,
    ),
    check(
      "balance_observation_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check("balance_observation_amount_check", sql`${table.amountMinor} >= 0`),
    check(
      "balance_observation_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "balance_observation_reference_check",
      sql`${table.rawDocumentId} IS NOT NULL OR ${table.extractedSignalId} IS NOT NULL`,
    ),
  ],
)

export const balanceAnchors = pgTable(
  "balance_anchor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    paymentInstrumentId: uuid("payment_instrument_id")
      .notNull()
      .references(() => paymentInstruments.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    anchoredAt: timestamp("anchored_at", { withTimezone: true, mode: "date" }).notNull(),
    sourceObservationId: uuid("source_observation_id").references(() => balanceObservations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("balance_anchor_user_instrument_unique").on(
      table.userId,
      table.paymentInstrumentId,
    ),
    index("balance_anchor_user_anchored_at_idx").on(table.userId, table.anchoredAt),
    check("balance_anchor_amount_check", sql`${table.amountMinor} >= 0`),
    check("balance_anchor_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
)

export type ForecastRunInsert = typeof forecastRuns.$inferInsert
export type ForecastRunSelect = typeof forecastRuns.$inferSelect
export type ForecastSnapshotInsert = typeof forecastSnapshots.$inferInsert
export type ForecastSnapshotSelect = typeof forecastSnapshots.$inferSelect
export type BalanceObservationInsert = typeof balanceObservations.$inferInsert
export type BalanceObservationSelect = typeof balanceObservations.$inferSelect
export type BalanceAnchorInsert = typeof balanceAnchors.$inferInsert
export type BalanceAnchorSelect = typeof balanceAnchors.$inferSelect
