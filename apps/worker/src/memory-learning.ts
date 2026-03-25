import { and, desc, eq } from "drizzle-orm"

import {
  createModelRun,
  categories,
  db,
  buildMemoryFactSummarySourceHash,
  expireUnpinnedMemoryFactsForUser,
  feedbackEvents,
  financialEvents,
  financialInstitutionAliases,
  financialInstitutions,
  getFeedbackEventById,
  incomeStreams,
  memoryFacts,
  merchantAliases,
  merchants,
  normalizeMemoryKey,
  paymentInstruments,
  paymentProcessors,
  recurringObligations,
  upsertMemoryFact,
  updateMemoryFact,
  updateModelRun,
  type FeedbackEventSelect,
  type MemoryFactInsert,
  type MemoryFactSelect,
  type ModelRunSelect,
} from "@workspace/db"
import {
  aiModels,
  aiPromptVersions,
  summarizeMemoryFactsWithAi,
} from "@workspace/ai"
import { createLogger } from "@workspace/observability"

const logger = createLogger("worker.memory-learning")

const LEARNED_MEMORY_TTL_DAYS = 180

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

type MemoryRebuildReason =
  | "feedback"
  | "review_resolution"
  | "automation_refresh"
  | "manual_refresh"
  | "startup_rebuild"

type RebuildOptions = {
  userId: string
  reason: MemoryRebuildReason
  sourceReferenceId?: string | null
}

type CurrentFactMaps = {
  pinnedKeys: Set<string>
  disabledKeys: Set<string>
}

function buildFactIdentity(factType: string, key: string) {
  return `${factType}::${key}`
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function groupById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]))
}

async function loadCurrentFactMaps(userId: string): Promise<CurrentFactMaps> {
  const [facts, memoryFeedbackRows] = await Promise.all([
    db
      .select()
      .from(memoryFacts)
      .where(eq(memoryFacts.userId, userId)),
    db
      .select()
      .from(feedbackEvents)
      .where(
        and(
          eq(feedbackEvents.userId, userId),
          eq(feedbackEvents.targetType, "memory_fact"),
        ),
      )
      .orderBy(desc(feedbackEvents.createdAt)),
  ])

  const factsById = new Map(facts.map((fact) => [fact.id, fact]))
  const pinnedKeys = new Set<string>()
  const disabledKeys = new Set<string>()

  for (const fact of facts) {
    if (fact.isUserPinned) {
      pinnedKeys.add(buildFactIdentity(fact.factType, fact.key))
    }
  }

  for (const feedback of memoryFeedbackRows) {
    const fact = factsById.get(feedback.targetId)
    const factType = fact?.factType ?? asString(feedback.metadataJson?.factType)
    const key = fact?.key ?? normalizeMemoryKey(asString(feedback.metadataJson?.key))

    if (!factType || !key) {
      continue
    }

    const identity = buildFactIdentity(factType, key)

    if (feedback.correctionType === "pin_memory") {
      pinnedKeys.add(identity)
      disabledKeys.delete(identity)
    } else if (feedback.correctionType === "unpin_memory") {
      pinnedKeys.delete(identity)
    } else if (feedback.correctionType === "expire_memory") {
      disabledKeys.add(identity)
      pinnedKeys.delete(identity)
    } else if (feedback.correctionType === "restore_memory") {
      disabledKeys.delete(identity)
    }
  }

  return { pinnedKeys, disabledKeys }
}

async function upsertDerivedFact(
  input: MemoryFactInsert & {
    currentFactMaps: CurrentFactMaps
  },
) {
  const identity = buildFactIdentity(input.factType, input.key)

  if (input.currentFactMaps.disabledKeys.has(identity)) {
    return null
  }

  if (input.currentFactMaps.pinnedKeys.has(identity) && input.source !== "feedback") {
    return null
  }

  return upsertMemoryFact(input)
}

