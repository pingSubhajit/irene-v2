import { and, desc, eq, inArray, not } from "drizzle-orm"

import { db } from "./client"
import {
  documentAttachments,
  emailSyncCursors,
  oauthConnections,
  rawDocuments,
  type RawDocumentRelevanceLabel,
  type RawDocumentRelevanceStage,
  type DocumentAttachmentParseStatus,
  type OauthConnectionStatus,
  type RawDocumentSourceType,
} from "./schema"

const GMAIL_PROVIDER = "gmail"

type UpsertOauthConnectionInput = {
  userId: string
  providerAccountEmail: string
  accessTokenEncrypted: string
  refreshTokenEncrypted?: string | null
  tokenExpiresAt?: Date | null
  scope?: string | null
  status: OauthConnectionStatus
}

export async function upsertGmailOauthConnection(input: UpsertOauthConnectionInput) {
  const [connection] = await db
    .insert(oauthConnections)
    .values({
      userId: input.userId,
      provider: GMAIL_PROVIDER,
      providerAccountEmail: input.providerAccountEmail,
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scope: input.scope ?? null,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: [
        oauthConnections.userId,
        oauthConnections.provider,
        oauthConnections.providerAccountEmail,
      ],
      set: {
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted ?? null,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        scope: input.scope ?? null,
        status: input.status,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!connection) {
    throw new Error("Failed to upsert Gmail oauth connection")
  }

  return connection
}

export async function getGmailOauthConnectionForUser(userId: string) {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, GMAIL_PROVIDER),
      ),
    )
    .orderBy(desc(oauthConnections.updatedAt))
    .limit(1)

  return connection ?? null
}

export async function listActiveGmailOauthConnections() {
  return db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.provider, GMAIL_PROVIDER),
        eq(oauthConnections.status, "active"),
      ),
    )
    .orderBy(desc(oauthConnections.updatedAt))
}

export async function listSyncableGmailOauthConnections() {
  return db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.provider, GMAIL_PROVIDER),
        not(eq(oauthConnections.status, "revoked")),
      ),
    )
    .orderBy(desc(oauthConnections.updatedAt))
}

export async function getOauthConnectionById(connectionId: string) {
  const [connection] = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1)

  return connection ?? null
}

type UpdateOauthConnectionInput = {
  accessTokenEncrypted?: string
  refreshTokenEncrypted?: string | null
  tokenExpiresAt?: Date | null
  scope?: string | null
  status?: OauthConnectionStatus
  lastSuccessfulSyncAt?: Date | null
  lastFailedSyncAt?: Date | null
}

export async function updateOauthConnection(
  connectionId: string,
  input: UpdateOauthConnectionInput,
) {
  const [connection] = await db
    .update(oauthConnections)
    .set({
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt,
      scope: input.scope,
      status: input.status,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
      lastFailedSyncAt: input.lastFailedSyncAt,
      updatedAt: new Date(),
    })
    .where(eq(oauthConnections.id, connectionId))
    .returning()

  return connection ?? null
}

export async function markOauthConnectionRevoked(connectionId: string) {
  return updateOauthConnection(connectionId, {
    status: "revoked",
  })
}

export async function ensureEmailSyncCursor(oauthConnectionId: string, folderName: string) {
  await db
    .insert(emailSyncCursors)
    .values({
      oauthConnectionId,
      folderName,
    })
    .onConflictDoNothing()

  const [cursor] = await db
    .select()
    .from(emailSyncCursors)
    .where(
      and(
        eq(emailSyncCursors.oauthConnectionId, oauthConnectionId),
        eq(emailSyncCursors.folderName, folderName),
      ),
    )
    .limit(1)

  if (!cursor) {
    throw new Error("Failed to ensure email sync cursor")
  }

  return cursor
}

type UpdateEmailSyncCursorInput = {
  providerCursor?: string | null
  backfillStartedAt?: Date | null
  backfillCompletedAt?: Date | null
  lastSeenMessageAt?: Date | null
}

export async function updateEmailSyncCursor(
  cursorId: string,
  input: UpdateEmailSyncCursorInput,
) {
  const [cursor] = await db
    .update(emailSyncCursors)
    .set({
      providerCursor: input.providerCursor,
      backfillStartedAt: input.backfillStartedAt,
      backfillCompletedAt: input.backfillCompletedAt,
      lastSeenMessageAt: input.lastSeenMessageAt,
      updatedAt: new Date(),
    })
    .where(eq(emailSyncCursors.id, cursorId))
    .returning()

  return cursor ?? null
}

export async function getEmailSyncCursorById(cursorId: string) {
  const [cursor] = await db
    .select()
    .from(emailSyncCursors)
    .where(eq(emailSyncCursors.id, cursorId))
    .limit(1)

  return cursor ?? null
}

type UpsertRawDocumentInput = {
  userId: string
  oauthConnectionId: string
  sourceType: RawDocumentSourceType
  providerMessageId: string
  threadId?: string | null
  messageTimestamp: Date
  fromAddress?: string | null
  toAddress?: string | null
  subject?: string | null
  bodyText?: string | null
  bodyHtmlStorageKey?: string | null
  snippet?: string | null
  hasAttachments: boolean
  documentHash: string
  relevanceLabel: RawDocumentRelevanceLabel
  relevanceStage: RawDocumentRelevanceStage
  relevanceScore: number
  relevanceReasonsJson: string[]
}

