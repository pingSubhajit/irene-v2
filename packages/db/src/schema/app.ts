import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    timeZone: text("time_zone").notNull().default("Asia/Kolkata"),
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
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
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
      sql`${table.forecastHorizonDays} > 0`
    ),
    check(
      "user_settings_reporting_currency_check",
      sql`${table.reportingCurrency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "user_settings_salary_day_range",
      sql`${table.salaryDayHint} IS NULL OR ${table.salaryDayHint} BETWEEN 1 AND 31`
    ),
  ]
)

export type JobRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_lettered"

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
    maxAttempts: integer("max_attempts").notNull().default(1),
    retryable: boolean("retryable").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    errorMessage: text("error_message"),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", {
      withTimezone: true,
      mode: "date",
    }),
    deadLetteredAt: timestamp("dead_lettered_at", {
      withTimezone: true,
      mode: "date",
    }),
    replayedFromJobRunId: uuid("replayed_from_job_run_id").references(
      (): AnyPgColumn => jobRuns.id,
      {
        onDelete: "set null",
      }
    ),
    recoveryGroupKey: text("recovery_group_key"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("job_run_queue_status_created_at_idx").on(
      table.queueName,
      table.status,
      table.createdAt
    ),
    index("job_run_job_name_idx").on(table.jobName),
    index("job_run_job_key_idx").on(table.jobKey),
    index("job_run_replayed_from_idx").on(table.replayedFromJobRunId),
    index("job_run_recovery_group_idx").on(
      table.recoveryGroupKey,
      table.createdAt
    ),
    check(
      "job_run_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered')`
    ),
    check("job_run_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check("job_run_max_attempts_check", sql`${table.maxAttempts} > 0`),
  ]
)

export type PwaMutationReceiptStatus =
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "blocked_auth"

export const pwaMutationReceipts = pgTable(
  "pwa_mutation_receipt",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    mutationId: text("mutation_id").notNull(),
    kind: text("kind").notNull(),
    requestPayloadJson: jsonb("request_payload_json")
      .$type<Record<string, unknown> | null>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    responseJson: jsonb("response_json")
      .$type<Record<string, unknown> | null>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").$type<PwaMutationReceiptStatus>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.idempotencyKey],
      name: "pwa_mutation_receipt_pk",
    }),
    index("pwa_mutation_receipt_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    check(
      "pwa_mutation_receipt_status_check",
      sql`${table.status} in ('succeeded', 'failed_retryable', 'failed_terminal', 'blocked_auth')`
    ),
  ]
)

export type UserSettingsInsert = typeof userSettings.$inferInsert
export type JobRunInsert = typeof jobRuns.$inferInsert
export type JobRunSelect = typeof jobRuns.$inferSelect
export type PwaMutationReceiptInsert = typeof pwaMutationReceipts.$inferInsert
export type PwaMutationReceiptSelect = typeof pwaMutationReceipts.$inferSelect
