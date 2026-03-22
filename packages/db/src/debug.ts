import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm"

import { db } from "./client"
import {
  balanceObservations,
  documentAttachments,
  emailSyncCursors,
  extractedSignals,
  feedbackEvents,
  financialEventSources,
  financialEvents,
  financialEventValuations,
  financialInstitutionAliases,
  financialInstitutions,
  incomeStreams,
  jobRuns,
  merchantObservations,
  memoryFacts,
  merchants,
  modelRuns,
  oauthConnections,
  paymentProcessorAliases,
  paymentProcessors,
  paymentInstrumentObservations,
  paymentInstruments,
  rawDocuments,
  recurringObligations,
  reviewQueueItems,
  userSettings,
  users,
} from "./schema"
import { emiPlans } from "./schema/recurring"

type DiagnosticStage = "sync" | "extraction" | "reconciliation"
export type DiagnosticFilter = "all" | DiagnosticStage | "failures"

function getJobRunStage(queueName: string, jobName: string): DiagnosticStage {
  const value = `${queueName}:${jobName}`.toLowerCase()

  if (
    value.includes("email") ||
    value.includes("backfill") ||
    value.includes("sync")
  ) {
    return "sync"
  }

  if (
    value.includes("document") ||
    value.includes("extract") ||
    value.includes("ai")
  ) {
    return "extraction"
  }

  return "reconciliation"
}

function includeTimelineEntry(
  filter: DiagnosticFilter,
  input: { stage: DiagnosticStage; status: string },
) {
  if (filter === "all") {
    return true
  }

  if (filter === "failures") {
    return input.status === "failed"
  }

  return input.stage === filter
}

