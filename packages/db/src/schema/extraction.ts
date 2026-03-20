import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./auth"
import { rawDocuments } from "./ingestion"
import { financialEvents } from "./ledger"

export type ModelRunTaskType =
  | "finance_relevance_classification"
  | "document_extraction"
  | "classification_support"
  | "entity_resolution"
  | "merchant_resolution"
  | "category_resolution"
  | "reconciliation_resolution"
  | "advice_generation"
  | "review_summary"

export type ModelRunStatus = "queued" | "running" | "succeeded" | "failed"

export type ExtractedSignalType =
  | "purchase_signal"
  | "income_signal"
  | "subscription_signal"
  | "emi_signal"
  | "bill_signal"
  | "refund_signal"
  | "transfer_signal"
  | "generic_finance_signal"

export type ExtractedSignalCandidateEventType =
  | "purchase"
  | "income"
  | "subscription_charge"
  | "emi_payment"
  | "bill_payment"
  | "refund"
  | "transfer"

export type ExtractedSignalStatus =
  | "pending"
  | "reconciled"
  | "ignored"
  | "needs_review"
  | "failed"

export const modelRuns = pgTable(
  "model_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawDocumentId: uuid("raw_document_id").references(() => rawDocuments.id, {
      onDelete: "set null",
    }),
    financialEventId: uuid("financial_event_id").references(() => financialEvents.id, {
      onDelete: "set null",
    }),
    taskType: text("task_type").$type<ModelRunTaskType>().notNull(),
    provider: text("provider").notNull(),
    modelName: text("model_name").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: numeric("input_tokens", { mode: "number" }),
    outputTokens: numeric("output_tokens", { mode: "number" }),
    status: text("status").$type<ModelRunStatus>().notNull(),
    latencyMs: numeric("latency_ms", { mode: "number" }),
    requestId: text("request_id"),
    errorMessage: text("error_message"),
    resultJson: jsonb("result_json").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("model_run_user_created_at_idx").on(table.userId, table.createdAt),
    index("model_run_raw_document_created_at_idx").on(
      table.rawDocumentId,
      table.createdAt,
    ),
    index("model_run_financial_event_created_at_idx").on(
      table.financialEventId,
      table.createdAt,
    ),
    index("model_run_task_status_created_at_idx").on(
      table.taskType,
      table.status,
      table.createdAt,
    ),
    check(
      "model_run_task_type_check",
      sql`${table.taskType} in ('finance_relevance_classification', 'document_extraction', 'classification_support', 'entity_resolution', 'merchant_resolution', 'category_resolution', 'reconciliation_resolution', 'advice_generation', 'review_summary')`,
    ),
    check(
      "model_run_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
    check(
      "model_run_input_tokens_check",
      sql`${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0`,
    ),
    check(
      "model_run_output_tokens_check",
      sql`${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0`,
    ),
    check(
      "model_run_latency_ms_check",
      sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`,
    ),
  ],
)

export const extractedSignals = pgTable(
  "extracted_signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawDocumentId: uuid("raw_document_id")
      .notNull()
      .references(() => rawDocuments.id, { onDelete: "cascade" }),
    modelRunId: uuid("model_run_id").references(() => modelRuns.id, {
      onDelete: "set null",
    }),
    signalType: text("signal_type").$type<ExtractedSignalType>().notNull(),
    candidateEventType: text("candidate_event_type").$type<
      ExtractedSignalCandidateEventType | null
    >(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: text("currency"),
    eventDate: date("event_date", { mode: "string" }),
    issuerNameHint: text("issuer_name_hint"),
    instrumentLast4Hint: text("instrument_last4_hint"),
    merchantDescriptorRaw: text("merchant_descriptor_raw"),
    merchantNameCandidate: text("merchant_name_candidate"),
    processorNameCandidate: text("processor_name_candidate"),
    channelHint: text("channel_hint"),
    merchantRaw: text("merchant_raw"),
    merchantHint: text("merchant_hint"),
    paymentInstrumentHint: text("payment_instrument_hint"),
    categoryHint: text("category_hint"),
    isRecurringHint: boolean("is_recurring_hint").notNull().default(false),
    isEmiHint: boolean("is_emi_hint").notNull().default(false),
    confidence: numeric("confidence", {
      precision: 5,
      scale: 4,
      mode: "number",
    }).notNull(),
    evidenceJson: jsonb("evidence_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").$type<ExtractedSignalStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("extracted_signal_raw_document_created_at_idx").on(
      table.rawDocumentId,
      table.createdAt,
    ),
    index("extracted_signal_user_status_created_at_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    index("extracted_signal_candidate_status_idx").on(
      table.candidateEventType,
      table.status,
    ),
    index("extracted_signal_model_run_idx").on(table.modelRunId),
    check(
      "extracted_signal_signal_type_check",
      sql`${table.signalType} in ('purchase_signal', 'income_signal', 'subscription_signal', 'emi_signal', 'bill_signal', 'refund_signal', 'transfer_signal', 'generic_finance_signal')`,
    ),
    check(
      "extracted_signal_candidate_event_type_check",
      sql`${table.candidateEventType} IS NULL OR ${table.candidateEventType} in ('purchase', 'income', 'subscription_charge', 'emi_payment', 'bill_payment', 'refund', 'transfer')`,
    ),
    check(
      "extracted_signal_status_check",
      sql`${table.status} in ('pending', 'reconciled', 'ignored', 'needs_review', 'failed')`,
    ),
    check(
      "extracted_signal_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check(
      "extracted_signal_currency_check",
      sql`${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "extracted_signal_channel_hint_check",
      sql`${table.channelHint} IS NULL OR ${table.channelHint} in ('card', 'wallet', 'upi', 'bank_transfer', 'other')`,
    ),
    check(
      "extracted_signal_amount_minor_check",
      sql`${table.amountMinor} IS NULL OR ${table.amountMinor} >= 0`,
    ),
  ],
)

export type ModelRunInsert = typeof modelRuns.$inferInsert
export type ModelRunSelect = typeof modelRuns.$inferSelect
export type ExtractedSignalInsert = typeof extractedSignals.$inferInsert
export type ExtractedSignalSelect = typeof extractedSignals.$inferSelect
