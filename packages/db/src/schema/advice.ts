import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  date,
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
import { modelRuns } from "./extraction"
import { categories, merchants } from "./ledger"

export type AdviceItemTriggerType =
  | "low_cash_projection"
  | "rising_recurring_obligations"
  | "delayed_income"
  | "discretionary_overspending"
  | "goal_slippage"
  | "review_backlog"

export type AdviceItemStatus = "active" | "dismissed" | "done" | "expired"
export type AdviceItemPriority = 1 | 2 | 3
export type FinancialGoalType =
  | "emergency_fund"
  | "target_purchase"
  | "travel"
  | "debt_payoff"
  | "custom"
export type FinancialGoalStatus = "active" | "completed" | "archived"

export const financialGoals = pgTable(
  "financial_goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalType: text("goal_type").$type<FinancialGoalType>().notNull(),
    status: text("status").$type<FinancialGoalStatus>().notNull().default("active"),
    name: text("name").notNull(),
    targetAmountMinor: bigint("target_amount_minor", { mode: "number" }).notNull(),
    startingAmountMinor: bigint("starting_amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull(),
    targetDate: date("target_date", { mode: "string" }).notNull(),
    linkedCategoryId: uuid("linked_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    contributionRuleJson: jsonb("contribution_rule_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("financial_goal_user_status_target_date_idx").on(
      table.userId,
      table.status,
      table.targetDate,
    ),
    check(
      "financial_goal_type_check",
      sql`${table.goalType} in ('emergency_fund', 'target_purchase', 'travel', 'debt_payoff', 'custom')`,
    ),
    check(
      "financial_goal_status_check",
      sql`${table.status} in ('active', 'completed', 'archived')`,
    ),
    check("financial_goal_target_amount_check", sql`${table.targetAmountMinor} > 0`),
    check("financial_goal_starting_amount_check", sql`${table.startingAmountMinor} >= 0`),
    check("financial_goal_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
)

export const goalContributionSnapshots = pgTable(
  "goal_contribution_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    financialGoalId: uuid("financial_goal_id")
      .notNull()
      .references(() => financialGoals.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    savedAmountMinor: bigint("saved_amount_minor", { mode: "number" }).notNull(),
    projectedAmountMinor: bigint("projected_amount_minor", { mode: "number" }).notNull(),
    gapAmountMinor: bigint("gap_amount_minor", { mode: "number" }).notNull(),
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
    uniqueIndex("goal_contribution_snapshot_goal_date_unique").on(
      table.financialGoalId,
      table.snapshotDate,
    ),
    index("goal_contribution_snapshot_date_idx").on(table.snapshotDate),
    check(
      "goal_contribution_snapshot_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
)

export const adviceItems = pgTable(
  "advice_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").$type<AdviceItemTriggerType>().notNull(),
    status: text("status").$type<AdviceItemStatus>().notNull().default("active"),
    priority: integer("priority").$type<AdviceItemPriority>().notNull().default(2),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail").notNull(),
    relatedMerchantId: uuid("related_merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    relatedFinancialGoalId: uuid("related_financial_goal_id").references(() => financialGoals.id, {
      onDelete: "set null",
    }),
    evidenceJson: jsonb("evidence_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceModelRunId: uuid("source_model_run_id").references(() => modelRuns.id, {
      onDelete: "set null",
    }),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "date" }),
    doneAt: timestamp("done_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("advice_item_user_dedupe_key_unique").on(table.userId, table.dedupeKey),
    index("advice_item_user_status_priority_updated_idx").on(
      table.userId,
      table.status,
      table.priority,
      table.updatedAt,
    ),
    check(
      "advice_item_trigger_type_check",
      sql`${table.triggerType} in ('low_cash_projection', 'rising_recurring_obligations', 'delayed_income', 'discretionary_overspending', 'goal_slippage', 'review_backlog')`,
    ),
    check(
      "advice_item_status_check",
      sql`${table.status} in ('active', 'dismissed', 'done', 'expired')`,
    ),
    check("advice_item_priority_check", sql`${table.priority} between 1 and 3`),
  ],
)

export type FinancialGoalInsert = typeof financialGoals.$inferInsert
export type FinancialGoalSelect = typeof financialGoals.$inferSelect
export type GoalContributionSnapshotInsert = typeof goalContributionSnapshots.$inferInsert
export type GoalContributionSnapshotSelect = typeof goalContributionSnapshots.$inferSelect
export type AdviceItemInsert = typeof adviceItems.$inferInsert
export type AdviceItemSelect = typeof adviceItems.$inferSelect
