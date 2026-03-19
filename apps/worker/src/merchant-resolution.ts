import {
  createModelRun,
  createReviewQueueItem,
  createMerchantObservations,
  ensureSystemCategories,
  findOpenMerchantReview,
  getCategoryBySlug,
  getFinancialEventById,
  getFinancialEventMerchantContext,
  getOrCreateMerchantForAlias,
  getOrCreatePaymentProcessor,
  getMerchantById,
  getPaymentProcessorById,
  listAliasesForMerchantIds,
  listCandidateMerchants,
  listCandidatePaymentProcessors,
  listFinancialEventIdsForMerchantRepair,
  listMerchantObservationsByClusterKey,
  listMerchantObservationsForEvent,
  listUserIdsForMerchantRepair,
  mergeMerchants,
  mergePaymentProcessors,
  normalizeMerchantResolutionName,
  updateFinancialEvent,
  updateMerchant,
  updateMerchantObservationStatus,
  updateModelRun,
  upsertMerchantAliases,
  upsertPaymentProcessorAliases,
  type MerchantObservationSelect,
} from "@workspace/db"
import {
  resolveCategoryWithAi,
  resolveMerchantAndProcessorWithAi,
} from "@workspace/ai"

type ObservationExtractionOutcome = {
  action: "skipped" | "observed"
  reason?: string
  createdCount?: number
  clusterKeys?: string[]
}

type ResolutionOutcome = {
  action:
    | "skipped"
    | "ignored"
    | "linked"
    | "created"
    | "updated"
    | "merged"
    | "review"
  reason: string
  merchantId?: string | null
  paymentProcessorId?: string | null
  categoryId?: string | null
  reviewQueueItemId?: string
  observationIds?: string[]
}

function normalizeWhitespace(input: string | null | undefined) {
  if (!input) return null
  const normalized = input.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : null
}

function extractSenderEmail(input: string | null | undefined) {
  const normalized = normalizeWhitespace(input)
  if (!normalized) return null
  const match = normalized.match(/<([^>]+)>/)
  if (match?.[1]) return match[1].trim().toLowerCase()
  return normalized.includes("@") ? normalized.toLowerCase() : null
}

function extractSenderDisplayName(input: string | null | undefined) {
  const normalized = normalizeWhitespace(input)
  if (!normalized) return null
  const angleIndex = normalized.indexOf("<")
  if (angleIndex === -1) return normalized
  return normalized.slice(0, angleIndex).replace(/^"+|"+$/g, "").trim() || normalized
}

function looksBankEvidence(input: string | null | undefined) {
  const lowered = input?.toLowerCase() ?? ""
  return /\b(bank|credit[_ ]?cards?|debit[_ ]?cards?|instaalert|statement|alerts?|transaction)\b/.test(
    lowered,
  )
}

function looksProcessorEvidence(input: string | null | undefined) {
  const lowered = input?.toLowerCase() ?? ""
  return /\b(paypal|razorpay|amazon pay|google|google pay|apple|cashfree|payu)\b/.test(lowered)
}

