import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { financialEvents } from "./ledger"

export type FxRateProvider = "currencyapi"
export type FinancialEventValuationKind =
  | "identity"
  | "historical_reference"
  | "settlement_confirmed"

export const fxRatesDaily = pgTable(
  "fx_rate_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").$type<FxRateProvider>().notNull(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    rate: numeric("rate", {
      precision: 18,
      scale: 8,
      mode: "number",
    }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("fx_rate_daily_provider_pair_date_unique").on(
      table.provider,
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate,
    ),
    index("fx_rate_daily_pair_date_idx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate,
    ),
    check("fx_rate_daily_provider_check", sql`${table.provider} in ('currencyapi')`),
    check("fx_rate_daily_base_currency_check", sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`),
    check("fx_rate_daily_quote_currency_check", sql`${table.quoteCurrency} ~ '^[A-Z]{3}$'`),
    check("fx_rate_daily_rate_positive", sql`${table.rate} > 0`),
  ],
)

export const financialEventValuations = pgTable(
  "financial_event_valuation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    financialEventId: uuid("financial_event_id")
      .notNull()
      .references(() => financialEvents.id, { onDelete: "cascade" }),
    targetCurrency: text("target_currency").notNull(),
    valuationKind: text("valuation_kind")
      .$type<FinancialEventValuationKind>()
      .notNull(),
    normalizedAmountMinor: bigint("normalized_amount_minor", {
      mode: "number",
    }).notNull(),
    fxRate: numeric("fx_rate", {
      precision: 18,
      scale: 8,
      mode: "number",
    }),
    fxRateDate: date("fx_rate_date", { mode: "string" }),
    provider: text("provider").$type<FxRateProvider>(),
    supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_event_valuation_active_unique")
      .on(table.financialEventId, table.targetCurrency)
      .where(sql`${table.supersededAt} IS NULL`),
    index("financial_event_valuation_target_currency_idx").on(
      table.targetCurrency,
      table.financialEventId,
    ),
    check(
      "financial_event_valuation_kind_check",
      sql`${table.valuationKind} in ('identity', 'historical_reference', 'settlement_confirmed')`,
    ),
    check(
      "financial_event_valuation_target_currency_check",
      sql`${table.targetCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "financial_event_valuation_amount_minor_check",
      sql`${table.normalizedAmountMinor} >= 0`,
    ),
    check(
      "financial_event_valuation_provider_check",
      sql`${table.provider} IS NULL OR ${table.provider} in ('currencyapi')`,
    ),
  ],
)

export type FxRateDailyInsert = typeof fxRatesDaily.$inferInsert
export type FxRateDailySelect = typeof fxRatesDaily.$inferSelect
export type FinancialEventValuationInsert = typeof financialEventValuations.$inferInsert
export type FinancialEventValuationSelect = typeof financialEventValuations.$inferSelect
