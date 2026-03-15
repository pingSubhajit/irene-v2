import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./auth"

export type OauthConnectionStatus = "active" | "expired" | "revoked" | "error"
export type RawDocumentSourceType = "email" | "attachment_email" | "forwarded_email"
export type RawDocumentRelevanceLabel =
  | "transactional_finance"
  | "obligation_finance"
  | "marketing_finance"
  | "non_finance"
export type RawDocumentRelevanceStage = "heuristic" | "model"
export type DocumentAttachmentParseStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"

export const oauthConnections = pgTable(
  "oauth_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountEmail: text("provider_account_email").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    scope: text("scope"),
    status: text("status").$type<OauthConnectionStatus>().notNull(),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastFailedSyncAt: timestamp("last_failed_sync_at", {
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
    uniqueIndex("oauth_connection_user_provider_email_unique").on(
      table.userId,
      table.provider,
      table.providerAccountEmail,
    ),
    index("oauth_connection_user_status_idx").on(table.userId, table.status),
    check("oauth_connection_provider_check", sql`${table.provider} = 'gmail'`),
    check(
      "oauth_connection_status_check",
      sql`${table.status} in ('active', 'expired', 'revoked', 'error')`,
    ),
  ],
)

export const emailSyncCursors = pgTable(
  "email_sync_cursor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    oauthConnectionId: uuid("oauth_connection_id")
      .notNull()
      .references(() => oauthConnections.id, { onDelete: "cascade" }),
    folderName: text("folder_name").notNull(),
    providerCursor: text("provider_cursor"),
    backfillStartedAt: timestamp("backfill_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    backfillCompletedAt: timestamp("backfill_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastSeenMessageAt: timestamp("last_seen_message_at", {
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
    uniqueIndex("email_sync_cursor_connection_folder_unique").on(
      table.oauthConnectionId,
      table.folderName,
    ),
    index("email_sync_cursor_last_seen_idx").on(table.lastSeenMessageAt),
  ],
)

export const rawDocuments = pgTable(
  "raw_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    oauthConnectionId: uuid("oauth_connection_id")
      .notNull()
      .references(() => oauthConnections.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<RawDocumentSourceType>().notNull(),
    providerMessageId: text("provider_message_id").notNull(),
    threadId: text("thread_id"),
    messageTimestamp: timestamp("message_timestamp", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtmlStorageKey: text("body_html_storage_key"),
    snippet: text("snippet"),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    documentHash: text("document_hash").notNull(),
    relevanceLabel: text("relevance_label").$type<RawDocumentRelevanceLabel>(),
    relevanceStage: text("relevance_stage").$type<RawDocumentRelevanceStage>(),
    relevanceScore: bigint("relevance_score", { mode: "number" }),
    relevanceReasonsJson: jsonb("relevance_reasons_json").$type<string[] | null>(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("raw_document_connection_message_unique").on(
      table.oauthConnectionId,
      table.providerMessageId,
    ),
    index("raw_document_user_message_timestamp_idx").on(
      table.userId,
      table.messageTimestamp,
    ),
    index("raw_document_user_thread_idx").on(table.userId, table.threadId),
    index("raw_document_document_hash_idx").on(table.documentHash),
    check(
      "raw_document_source_type_check",
      sql`${table.sourceType} in ('email', 'attachment_email', 'forwarded_email')`,
    ),
    check(
      "raw_document_relevance_label_check",
      sql`${table.relevanceLabel} IS NULL OR ${table.relevanceLabel} in ('transactional_finance', 'obligation_finance', 'marketing_finance', 'non_finance')`,
    ),
    check(
      "raw_document_relevance_stage_check",
      sql`${table.relevanceStage} IS NULL OR ${table.relevanceStage} in ('heuristic', 'model')`,
    ),
  ],
)

export const documentAttachments = pgTable(
  "document_attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawDocumentId: uuid("raw_document_id")
      .notNull()
      .references(() => rawDocuments.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256Hash: text("sha256_hash").notNull(),
    parseStatus: text("parse_status")
      .$type<DocumentAttachmentParseStatus>()
      .notNull()
      .default("pending"),
    parsedText: text("parsed_text"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("document_attachment_raw_document_idx").on(table.rawDocumentId),
    index("document_attachment_parse_status_created_at_idx").on(
      table.parseStatus,
      table.createdAt,
    ),
    uniqueIndex("document_attachment_raw_document_sha256_unique").on(
      table.rawDocumentId,
      table.sha256Hash,
    ),
    check("document_attachment_size_bytes_check", sql`${table.sizeBytes} >= 0`),
    check(
      "document_attachment_parse_status_check",
      sql`${table.parseStatus} in ('pending', 'processing', 'completed', 'failed', 'skipped')`,
    ),
  ],
)

export type OauthConnectionInsert = typeof oauthConnections.$inferInsert
export type OauthConnectionSelect = typeof oauthConnections.$inferSelect
export type EmailSyncCursorSelect = typeof emailSyncCursors.$inferSelect
export type RawDocumentSelect = typeof rawDocuments.$inferSelect
export type RawDocumentInsert = typeof rawDocuments.$inferInsert
export type DocumentAttachmentInsert = typeof documentAttachments.$inferInsert
export type DocumentAttachmentSelect = typeof documentAttachments.$inferSelect
