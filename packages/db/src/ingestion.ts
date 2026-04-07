import { and, desc, eq, gte, inArray, lte, not, or } from "drizzle-orm"

import { db } from "./client"
import {
  accounts,
  adviceItems,
  balanceAnchors,
  balanceObservations,
  documentAttachments,
  emailSyncCursors,
  emiPlans,
  extractedSignals,
  feedbackEvents,
  financialGoals,
  forecastRuns,
  forecastSnapshots,
  financialEvents,
  financialEventSources,
  financialInstitutionAliases,
  financialInstitutions,
  gmailMessageRelevanceCaches,
  incomeStreams,
  merchantObservations,
  memoryFacts,
  merchantAliases,
  merchants,
  modelRuns,
  oauthConnections,
  paymentInstrumentObservations,
  paymentInstruments,
  paymentProcessorAliases,
  paymentProcessors,
  goalContributionSnapshots,
  rawDocuments,
  recurringObligations,
  reviewQueueItems,
  type RawDocumentRelevanceLabel,
  type RawDocumentRelevanceStage,
  type DocumentAttachmentParseStatus,
  type GmailMessageRelevanceCacheInsert,
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

export async function getLatestGoogleAccountForUser(userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")))
    .orderBy(desc(accounts.updatedAt))
    .limit(1)

  return account ?? null
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

export async function getRawDocumentForConnectionMessage(input: {
  oauthConnectionId: string
  providerMessageId: string
}) {
  const [row] = await db
    .select()
    .from(rawDocuments)
    .where(
      and(
        eq(rawDocuments.oauthConnectionId, input.oauthConnectionId),
        eq(rawDocuments.providerMessageId, input.providerMessageId),
      ),
    )
    .limit(1)

  return row ?? null
}

type UpsertGmailMessageRelevanceCacheInput = Omit<
  GmailMessageRelevanceCacheInsert,
  "id" | "createdAt" | "updatedAt"
>

export async function getGmailMessageRelevanceCache(input: {
  oauthConnectionId: string
  providerMessageId: string
}) {
  const [row] = await db
    .select()
    .from(gmailMessageRelevanceCaches)
    .where(
      and(
        eq(gmailMessageRelevanceCaches.oauthConnectionId, input.oauthConnectionId),
        eq(gmailMessageRelevanceCaches.providerMessageId, input.providerMessageId),
      ),
    )
    .limit(1)

  return row ?? null
}

export async function upsertGmailMessageRelevanceCache(
  input: UpsertGmailMessageRelevanceCacheInput,
) {
  const [row] = await db
    .insert(gmailMessageRelevanceCaches)
    .values({
      ...input,
      reasonsJson: input.reasonsJson ?? [],
    })
    .onConflictDoUpdate({
      target: [
        gmailMessageRelevanceCaches.oauthConnectionId,
        gmailMessageRelevanceCaches.providerMessageId,
      ],
      set: {
        userId: input.userId,
        messageTimestamp: input.messageTimestamp,
        inputHash: input.inputHash,
        classification: input.classification,
        stage: input.stage,
        score: input.score,
        reasonsJson: input.reasonsJson ?? [],
        promptVersion: input.promptVersion,
        modelName: input.modelName,
        provider: input.provider,
        modelRunId: input.modelRunId ?? null,
        lastEvaluatedAt: input.lastEvaluatedAt,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to upsert Gmail message relevance cache")
  }

  return row
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

export async function resetGmailIngestionForConnection(
  oauthConnectionId: string,
  userId: string,
) {
  const artifacts = await getGmailIngestionArtifactsForConnection(oauthConnectionId)

  return db.transaction(async (tx) => {
    const [
      reviewItems,
      recurringRows,
      incomeRows,
      financialEventRows,
      modelRunRows,
      merchantRows,
      institutionRows,
      observationRows,
      merchantObservationRows,
      paymentInstrumentRows,
      paymentProcessorRows,
      balanceObservationRows,
      balanceAnchorRows,
      forecastRunRows,
      forecastSnapshotRows,
      feedbackRows,
      ,
      goalRows,
      ,
    ] = await Promise.all([
      tx.select({ id: reviewQueueItems.id }).from(reviewQueueItems).where(eq(reviewQueueItems.userId, userId)),
      tx
        .select({ id: recurringObligations.id })
        .from(recurringObligations)
        .where(eq(recurringObligations.userId, userId)),
      tx.select({ id: incomeStreams.id }).from(incomeStreams).where(eq(incomeStreams.userId, userId)),
      tx
        .select({ id: financialEvents.id })
        .from(financialEvents)
        .where(eq(financialEvents.userId, userId)),
      tx.select({ id: modelRuns.id }).from(modelRuns).where(eq(modelRuns.userId, userId)),
      tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.userId, userId)),
      tx
        .select({ id: financialInstitutions.id })
        .from(financialInstitutions)
        .where(eq(financialInstitutions.userId, userId)),
      tx
        .select({ id: paymentInstrumentObservations.id })
        .from(paymentInstrumentObservations)
        .where(eq(paymentInstrumentObservations.userId, userId)),
      tx
        .select({ id: merchantObservations.id })
        .from(merchantObservations)
        .where(eq(merchantObservations.userId, userId)),
      tx
        .select({ id: paymentInstruments.id })
        .from(paymentInstruments)
        .where(eq(paymentInstruments.userId, userId)),
      tx
        .select({ id: paymentProcessors.id })
        .from(paymentProcessors)
        .where(eq(paymentProcessors.userId, userId)),
      tx
        .select({ id: balanceObservations.id })
        .from(balanceObservations)
        .where(eq(balanceObservations.userId, userId)),
      tx
        .select({ id: balanceAnchors.id })
        .from(balanceAnchors)
        .where(eq(balanceAnchors.userId, userId)),
      tx.select({ id: forecastRuns.id }).from(forecastRuns).where(eq(forecastRuns.userId, userId)),
      tx
        .select({ id: forecastSnapshots.id })
        .from(forecastSnapshots)
        .innerJoin(forecastRuns, eq(forecastSnapshots.forecastRunId, forecastRuns.id))
        .where(eq(forecastRuns.userId, userId)),
      tx.select({ id: feedbackEvents.id }).from(feedbackEvents).where(eq(feedbackEvents.userId, userId)),
      tx.select({ id: memoryFacts.id }).from(memoryFacts).where(eq(memoryFacts.userId, userId)),
      tx.select({ id: financialGoals.id }).from(financialGoals).where(eq(financialGoals.userId, userId)),
      tx.select({ id: adviceItems.id }).from(adviceItems).where(eq(adviceItems.userId, userId)),
    ])

    await tx.delete(reviewQueueItems).where(eq(reviewQueueItems.userId, userId))
    await tx.delete(incomeStreams).where(eq(incomeStreams.userId, userId))
    await tx.delete(recurringObligations).where(eq(recurringObligations.userId, userId))
    if (goalRows.length > 0) {
      await tx.delete(goalContributionSnapshots).where(
        inArray(
          goalContributionSnapshots.financialGoalId,
          goalRows.map((row) => row.id),
        ),
      )
    }
    await tx.delete(adviceItems).where(eq(adviceItems.userId, userId))
    await tx.delete(financialGoals).where(eq(financialGoals.userId, userId))
    await tx.delete(balanceAnchors).where(eq(balanceAnchors.userId, userId))
    await tx.delete(balanceObservations).where(eq(balanceObservations.userId, userId))
    await tx.delete(forecastRuns).where(eq(forecastRuns.userId, userId))
    await tx.delete(feedbackEvents).where(eq(feedbackEvents.userId, userId))
    await tx.delete(memoryFacts).where(eq(memoryFacts.userId, userId))
    await tx.delete(financialEvents).where(eq(financialEvents.userId, userId))
    await tx.delete(modelRuns).where(eq(modelRuns.userId, userId))
    await tx
      .delete(paymentInstrumentObservations)
      .where(eq(paymentInstrumentObservations.userId, userId))
    await tx
      .delete(merchantObservations)
      .where(eq(merchantObservations.userId, userId))

    if (artifacts.rawDocumentIds.length > 0) {
      await tx
        .delete(financialEventSources)
        .where(inArray(financialEventSources.rawDocumentId, artifacts.rawDocumentIds))
    }

    await tx.delete(rawDocuments).where(eq(rawDocuments.oauthConnectionId, oauthConnectionId))
    await tx.delete(paymentInstruments).where(eq(paymentInstruments.userId, userId))
    await tx.delete(paymentProcessors).where(eq(paymentProcessors.userId, userId))
    if (institutionRows.length > 0) {
      await tx
        .delete(financialInstitutionAliases)
        .where(
          inArray(
            financialInstitutionAliases.financialInstitutionId,
            institutionRows.map((row) => row.id),
          ),
        )
    }
    if (paymentProcessorRows.length > 0) {
      await tx
        .delete(paymentProcessorAliases)
        .where(
          inArray(
            paymentProcessorAliases.paymentProcessorId,
            paymentProcessorRows.map((row) => row.id),
          ),
        )
    }
    await tx.delete(financialInstitutions).where(eq(financialInstitutions.userId, userId))
    await tx.delete(merchants).where(eq(merchants.userId, userId))

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
      deletedReviewItems: reviewItems.length,
      deletedRecurringObligations: recurringRows.length,
      deletedIncomeStreams: incomeRows.length,
      deletedFinancialEvents: financialEventRows.length,
      deletedModelRuns: modelRunRows.length,
      deletedMerchants: merchantRows.length,
      deletedFinancialInstitutions: institutionRows.length,
      deletedPaymentInstrumentObservations: observationRows.length,
      deletedMerchantObservations: merchantObservationRows.length,
      deletedPaymentInstruments: paymentInstrumentRows.length,
      deletedPaymentProcessors: paymentProcessorRows.length,
      deletedBalanceObservations: balanceObservationRows.length,
      deletedBalanceAnchors: balanceAnchorRows.length,
      deletedForecastRuns: forecastRunRows.length,
      deletedForecastSnapshots: forecastSnapshotRows.length,
      deletedFeedbackEvents: feedbackRows.length,
    }
  })
}

export async function resetGmailIngestionWindowForConnection(input: {
  oauthConnectionId: string
  userId: string
  dateFrom: Date
  dateTo: Date
}) {
  const documents = await db
    .select({
      id: rawDocuments.id,
      bodyHtmlStorageKey: rawDocuments.bodyHtmlStorageKey,
      fromAddress: rawDocuments.fromAddress,
    })
    .from(rawDocuments)
    .where(
      and(
        eq(rawDocuments.oauthConnectionId, input.oauthConnectionId),
        gte(rawDocuments.messageTimestamp, input.dateFrom),
        lte(rawDocuments.messageTimestamp, input.dateTo),
      ),
    )

  const rawDocumentIds = documents.map((document) => document.id)
  const attachments = await listDocumentAttachmentsForRawDocumentIds(rawDocumentIds)
  const storageKeys = [
    ...documents
      .map((document) => document.bodyHtmlStorageKey)
      .filter((value): value is string => Boolean(value)),
    ...attachments.map((attachment) => attachment.storageKey),
  ]

  if (rawDocumentIds.length === 0) {
    return {
      deletedRelevanceCacheRows: 0,
      deletedRawDocuments: 0,
      deletedAttachments: 0,
      deletedStorageObjects: 0,
      deletedExtractedSignals: 0,
      deletedFinancialEvents: 0,
      deletedReviewItems: 0,
      deletedModelRuns: 0,
      deletedMerchantObservations: 0,
      deletedFeedbackEvents: 0,
      deletedRecurringObligations: 0,
      deletedEmiPlans: 0,
      deletedMerchantAliases: 0,
      deletedFinancialInstitutionAliases: 0,
      deletedPaymentProcessorAliases: 0,
      deletedMemoryFacts: 0,
      deletedPaymentInstrumentObservations: 0,
      deletedBalanceObservations: 0,
      deletedBalanceAnchors: 0,
      touchedMerchantIds: [] as string[],
      touchedPaymentInstrumentIds: [] as string[],
      touchedPaymentProcessorIds: [] as string[],
      touchedFinancialInstitutionIds: [] as string[],
      storageKeys: [] as string[],
    }
  }

  return db.transaction(async (tx) => {
    const relevanceCacheRows = await tx
      .select({ id: gmailMessageRelevanceCaches.id })
      .from(gmailMessageRelevanceCaches)
      .where(
        and(
          eq(gmailMessageRelevanceCaches.oauthConnectionId, input.oauthConnectionId),
          gte(gmailMessageRelevanceCaches.messageTimestamp, input.dateFrom),
          lte(gmailMessageRelevanceCaches.messageTimestamp, input.dateTo),
        ),
      )

    const signalRows = await tx
      .select({
        id: extractedSignals.id,
        merchantHint: extractedSignals.merchantHint,
        merchantRaw: extractedSignals.merchantRaw,
        merchantDescriptorRaw: extractedSignals.merchantDescriptorRaw,
        processorNameCandidate: extractedSignals.processorNameCandidate,
      })
      .from(extractedSignals)
      .where(inArray(extractedSignals.rawDocumentId, rawDocumentIds))

    const signalIds = signalRows.map((row) => row.id)

    const sourceRows =
      rawDocumentIds.length > 0 || signalIds.length > 0
        ? await tx
            .select({
              id: financialEventSources.id,
              financialEventId: financialEventSources.financialEventId,
            })
            .from(financialEventSources)
            .where(
              or(
                inArray(financialEventSources.rawDocumentId, rawDocumentIds),
                signalIds.length > 0
                  ? inArray(financialEventSources.extractedSignalId, signalIds)
                  : undefined,
              )!,
            )
        : []

    const touchedEventIds = [...new Set(sourceRows.map((row) => row.financialEventId))]
    const eventRows =
      touchedEventIds.length > 0
        ? await tx
            .select({
              id: financialEvents.id,
              merchantId: financialEvents.merchantId,
              paymentProcessorId: financialEvents.paymentProcessorId,
            })
            .from(financialEvents)
            .where(inArray(financialEvents.id, touchedEventIds))
        : []

    const merchantObservationRows =
      rawDocumentIds.length > 0 || signalIds.length > 0 || touchedEventIds.length > 0
        ? await tx
            .select({
              id: merchantObservations.id,
              merchantId: merchantObservations.merchantId,
              paymentProcessorId: merchantObservations.paymentProcessorId,
              merchantNameHint: merchantObservations.merchantNameHint,
              merchantDescriptorRaw: merchantObservations.merchantDescriptorRaw,
              senderAliasHint: merchantObservations.senderAliasHint,
              processorNameHint: merchantObservations.processorNameHint,
            })
            .from(merchantObservations)
            .where(
              or(
                inArray(merchantObservations.rawDocumentId, rawDocumentIds),
                signalIds.length > 0
                  ? inArray(merchantObservations.extractedSignalId, signalIds)
                  : undefined,
                touchedEventIds.length > 0
                  ? inArray(merchantObservations.financialEventId, touchedEventIds)
                  : undefined,
              )!,
            )
        : []

    const paymentInstrumentObservationRows =
      rawDocumentIds.length > 0 || signalIds.length > 0 || touchedEventIds.length > 0
        ? await tx
            .select({
              id: paymentInstrumentObservations.id,
              paymentInstrumentId: paymentInstrumentObservations.paymentInstrumentId,
              issuerAliasHint: paymentInstrumentObservations.issuerAliasHint,
            })
            .from(paymentInstrumentObservations)
            .where(
              or(
                inArray(paymentInstrumentObservations.rawDocumentId, rawDocumentIds),
                signalIds.length > 0
                  ? inArray(paymentInstrumentObservations.extractedSignalId, signalIds)
                  : undefined,
                touchedEventIds.length > 0
                  ? inArray(paymentInstrumentObservations.financialEventId, touchedEventIds)
                  : undefined,
              )!,
            )
        : []

    const touchedMerchantIds = [
      ...new Set(
        [
          ...eventRows.map((row) => row.merchantId),
          ...merchantObservationRows.map((row) => row.merchantId),
        ].filter((value): value is string => Boolean(value)),
      ),
    ]
    const touchedPaymentInstrumentIds = [
      ...new Set(
        paymentInstrumentObservationRows
          .map((row) => row.paymentInstrumentId)
          .filter((value): value is string => Boolean(value)),
      ),
    ]
    const touchedPaymentProcessorIds = [
      ...new Set(
        [
          ...eventRows.map((row) => row.paymentProcessorId),
          ...merchantObservationRows.map((row) => row.paymentProcessorId),
        ].filter((value): value is string => Boolean(value)),
      ),
    ]
    const touchedPaymentInstruments =
      touchedPaymentInstrumentIds.length > 0
        ? await tx
            .select({
              id: paymentInstruments.id,
              financialInstitutionId: paymentInstruments.financialInstitutionId,
            })
            .from(paymentInstruments)
            .where(inArray(paymentInstruments.id, touchedPaymentInstrumentIds))
        : []
    const touchedFinancialInstitutionIds = [
      ...new Set(
        touchedPaymentInstruments
          .map((row) => row.financialInstitutionId)
          .filter((value): value is string => Boolean(value)),
      ),
    ]

    const aliasTexts = [
      ...new Set(
        [
          ...documents.map((row) => row.fromAddress),
          ...signalRows.flatMap((row) => [
            row.merchantHint,
            row.merchantRaw,
            row.merchantDescriptorRaw,
          ]),
          ...merchantObservationRows.flatMap((row) => [
            row.merchantNameHint,
            row.merchantDescriptorRaw,
            row.senderAliasHint,
          ]),
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ]

    const processorAliasTexts = [
      ...new Set(
        [
          ...signalRows.map((row) => row.processorNameCandidate),
          ...merchantObservationRows.map((row) => row.processorNameHint),
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ]

    const institutionAliasTexts = [
      ...new Set(
        paymentInstrumentObservationRows
          .map((row) => row.issuerAliasHint?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ]

    const recurringRows =
      touchedEventIds.length > 0
        ? await tx
            .select({ id: recurringObligations.id })
            .from(recurringObligations)
            .where(inArray(recurringObligations.sourceEventId, touchedEventIds))
        : []
    const recurringIds = recurringRows.map((row) => row.id)

    const reviewRows =
      rawDocumentIds.length > 0 || signalIds.length > 0 || touchedEventIds.length > 0
        ? await tx
            .select({ id: reviewQueueItems.id })
            .from(reviewQueueItems)
            .where(
              or(
                inArray(reviewQueueItems.rawDocumentId, rawDocumentIds),
                signalIds.length > 0
                  ? inArray(reviewQueueItems.extractedSignalId, signalIds)
                  : undefined,
                touchedEventIds.length > 0
                  ? inArray(reviewQueueItems.financialEventId, touchedEventIds)
                  : undefined,
              )!,
            )
        : []

    const modelRunRows =
      rawDocumentIds.length > 0 || touchedEventIds.length > 0
        ? await tx
            .select({ id: modelRuns.id })
            .from(modelRuns)
            .where(
              or(
                inArray(modelRuns.rawDocumentId, rawDocumentIds),
                touchedEventIds.length > 0
                  ? inArray(modelRuns.financialEventId, touchedEventIds)
                  : undefined,
              )!,
            )
        : []

    const balanceObservationRows =
      rawDocumentIds.length > 0 || signalIds.length > 0
        ? await tx
            .select({ id: balanceObservations.id })
            .from(balanceObservations)
            .where(
              or(
                inArray(balanceObservations.rawDocumentId, rawDocumentIds),
                signalIds.length > 0
                  ? inArray(balanceObservations.extractedSignalId, signalIds)
                  : undefined,
              )!,
            )
        : []
    const balanceObservationIds = balanceObservationRows.map((row) => row.id)
    const balanceAnchorRows =
      balanceObservationIds.length > 0
        ? await tx
            .select({ id: balanceAnchors.id })
            .from(balanceAnchors)
            .where(inArray(balanceAnchors.sourceObservationId, balanceObservationIds))
        : []

    const memoryRows =
      touchedMerchantIds.length > 0 || aliasTexts.length > 0
        ? await tx
            .select({ id: memoryFacts.id })
            .from(memoryFacts)
            .where(
              and(
                eq(memoryFacts.userId, input.userId),
                eq(memoryFacts.source, "automation"),
                or(
                  touchedMerchantIds.length > 0
                    ? inArray(memoryFacts.subjectId, touchedMerchantIds)
                    : undefined,
                  aliasTexts.length > 0 ? inArray(memoryFacts.key, aliasTexts) : undefined,
                )!,
              ),
            )
        : []

    const merchantAliasRows =
      touchedMerchantIds.length > 0 && aliasTexts.length > 0
        ? await tx
            .select({ id: merchantAliases.id })
            .from(merchantAliases)
            .where(
              and(
                inArray(merchantAliases.merchantId, touchedMerchantIds),
                inArray(merchantAliases.aliasText, aliasTexts),
              ),
            )
        : []

    const financialInstitutionAliasRows =
      touchedFinancialInstitutionIds.length > 0 && institutionAliasTexts.length > 0
        ? await tx
            .select({ id: financialInstitutionAliases.id })
            .from(financialInstitutionAliases)
            .where(
              and(
                inArray(
                  financialInstitutionAliases.financialInstitutionId,
                  touchedFinancialInstitutionIds,
                ),
                inArray(financialInstitutionAliases.aliasText, institutionAliasTexts),
              ),
            )
        : []

    const paymentProcessorAliasRows =
      touchedPaymentProcessorIds.length > 0 && processorAliasTexts.length > 0
        ? await tx
            .select({ id: paymentProcessorAliases.id })
            .from(paymentProcessorAliases)
            .where(
              and(
                inArray(paymentProcessorAliases.paymentProcessorId, touchedPaymentProcessorIds),
                inArray(paymentProcessorAliases.aliasText, processorAliasTexts),
              ),
            )
        : []

    if (memoryRows.length > 0) {
      await tx.delete(memoryFacts).where(
        inArray(
          memoryFacts.id,
          memoryRows.map((row) => row.id),
        ),
      )
    }

    if (reviewRows.length > 0) {
      await tx.delete(reviewQueueItems).where(
        inArray(
          reviewQueueItems.id,
          reviewRows.map((row) => row.id),
        ),
      )
    }

    if (recurringIds.length > 0) {
      await tx
        .delete(emiPlans)
        .where(inArray(emiPlans.recurringObligationId, recurringIds))
      await tx
        .delete(recurringObligations)
        .where(inArray(recurringObligations.id, recurringIds))
    }

    if (merchantAliasRows.length > 0) {
      await tx.delete(merchantAliases).where(
        inArray(
          merchantAliases.id,
          merchantAliasRows.map((row) => row.id),
        ),
      )
    }

    if (financialInstitutionAliasRows.length > 0) {
      await tx.delete(financialInstitutionAliases).where(
        inArray(
          financialInstitutionAliases.id,
          financialInstitutionAliasRows.map((row) => row.id),
        ),
      )
    }

    if (paymentProcessorAliasRows.length > 0) {
      await tx.delete(paymentProcessorAliases).where(
        inArray(
          paymentProcessorAliases.id,
          paymentProcessorAliasRows.map((row) => row.id),
        ),
      )
    }

    if (paymentInstrumentObservationRows.length > 0) {
      await tx.delete(paymentInstrumentObservations).where(
        inArray(
          paymentInstrumentObservations.id,
          paymentInstrumentObservationRows.map((row) => row.id),
        ),
      )
    }

    if (merchantObservationRows.length > 0) {
      await tx.delete(merchantObservations).where(
        inArray(
          merchantObservations.id,
          merchantObservationRows.map((row) => row.id),
        ),
      )
    }

    if (balanceAnchorRows.length > 0) {
      await tx.delete(balanceAnchors).where(
        inArray(
          balanceAnchors.id,
          balanceAnchorRows.map((row) => row.id),
        ),
      )
    }

    if (balanceObservationRows.length > 0) {
      await tx.delete(balanceObservations).where(
        inArray(
          balanceObservations.id,
          balanceObservationRows.map((row) => row.id),
        ),
      )
    }

    if (modelRunRows.length > 0) {
      await tx.delete(modelRuns).where(
        inArray(
          modelRuns.id,
          modelRunRows.map((row) => row.id),
        ),
      )
    }

    if (relevanceCacheRows.length > 0) {
      await tx.delete(gmailMessageRelevanceCaches).where(
        inArray(
          gmailMessageRelevanceCaches.id,
          relevanceCacheRows.map((row) => row.id),
        ),
      )
    }

    if (sourceRows.length > 0) {
      await tx.delete(financialEventSources).where(
        inArray(
          financialEventSources.id,
          sourceRows.map((row) => row.id),
        ),
      )
    }

    await tx.delete(rawDocuments).where(inArray(rawDocuments.id, rawDocumentIds))

    const eventIdsWithoutSources =
      touchedEventIds.length > 0
        ? await tx
            .select({ id: financialEvents.id })
            .from(financialEvents)
            .where(
              and(
                inArray(financialEvents.id, touchedEventIds),
                not(
                  inArray(
                    financialEvents.id,
                    tx
                      .select({ id: financialEventSources.financialEventId })
                      .from(financialEventSources),
                  ),
                ),
              ),
            )
        : []

    if (eventIdsWithoutSources.length > 0) {
      const orphanedEventIds = eventIdsWithoutSources.map((row) => row.id)
      await tx.delete(financialEvents).where(inArray(financialEvents.id, orphanedEventIds))
    }

    const feedbackTargetFilters = [
      eventIdsWithoutSources.length > 0
        ? and(
            eq(feedbackEvents.targetType, "financial_event"),
            inArray(
              feedbackEvents.targetId,
              eventIdsWithoutSources.map((row) => row.id),
            ),
          )
        : undefined,
      recurringIds.length > 0
        ? and(
            eq(feedbackEvents.targetType, "recurring_obligation"),
            inArray(feedbackEvents.targetId, recurringIds),
          )
        : undefined,
      reviewRows.length > 0
        ? and(
            eq(feedbackEvents.targetType, "review_queue_item"),
            inArray(
              feedbackEvents.targetId,
              reviewRows.map((row) => row.id),
            ),
          )
        : undefined,
      memoryRows.length > 0
        ? and(
            eq(feedbackEvents.targetType, "memory_fact"),
            inArray(
              feedbackEvents.targetId,
              memoryRows.map((row) => row.id),
            ),
          )
        : undefined,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value))

    const feedbackRows =
      feedbackTargetFilters.length > 0
        ? await tx
            .select({ id: feedbackEvents.id })
            .from(feedbackEvents)
            .where(
              and(
                eq(feedbackEvents.userId, input.userId),
                or(...feedbackTargetFilters),
              ),
            )
        : []

    if (feedbackRows.length > 0) {
      await tx.delete(feedbackEvents).where(
        inArray(
          feedbackEvents.id,
          feedbackRows.map((row) => row.id),
        ),
      )
    }

    return {
      deletedRelevanceCacheRows: relevanceCacheRows.length,
      deletedRawDocuments: rawDocumentIds.length,
      deletedAttachments: attachments.length,
      deletedStorageObjects: [...new Set(storageKeys)].length,
      deletedExtractedSignals: signalIds.length,
      deletedFinancialEvents: eventIdsWithoutSources.length,
      deletedReviewItems: reviewRows.length,
      deletedModelRuns: modelRunRows.length,
      deletedMerchantObservations: merchantObservationRows.length,
      deletedFeedbackEvents: feedbackRows.length,
      deletedRecurringObligations: recurringRows.length,
      deletedEmiPlans: recurringIds.length,
      deletedMerchantAliases: merchantAliasRows.length,
      deletedFinancialInstitutionAliases: financialInstitutionAliasRows.length,
      deletedPaymentProcessorAliases: paymentProcessorAliasRows.length,
      deletedMemoryFacts: memoryRows.length,
      deletedPaymentInstrumentObservations: paymentInstrumentObservationRows.length,
      deletedBalanceObservations: balanceObservationRows.length,
      deletedBalanceAnchors: balanceAnchorRows.length,
      touchedMerchantIds,
      touchedPaymentInstrumentIds,
      touchedPaymentProcessorIds,
      touchedFinancialInstitutionIds,
      storageKeys: [...new Set(storageKeys)],
    }
  })
}
