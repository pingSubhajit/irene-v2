import {
  createModelRun,
  createPaymentInstrument,
  createPaymentInstrumentObservations,
  createReviewQueueItem,
  findExistingCanonicalPaymentInstrument,
  findOpenPaymentInstrumentReview,
  getFinancialEventInstrumentContext,
  getMemoryBundleForUser,
  getOrCreateFinancialInstitution,
  getPaymentInstrumentById,
  listCandidateFinancialInstitutions,
  listCandidatePaymentInstrumentsByMaskedIdentifier,
  listFinancialEventIdsForInstrumentRepair,
  listPaymentInstrumentObservationsByMaskedIdentifier,
  listPaymentInstrumentObservationsForEvent,
  mergePaymentInstruments,
  normalizeInstrumentMaskedIdentifier,
  updateFinancialEvent,
  updateModelRun,
  updatePaymentInstrument,
  updatePaymentInstrumentObservationStatus,
  upsertFinancialInstitutionAliases,
  type ObservationSourceKind,
  type PaymentInstrumentObservationSelect,
  type PaymentInstrumentType,
} from "@workspace/db"

import { resolvePaymentInstrumentWithAi } from "@workspace/ai"

type ObservationExtractionOutcome = {
  action: "skipped" | "observed"
  reason?: string
  createdCount?: number
  maskedIdentifiers?: string[]
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
  paymentInstrumentId?: string
  reviewQueueItemId?: string
  observationIds?: string[]
  financialEventIds?: string[]
}

const MAX_AI_INSTRUMENT_OBSERVATIONS = 8
const MAX_AI_INSTRUMENT_CANDIDATES = 6
const MAX_AI_INSTITUTION_CANDIDATES = 6
const MAX_AI_ALIAS_PER_INSTITUTION = 6
const MAX_AI_MEMORY_LINES = 8

function normalizeWhitespace(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const normalized = input.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : null
}

function extractSenderEmail(input: string | null | undefined) {
  const normalized = normalizeWhitespace(input)

  if (!normalized) {
    return null
  }

  const match = normalized.match(/<([^>]+)>/)
  if (match?.[1]) {
    return match[1].trim().toLowerCase()
  }

  return normalized.includes("@") ? normalized.toLowerCase() : null
}

function extractSenderDisplayName(input: string | null | undefined) {
  const normalized = normalizeWhitespace(input)

  if (!normalized) {
    return null
  }

  const angleIndex = normalized.indexOf("<")
  if (angleIndex === -1) {
    return normalized
  }

  return normalized.slice(0, angleIndex).replace(/^"+|"+$/g, "").trim() || normalized
}

function looksBankEvidence(input: string | null | undefined) {
  const lowered = input?.toLowerCase() ?? ""
  return /\b(bank|credit[_ ]?cards?|debit[_ ]?cards?|instaalert|statement|alerts?|transaction)\b/.test(
    lowered,
  )
}