async function summarizeMemoryFactsForUser(input: {
  userId: string
  facts: MemoryFactSelect[]
}) {
  const candidates = input.facts.filter((fact) => {
    if (fact.authoredText) {
      return false
    }

    if (fact.source !== "automation" && fact.source !== "system_rebuild") {
      return false
    }

    const expectedSummarySourceHash = buildMemoryFactSummarySourceHash({
      factType: fact.factType,
      key: fact.key,
      valueJson: fact.valueJson ?? {},
      promptVersion: aiPromptVersions.financeMemorySummarizer,
      modelName: aiModels.financeMemorySummarizer,
    })

    return fact.summarySourceHash !== expectedSummarySourceHash
  })

  if (candidates.length === 0) {
    return
  }

  const skippedCount = input.facts.length - candidates.length
  if (skippedCount > 0) {
    logger.info("memory_summary_skipped_unchanged", {
      userId: input.userId,
      skippedCount,
    })
  }

  const chunkSize = 10

  for (let index = 0; index < candidates.length; index += chunkSize) {
    const chunk = candidates.slice(index, index + chunkSize)
    let modelRun: ModelRunSelect | null = null

    try {
      modelRun = await createModelRun({
        userId: input.userId,
        taskType: "memory_summarization",
        provider: "ai-gateway",
        modelName: aiModels.financeMemorySummarizer,
        promptVersion: aiPromptVersions.financeMemorySummarizer,
        status: "running",
      })

      const summary = await summarizeMemoryFactsWithAi({
        facts: chunk.map((fact) => ({
          id: fact.id,
          factType: fact.factType,
          key: fact.key,
          valueJson: fact.valueJson ?? {},
        })),
      })

      for (const item of summary.result.summaries) {
        const target = chunk.find((fact) => fact.id === item.id)
        if (!target) {
          continue
        }

        const summarySourceHash = buildMemoryFactSummarySourceHash({
          factType: target.factType,
          key: target.key,
          valueJson: target.valueJson ?? {},
          promptVersion: aiPromptVersions.financeMemorySummarizer,
          modelName: aiModels.financeMemorySummarizer,
        })

        await updateMemoryFact(target.id, {
          summaryText: item.summaryText,
          detailText: item.detailText ?? null,
          summarySourceHash,
          summaryModelRunId: modelRun.id,
          summarizedAt: new Date(),
        })
      }

      await updateModelRun(modelRun.id, {
        status: "succeeded",
        inputTokens: summary.metadata.inputTokens,
        outputTokens: summary.metadata.outputTokens,
        latencyMs: summary.metadata.latencyMs,
        requestId: summary.metadata.requestId,
        resultJson: {
          recovery: summary.recovery,
          summaryCount: summary.result.summaries.length,
        },
      })
    } catch (error) {
      logger.warn("Memory summarization failed; keeping deterministic summaries", {
        userId: input.userId,
        factCount: chunk.length,
        error: error instanceof Error ? error.message : String(error),
      })

      if (modelRun) {
        await updateModelRun(modelRun.id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}

export async function processFeedbackMemory(feedbackEventId: string) {
  const feedback = await getFeedbackEventById(feedbackEventId)

  if (!feedback) {
    return { action: "skipped", reason: "missing_feedback_event" as const }
  }

  if (feedback.targetType === "memory_fact") {
    return { action: "skipped", reason: "memory_fact_feedback_is_direct" as const }
  }

  await rebuildMemoryForUser({
    userId: feedback.userId,
    reason:
      feedback.sourceSurface === "review"
        ? "review_resolution"
        : "feedback",
    sourceReferenceId: feedback.id,
  })

  return { action: "rebuilt", userId: feedback.userId } as const
}

function addFeedbackDerivedMerchantFacts(input: {
  feedback: FeedbackEventSelect
  eventMap: Map<string, typeof financialEvents.$inferSelect>
  merchantMap: Map<string, typeof merchants.$inferSelect>
  categoryMap: Map<string, typeof categories.$inferSelect>
  instrumentMap: Map<string, typeof paymentInstruments.$inferSelect>
  currentFactMaps: CurrentFactMaps
}) {
  const newValue = (input.feedback.newValueJson ?? {}) as Record<string, unknown>
  const event = input.eventMap.get(input.feedback.targetId)
  const merchantId =
    asString(newValue.merchantId) ??
    (input.feedback.targetType === "merchant" ? input.feedback.targetId : event?.merchantId ?? null)
  const merchant = merchantId ? input.merchantMap.get(merchantId) : null

  if (!merchant) {
    return [] as Promise<MemoryFactSelect | null>[]
  }

  const merchantKey = normalizeMemoryKey(merchant.displayName)

  if (!merchantKey) {
    return [] as Promise<MemoryFactSelect | null>[]
  }

  const facts: Promise<MemoryFactSelect | null>[] = []
  const categoryId = asString(newValue.categoryId) ?? event?.categoryId ?? null
  const category = categoryId ? input.categoryMap.get(categoryId) : null

  if (category) {
    facts.push(
      upsertDerivedFact({
        userId: input.feedback.userId,
        factType: "merchant_category_default",
        subjectType: "merchant",
        subjectId: merchant.id,
        key: merchantKey,
        valueJson: {
          merchantId: merchant.id,
          merchantName: merchant.displayName,
          categoryId: category.id,
          categoryName: category.name,
          categorySlug: category.slug,
        },
        confidence: 1,
        source: input.feedback.sourceSurface === "review" ? "review" : "feedback",
        sourceReferenceId: input.feedback.id,
        isUserPinned: false,
        firstObservedAt: input.feedback.createdAt,
        lastConfirmedAt: input.feedback.createdAt,
        expiresAt: null,
        currentFactMaps: input.currentFactMaps,
      }),
    )
  }

  const eventType = asString(newValue.eventType) ?? event?.eventType ?? null

  if (eventType) {
    facts.push(
      upsertDerivedFact({
        userId: input.feedback.userId,
        factType: "merchant_preferred_event_type",
        subjectType: "merchant",
        subjectId: merchant.id,
        key: merchantKey,
        valueJson: {
          merchantId: merchant.id,
          merchantName: merchant.displayName,
          eventType,
        },
        confidence: 1,
        source: input.feedback.sourceSurface === "review" ? "review" : "feedback",
        sourceReferenceId: input.feedback.id,
        isUserPinned: false,
        firstObservedAt: input.feedback.createdAt,
        lastConfirmedAt: input.feedback.createdAt,
        expiresAt: null,
        currentFactMaps: input.currentFactMaps,
      }),
    )
  }

  const paymentInstrumentId = asString(newValue.paymentInstrumentId) ?? event?.paymentInstrumentId ?? null
  const instrument = paymentInstrumentId
    ? input.instrumentMap.get(paymentInstrumentId)
    : null

  if (instrument?.maskedIdentifier) {
      const instrumentKey = normalizeMemoryKey(instrument.maskedIdentifier)

    if (instrumentKey) {
      facts.push(
        upsertDerivedFact({
          userId: input.feedback.userId,
          factType: "instrument_type_preference",
          subjectType: "payment_instrument",
          subjectId: instrument.id,
          key: instrumentKey,
          valueJson: {
            paymentInstrumentId: instrument.id,
            displayName: instrument.displayName,
            instrumentType: instrument.instrumentType,
            maskedIdentifier: instrument.maskedIdentifier,
          },
          confidence: 1,
          source: input.feedback.sourceSurface === "review" ? "review" : "feedback",
          sourceReferenceId: input.feedback.id,
          isUserPinned: false,
          firstObservedAt: input.feedback.createdAt,
          lastConfirmedAt: input.feedback.createdAt,
          expiresAt: null,
          currentFactMaps: input.currentFactMaps,
        }),
      )
    }
  }

  return facts
}

export async function rebuildMemoryForUser(input: RebuildOptions) {
  const currentFactMaps = await loadCurrentFactMaps(input.userId)
  const now = new Date()
  const learnedExpiresAt = addDays(now, LEARNED_MEMORY_TTL_DAYS)

  await expireUnpinnedMemoryFactsForUser(input.userId, now)

  const [
    merchantRows,
    merchantAliasRows,
    categoryRows,
    institutionRows,
    institutionAliasRows,
    instrumentRows,
    processorRows,
    eventRows,
    recurringRows,
    incomeRows,
    feedbackRows,
  ] = await Promise.all([
    db.select().from(merchants).where(eq(merchants.userId, input.userId)),
    db.select().from(merchantAliases),
    db.select().from(categories).where(eq(categories.userId, input.userId)),
    db.select().from(financialInstitutions).where(eq(financialInstitutions.userId, input.userId)),
    db.select().from(financialInstitutionAliases),
    db.select().from(paymentInstruments).where(eq(paymentInstruments.userId, input.userId)),
    db.select().from(paymentProcessors).where(eq(paymentProcessors.userId, input.userId)),
    db
      .select()
      .from(financialEvents)
      .where(eq(financialEvents.userId, input.userId)),
    db.select().from(recurringObligations).where(eq(recurringObligations.userId, input.userId)),
    db.select().from(incomeStreams).where(eq(incomeStreams.userId, input.userId)),
    db
      .select()
      .from(feedbackEvents)
      .where(eq(feedbackEvents.userId, input.userId))
      .orderBy(desc(feedbackEvents.createdAt)),
  ])

  const merchantIds = merchantRows.map((row) => row.id)
  const institutionIds = institutionRows.map((row) => row.id)
  const merchantAliasFiltered = merchantIds.length
    ? merchantAliasRows.filter((row) => merchantIds.includes(row.merchantId))
    : []
  const institutionAliasFiltered = institutionIds.length
    ? institutionAliasRows.filter((row) =>
        institutionIds.includes(row.financialInstitutionId),
      )
    : []

  const merchantMap = groupById(merchantRows)
  const categoryMap = groupById(categoryRows)
  const instrumentMap = groupById(instrumentRows)
  const processorMap = groupById(processorRows)
  const eventMap = groupById(eventRows)
  const recurringMap = groupById(recurringRows)
  const incomeMap = groupById(incomeRows)

  const merchantAliasesByMerchantId = new Map<string, string[]>()

  for (const alias of merchantAliasFiltered) {
    const existing = merchantAliasesByMerchantId.get(alias.merchantId) ?? []
    existing.push(alias.aliasText)
    merchantAliasesByMerchantId.set(alias.merchantId, existing)
  }

  const institutionAliasesById = new Map<string, string[]>()
  for (const alias of institutionAliasFiltered) {
    const existing = institutionAliasesById.get(alias.financialInstitutionId) ?? []
    existing.push(alias.aliasText)
    institutionAliasesById.set(alias.financialInstitutionId, existing)
  }

  const upserts: Promise<MemoryFactSelect | null>[] = []

  for (const feedback of feedbackRows) {
    if (feedback.targetType === "financial_event" || feedback.targetType === "merchant") {
      upserts.push(
        ...addFeedbackDerivedMerchantFacts({
          feedback,
          eventMap,
          merchantMap,
          categoryMap,
          instrumentMap,
          currentFactMaps,
        }),
      )
    }

    if (feedback.targetType === "payment_instrument") {
      const instrument = instrumentMap.get(feedback.targetId)
      if (!instrument?.maskedIdentifier) {
        continue
      }

      const key = normalizeMemoryKey(instrument.maskedIdentifier)

      if (!key) {
        continue
      }

      upserts.push(
        upsertDerivedFact({
          userId: feedback.userId,
          factType: "instrument_type_preference",
          subjectType: "payment_instrument",
          subjectId: instrument.id,
          key,
          valueJson: {
            paymentInstrumentId: instrument.id,
            displayName: instrument.displayName,
            instrumentType: instrument.instrumentType,
            maskedIdentifier: instrument.maskedIdentifier,
          },
          confidence: 1,
          source: feedback.sourceSurface === "review" ? "review" : "feedback",
          sourceReferenceId: feedback.id,
          isUserPinned: false,
          firstObservedAt: feedback.createdAt,
          lastConfirmedAt: feedback.createdAt,
          expiresAt: null,
          currentFactMaps,
        }),
      )

      if (instrument.backingPaymentInstrumentId) {
        const backing = instrumentMap.get(instrument.backingPaymentInstrumentId)
        if (backing) {
          upserts.push(
            upsertDerivedFact({
              userId: feedback.userId,
              factType: "instrument_backing_account_link",
              subjectType: "payment_instrument",
              subjectId: instrument.id,
              key,
              valueJson: {
                paymentInstrumentId: instrument.id,
                displayName: instrument.displayName,
                backingPaymentInstrumentId: backing.id,
                backingDisplayName: backing.displayName,
                backingMaskedIdentifier: backing.maskedIdentifier,
              },
              confidence: 1,
              source: feedback.sourceSurface === "review" ? "review" : "feedback",
              sourceReferenceId: feedback.id,
              isUserPinned: false,
              firstObservedAt: feedback.createdAt,
              lastConfirmedAt: feedback.createdAt,
              expiresAt: null,
              currentFactMaps,
            }),
          )
        }
      }
    }

    if (feedback.targetType === "recurring_obligation") {
      const recurring = recurringMap.get(feedback.targetId)
      const merchant = recurring?.merchantId ? merchantMap.get(recurring.merchantId) : null
      const merchantKey = normalizeMemoryKey(merchant?.displayName ?? null)

      if (recurring && merchant && merchantKey) {
        upserts.push(
          upsertDerivedFact({
            userId: feedback.userId,
            factType: "merchant_recurring_hint",
            subjectType: "merchant",
            subjectId: merchant.id,
            key: merchantKey,
            valueJson: {
              merchantId: merchant.id,
              merchantName: merchant.displayName,
              obligationType: recurring.obligationType,
              status: recurring.status,
            },
            confidence: 1,
            source: feedback.sourceSurface === "review" ? "review" : "feedback",
            sourceReferenceId: feedback.id,
            isUserPinned: false,
            firstObservedAt: feedback.createdAt,
            lastConfirmedAt: feedback.createdAt,
            expiresAt: null,
            currentFactMaps,
          }),
        )
      }
    }

    if (feedback.targetType === "income_stream") {
      const stream = incomeMap.get(feedback.targetId)
      const merchant = stream?.sourceMerchantId
        ? merchantMap.get(stream.sourceMerchantId)
        : null
      const key = normalizeMemoryKey(merchant?.displayName ?? stream?.name ?? null)

      if (stream && key) {
        upserts.push(
          upsertDerivedFact({
            userId: feedback.userId,
            factType: "income_timing_expectation",
            subjectType: "income_stream",
            subjectId: stream.id,
            key,
            valueJson: {
              incomeStreamId: stream.id,
              name: stream.name,
              cadence: stream.cadence,
              intervalCount: stream.intervalCount,
              expectedDayOfMonth: stream.expectedDayOfMonth,
              secondaryDayOfMonth: stream.secondaryDayOfMonth,
              nextExpectedAt: stream.nextExpectedAt?.toISOString() ?? null,
            },
            confidence: 1,
            source: feedback.sourceSurface === "review" ? "review" : "feedback",
            sourceReferenceId: feedback.id,
            isUserPinned: false,
            firstObservedAt: feedback.createdAt,
            lastConfirmedAt: feedback.createdAt,
            expiresAt: null,
            currentFactMaps,
          }),
        )
      }
    }
  }

  for (const merchant of merchantRows) {
    const merchantKey = normalizeMemoryKey(merchant.displayName)
    if (!merchantKey) {
      continue
    }

    const aliasTexts = uniqueStringValues([
      merchant.displayName,
      ...(merchantAliasesByMerchantId.get(merchant.id) ?? []),
    ])

    for (const aliasText of aliasTexts) {
      const aliasKey = normalizeMemoryKey(aliasText)
      if (!aliasKey) {
        continue
      }

      upserts.push(
        upsertDerivedFact({
          userId: merchant.userId,
          factType: "merchant_alias",
          subjectType: "merchant",
          subjectId: merchant.id,
          key: aliasKey,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            alias: aliasText,
          },
          confidence: aliasKey === merchantKey ? 0.99 : 0.92,
          source: "automation",
          sourceReferenceId: input.sourceReferenceId ?? null,
          isUserPinned: false,
          firstObservedAt: merchant.createdAt,
          lastConfirmedAt: merchant.updatedAt,
          expiresAt: learnedExpiresAt,
          currentFactMaps,
        }),
      )
    }
  }

  for (const institution of institutionRows) {
    const aliases = uniqueStringValues([
      institution.displayName,
      ...(institutionAliasesById.get(institution.id) ?? []),
    ])

    for (const aliasText of aliases) {
      const key = normalizeMemoryKey(aliasText)
      if (!key) {
        continue
      }

      upserts.push(
        upsertDerivedFact({
          userId: institution.userId,
          factType: "sender_institution_alias",
          subjectType: "financial_institution",
          subjectId: institution.id,
          key,
          valueJson: {
            financialInstitutionId: institution.id,
            institutionName: institution.displayName,
            alias: aliasText,
          },
          confidence: key === normalizeMemoryKey(institution.displayName) ? 0.98 : 0.9,
          source: "automation",
          sourceReferenceId: input.sourceReferenceId ?? null,
          isUserPinned: false,
          firstObservedAt: institution.createdAt,
          lastConfirmedAt: institution.updatedAt,
          expiresAt: learnedExpiresAt,
          currentFactMaps,
        }),
      )
    }
  }

  for (const instrument of instrumentRows) {
    if (!instrument.maskedIdentifier) {
      continue
    }

    const key = normalizeMemoryKey(instrument.maskedIdentifier)

    if (!key) {
      continue
    }

    upserts.push(
      upsertDerivedFact({
        userId: instrument.userId,
        factType: "instrument_type_preference",
        subjectType: "payment_instrument",
        subjectId: instrument.id,
        key,
        valueJson: {
          paymentInstrumentId: instrument.id,
          displayName: instrument.displayName,
          instrumentType: instrument.instrumentType,
          maskedIdentifier: instrument.maskedIdentifier,
        },
        confidence: 0.95,
        source: "automation",
        sourceReferenceId: input.sourceReferenceId ?? null,
        isUserPinned: false,
        firstObservedAt: instrument.createdAt,
        lastConfirmedAt: instrument.updatedAt,
        expiresAt: learnedExpiresAt,
        currentFactMaps,
      }),
    )

    if (instrument.backingPaymentInstrumentId) {
      const backing = instrumentMap.get(instrument.backingPaymentInstrumentId)
      if (!backing) {
        continue
      }

      upserts.push(
        upsertDerivedFact({
          userId: instrument.userId,
          factType: "instrument_backing_account_link",
          subjectType: "payment_instrument",
          subjectId: instrument.id,
          key,
          valueJson: {
            paymentInstrumentId: instrument.id,
            displayName: instrument.displayName,
            backingPaymentInstrumentId: backing.id,
            backingDisplayName: backing.displayName,
            backingMaskedIdentifier: backing.maskedIdentifier,
          },
          confidence: 0.97,
          source: "automation",
          sourceReferenceId: input.sourceReferenceId ?? null,
          isUserPinned: false,
          firstObservedAt: instrument.createdAt,
          lastConfirmedAt: instrument.updatedAt,
          expiresAt: learnedExpiresAt,
          currentFactMaps,
        }),
      )
    }
  }

  const confirmedEvents = eventRows.filter((event) => event.status === "confirmed")
  const eventsByMerchantId = new Map<string, typeof financialEvents.$inferSelect[]>()

  for (const event of confirmedEvents) {
    if (!event.merchantId) {
      continue
    }

    const existing = eventsByMerchantId.get(event.merchantId) ?? []
    existing.push(event)
    eventsByMerchantId.set(event.merchantId, existing)
  }

  for (const [merchantId, merchantEvents] of eventsByMerchantId) {
    const merchant = merchantMap.get(merchantId)
    const merchantKey = normalizeMemoryKey(merchant?.displayName ?? null)

    if (!merchant || !merchantKey || merchantEvents.length < 2) {
      continue
    }

    const categoryCounts = new Map<string, number>()
    const processorCounts = new Map<string, number>()
    const eventTypeCounts = new Map<string, number>()

    for (const event of merchantEvents) {
      if (event.categoryId) {
        categoryCounts.set(event.categoryId, (categoryCounts.get(event.categoryId) ?? 0) + 1)
      }

      if (event.paymentProcessorId) {
        processorCounts.set(
          event.paymentProcessorId,
          (processorCounts.get(event.paymentProcessorId) ?? 0) + 1,
        )
      }

      eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) ?? 0) + 1)
    }

    const topCategory = getDominantEntry(categoryCounts)
    if (topCategory && topCategory.count >= 2) {
      const category = categoryMap.get(topCategory.id)
      if (category) {
        upserts.push(
          upsertDerivedFact({
            userId: merchant.userId,
            factType: "merchant_category_default",
            subjectType: "merchant",
            subjectId: merchant.id,
            key: merchantKey,
            valueJson: {
              merchantId: merchant.id,
              merchantName: merchant.displayName,
              categoryId: category.id,
              categoryName: category.name,
              categorySlug: category.slug,
              sampleCount: topCategory.count,
            },
            confidence: topCategory.count / merchantEvents.length >= 0.75 ? 0.94 : 0.82,
            source: "automation",
            sourceReferenceId: input.sourceReferenceId ?? null,
            isUserPinned: false,
            firstObservedAt: merchant.createdAt,
            lastConfirmedAt: merchant.updatedAt,
            expiresAt: learnedExpiresAt,
            currentFactMaps,
          }),
        )
      }
    }

    const topProcessor = getDominantEntry(processorCounts)
    if (topProcessor && topProcessor.count >= 2) {
      const processor = processorMap.get(topProcessor.id)
      if (processor) {
        upserts.push(
          upsertDerivedFact({
            userId: merchant.userId,
            factType: "merchant_preferred_processor",
            subjectType: "merchant",
            subjectId: merchant.id,
            key: merchantKey,
            valueJson: {
              merchantId: merchant.id,
              merchantName: merchant.displayName,
              paymentProcessorId: processor.id,
              processorName: processor.displayName,
              sampleCount: topProcessor.count,
            },
            confidence: topProcessor.count / merchantEvents.length >= 0.75 ? 0.9 : 0.78,
            source: "automation",
            sourceReferenceId: input.sourceReferenceId ?? null,
            isUserPinned: false,
            firstObservedAt: merchant.createdAt,
            lastConfirmedAt: merchant.updatedAt,
            expiresAt: learnedExpiresAt,
            currentFactMaps,
          }),
        )
      }
    }

    const topEventType = getDominantEntry(eventTypeCounts)
    if (topEventType && topEventType.count >= 2) {
      upserts.push(
        upsertDerivedFact({
          userId: merchant.userId,
          factType: "merchant_preferred_event_type",
          subjectType: "merchant",
          subjectId: merchant.id,
          key: merchantKey,
          valueJson: {
            merchantId: merchant.id,
            merchantName: merchant.displayName,
            eventType: topEventType.id,
            sampleCount: topEventType.count,
          },
          confidence: topEventType.count / merchantEvents.length >= 0.75 ? 0.88 : 0.76,
          source: "automation",
          sourceReferenceId: input.sourceReferenceId ?? null,
          isUserPinned: false,
          firstObservedAt: merchant.createdAt,
          lastConfirmedAt: merchant.updatedAt,
          expiresAt: learnedExpiresAt,
          currentFactMaps,
        }),
      )
    }
  }

  for (const recurring of recurringRows) {
    if (!recurring.merchantId || !["active", "suspected"].includes(recurring.status)) {
      continue
    }

    const merchant = merchantMap.get(recurring.merchantId)
    const key = normalizeMemoryKey(merchant?.displayName ?? null)

    if (!merchant || !key) {
      continue
    }

    upserts.push(
      upsertDerivedFact({
        userId: recurring.userId,
        factType: "merchant_recurring_hint",
        subjectType: "merchant",
        subjectId: merchant.id,
        key,
        valueJson: {
          merchantId: merchant.id,
          merchantName: merchant.displayName,
          obligationType: recurring.obligationType,
          status: recurring.status,
        },
        confidence: recurring.status === "active" ? 0.92 : 0.72,
        source: "automation",
        sourceReferenceId: input.sourceReferenceId ?? null,
        isUserPinned: false,
        firstObservedAt: recurring.createdAt,
        lastConfirmedAt: recurring.updatedAt,
        expiresAt: learnedExpiresAt,
        currentFactMaps,
      }),
    )
  }

  for (const stream of incomeRows) {
    if (!["active", "suspected"].includes(stream.status)) {
      continue
    }

    const merchant = stream.sourceMerchantId ? merchantMap.get(stream.sourceMerchantId) : null
    const key = normalizeMemoryKey(merchant?.displayName ?? stream.name)

    if (!key) {
      continue
    }

    upserts.push(
      upsertDerivedFact({
        userId: stream.userId,
        factType: "income_timing_expectation",
        subjectType: "income_stream",
        subjectId: stream.id,
        key,
        valueJson: {
          incomeStreamId: stream.id,
          name: stream.name,
          incomeType: stream.incomeType,
          cadence: stream.cadence,
          intervalCount: stream.intervalCount,
          expectedDayOfMonth: stream.expectedDayOfMonth,
          secondaryDayOfMonth: stream.secondaryDayOfMonth,
          nextExpectedAt: stream.nextExpectedAt?.toISOString() ?? null,
        },
        confidence: stream.status === "active" ? 0.9 : 0.72,
        source: "automation",
        sourceReferenceId: input.sourceReferenceId ?? null,
        isUserPinned: false,
        firstObservedAt: stream.createdAt,
        lastConfirmedAt: stream.updatedAt,
        expiresAt: learnedExpiresAt,
        currentFactMaps,
      }),
    )
  }

  const settled = await Promise.all(upserts)
  const factCount = settled.filter(Boolean).length

  await summarizeMemoryFactsForUser({
    userId: input.userId,
    facts: settled.filter((fact): fact is MemoryFactSelect => Boolean(fact)),
  })

  logger.info("Rebuilt user memory facts", {
    userId: input.userId,
    reason: input.reason,
    factCount,
  })

  return {
    action: "rebuilt" as const,
    factCount,
  }
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string => {
    if (!value) {
      return false
    }

    return array.indexOf(value) === index
  })
}

function getDominantEntry(map: Map<string, number>) {
  let best: { id: string; count: number } | null = null

  for (const [id, count] of map) {
    if (!best || count > best.count) {
      best = { id, count }
    }
  }

  return best
}

export async function runMemoryDecayScan() {
  const activeFacts = await db
    .select()
    .from(memoryFacts)
    .where(eq(memoryFacts.isUserPinned, false))

  let expiredCount = 0

  for (const fact of activeFacts) {
    if (fact.expiresAt && fact.expiresAt.getTime() <= Date.now()) {
      continue
    }

    if (fact.source !== "automation") {
      continue
    }

    if (!fact.lastConfirmedAt) {
      continue
    }

    const ageDays =
      (Date.now() - fact.lastConfirmedAt.getTime()) / (1000 * 60 * 60 * 24)

    if (ageDays < LEARNED_MEMORY_TTL_DAYS) {
      continue
    }

    await updateMemoryFact(fact.id, {
      expiresAt: new Date(),
    })
    expiredCount += 1
  }

  logger.info("Completed memory decay scan", {
    scannedCount: activeFacts.length,
    expiredCount,
  })

  return {
    action: "scanned" as const,
    scannedCount: activeFacts.length,
    expiredCount,
  }
}