export async function upsertRawDocument(input: UpsertRawDocumentInput) {
  const [byHash] = await db
    .select()
    .from(rawDocuments)
    .where(
      and(
        eq(rawDocuments.userId, input.userId),
        eq(rawDocuments.documentHash, input.documentHash),
      ),
    )
    .limit(1)

  if (byHash) {
    return {
      rawDocument: byHash,
      created: false,
    }
  }

  const [inserted] = await db
    .insert(rawDocuments)
    .values({
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      sourceType: input.sourceType,
      providerMessageId: input.providerMessageId,
      threadId: input.threadId ?? null,
      messageTimestamp: input.messageTimestamp,
      fromAddress: input.fromAddress ?? null,
      toAddress: input.toAddress ?? null,
      subject: input.subject ?? null,
      bodyText: input.bodyText ?? null,
      bodyHtmlStorageKey: input.bodyHtmlStorageKey ?? null,
      snippet: input.snippet ?? null,
      hasAttachments: input.hasAttachments,
      documentHash: input.documentHash,
      relevanceLabel: input.relevanceLabel,
      relevanceStage: input.relevanceStage,
      relevanceScore: input.relevanceScore,
      relevanceReasonsJson: input.relevanceReasonsJson,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted) {
    return {
      rawDocument: inserted,
      created: true,
    }
  }

  const [existing] = await db
    .select()
    .from(rawDocuments)
    .where(
      and(
        eq(rawDocuments.oauthConnectionId, input.oauthConnectionId),
        eq(rawDocuments.providerMessageId, input.providerMessageId),
      ),
    )
    .limit(1)

  if (!existing) {
    throw new Error("Failed to resolve raw document after upsert")
  }

  return {
    rawDocument: existing,
    created: false,
  }
}

type UpsertDocumentAttachmentInput = {
  rawDocumentId: string
  filename: string
  mimeType: string
  storageKey: string
  sizeBytes: number
  sha256Hash: string
  parseStatus?: DocumentAttachmentParseStatus
  parsedText?: string | null
}

export async function upsertDocumentAttachment(input: UpsertDocumentAttachmentInput) {
  const [inserted] = await db
    .insert(documentAttachments)
    .values({
      rawDocumentId: input.rawDocumentId,
      filename: input.filename,
      mimeType: input.mimeType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      sha256Hash: input.sha256Hash,
      parseStatus: input.parseStatus ?? "pending",
      parsedText: input.parsedText ?? null,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted) {
    return inserted
  }

  const [existing] = await db
    .select()
    .from(documentAttachments)
    .where(
      and(
        eq(documentAttachments.rawDocumentId, input.rawDocumentId),
        eq(documentAttachments.sha256Hash, input.sha256Hash),
      ),
    )
    .limit(1)

  if (!existing) {
    throw new Error("Failed to resolve document attachment after upsert")
  }

  return existing
}

export async function countRawDocumentsForUser(userId: string) {
  const rows = await db
    .select({
      id: rawDocuments.id,
    })
    .from(rawDocuments)
    .where(eq(rawDocuments.userId, userId))

  return rows.length
}

export async function listRecentRawDocumentsForUser(userId: string, limit = 10) {
  return db
    .select()
    .from(rawDocuments)
    .where(eq(rawDocuments.userId, userId))
    .orderBy(desc(rawDocuments.messageTimestamp))
    .limit(limit)
}

export async function listRecentOauthConnections(limit = 10) {
  return db
    .select()
    .from(oauthConnections)
    .orderBy(desc(oauthConnections.updatedAt))
    .limit(limit)
}

export async function getLatestCursorForConnection(oauthConnectionId: string) {
  const [cursor] = await db
    .select()
    .from(emailSyncCursors)
    .where(eq(emailSyncCursors.oauthConnectionId, oauthConnectionId))
    .orderBy(desc(emailSyncCursors.updatedAt))
    .limit(1)

  return cursor ?? null
}

export async function listDocumentAttachmentsForRawDocumentIds(rawDocumentIds: string[]) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(documentAttachments)
    .where(inArray(documentAttachments.rawDocumentId, rawDocumentIds))
    .orderBy(desc(documentAttachments.createdAt))
}

export async function getGmailIngestionArtifactsForConnection(oauthConnectionId: string) {
  const documents = await db
    .select({
      id: rawDocuments.id,
      bodyHtmlStorageKey: rawDocuments.bodyHtmlStorageKey,
    })
    .from(rawDocuments)
    .where(eq(rawDocuments.oauthConnectionId, oauthConnectionId))

  const rawDocumentIds = documents.map((document) => document.id)
  const attachments = await listDocumentAttachmentsForRawDocumentIds(rawDocumentIds)
  const storageKeys = [
    ...documents
      .map((document) => document.bodyHtmlStorageKey)
      .filter((value): value is string => Boolean(value)),
    ...attachments.map((attachment) => attachment.storageKey),
  ]

  return {
    rawDocumentIds,
    rawDocumentCount: documents.length,
    attachmentCount: attachments.length,
    storageKeys: [...new Set(storageKeys)],
  }
}

export async function resetGmailIngestionForConnection(oauthConnectionId: string) {
  const artifacts = await getGmailIngestionArtifactsForConnection(oauthConnectionId)

  return db.transaction(async (tx) => {
    await tx.delete(rawDocuments).where(eq(rawDocuments.oauthConnectionId, oauthConnectionId))

    await tx
      .update(emailSyncCursors)
      .set({
        providerCursor: null,
        backfillStartedAt: null,
        backfillCompletedAt: null,
        lastSeenMessageAt: null,
        updatedAt: new Date(),
      })
      .where(eq(emailSyncCursors.oauthConnectionId, oauthConnectionId))

    await tx
      .update(oauthConnections)
      .set({
        status: "active",
        lastSuccessfulSyncAt: null,
        lastFailedSyncAt: null,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, oauthConnectionId))

    return {
      deletedRawDocuments: artifacts.rawDocumentCount,
      deletedAttachments: artifacts.attachmentCount,
      deletedStorageObjects: artifacts.storageKeys.length,
    }
  })
}