export async function getPrivateStorageArtifactsForUser(userId: string) {
  const documents = await db
    .select({
      id: rawDocuments.id,
      bodyHtmlStorageKey: rawDocuments.bodyHtmlStorageKey,
    })
    .from(rawDocuments)
    .where(eq(rawDocuments.userId, userId))

  const rawDocumentIds = documents.map((document) => document.id)
  const attachments =
    rawDocumentIds.length > 0
      ? await db
          .select({
            storageKey: documentAttachments.storageKey,
          })
          .from(documentAttachments)
          .where(inArray(documentAttachments.rawDocumentId, rawDocumentIds))
      : []
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

export async function getAuthUserProfile(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return user ?? null
}

export async function resetUserDatabaseState(input: {
  userId: string
}) {
  const artifacts = await getPrivateStorageArtifactsForUser(input.userId)

  return db.transaction(async (tx) => {
    const [
      recurringRows,
      incomeRows,
      reviewRows,
      eventRows,
      signalRows,
      modelRunRows,
      merchantRows,
      merchantObservationRows,
      paymentProcessorRows,
      institutionRows,
      observationRows,
      paymentInstrumentRows,
      settingsRows,
      oauthRows,
      cursorRows,
      jobRunRows,
      feedbackRows,
    ] = await Promise.all([
      tx
        .select({ id: recurringObligations.id })
        .from(recurringObligations)
        .where(eq(recurringObligations.userId, input.userId)),
      tx
        .select({ id: incomeStreams.id })
        .from(incomeStreams)
        .where(eq(incomeStreams.userId, input.userId)),
      tx
        .select({ id: reviewQueueItems.id })
        .from(reviewQueueItems)
        .where(eq(reviewQueueItems.userId, input.userId)),
      tx
        .select({ id: financialEvents.id })
        .from(financialEvents)
        .where(eq(financialEvents.userId, input.userId)),
      tx
        .select({ id: extractedSignals.id })
        .from(extractedSignals)
        .where(eq(extractedSignals.userId, input.userId)),
      tx
        .select({ id: modelRuns.id })
        .from(modelRuns)
        .where(eq(modelRuns.userId, input.userId)),
      tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, input.userId)),
      tx
        .select({ id: merchantObservations.id })
        .from(merchantObservations)
        .where(eq(merchantObservations.userId, input.userId)),
      tx
        .select({ id: paymentProcessors.id })
        .from(paymentProcessors)
        .where(eq(paymentProcessors.userId, input.userId)),
      tx
        .select({ id: financialInstitutions.id })
        .from(financialInstitutions)
        .where(eq(financialInstitutions.userId, input.userId)),
      tx
        .select({ id: paymentInstrumentObservations.id })
        .from(paymentInstrumentObservations)
        .where(eq(paymentInstrumentObservations.userId, input.userId)),
      tx
        .select({ id: paymentInstruments.id })
        .from(paymentInstruments)
        .where(eq(paymentInstruments.userId, input.userId)),
      tx
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, input.userId)),
      tx
        .select({ id: oauthConnections.id })
        .from(oauthConnections)
        .where(eq(oauthConnections.userId, input.userId)),
      tx
        .select({ id: emailSyncCursors.id })
        .from(emailSyncCursors)
        .innerJoin(
          oauthConnections,
          eq(emailSyncCursors.oauthConnectionId, oauthConnections.id),
        )
        .where(eq(oauthConnections.userId, input.userId)),
      tx
        .select({ id: jobRuns.id })
        .from(jobRuns)
        .where(sql`${jobRuns.payloadJson} ->> 'userId' = ${input.userId}`),
      tx
        .select({ id: feedbackEvents.id })
        .from(feedbackEvents)
        .where(eq(feedbackEvents.userId, input.userId)),
      tx.select({ id: memoryFacts.id }).from(memoryFacts).where(eq(memoryFacts.userId, input.userId)),
    ])

    const recurringIds = recurringRows.map((row) => row.id)
    const eventIds = eventRows.map((row) => row.id)
    const paymentProcessorIds = paymentProcessorRows.map((row) => row.id)
    const institutionIds = institutionRows.map((row) => row.id)
    const oauthIds = oauthRows.map((row) => row.id)

    if (recurringIds.length > 0) {
      await tx
        .delete(emiPlans)
        .where(inArray(emiPlans.recurringObligationId, recurringIds))
    }

    await tx.delete(reviewQueueItems).where(eq(reviewQueueItems.userId, input.userId))
    await tx.delete(incomeStreams).where(eq(incomeStreams.userId, input.userId))
    await tx
      .delete(recurringObligations)
      .where(eq(recurringObligations.userId, input.userId))

    if (eventIds.length > 0) {
      await tx
        .delete(financialEventValuations)
        .where(inArray(financialEventValuations.financialEventId, eventIds))
      await tx
        .delete(financialEventSources)
        .where(inArray(financialEventSources.financialEventId, eventIds))
    }

    if (artifacts.rawDocumentIds.length > 0) {
      await tx
        .delete(financialEventSources)
        .where(inArray(financialEventSources.rawDocumentId, artifacts.rawDocumentIds))
    }

    await tx
      .delete(merchantObservations)
      .where(eq(merchantObservations.userId, input.userId))
    await tx
      .delete(paymentInstrumentObservations)
      .where(eq(paymentInstrumentObservations.userId, input.userId))
    await tx.delete(financialEvents).where(eq(financialEvents.userId, input.userId))
    await tx.delete(extractedSignals).where(eq(extractedSignals.userId, input.userId))
    await tx.delete(modelRuns).where(eq(modelRuns.userId, input.userId))
    await tx.delete(rawDocuments).where(eq(rawDocuments.userId, input.userId))
    await tx.delete(paymentInstruments).where(eq(paymentInstruments.userId, input.userId))
    await tx.delete(feedbackEvents).where(eq(feedbackEvents.userId, input.userId))
    await tx.delete(memoryFacts).where(eq(memoryFacts.userId, input.userId))

    if (paymentProcessorIds.length > 0) {
      await tx
        .delete(paymentProcessorAliases)
        .where(inArray(paymentProcessorAliases.paymentProcessorId, paymentProcessorIds))
    }

    await tx
      .delete(paymentProcessors)
      .where(eq(paymentProcessors.userId, input.userId))

    if (institutionIds.length > 0) {
      await tx
        .delete(financialInstitutionAliases)
        .where(
          inArray(
            financialInstitutionAliases.financialInstitutionId,
            institutionIds,
          ),
        )
    }

    await tx
      .delete(financialInstitutions)
      .where(eq(financialInstitutions.userId, input.userId))
    await tx.delete(merchants).where(eq(merchants.userId, input.userId))
    await tx.delete(userSettings).where(eq(userSettings.userId, input.userId))
    await tx
      .delete(jobRuns)
      .where(sql`${jobRuns.payloadJson} ->> 'userId' = ${input.userId}`)

    if (oauthIds.length > 0) {
      await tx
        .update(emailSyncCursors)
        .set({
          providerCursor: null,
          backfillStartedAt: null,
          backfillCompletedAt: null,
          lastSeenMessageAt: null,
          updatedAt: new Date(),
        })
        .where(inArray(emailSyncCursors.oauthConnectionId, oauthIds))

      await tx
        .update(oauthConnections)
        .set({
          status: "active",
          lastSuccessfulSyncAt: null,
          lastFailedSyncAt: null,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.userId, input.userId))
    }

    return {
      deletedRawDocuments: artifacts.rawDocumentCount,
      deletedAttachments: artifacts.attachmentCount,
      deletedStorageObjects: artifacts.storageKeys.length,
      deletedRecurringObligations: recurringRows.length,
      deletedIncomeStreams: incomeRows.length,
      deletedReviewItems: reviewRows.length,
      deletedFinancialEvents: eventRows.length,
      deletedExtractedSignals: signalRows.length,
      deletedModelRuns: modelRunRows.length,
      deletedFeedbackEvents: feedbackRows.length,
      deletedMerchants: merchantRows.length,
      deletedMerchantObservations: merchantObservationRows.length,
      deletedPaymentProcessors: paymentProcessorRows.length,
      deletedFinancialInstitutions: institutionRows.length,
      deletedPaymentInstrumentObservations: observationRows.length,
      deletedPaymentInstruments: paymentInstrumentRows.length,
      deletedUserSettings: settingsRows.length,
      deletedJobRuns: jobRunRows.length,
      resetOauthConnections: oauthRows.length,
      resetSyncCursors: cursorRows.length,
    }
  })
}

