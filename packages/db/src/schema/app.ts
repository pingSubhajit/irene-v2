import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./auth"

export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    reportingCurrency: text("reporting_currency").notNull().default("INR"),
    forecastHorizonDays: integer("forecast_horizon_days").notNull().default(30),
    salaryDayHint: integer("salary_day_hint"),
    lowBalanceThreshold: bigint("low_balance_threshold", { mode: "number" })
      .notNull()
      .default(0),
    reviewConfidenceThreshold: numeric("review_confidence_threshold", {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default("0.7000"),
    autoApplyConfidenceThreshold: numeric("auto_apply_confidence_threshold", {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default("0.9500"),
    dataRetentionDays: integer("data_retention_days"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "user_settings_forecast_horizon_positive",
      sql`${table.forecastHorizonDays} > 0`,
    ),
    check(
      "user_settings_reporting_currency_check",
      sql`${table.reportingCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "user_settings_salary_day_range",
      sql`${table.salaryDayHint} IS NULL OR ${table.salaryDayHint} BETWEEN 1 AND 31`,
    ),
  ],
)

export type JobRunStatus = "queued" | "running" | "succeeded" | "failed"

export const jobRuns = pgTable(
  "job_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queueName: text("queue_name").notNull(),
    jobName: text("job_name").notNull(),
    jobKey: text("job_key"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown> | null>(),
    status: text("status").$type<JobRunStatus>().notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("job_run_queue_status_created_at_idx").on(
      table.queueName,
      table.status,
      table.createdAt,
    ),
    index("job_run_job_name_idx").on(table.jobName),
    index("job_run_job_key_idx").on(table.jobKey),
    check(
      "job_run_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
  ],
)

export type UserSettingsInsert = typeof userSettings.$inferInsert
export type JobRunInsert = typeof jobRuns.$inferInsert
export type JobRunSelect = typeof jobRuns.$inferSelect
