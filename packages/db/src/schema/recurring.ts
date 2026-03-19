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
import { categories, financialEvents, merchants, paymentInstruments } from "./ledger"

export type RecurringObligationType = "subscription" | "bill" | "emi"
export type RecurringObligationStatus = "suspected" | "active" | "paused" | "closed"
export type RecurringCadence = "weekly" | "monthly" | "quarterly" | "yearly" | "irregular"
export type EmiPlanStatus = "suspected" | "active" | "completed" | "cancelled"
export type IncomeStreamType =
  | "salary"
  | "freelance"
  | "reimbursement"
  | "transfer_in"
  | "other"
export type IncomeStreamStatus = "suspected" | "active" | "inactive"

export const recurringObligations = pgTable(
  "recurring_obligation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    obligationType: text("obligation_type").$type<RecurringObligationType>().notNull(),
    status: text("status").$type<RecurringObligationStatus>().notNull().default("suspected"),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    paymentInstrumentId: uuid("payment_instrument_id").references(
      () => paymentInstruments.id,
      {
        onDelete: "set null",
      },
    ),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: text("currency"),
    cadence: text("cadence").$type<RecurringCadence>().notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    dayOfMonth: integer("day_of_month"),
    nextDueAt: timestamp("next_due_at", { withTimezone: true, mode: "date" }),
    lastChargedAt: timestamp("last_charged_at", { withTimezone: true, mode: "date" }),
    detectionConfidence: numeric("detection_confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0.5),
    sourceEventId: uuid("source_event_id").references(() => financialEvents.id, {
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
    index("recurring_obligation_user_status_next_due_idx").on(
      table.userId,
      table.status,
      table.nextDueAt,
    ),
    index("recurring_obligation_merchant_status_idx").on(table.merchantId, table.status),
    index("recurring_obligation_payment_instrument_status_idx").on(
      table.paymentInstrumentId,
      table.status,
    ),
    check(
      "recurring_obligation_type_check",
      sql`${table.obligationType} in ('subscription', 'bill', 'emi')`,
    ),
    check(
      "recurring_obligation_status_check",
      sql`${table.status} in ('suspected', 'active', 'paused', 'closed')`,
    ),
    check(
      "recurring_obligation_cadence_check",
      sql`${table.cadence} in ('weekly', 'monthly', 'quarterly', 'yearly', 'irregular')`,
    ),
    check(
      "recurring_obligation_interval_count_check",
      sql`${table.intervalCount} > 0`,
    ),
    check(
      "recurring_obligation_day_of_month_check",
      sql`${table.dayOfMonth} IS NULL OR ${table.dayOfMonth} BETWEEN 1 AND 31`,
    ),
    check(
      "recurring_obligation_detection_confidence_check",
      sql`${table.detectionConfidence} >= 0 AND ${table.detectionConfidence} <= 1`,
    ),
    check(
      "recurring_obligation_currency_check",
      sql`${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
)

export const emiPlans = pgTable(
  "emi_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recurringObligationId: uuid("recurring_obligation_id")
      .notNull()
      .references(() => recurringObligations.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    paymentInstrumentId: uuid("payment_instrument_id").references(
      () => paymentInstruments.id,
      {
        onDelete: "set null",
      },
    ),
    principalMinor: bigint("principal_minor", { mode: "number" }),
    installmentAmountMinor: bigint("installment_amount_minor", { mode: "number" }),
    currency: text("currency"),
    tenureMonths: integer("tenure_months"),
    installmentsPaid: integer("installments_paid").notNull().default(0),
    interestRateBps: integer("interest_rate_bps"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    nextDueAt: timestamp("next_due_at", { withTimezone: true, mode: "date" }),
    status: text("status").$type<EmiPlanStatus>().notNull().default("suspected"),
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
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("emi_plan_recurring_obligation_unique").on(table.recurringObligationId),
    index("emi_plan_user_status_next_due_idx").on(table.userId, table.status, table.nextDueAt),
    check(
      "emi_plan_status_check",
      sql`${table.status} in ('suspected', 'active', 'completed', 'cancelled')`,
    ),
    check(
      "emi_plan_installments_paid_check",
      sql`${table.installmentsPaid} >= 0`,
    ),
    check(
      "emi_plan_tenure_months_check",
      sql`${table.tenureMonths} IS NULL OR ${table.tenureMonths} > 0`,
    ),
    check(
      "emi_plan_interest_rate_bps_check",
      sql`${table.interestRateBps} IS NULL OR ${table.interestRateBps} >= 0`,
    ),
    check(
      "emi_plan_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "emi_plan_currency_check",
      sql`${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
)

export const incomeStreams = pgTable(
  "income_stream",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    incomeType: text("income_type").$type<IncomeStreamType>().notNull(),
    sourceMerchantId: uuid("source_merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    paymentInstrumentId: uuid("payment_instrument_id").references(
      () => paymentInstruments.id,
      {
        onDelete: "set null",
      },
    ),
    expectedAmountMinor: bigint("expected_amount_minor", { mode: "number" }),
    currency: text("currency"),
    expectedDayOfMonth: integer("expected_day_of_month"),
    variabilityScore: numeric("variability_score", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0),
    lastReceivedAt: timestamp("last_received_at", { withTimezone: true, mode: "date" }),
    nextExpectedAt: timestamp("next_expected_at", { withTimezone: true, mode: "date" }),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0.5),
    status: text("status").$type<IncomeStreamStatus>().notNull().default("suspected"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("income_stream_user_status_next_expected_idx").on(
      table.userId,
      table.status,
      table.nextExpectedAt,
    ),
    index("income_stream_source_merchant_status_idx").on(
      table.sourceMerchantId,
      table.status,
    ),
    check(
      "income_stream_type_check",
      sql`${table.incomeType} in ('salary', 'freelance', 'reimbursement', 'transfer_in', 'other')`,
    ),
    check(
      "income_stream_status_check",
      sql`${table.status} in ('suspected', 'active', 'inactive')`,
    ),
    check(
      "income_stream_expected_day_of_month_check",
      sql`${table.expectedDayOfMonth} IS NULL OR ${table.expectedDayOfMonth} BETWEEN 1 AND 31`,
    ),
    check(
      "income_stream_variability_score_check",
      sql`${table.variabilityScore} >= 0 AND ${table.variabilityScore} <= 1`,
    ),
    check(
      "income_stream_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "income_stream_currency_check",
      sql`${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
)

export type RecurringObligationInsert = typeof recurringObligations.$inferInsert
export type RecurringObligationSelect = typeof recurringObligations.$inferSelect
export type EmiPlanInsert = typeof emiPlans.$inferInsert
export type EmiPlanSelect = typeof emiPlans.$inferSelect
export type IncomeStreamInsert = typeof incomeStreams.$inferInsert
export type IncomeStreamSelect = typeof incomeStreams.$inferSelect