export async function listDiagnosticTimelineForUser(input: {
  userId: string
  filter?: DiagnosticFilter
  limit?: number
}) {
  const filter = input.filter ?? "all"
  const itemLimit = Math.max(input.limit ?? 60, 30)

  const [
    userJobRuns,
    userModelRuns,
    userRawDocuments,
    userSignals,
    userEventLinks,
  ] = await Promise.all([
    db
      .select()
      .from(jobRuns)
      .where(sql`${jobRuns.payloadJson} ->> 'userId' = ${input.userId}`)
      .orderBy(desc(jobRuns.createdAt))
      .limit(itemLimit),
    db
      .select()
      .from(modelRuns)
      .where(eq(modelRuns.userId, input.userId))
      .orderBy(desc(modelRuns.createdAt))
      .limit(itemLimit),
    db
      .select()
      .from(rawDocuments)
      .where(eq(rawDocuments.userId, input.userId))
      .orderBy(desc(rawDocuments.messageTimestamp))
      .limit(itemLimit),
    db
      .select()
      .from(extractedSignals)
      .where(eq(extractedSignals.userId, input.userId))
      .orderBy(desc(extractedSignals.createdAt))
      .limit(itemLimit),
    db
      .select({
        sourceId: financialEventSources.id,
        createdAt: financialEventSources.createdAt,
        linkReason: financialEventSources.linkReason,
        eventId: financialEvents.id,
        eventType: financialEvents.eventType,
        rawDocumentId: rawDocuments.id,
        rawDocumentSubject: rawDocuments.subject,
        signalId: extractedSignals.id,
        signalType: extractedSignals.signalType,
      })
      .from(financialEventSources)
      .innerJoin(
        financialEvents,
        eq(financialEventSources.financialEventId, financialEvents.id),
      )
      .leftJoin(rawDocuments, eq(financialEventSources.rawDocumentId, rawDocuments.id))
      .leftJoin(
        extractedSignals,
        eq(financialEventSources.extractedSignalId, extractedSignals.id),
      )
      .where(eq(financialEvents.userId, input.userId))
      .orderBy(desc(financialEventSources.createdAt))
      .limit(itemLimit),
  ])

  const timeline = [
    ...userJobRuns.map((jobRun) => {
      const stage = getJobRunStage(jobRun.queueName, jobRun.jobName)
      return {
        id: `job-run:${jobRun.id}`,
        kind: "job_run" as const,
        stage,
        status: jobRun.status,
        occurredAt: jobRun.createdAt,
        title: `${jobRun.jobName} · ${jobRun.status}`,
        description: `${jobRun.queueName}${jobRun.errorMessage ? ` · ${jobRun.errorMessage}` : ""}`,
        meta: [
          `attempts ${jobRun.attemptCount}`,
          jobRun.jobKey ?? "no job key",
        ],
        traceEventId:
          typeof jobRun.payloadJson?.financialEventId === "string"
            ? jobRun.payloadJson.financialEventId
            : null,
      }
    }),
    ...userModelRuns.map((modelRun) => ({
      id: `model-run:${modelRun.id}`,
      kind: "model_run" as const,
      stage: "extraction" as const,
      status: modelRun.status,
      occurredAt: modelRun.createdAt,
      title: `${modelRun.taskType} · ${modelRun.status}`,
      description: `${modelRun.modelName}${modelRun.errorMessage ? ` · ${modelRun.errorMessage}` : ""}`,
      meta: [
        modelRun.provider,
        modelRun.requestId ?? "no request id",
        modelRun.rawDocumentId ?? "no raw document",
      ],
      traceEventId: null,
    })),
    ...userRawDocuments.map((document) => ({
      id: `raw-document:${document.id}`,
      kind: "raw_document" as const,
      stage: "sync" as const,
      status: "accepted",
      occurredAt: document.messageTimestamp,
      title: document.subject ?? "(no subject)",
      description: document.fromAddress ?? "Unknown sender",
      meta: [
        document.providerMessageId,
        document.threadId ?? "no thread",
        document.relevanceLabel ?? "unknown relevance",
      ],
      traceEventId: null,
    })),
    ...userSignals.map((signal) => ({
      id: `signal:${signal.id}`,
      kind: "signal" as const,
      stage: "extraction" as const,
      status: signal.status,
      occurredAt: signal.createdAt,
      title: signal.signalType,
      description: `${signal.candidateEventType ?? "no candidate"} · confidence ${Math.round(Number(signal.confidence) * 100)}%`,
      meta: [
        signal.rawDocumentId,
        signal.currency ?? "no currency",
        signal.eventDate ?? "no event date",
      ],
      traceEventId: null,
    })),
    ...userEventLinks.map((link) => ({
      id: `event-link:${link.sourceId}`,
      kind: "event_link" as const,
      stage: "reconciliation" as const,
      status: "linked",
      occurredAt: link.createdAt,
      title: `${link.eventType} linked from ${link.signalType ?? "source"}`,
      description: `${link.linkReason} · ${link.rawDocumentSubject ?? "no subject"}`,
      meta: [
        link.eventId,
        link.rawDocumentId ?? "no raw document",
        link.signalId ?? "no signal",
      ],
      traceEventId: link.eventId,
    })),
  ]
    .filter((item) =>
      includeTimelineEntry(filter, { stage: item.stage, status: item.status }),
    )
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, input.limit ?? 60)

  return timeline
}