function inferObservationSourceKind(input: {
  sender: string | null
  subject: string | null
  snippet: string | null
  merchantDescriptorRaw: string | null
  processorNameHint: string | null
}) {
  const combined = [
    input.sender,
    input.subject,
    input.snippet,
    input.merchantDescriptorRaw,
    input.processorNameHint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (looksBankEvidence(input.sender) || /\btransaction|debited|credited|card|account\b/.test(combined)) {
    return "bank_alert" as const
  }
  if (/\bstatement|billing cycle|minimum due|total amount due\b/.test(combined)) {
    return "statement" as const
  }
  if (looksProcessorEvidence(input.processorNameHint) || /\bpaypal|razorpay|amazon pay|google pay\b/.test(combined)) {
    return "processor_receipt" as const
  }
  if (/\border id|order confirmed|placed successfully|purchase confirmation\b/.test(combined)) {
    return "merchant_order" as const
  }
  if (/\breceipt|invoice|paid to|payment successful\b/.test(combined)) {
    return "merchant_receipt" as const
  }
  if (/\bsubscription|renewal|expires|expiring\b/.test(combined)) {
    return "subscription_notice" as const
  }
  return "other" as const
}

function buildObservationConfidence(sourceKind: string) {
  switch (sourceKind) {
    case "statement":
      return 0.95
    case "bank_alert":
      return 0.9
    case "processor_receipt":
      return 0.82
    case "merchant_receipt":
      return 0.76
    case "merchant_order":
      return 0.72
    case "subscription_notice":
      return 0.6
    default:
      return 0.45
  }
}

function summarizeEvidence(observation: MerchantObservationSelect) {
  const evidence = observation.evidenceJson as Record<string, unknown>
  const snippets = Array.isArray(evidence.snippets)
    ? evidence.snippets.filter((value): value is string => typeof value === "string")
    : []

  return snippets.slice(0, 3)
}

function getClusterKey(input: {
  merchantDescriptorRaw: string | null
  merchantNameHint: string | null
  processorNameHint: string | null
}) {
  return (
    normalizeMerchantResolutionName(input.merchantDescriptorRaw) ??
    normalizeMerchantResolutionName(input.merchantNameHint) ??
    normalizeMerchantResolutionName(input.processorNameHint) ??
    "unknown"
  )
}

export async function extractMerchantObservationsFromEvent(
  financialEventId: string,
): Promise<ObservationExtractionOutcome> {
  const context = await getFinancialEventMerchantContext(financialEventId)

  if (!context) {
    return { action: "skipped", reason: "missing_financial_event" }
  }

  const existing = await listMerchantObservationsForEvent(financialEventId)
  const existingKeys = new Set(
    existing.map(
      (observation) =>
        `${observation.rawDocumentId ?? "none"}:${observation.extractedSignalId ?? "none"}:${observation.merchantDescriptorRaw ?? "none"}`,
    ),
  )

  const values = context.sources
    .map((source) => {
      const rawDocument = source.rawDocument
      const signal = source.extractedSignal
      const sender = rawDocument?.fromAddress ?? null
      const senderEmail = extractSenderEmail(sender)
      const senderDisplayName = extractSenderDisplayName(sender)
      const merchantDescriptorRaw =
        normalizeWhitespace(signal?.merchantDescriptorRaw) ??
        normalizeWhitespace(signal?.merchantRaw) ??
        null
      const merchantNameHint =
        normalizeWhitespace(signal?.merchantNameCandidate) ??
        normalizeWhitespace(signal?.merchantHint) ??
        context.merchant?.displayName ??
        null
      const processorNameHint = normalizeWhitespace(signal?.processorNameCandidate)
      const key = `${rawDocument?.id ?? "none"}:${signal?.id ?? "none"}:${merchantDescriptorRaw ?? "none"}`

      if (existingKeys.has(key)) {
        return null
      }

      const sourceKind = inferObservationSourceKind({
        sender,
        subject: rawDocument?.subject ?? null,
        snippet: rawDocument?.snippet ?? null,
        merchantDescriptorRaw,
        processorNameHint,
      })

      return {
        userId: context.event.userId,
        financialEventId: context.event.id,
        rawDocumentId: rawDocument?.id ?? null,
        extractedSignalId: signal?.id ?? null,
        merchantId: context.event.merchantId ?? null,
        paymentProcessorId: context.event.paymentProcessorId ?? null,
        observationSourceKind: sourceKind,
        issuerHint:
          signal?.issuerNameHint ??
          (looksBankEvidence(senderDisplayName) || looksBankEvidence(senderEmail)
            ? senderDisplayName ?? senderEmail
            : null),
        merchantDescriptorRaw,
        merchantNameHint,
        processorNameHint,
        senderAliasHint: senderEmail ?? senderDisplayName,
        channelHint: signal?.channelHint ?? null,
        confidence: Math.max(signal?.confidence ?? 0, buildObservationConfidence(sourceKind)),
        evidenceJson: {
          sender,
          subject: rawDocument?.subject ?? null,
          snippet: rawDocument?.snippet ?? null,
          linkReason: source.source.linkReason,
          snippets: [rawDocument?.subject, rawDocument?.snippet, merchantDescriptorRaw]
            .filter((value): value is string => Boolean(value))
            .slice(0, 3),
        },
        resolutionStatus: "pending" as const,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (values.length === 0) {
    return { action: "skipped", reason: "no_new_observations" }
  }

  const created = await createMerchantObservations(values)
  const clusterKeys = Array.from(
    new Set(
      created.map((observation) =>
        getClusterKey({
          merchantDescriptorRaw: observation.merchantDescriptorRaw,
          merchantNameHint: observation.merchantNameHint,
          processorNameHint: observation.processorNameHint,
        }),
      ),
    ),
  )

  return {
    action: "observed",
    createdCount: created.length,
    clusterKeys,
  }
}

async function applyMerchantDecision(input: {
  userId: string
  financialEventId: string
  observations: MerchantObservationSelect[]
  canonicalMerchantName: string | null
  canonicalProcessorName: string | null
  categorySlug: string | null
  targetMerchantId?: string | null
  targetProcessorId?: string | null
  decision:
    | "link_to_existing_merchant"
    | "create_new_merchant"
    | "update_existing_merchant"
    | "merge_merchants"
    | "link_to_existing_processor"
    | "create_new_processor"
    | "merge_processors"
}) {
  let merchant = input.targetMerchantId ? await getMerchantById(input.targetMerchantId) : null

  if (!merchant && input.canonicalMerchantName) {
    merchant = await getOrCreateMerchantForAlias({
      userId: input.userId,
      aliasText: input.canonicalMerchantName,
      source: "merchant_resolution",
      confidence: 1,
    })
  }

  if (merchant && input.canonicalMerchantName) {
    await updateMerchant(merchant.id, {
      displayName: input.canonicalMerchantName,
      normalizedName:
        normalizeMerchantResolutionName(input.canonicalMerchantName) ?? merchant.normalizedName,
      lastSeenAt: new Date(),
    })
    await upsertMerchantAliases({
      merchantId: merchant.id,
      aliases: input.observations.flatMap((observation) => {
        const aliases = [
          observation.merchantNameHint,
          observation.merchantDescriptorRaw,
        ].filter((value): value is string => Boolean(value))
        return aliases.map((aliasText) => ({
          aliasText,
          source: "merchant_resolution",
          confidence: observation.confidence,
        }))
      }),
    })
  }

  let processor = input.targetProcessorId
    ? await getPaymentProcessorById(input.targetProcessorId)
    : null

  if (!processor && input.canonicalProcessorName) {
    processor = await getOrCreatePaymentProcessor({
      userId: input.userId,
      displayName: input.canonicalProcessorName,
    })
  }

  if (processor) {
    await upsertPaymentProcessorAliases({
      paymentProcessorId: processor.id,
      aliases: input.observations.flatMap((observation) => {
        const aliases = [observation.processorNameHint].filter(
          (value): value is string => Boolean(value),
        )
        return aliases.map((aliasText) => ({
          aliasText,
          source: "merchant_resolution",
          confidence: observation.confidence,
        }))
      }),
    })
  }

  if (input.decision === "merge_merchants" && merchant) {
    const duplicateMerchantIds = input.observations
      .map((observation) => observation.merchantId)
      .filter((value): value is string => Boolean(value))
    await mergeMerchants({
      canonicalMerchantId: merchant.id,
      duplicateMerchantIds,
    })
  }

  if (input.decision === "merge_processors" && processor) {
    const duplicateProcessorIds = input.observations
      .map((observation) => observation.paymentProcessorId)
      .filter((value): value is string => Boolean(value))
    await mergePaymentProcessors({
      canonicalPaymentProcessorId: processor.id,
      duplicatePaymentProcessorIds: duplicateProcessorIds,
    })
  }

  const category = input.categorySlug
    ? await getCategoryBySlug(input.userId, input.categorySlug)
    : null

  const primaryObservation = input.observations[0] ?? null
  await updateFinancialEvent(input.financialEventId, {
    merchantId: merchant?.id ?? null,
    paymentProcessorId: processor?.id ?? null,
    categoryId: category?.id ?? undefined,
    merchantDescriptorRaw:
      primaryObservation?.merchantDescriptorRaw ?? undefined,
    description:
      merchant?.displayName ??
      primaryObservation?.merchantNameHint ??
      primaryObservation?.merchantDescriptorRaw ??
      undefined,
  })

  await updateMerchantObservationStatus(
    input.observations.map((observation) => observation.id),
    "linked",
    {
      merchantId: merchant?.id ?? null,
      paymentProcessorId: processor?.id ?? null,
    },
  )

  return {
    merchant,
    processor,
    category,
  }
}

export async function resolveMerchantCluster(input: {
  userId: string
  financialEventId: string
  observationClusterKey: string
}): Promise<ResolutionOutcome> {
  const observations = await listMerchantObservationsByClusterKey({
    userId: input.userId,
    merchantDescriptorRaw: input.observationClusterKey,
    merchantNameHint: input.observationClusterKey,
  })

  const relevantObservations = observations.filter(
    (observation) => observation.resolutionStatus !== "ignored",
  )

  if (relevantObservations.length === 0) {
    return { action: "skipped", reason: "no_pending_observations" }
  }

  const candidateMerchantRows = await listCandidateMerchants({
    userId: input.userId,
    aliasHints: relevantObservations.flatMap((observation) => [
      observation.merchantNameHint ?? "",
      observation.merchantDescriptorRaw ?? "",
    ]),
  })
  const merchantIds = candidateMerchantRows.map((row) => row.merchant.id)
  const merchantAliases = await listAliasesForMerchantIds(merchantIds)
  const candidateProcessors = await listCandidatePaymentProcessors({
    userId: input.userId,
    aliasHints: relevantObservations.flatMap((observation) => [
      observation.processorNameHint ?? "",
    ]),
  })

  const merchantModelRun = await createModelRun({
    userId: input.userId,
    rawDocumentId: relevantObservations[0]?.rawDocumentId ?? null,
    taskType: "merchant_resolution",
    provider: "ai-gateway",
    modelName: "pending",
    promptVersion: "pending",
    status: "running",
  })

  try {
    const resolved = await resolveMerchantAndProcessorWithAi({
      userId: input.userId,
      sourceReliability: {
        bankOriginCount: relevantObservations.filter((observation) => observation.observationSourceKind === "bank_alert").length,
        merchantOriginCount: relevantObservations.filter((observation) => observation.observationSourceKind === "merchant_receipt" || observation.observationSourceKind === "merchant_order").length,
        processorOriginCount: relevantObservations.filter((observation) => observation.observationSourceKind === "processor_receipt").length,
        statementOriginCount: relevantObservations.filter((observation) => observation.observationSourceKind === "statement").length,
      },
      observations: relevantObservations.map((observation) => ({
        id: observation.id,
        observationSourceKind: observation.observationSourceKind,
        issuerHint: observation.issuerHint,
        merchantDescriptorRaw: observation.merchantDescriptorRaw,
        merchantNameHint: observation.merchantNameHint,
        processorNameHint: observation.processorNameHint,
        senderAliasHint: observation.senderAliasHint,
        channelHint: observation.channelHint,
        confidence: Number(observation.confidence),
        evidenceSummary: summarizeEvidence(observation),
      })),
      candidateMerchants: candidateMerchantRows.map((row) => ({
        id: row.merchant.id,
        displayName: row.merchant.displayName,
        normalizedName: row.merchant.normalizedName,
        aliases: merchantAliases
          .filter((alias) => alias.merchantId === row.merchant.id)
          .map((alias) => alias.aliasText),
        linkedEventCount: Number(row.linkedEventCount),
      })),
      candidateProcessors: candidateProcessors.reduce<
        Array<{ id: string; displayName: string; aliases: string[] }>
      >((accumulator, row) => {
        const existing = accumulator.find((item) => item.id === row.processor.id)
        if (existing) {
          if (row.alias?.aliasText) existing.aliases.push(row.alias.aliasText)
          return accumulator
        }

        accumulator.push({
          id: row.processor.id,
          displayName: row.processor.displayName,
          aliases: row.alias?.aliasText ? [row.alias.aliasText] : [],
        })
        return accumulator
      }, []),
    })

    await updateModelRun(merchantModelRun.id, {
      status: "succeeded",
      provider: resolved.metadata.provider,
      modelName: resolved.metadata.modelName,
      promptVersion: resolved.metadata.promptVersion,
      inputTokens: resolved.metadata.inputTokens,
      outputTokens: resolved.metadata.outputTokens,
      latencyMs: resolved.metadata.latencyMs,
      requestId: resolved.metadata.requestId,
    })

    const decision = resolved.resolution

    if (decision.confidence < 0.65 || decision.decision === "ignore") {
      await updateMerchantObservationStatus(
        decision.supportingObservationIds,
        decision.decision === "ignore" ? "ignored" : "needs_review",
      )

      return {
        action: decision.decision === "ignore" ? "ignored" : "skipped",
        reason: decision.reason,
        observationIds: decision.supportingObservationIds,
      }
    }

    if (decision.confidence < 0.9 || decision.decision === "needs_review") {
      const existingReview = await findOpenMerchantReview({
        userId: input.userId,
        financialEventId: input.financialEventId,
        itemType: "merchant_resolution",
      })

      if (existingReview) {
        await updateMerchantObservationStatus(decision.supportingObservationIds, "needs_review")
        return {
          action: "review",
          reason: "existing_review",
          reviewQueueItemId: existingReview.id,
          observationIds: decision.supportingObservationIds,
        }
      }

      const reviewItem = await createReviewQueueItem({
        userId: input.userId,
        itemType: "merchant_resolution",
        financialEventId: input.financialEventId,
        priority: 3,
        title: "Resolve merchant and processor",
        explanation: decision.reason,
        proposedResolutionJson: {
          kind: "merchant_resolution",
          confidence: decision.confidence,
          canonicalMerchantName: decision.canonicalMerchantName ?? null,
          canonicalProcessorName: decision.canonicalProcessorName ?? null,
          targetMerchantId: decision.targetMerchantId ?? null,
          targetProcessorId: decision.targetProcessorId ?? null,
          supportingObservationIds: decision.supportingObservationIds,
          categorySlug: decision.categorySlug ?? null,
          categoryConfidence: decision.categoryConfidence ?? null,
          categoryReason: decision.categoryReason ?? null,
          matchedMerchantIds: candidateMerchantRows.map((row) => row.merchant.id),
          matchedProcessorIds: candidateProcessors.map((row) => row.processor.id),
        },
      })

      await updateMerchantObservationStatus(decision.supportingObservationIds, "needs_review")
      return {
        action: "review",
        reason: decision.reason,
        reviewQueueItemId: reviewItem.id,
        observationIds: decision.supportingObservationIds,
      }
    }

    const applied = await applyMerchantDecision({
      userId: input.userId,
      financialEventId: input.financialEventId,
      observations: relevantObservations.filter((observation) =>
        decision.supportingObservationIds.includes(observation.id),
      ),
      canonicalMerchantName: decision.canonicalMerchantName ?? null,
      canonicalProcessorName: decision.canonicalProcessorName ?? null,
      categorySlug: decision.categorySlug ?? null,
      targetMerchantId: decision.targetMerchantId ?? null,
      targetProcessorId: decision.targetProcessorId ?? null,
      decision: decision.decision,
    })

    return {
      action:
        decision.decision === "merge_merchants" || decision.decision === "merge_processors"
          ? "merged"
          : decision.decision === "create_new_merchant" ||
              decision.decision === "create_new_processor"
            ? "created"
            : "linked",
      reason: decision.reason,
      merchantId: applied.merchant?.id ?? null,
      paymentProcessorId: applied.processor?.id ?? null,
      categoryId: applied.category?.id ?? null,
      observationIds: decision.supportingObservationIds,
    }
  } catch (error) {
    await updateModelRun(merchantModelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown merchant resolution failure",
    })
    throw error
  }
}

export async function resolveEventCategory(input: {
  userId: string
  financialEventId: string
}) {
  const event = await getFinancialEventById(input.financialEventId)
  if (!event) {
    return { action: "skipped", reason: "missing_financial_event" as const }
  }

  const context = await getFinancialEventMerchantContext(input.financialEventId)
  if (!context) {
    return { action: "skipped", reason: "missing_event_context" as const }
  }

  await ensureSystemCategories(input.userId)

  const categoryModelRun = await createModelRun({
    userId: input.userId,
    rawDocumentId: context.sources[0]?.rawDocument?.id ?? null,
    taskType: "category_resolution",
    provider: "ai-gateway",
    modelName: "pending",
    promptVersion: "pending",
    status: "running",
  })

  try {
    const resolved = await resolveCategoryWithAi({
      merchantName: context.merchant?.displayName ?? null,
      processorName: context.paymentProcessor?.displayName ?? null,
      eventType: context.event.eventType,
      description: context.event.description ?? null,
      notes: context.event.notes ?? null,
      evidenceSnippets: context.sources.flatMap((source) => {
        const evidence = source.extractedSignal?.evidenceJson as Record<string, unknown> | undefined
        const snippets = Array.isArray(evidence?.snippets)
          ? evidence.snippets.filter((value): value is string => typeof value === "string")
          : []
        return snippets
      }).slice(0, 4),
    })

    await updateModelRun(categoryModelRun.id, {
      status: "succeeded",
      provider: resolved.metadata.provider,
      modelName: resolved.metadata.modelName,
      promptVersion: resolved.metadata.promptVersion,
      inputTokens: resolved.metadata.inputTokens,
      outputTokens: resolved.metadata.outputTokens,
      latencyMs: resolved.metadata.latencyMs,
      requestId: resolved.metadata.requestId,
    })

    const category = await getCategoryBySlug(input.userId, resolved.category.categorySlug)

    if (category) {
      await updateFinancialEvent(context.event.id, {
        categoryId: category.id,
      })
    }

    return {
      action: "updated" as const,
      reason: resolved.category.reason,
      categoryId: category?.id ?? null,
    }
  } catch (error) {
    await updateModelRun(categoryModelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown category resolution failure",
    })
    throw error
  }
}

export async function runMerchantRepairBackfill(userId: string) {
  const eventIds = await listFinancialEventIdsForMerchantRepair(userId)
  let observedEvents = 0
  let resolvedEvents = 0

  for (const financialEventId of eventIds) {
    const extracted = await extractMerchantObservationsFromEvent(financialEventId)
    if (extracted.action === "observed") {
      observedEvents += 1
      for (const clusterKey of extracted.clusterKeys ?? []) {
        const outcome = await resolveMerchantCluster({
          userId,
          financialEventId,
          observationClusterKey: clusterKey,
        })

        if (outcome.action === "linked" || outcome.action === "created" || outcome.action === "merged") {
          resolvedEvents += 1
          await resolveEventCategory({
            userId,
            financialEventId,
          })
        }
      }
    }
  }

  return {
    eventCount: eventIds.length,
    observedEvents,
    resolvedEvents,
  }
}

export async function listUsersForMerchantRepair() {
  return listUserIdsForMerchantRepair()
}