function inferObservationSourceKind(input: {
  sender: string | null
  subject: string | null
  snippet: string | null
  merchantHint: string | null
}): ObservationSourceKind {
  const sender = input.sender?.toLowerCase() ?? ""
  const combined = [input.subject, input.snippet, input.merchantHint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (looksBankEvidence(sender) || /\b(transaction|debited|credited|card|account)\b/.test(combined)) {
    return "bank_alert"
  }

  if (/\bstatement|billing cycle|minimum due|total amount due\b/.test(combined)) {
    return "statement"
  }

  if (/\bsubscription|renewal|expires|expiring\b/.test(combined)) {
    return "subscription_notice"
  }

  if (/\border id|order confirmed|placed successfully|purchase confirmation\b/.test(combined)) {
    return "merchant_order"
  }

  if (/\breceipt|invoice|paid to|payment successful\b/.test(combined)) {
    return "merchant_receipt"
  }

  return "other"
}

function inferInstrumentTypeHint(input: {
  signalHint: string | null
  sender: string | null
  subject: string | null
}): PaymentInstrumentType {
  const combined = [input.signalHint, input.sender, input.subject]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (/\bdebit\b/.test(combined)) {
    return "debit_card"
  }

  if (/\bcredit\b/.test(combined) || /\bcards?\b/.test(combined)) {
    return "credit_card"
  }

  if (/\bupi\b/.test(combined)) {
    return "upi"
  }

  if (/\baccount\b/.test(combined)) {
    return "bank_account"
  }

  return "unknown"
}

function buildObservationConfidence(sourceKind: ObservationSourceKind) {
  switch (sourceKind) {
    case "statement":
      return 0.95
    case "bank_alert":
      return 0.9
    case "merchant_receipt":
      return 0.72
    case "merchant_order":
      return 0.64
    case "subscription_notice":
      return 0.58
    default:
      return 0.45
  }
}

function buildInstrumentDisplayName(input: {
  institutionName: string
  maskedIdentifier: string | null
  instrumentType: PaymentInstrumentType
}) {
  const suffix = input.maskedIdentifier ? ` •${input.maskedIdentifier}` : ""
  return `${input.institutionName}${suffix}`
}

function summarizeEvidence(observation: PaymentInstrumentObservationSelect) {
  const evidence = observation.evidenceJson as Record<string, unknown>
  const snippets = Array.isArray(evidence.snippets)
    ? evidence.snippets.filter((value): value is string => typeof value === "string")
    : []

  return snippets.slice(0, 3)
}

export async function extractInstrumentObservationsFromEvent(
  financialEventId: string,
): Promise<ObservationExtractionOutcome> {
  const context = await getFinancialEventInstrumentContext(financialEventId)

  if (!context) {
    return {
      action: "skipped",
      reason: "missing_financial_event",
    }
  }

  const existing = await listPaymentInstrumentObservationsForEvent(financialEventId)
  const existingKeys = new Set(
    existing.map(
      (observation) =>
        `${observation.maskedIdentifier ?? "none"}:${observation.rawDocumentId ?? "none"}:${observation.extractedSignalId ?? "none"}`,
    ),
  )

  const values = context.sources
    .map((source) => {
      const sender = source.rawDocument?.fromAddress ?? null
      const senderEmail = extractSenderEmail(sender)
      const senderDisplayName = extractSenderDisplayName(sender)
      const maskedIdentifier =
        normalizeInstrumentMaskedIdentifier(source.extractedSignal?.paymentInstrumentHint) ??
        normalizeInstrumentMaskedIdentifier(context.paymentInstrument?.maskedIdentifier) ??
        null

      if (!maskedIdentifier) {
        return null
      }

      const sourceKind = inferObservationSourceKind({
        sender,
        subject: source.rawDocument?.subject ?? null,
        snippet: source.rawDocument?.snippet ?? null,
        merchantHint:
          source.extractedSignal?.merchantHint ?? source.extractedSignal?.merchantRaw ?? null,
      })
      const issuerHint =
        looksBankEvidence(senderDisplayName) || looksBankEvidence(senderEmail)
          ? senderDisplayName ?? senderEmail
          : context.paymentInstrument?.providerName ?? null
      const issuerAliasHint =
        looksBankEvidence(senderEmail) || looksBankEvidence(senderDisplayName)
          ? senderEmail ?? senderDisplayName
          : null
      const counterpartyHint =
        source.extractedSignal?.merchantHint ??
        source.extractedSignal?.merchantRaw ??
        context.merchant?.displayName ??
        null
      const key = `${maskedIdentifier}:${source.rawDocument?.id ?? "none"}:${source.extractedSignal?.id ?? "none"}`

      if (existingKeys.has(key)) {
        return null
      }

      return {
        userId: context.event.userId,
        financialEventId: context.event.id,
        rawDocumentId: source.rawDocument?.id ?? null,
        extractedSignalId: source.extractedSignal?.id ?? null,
        paymentInstrumentId: context.event.paymentInstrumentId ?? null,
        observationSourceKind: sourceKind,
        maskedIdentifier,
        instrumentTypeHint: inferInstrumentTypeHint({
          signalHint: source.extractedSignal?.paymentInstrumentHint ?? null,
          sender,
          subject: source.rawDocument?.subject ?? null,
        }),
        issuerHint,
        issuerAliasHint,
        counterpartyHint,
        networkHint: null,
        confidence: buildObservationConfidence(sourceKind),
        evidenceJson: {
          sender,
          subject: source.rawDocument?.subject ?? null,
          snippet: source.rawDocument?.snippet ?? null,
          merchantHint: counterpartyHint,
          linkReason: source.source.linkReason,
          snippets: [source.rawDocument?.subject, source.rawDocument?.snippet]
            .filter((value): value is string => Boolean(value))
            .slice(0, 2),
        },
        resolutionStatus: "pending" as const,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (values.length === 0) {
    return {
      action: "skipped",
      reason: "no_new_observations",
    }
  }

  const created = await createPaymentInstrumentObservations(values)
  const maskedIdentifiers = Array.from(
    new Set(
      created
        .map((observation) => observation.maskedIdentifier)
        .filter((maskedIdentifier): maskedIdentifier is string => Boolean(maskedIdentifier)),
    ),
  )

  return {
    action: "observed",
    createdCount: created.length,
    maskedIdentifiers,
  }
}

async function applyCanonicalInstrumentDecision(input: {
  userId: string
  maskedIdentifier: string
  observations: PaymentInstrumentObservationSelect[]
  canonicalInstitutionName: string | null
  canonicalInstrumentType: PaymentInstrumentType
  targetPaymentInstrumentId?: string | null
  decision:
    | "link_to_existing_instrument"
    | "create_new_instrument"
    | "update_existing_instrument"
    | "merge_instruments"
}) {
  const institution =
    input.canonicalInstitutionName && input.canonicalInstitutionName.trim().length > 0
      ? await getOrCreateFinancialInstitution({
          userId: input.userId,
          displayName: input.canonicalInstitutionName,
        })
      : null

  if (institution) {
    await upsertFinancialInstitutionAliases({
      financialInstitutionId: institution.id,
      aliases: input.observations.flatMap((observation) => {
        const aliases = [
          observation.issuerAliasHint,
          observation.issuerHint,
        ].filter((value): value is string => Boolean(value))

        return aliases.map((aliasText) => ({
          aliasText,
          source: "instrument_resolution",
          confidence: observation.confidence,
        }))
      }),
    })
  }

  let canonicalInstrument =
    input.targetPaymentInstrumentId
      ? (await getPaymentInstrumentById(input.targetPaymentInstrumentId))?.instrument
      : null

  if (!canonicalInstrument) {
    canonicalInstrument = await findExistingCanonicalPaymentInstrument({
      userId: input.userId,
      financialInstitutionId: institution?.id ?? null,
      instrumentType: input.canonicalInstrumentType,
      maskedIdentifier: input.maskedIdentifier,
    })
  }

  if (!canonicalInstrument) {
    canonicalInstrument = await createPaymentInstrument({
      userId: input.userId,
      financialInstitutionId: institution?.id ?? null,
      instrumentType: input.canonicalInstrumentType,
      providerName: institution?.displayName ?? null,
      displayName: buildInstrumentDisplayName({
        institutionName: institution?.displayName ?? "Unknown issuer",
        maskedIdentifier: input.maskedIdentifier,
        instrumentType: input.canonicalInstrumentType,
      }),
      maskedIdentifier: input.maskedIdentifier,
      currency: "INR",
      status: "active",
    })
  } else {
    canonicalInstrument =
      (await updatePaymentInstrument(canonicalInstrument.id, {
        financialInstitutionId: institution?.id ?? canonicalInstrument.financialInstitutionId,
        instrumentType:
          input.canonicalInstrumentType === "unknown"
            ? canonicalInstrument.instrumentType
            : input.canonicalInstrumentType,
        providerName: institution?.displayName ?? canonicalInstrument.providerName,
        displayName: buildInstrumentDisplayName({
          institutionName:
            institution?.displayName ?? canonicalInstrument.providerName ?? "Unknown issuer",
          maskedIdentifier: input.maskedIdentifier,
          instrumentType:
            input.canonicalInstrumentType === "unknown"
              ? canonicalInstrument.instrumentType
              : input.canonicalInstrumentType,
        }),
        maskedIdentifier: input.maskedIdentifier,
      })) ?? canonicalInstrument
  }

  const duplicateIds = Array.from(
    new Set(
      input.observations
        .map((observation) => observation.paymentInstrumentId)
        .filter(
          (paymentInstrumentId): paymentInstrumentId is string =>
            Boolean(paymentInstrumentId) && paymentInstrumentId !== canonicalInstrument.id,
        ),
    ),
  )

  if (input.decision === "merge_instruments" && duplicateIds.length > 0) {
    await mergePaymentInstruments({
      canonicalPaymentInstrumentId: canonicalInstrument.id,
      duplicatePaymentInstrumentIds: duplicateIds,
    })
  }

  const observationIds = input.observations.map((observation) => observation.id)
  await updatePaymentInstrumentObservationStatus(
    observationIds,
    "linked",
    canonicalInstrument.id,
  )

  const financialEventIds = Array.from(
    new Set(
      input.observations
        .map((observation) => observation.financialEventId)
        .filter((financialEventId): financialEventId is string => Boolean(financialEventId)),
    ),
  )

  await Promise.all(
    financialEventIds.map((financialEventId) =>
      updateFinancialEvent(financialEventId, {
        paymentInstrumentId: canonicalInstrument.id,
      }),
    ),
  )

  return canonicalInstrument
}

export async function resolveInstrumentCluster(input: {
  userId: string
  maskedIdentifier: string
}): Promise<ResolutionOutcome> {
  const observations = await listPaymentInstrumentObservationsByMaskedIdentifier({
    userId: input.userId,
    maskedIdentifier: input.maskedIdentifier,
  })

  if (observations.length === 0) {
    return {
      action: "skipped",
      reason: "missing_observations",
    }
  }

  const sourceReliability = observations.reduce(
    (acc, observation) => {
      if (observation.observationSourceKind === "bank_alert") {
        acc.bankOriginCount += 1
      } else if (observation.observationSourceKind === "statement") {
        acc.statementOriginCount += 1
      } else if (
        observation.observationSourceKind === "merchant_receipt" ||
        observation.observationSourceKind === "merchant_order"
      ) {
        acc.merchantOriginCount += 1
      }

      return acc
    },
    {
      bankOriginCount: 0,
      statementOriginCount: 0,
      merchantOriginCount: 0,
    },
  )

  const aliasHints = Array.from(
    new Set(
      observations
        .flatMap((observation) => [observation.issuerAliasHint, observation.issuerHint])
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const candidateInstruments = await listCandidatePaymentInstrumentsByMaskedIdentifier({
    userId: input.userId,
    maskedIdentifier: input.maskedIdentifier,
  })
  const candidateInstitutions = await listCandidateFinancialInstitutions({
    userId: input.userId,
    aliasHints,
  })
  const matchingCandidateInstruments = candidateInstruments.filter(
    (candidate) =>
      normalizeInstrumentMaskedIdentifier(candidate.instrument.maskedIdentifier) ===
      normalizeInstrumentMaskedIdentifier(input.maskedIdentifier),
  )

  if (
    matchingCandidateInstruments.length === 1 &&
    sourceReliability.bankOriginCount + sourceReliability.statementOriginCount > 0
  ) {
    const candidate = matchingCandidateInstruments[0]!
    const canonicalInstrument = await applyCanonicalInstrumentDecision({
      userId: input.userId,
      maskedIdentifier: input.maskedIdentifier,
      observations,
      canonicalInstitutionName:
        candidate.institution?.displayName ??
        candidate.instrument.providerName ??
        null,
      canonicalInstrumentType:
        candidate.instrument.instrumentType === "unknown"
          ? inferInstrumentTypeHint({
              signalHint: observations[0]?.instrumentTypeHint ?? null,
              sender: observations[0]?.issuerAliasHint ?? observations[0]?.issuerHint ?? null,
              subject: null,
            })
          : candidate.instrument.instrumentType,
      targetPaymentInstrumentId: candidate.instrument.id,
      decision: "link_to_existing_instrument",
    })

    return {
      action: "linked",
      reason: "existing_instrument_last4_bank_evidence",
      paymentInstrumentId: canonicalInstrument.id,
      observationIds: observations.map((observation) => observation.id),
      financialEventIds: Array.from(
        new Set(
          observations
            .map((observation) => observation.financialEventId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    }
  }

  const modelRun = await createModelRun({
    userId: input.userId,
    rawDocumentId:
      observations.find((observation) => Boolean(observation.rawDocumentId))?.rawDocumentId ??
      null,
    taskType: "entity_resolution",
    provider: "ai-gateway",
    modelName: "pending",
    promptVersion: "pending",
    status: "running",
  })

  try {
    const memory = await getMemoryBundleForUser({
      userId: input.userId,
      senderHints: observations.flatMap((observation) => [
        observation.issuerAliasHint,
        observation.issuerHint,
      ]),
      instrumentHints: observations.flatMap((observation) => [
        observation.maskedIdentifier,
        observation.counterpartyHint,
      ]),
    })

    const aiObservations = observations.slice(0, MAX_AI_INSTRUMENT_OBSERVATIONS)
    const aiCandidateInstruments = candidateInstruments.slice(0, MAX_AI_INSTRUMENT_CANDIDATES)
    const aiCandidateInstitutions = candidateInstitutions.slice(
      0,
      MAX_AI_INSTITUTION_CANDIDATES,
    )

    const aiResult = await resolvePaymentInstrumentWithAi({
      userId: input.userId,
      maskedIdentifier: input.maskedIdentifier,
      sourceReliability,
      observations: aiObservations.map((observation) => ({
        id: observation.id,
        observationSourceKind: observation.observationSourceKind,
        maskedIdentifier: observation.maskedIdentifier,
        instrumentTypeHint: observation.instrumentTypeHint,
        issuerHint: observation.issuerHint,
        issuerAliasHint: observation.issuerAliasHint,
        counterpartyHint: observation.counterpartyHint,
        networkHint: observation.networkHint,
        confidence: Number(observation.confidence),
        evidenceSummary: summarizeEvidence(observation),
      })),
      candidateInstruments: aiCandidateInstruments.map((candidate) => ({
        id: candidate.instrument.id,
        displayName: candidate.instrument.displayName,
        providerName: candidate.instrument.providerName,
        canonicalInstitutionName: candidate.institution?.displayName ?? null,
        instrumentType: candidate.instrument.instrumentType,
        maskedIdentifier: candidate.instrument.maskedIdentifier,
        linkedEventCount: Number(candidate.linkedEventCount),
      })),
      candidateInstitutions: Array.from(
        new Map(
          aiCandidateInstitutions.map((candidate) => [
            candidate.institution.id,
            {
              id: candidate.institution.id,
              displayName: candidate.institution.displayName,
              aliases: candidate.alias?.aliasText ? [candidate.alias.aliasText] : [],
            },
          ]),
        ).values(),
      ).map((candidate) => ({
        ...candidate,
        aliases: candidate.aliases.slice(0, MAX_AI_ALIAS_PER_INSTITUTION),
      })),
      memorySummary: memory.summaryLines.slice(0, MAX_AI_MEMORY_LINES),
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: aiResult.metadata.provider,
      modelName: aiResult.metadata.modelName,
      promptVersion: aiResult.metadata.promptVersion,
      inputTokens: aiResult.metadata.inputTokens,
      outputTokens: aiResult.metadata.outputTokens,
      latencyMs: aiResult.metadata.latencyMs,
      requestId: aiResult.metadata.requestId,
      resultJson: {
        recovery: aiResult.recovery,
        decision: aiResult.resolution,
      },
    })

    const reviewAnchorEventId =
      observations.find((observation) => Boolean(observation.financialEventId))?.financialEventId ??
      null
    const highConfidence = aiResult.resolution.confidence >= 0.9
    const mediumConfidence = aiResult.resolution.confidence >= 0.65

    if (
      aiResult.resolution.decision === "ignore" ||
      (!highConfidence && !mediumConfidence)
    ) {
      const financialEventIds = Array.from(
        new Set(
          observations
            .map((observation) => observation.financialEventId)
            .filter((value): value is string => Boolean(value)),
        ),
      )
      await updatePaymentInstrumentObservationStatus(
        observations.map((observation) => observation.id),
        "ignored",
      )

      return {
        action: "ignored",
        reason:
          aiResult.resolution.decision === "ignore"
            ? "llm_ignored_cluster"
            : "low_confidence_resolution",
        observationIds: observations.map((observation) => observation.id),
        financialEventIds,
      }
    }

    if (aiResult.resolution.decision === "needs_review" || !highConfidence) {
      const existingReview =
        reviewAnchorEventId
          ? await findOpenPaymentInstrumentReview({
              userId: input.userId,
              financialEventId: reviewAnchorEventId,
            })
          : null

      const reviewItem =
        existingReview ??
        (await createReviewQueueItem({
          userId: input.userId,
          itemType: "payment_instrument_resolution",
          financialEventId: reviewAnchorEventId,
          rawDocumentId:
            observations.find((observation) => Boolean(observation.rawDocumentId))?.rawDocumentId ??
            null,
          extractedSignalId:
            observations.find((observation) => Boolean(observation.extractedSignalId))
              ?.extractedSignalId ?? null,
          title: `Resolve instrument •${input.maskedIdentifier}`,
          explanation: aiResult.resolution.reason,
          proposedResolutionJson: {
            kind: "payment_instrument_resolution",
            maskedIdentifier: input.maskedIdentifier,
            confidence: aiResult.resolution.confidence,
            decision: aiResult.resolution.decision,
            canonicalInstitutionName: aiResult.resolution.canonicalInstitutionName ?? null,
            canonicalInstrumentType: aiResult.resolution.canonicalInstrumentType,
            targetPaymentInstrumentId: aiResult.resolution.targetPaymentInstrumentId ?? null,
            instrumentDisplayName: aiResult.resolution.instrumentDisplayName ?? null,
            supportingObservationIds: aiResult.resolution.supportingObservationIds,
            ignoredHints: aiResult.resolution.ignoredHints,
            matchedPaymentInstrumentIds: candidateInstruments.map(
              (candidate) => candidate.instrument.id,
            ),
          },
        }))

      await updatePaymentInstrumentObservationStatus(
        observations.map((observation) => observation.id),
        "needs_review",
      )

      return {
        action: "review",
        reason: "instrument_resolution_review",
        reviewQueueItemId: reviewItem.id,
        observationIds: observations.map((observation) => observation.id),
        financialEventIds: Array.from(
          new Set(
            observations
              .map((observation) => observation.financialEventId)
              .filter((value): value is string => Boolean(value)),
          ),
        ),
      }
    }

    const canonicalInstrument = await applyCanonicalInstrumentDecision({
      userId: input.userId,
      maskedIdentifier: input.maskedIdentifier,
      observations,
      canonicalInstitutionName: aiResult.resolution.canonicalInstitutionName ?? null,
      canonicalInstrumentType: aiResult.resolution.canonicalInstrumentType,
      targetPaymentInstrumentId: aiResult.resolution.targetPaymentInstrumentId ?? null,
      decision: aiResult.resolution.decision,
    })

    const mappedAction =
      aiResult.resolution.decision === "create_new_instrument"
        ? "created"
        : aiResult.resolution.decision === "merge_instruments"
          ? "merged"
          : aiResult.resolution.decision === "update_existing_instrument"
            ? "updated"
            : "linked"

    return {
      action: mappedAction,
      reason: aiResult.resolution.reason,
      paymentInstrumentId: canonicalInstrument.id,
      observationIds: observations.map((observation) => observation.id),
      financialEventIds: Array.from(
        new Set(
          observations
            .map((observation) => observation.financialEventId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    }
  } catch (error) {
    await updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown instrument resolution failure",
    })
    throw error
  }
}

export async function runInstrumentRepairBackfill(userId: string) {
  const financialEventIds = await listFinancialEventIdsForInstrumentRepair(userId)
  const maskedIdentifiers = new Set<string>()

  for (const financialEventId of financialEventIds) {
    const extracted = await extractInstrumentObservationsFromEvent(financialEventId)

    for (const maskedIdentifier of extracted.maskedIdentifiers ?? []) {
      maskedIdentifiers.add(maskedIdentifier)
    }
  }

  const outcomes = []
  for (const maskedIdentifier of maskedIdentifiers) {
    outcomes.push(await resolveInstrumentCluster({ userId, maskedIdentifier }))
  }

  return {
    scannedEventCount: financialEventIds.length,
    clusteredInstrumentCount: maskedIdentifiers.size,
    outcomes,
  }
}