export async function getFinancialEventTraceForUser(input: {
  userId: string
  eventId: string
}) {
  const [eventRow] = await db
    .select({
      event: financialEvents,
      merchant: merchants,
      paymentInstrument: paymentInstruments,
      paymentProcessor: paymentProcessors,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(
      paymentInstruments,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id),
    )
    .leftJoin(
      paymentProcessors,
      eq(financialEvents.paymentProcessorId, paymentProcessors.id),
    )
    .where(and(eq(financialEvents.userId, input.userId), eq(financialEvents.id, input.eventId)))
    .limit(1)

  if (!eventRow) {
    return null
  }

  const traceRows = await db
    .select({
      source: financialEventSources,
      rawDocument: rawDocuments,
      extractedSignal: extractedSignals,
    })
    .from(financialEventSources)
    .leftJoin(rawDocuments, eq(financialEventSources.rawDocumentId, rawDocuments.id))
    .leftJoin(
      extractedSignals,
      eq(financialEventSources.extractedSignalId, extractedSignals.id),
    )
    .where(eq(financialEventSources.financialEventId, input.eventId))
    .orderBy(asc(financialEventSources.createdAt))

  const traceSignalIds = traceRows
    .map((row) => row.extractedSignal?.id ?? null)
    .filter((value): value is string => Boolean(value))
  const traceRawDocumentIds = traceRows
    .map((row) => row.rawDocument?.id ?? null)
    .filter((value): value is string => Boolean(value))

  const rawDocumentIds = [...new Set(
    traceRows
      .map((row) => row.rawDocument?.id ?? row.extractedSignal?.rawDocumentId ?? null)
      .filter((value): value is string => Boolean(value)),
  )]

  const relatedModelRuns = await db
    .select()
    .from(modelRuns)
    .where(
      rawDocumentIds.length > 0
        ? or(
            inArray(modelRuns.rawDocumentId, rawDocumentIds),
            eq(modelRuns.financialEventId, input.eventId),
          )
        : eq(modelRuns.financialEventId, input.eventId),
    )
    .orderBy(asc(modelRuns.createdAt))

  const modelRunsByDocumentId = new Map<string, typeof relatedModelRuns>()
  const eventModelRuns: typeof relatedModelRuns = []

  const balanceObservationRows =
    traceSignalIds.length > 0 || traceRawDocumentIds.length > 0
      ? await db
          .select({
            observation: balanceObservations,
            paymentInstrument: paymentInstruments,
          })
          .from(balanceObservations)
          .leftJoin(
            paymentInstruments,
            eq(balanceObservations.paymentInstrumentId, paymentInstruments.id),
          )
          .where(
            traceSignalIds.length > 0 && traceRawDocumentIds.length > 0
              ? or(
                  inArray(balanceObservations.extractedSignalId, traceSignalIds),
                  inArray(balanceObservations.rawDocumentId, traceRawDocumentIds),
                )
              : traceSignalIds.length > 0
                ? inArray(balanceObservations.extractedSignalId, traceSignalIds)
                : inArray(balanceObservations.rawDocumentId, traceRawDocumentIds),
          )
          .orderBy(desc(balanceObservations.observedAt))
      : []

  const balanceObservationsBySignalId = new Map<
    string,
    typeof balanceObservationRows
  >()
  const balanceObservationsByRawDocumentId = new Map<
    string,
    typeof balanceObservationRows
  >()

  for (const modelRun of relatedModelRuns) {
    if (modelRun.financialEventId === input.eventId) {
      eventModelRuns.push(modelRun)
      continue
    }

    if (!modelRun.rawDocumentId) {
      continue
    }

    const existing = modelRunsByDocumentId.get(modelRun.rawDocumentId) ?? []
    existing.push(modelRun)
    modelRunsByDocumentId.set(modelRun.rawDocumentId, existing)
  }

  for (const row of balanceObservationRows) {
    if (row.observation.extractedSignalId) {
      const existing =
        balanceObservationsBySignalId.get(row.observation.extractedSignalId) ?? []
      existing.push(row)
      balanceObservationsBySignalId.set(row.observation.extractedSignalId, existing)
    }

    if (row.observation.rawDocumentId) {
      const existing =
        balanceObservationsByRawDocumentId.get(row.observation.rawDocumentId) ?? []
      existing.push(row)
      balanceObservationsByRawDocumentId.set(row.observation.rawDocumentId, existing)
    }
  }

  return {
    ...eventRow,
    eventModelRuns,
    traces: traceRows.map((row) => {
      const rawDocumentId = row.rawDocument?.id ?? row.extractedSignal?.rawDocumentId ?? null

      return {
        ...row,
        modelRuns:
          rawDocumentId ? modelRunsByDocumentId.get(rawDocumentId) ?? [] : [],
        balanceObservations: [
          ...(row.extractedSignal?.id
            ? balanceObservationsBySignalId.get(row.extractedSignal.id) ?? []
            : []),
          ...(rawDocumentId
            ? balanceObservationsByRawDocumentId.get(rawDocumentId) ?? []
            : []),
        ].filter(
          (value, index, array) =>
            array.findIndex((candidate) => candidate.observation.id === value.observation.id) ===
            index,
        ),
      }
    }),
  }
}
