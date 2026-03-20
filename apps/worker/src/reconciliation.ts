import {
  createModelRun,
  createFinancialEvent,
  createFinancialEventSource,
  createReviewQueueItem,
  getDirectionForEventType,
  getExtractedSignalById,
  getFinancialEventById,
  getFinancialEventSourceByExtractedSignal,
  getFinancialEventSourceByRawDocument,
  getOrCreateMerchantForAlias,
  getRawDocumentById,
  getLatestFxRateDailyOnOrBefore,
  listMerchantAliasCandidatesForUser,
  listCandidateFinancialEvents,
  listCandidateFinancialEventsByWindow,
  listFinancialEventReconciliationContexts,
  normalizeMerchantName,
  refreshFinancialEventSourceCount,
  resolveCategoryForSignal,
  updateModelRun,
  upsertFxRateDaily,
  updateExtractedSignalStatus,
  updateFinancialEvent,
  type ExtractedSignalSelect,
  type FinancialEventInsert,
  type FinancialEventSelect,
  type FinancialEventType,
  type RawDocumentSelect,
} from "@workspace/db"
import { aiModels, aiPromptVersions, resolveReconciliationWithAi } from "@workspace/ai"
import { fetchCurrencyApiHistoricalRate } from "@workspace/integrations"

import { deriveMerchantDisplayName } from "./merchant-name"
import { resolveExistingMerchantFastPath } from "./merchant-fast-path"

const FX_PROVIDER = "currencyapi" as const
const FX_DUPLICATE_RATE_LOOKBACK_DAYS = 7
const FX_DUPLICATE_TOLERANCE_RATIO = 0.02
const FX_DUPLICATE_TOLERANCE_MINOR = 100
const AI_RECONCILIATION_CONFIDENCE_THRESHOLD = 0.9
const AI_RECONCILIATION_SHORTLIST_LIMIT = 5

type CandidateMatchSet = {
  plausible: FinancialEventSelect[]
  exact: FinancialEventSelect[]
}

type ReconciliationCandidateContext = Awaited<
  ReturnType<typeof listFinancialEventReconciliationContexts>
>[number]

type ReconciliationCandidateEventSummary = {
  event: FinancialEventSelect
  merchantName: string | null
  paymentProcessorName: string | null
  paymentInstrumentName: string | null
  sources: ReconciliationCandidateContext[]
  isBankSettlementSource: boolean
}

type ReconciliationAiDecisionOutcome =
  | { action: "unavailable" }
  | {
      action: "merge"
      confidence: number
      financialEventId: string
      canonicalEventType: FinancialEventType | null
      resultJson: Record<string, unknown>
    }
  | {
      action: "create"
      confidence: number
      canonicalEventType: FinancialEventType | null
      resultJson: Record<string, unknown>
    }
  | {
      action: "review"
      confidence: number
      resultJson: Record<string, unknown>
      explanation: string
    }

type ReconciliationOutcome =
  | {
      action: "skipped"
      reasonCode: string
    }
  | {
      action: "ignored"
      reasonCode: string
    }
  | {
      action: "created"
      reasonCode: string
      financialEventId: string
    }
  | {
      action: "merged"
      reasonCode: string
      financialEventId: string
    }
  | {
      action: "review"
      reasonCode: string
      reviewQueueItemId: string
    }

type EventDraft = Pick<
  FinancialEventInsert,
  | "userId"
  | "eventType"
  | "direction"
  | "amountMinor"
  | "currency"
  | "eventOccurredAt"
  | "postedAt"
  | "merchantId"
  | "paymentInstrumentId"
  | "paymentProcessorId"
  | "categoryId"
  | "merchantDescriptorRaw"
  | "description"
  | "notes"
  | "confidence"
  | "needsReview"
  | "isRecurringCandidate"
  | "isTransfer"
  | "status"
  | "sourceCount"
>

function normalizeWhitespace(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const normalized = input.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : null
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

function looksLikeIssuerOrSenderAlias(input: string | null | undefined) {
  const lowered = input?.toLowerCase() ?? ""

  return (
    lowered.includes("@") ||
    /\b(bank|credit[_ ]?cards?|debit[_ ]?cards?|instaalert|statement|alerts?|transaction|noreply|no-reply)\b/.test(
      lowered,
    )
  )
}

function getProvisionalMerchantAliases(
  signal: ExtractedSignalSelect,
  rawDocument: RawDocumentSelect,
) {
  const candidates = [
    deriveMerchantDisplayName(signal.merchantNameCandidate),
    deriveMerchantDisplayName(signal.merchantHint),
    deriveMerchantDisplayName(signal.merchantRaw),
    deriveMerchantDisplayName(signal.merchantDescriptorRaw),
    normalizeWhitespace(signal.merchantNameCandidate),
    normalizeWhitespace(signal.merchantHint),
    normalizeWhitespace(signal.merchantRaw),
    normalizeWhitespace(signal.merchantDescriptorRaw),
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    if (!looksLikeIssuerOrSenderAlias(candidate)) {
      return [candidate]
    }
  }

  const senderDisplayName = extractSenderDisplayName(rawDocument.fromAddress)
  if (senderDisplayName && !looksLikeIssuerOrSenderAlias(senderDisplayName)) {
    return [senderDisplayName]
  }

  const senderEmail = extractSenderEmail(rawDocument.fromAddress)
  if (senderEmail && !looksLikeIssuerOrSenderAlias(senderEmail)) {
    candidates.push(senderEmail)
  }

  return candidates.filter(
    (candidate, index, values): candidate is string =>
      Boolean(candidate) && values.indexOf(candidate) === index,
  )
}

function getProvisionalMerchantAlias(
  signal: ExtractedSignalSelect,
  rawDocument: RawDocumentSelect,
) {
  return getProvisionalMerchantAliases(signal, rawDocument)[0] ?? null
}

function getSafeEventDescription(
  signal: ExtractedSignalSelect,
  rawDocument: RawDocumentSelect,
) {
  return (
    getProvisionalMerchantAlias(signal, rawDocument) ??
    normalizeWhitespace(rawDocument.subject) ??
    null
  )
}

function mapCandidateEventTypeToFinancialEventType(
  candidateEventType: ExtractedSignalSelect["candidateEventType"],
): FinancialEventType | null {
  switch (candidateEventType) {
    case "purchase":
    case "income":
    case "subscription_charge":
    case "emi_payment":
    case "bill_payment":
    case "refund":
    case "transfer":
      return candidateEventType
    default:
      return null
  }
}

function looksPromotional(rawDocument: RawDocumentSelect, signal: ExtractedSignalSelect) {
  const combined = [
    rawDocument.subject,
    rawDocument.snippet,
    rawDocument.bodyText,
    signal.merchantRaw,
    signal.merchantHint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return /\b(save up to|offer|offers|deal|deals|discount|discounts|cashback|upgrade|exclusive|need funds|pre-?approved|starting at|big savings|sale)\b/.test(
    combined,
  )
}

function hasActionableEvidence(rawDocument: RawDocumentSelect, signal: ExtractedSignalSelect) {
  const combined = [
    rawDocument.subject,
    rawDocument.snippet,
    rawDocument.bodyText,
    signal.merchantRaw,
    signal.merchantHint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return /\b(transaction|debited|credited|charged|paid|payment due|bill due|order id|order confirmed|placed successfully|receipt|invoice|refund|reversed|salary credited|standing instruction|registered successfully)\b/.test(
    combined,
  )
}

function getEventWindowHours(eventType: FinancialEventType) {
  switch (eventType) {
    case "purchase":
    case "refund":
    case "transfer":
    case "income":
      return 24
    case "subscription_charge":
    case "emi_payment":
    case "bill_payment":
      return 72
  }
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function shiftDate(dateKey: string, offsetDays: number) {
  const value = new Date(`${dateKey}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return formatDateKey(value)
}

function getCompatibleDuplicateEventTypes(eventType: FinancialEventType) {
  switch (eventType) {
    case "purchase":
    case "subscription_charge":
    case "emi_payment":
    case "bill_payment":
      return [
        "purchase",
        "subscription_charge",
        "emi_payment",
        "bill_payment",
      ] as FinancialEventType[]
    default:
      return [eventType] as FinancialEventType[]
  }
}

function canUseCrossTypeReconciliation(eventType: FinancialEventType) {
  return getCompatibleDuplicateEventTypes(eventType).length > 1
}

function normalizeEvidenceSnippets(value: unknown) {
  if (!value || typeof value !== "object") {
    return []
  }

  const snippets = (value as Record<string, unknown>).snippets
  if (!Array.isArray(snippets)) {
    return []
  }

  return snippets.filter((snippet): snippet is string => typeof snippet === "string").slice(0, 4)
}

function isLikelyBankSettlementEvidence(input: {
  sender: string | null | undefined
  issuerHint: string | null | undefined
  subject: string | null | undefined
  snippet: string | null | undefined
}) {
  const combined = [
    input.sender,
    input.issuerHint,
    input.subject,
    input.snippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return /\b(bank|credit[_ ]?cards?|debit[_ ]?cards?|instaalert|statement|alerts?|transaction alert|card xx|available credit limit|available balance)\b/.test(
    combined,
  )
}

function inferIncomingBankSettlementSource(
  signal: ExtractedSignalSelect,
  rawDocument: RawDocumentSelect,
) {
  return isLikelyBankSettlementEvidence({
    sender: rawDocument.fromAddress,
    issuerHint: signal.issuerNameHint,
    subject: rawDocument.subject,
    snippet: rawDocument.snippet,
  })
}

function buildModelRunResultJson(input: {
  decision: string
  confidence: number
  targetFinancialEventId?: string | null
  canonicalEventType?: string | null
  reason: string
  supportingCandidateIds?: string[]
  contradictions?: string[]
  warnings?: string[]
}) {
  return {
    decision: input.decision,
    confidence: input.confidence,
    targetFinancialEventId: input.targetFinancialEventId ?? null,
    canonicalEventType: input.canonicalEventType ?? null,
    reason: input.reason,
    supportingCandidateIds: input.supportingCandidateIds ?? [],
    contradictions: input.contradictions ?? [],
    warnings: input.warnings ?? [],
  }
}

async function resolveHistoricalDuplicateFxRate(input: {
  baseCurrency: string
  quoteCurrency: string
  eventDate: string
}) {
  const cached = await getLatestFxRateDailyOnOrBefore({
    provider: FX_PROVIDER,
    baseCurrency: input.baseCurrency,
    quoteCurrency: input.quoteCurrency,
    rateDate: input.eventDate,
  })

  if (cached) {
    return cached
  }

  for (let offset = 0; offset < FX_DUPLICATE_RATE_LOOKBACK_DAYS; offset += 1) {
    const rateDate = shiftDate(input.eventDate, -offset)
    const remote = await fetchCurrencyApiHistoricalRate({
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      date: rateDate,
    })

    if (!remote) {
      continue
    }

    return upsertFxRateDaily({
      provider: remote.provider,
      baseCurrency: remote.baseCurrency,
      quoteCurrency: remote.quoteCurrency,
      rateDate: remote.rateDate,
      rate: remote.rate,
      fetchedAt: new Date(),
    })
  }

  return null
}

async function amountsLikelyRepresentSameTransaction(input: {
  signalAmountMinor: number
  signalCurrency: string
  signalOccurredAt: Date
  candidateAmountMinor: number
  candidateCurrency: string
}) {
  if (input.signalCurrency === input.candidateCurrency) {
    return input.signalAmountMinor === input.candidateAmountMinor
  }

  const rate = await resolveHistoricalDuplicateFxRate({
    baseCurrency: input.signalCurrency,
    quoteCurrency: input.candidateCurrency,
    eventDate: formatDateKey(input.signalOccurredAt),
  })

  if (!rate) {
    return false
  }

  const convertedAmountMinor = Math.round(input.signalAmountMinor * rate.rate)
  const toleranceMinor = Math.max(
    FX_DUPLICATE_TOLERANCE_MINOR,
    Math.round(convertedAmountMinor * FX_DUPLICATE_TOLERANCE_RATIO),
  )

  return Math.abs(input.candidateAmountMinor - convertedAmountMinor) <= toleranceMinor
}

function buildOccurredAt(signal: ExtractedSignalSelect, rawDocument: RawDocumentSelect) {
  if (signal.eventDate) {
    const parts = signal.eventDate.split("-").map(Number)

    if (parts.length === 3) {
      const year = parts[0]!
      const month = parts[1]!
      const day = parts[2]!

      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        Number.isFinite(day)
      ) {
        return new Date(
          Date.UTC(
            year,
            month - 1,
            day,
            rawDocument.messageTimestamp.getUTCHours(),
            rawDocument.messageTimestamp.getUTCMinutes(),
            rawDocument.messageTimestamp.getUTCSeconds(),
            rawDocument.messageTimestamp.getUTCMilliseconds(),
          ),
        )
      }
    }
  }

  return rawDocument.messageTimestamp
}

function hasWeakMerchantIdentity(
  signal: ExtractedSignalSelect,
  rawDocument: RawDocumentSelect,
  amountMinor: number,
) {
  const merchantCandidate =
    normalizeWhitespace(signal.merchantHint) ||
    normalizeWhitespace(signal.merchantRaw) ||
    extractSenderDisplayName(rawDocument.fromAddress)

  if (!merchantCandidate) {
    return amountMinor >= 50_000
  }

  const lowered = merchantCandidate.toLowerCase()

  if (
    /^(alerts?|notifications?|bank|cards?|credit cards?|debit cards?|noreply|no-reply|team)$/.test(
      lowered,
    )
  ) {
    return amountMinor >= 50_000
  }

  return false
}

function serializeEventDraft(eventDraft: EventDraft) {
  return {
    ...eventDraft,
    eventOccurredAt: eventDraft.eventOccurredAt.toISOString(),
    postedAt: eventDraft.postedAt?.toISOString() ?? null,
  }
}

function groupCandidateEventSummaries(rows: ReconciliationCandidateContext[]) {
  const grouped = new Map<string, ReconciliationCandidateEventSummary>()

  for (const row of rows) {
    const existing = grouped.get(row.event.id)

    if (existing) {
      existing.sources.push(row)
      if (!existing.isBankSettlementSource) {
        existing.isBankSettlementSource = isLikelyBankSettlementEvidence({
          sender: row.rawDocument?.fromAddress,
          issuerHint: row.extractedSignal?.issuerNameHint,
          subject: row.rawDocument?.subject,
          snippet: row.rawDocument?.snippet,
        })
      }
      continue
    }

    grouped.set(row.event.id, {
      event: row.event,
      merchantName: row.merchant?.displayName ?? null,
      paymentProcessorName: row.paymentProcessor?.displayName ?? null,
      paymentInstrumentName: row.paymentInstrument?.displayName ?? null,
      sources: [row],
      isBankSettlementSource: isLikelyBankSettlementEvidence({
        sender: row.rawDocument?.fromAddress,
        issuerHint: row.extractedSignal?.issuerNameHint,
        subject: row.rawDocument?.subject,
        snippet: row.rawDocument?.snippet,
      }),
    })
  }

  return grouped
}

function summarizeCandidateForAi(candidate: ReconciliationCandidateEventSummary) {
  return {
    financialEventId: candidate.event.id,
    eventType: candidate.event.eventType,
    direction: candidate.event.direction,
    amountMinor: candidate.event.amountMinor,
    currency: candidate.event.currency,
    eventOccurredAtIso: candidate.event.eventOccurredAt.toISOString(),
    createdAtIso: candidate.event.createdAt.toISOString(),
    merchantName: candidate.merchantName,
    processorName: candidate.paymentProcessorName,
    paymentInstrumentName: candidate.paymentInstrumentName,
    description: candidate.event.description ?? null,
    sourceCount: candidate.sources.length,
    isBankSettlementSource: candidate.isBankSettlementSource,
    sources: candidate.sources.slice(0, 3).map((row) => ({
      rawDocumentId: row.rawDocument?.id ?? null,
      subject: row.rawDocument?.subject ?? null,
      sender: row.rawDocument?.fromAddress ?? null,
      timestampIso: row.rawDocument?.messageTimestamp?.toISOString() ?? null,
      signalType: row.extractedSignal?.signalType ?? null,
      candidateEventType: row.extractedSignal?.candidateEventType ?? null,
      descriptor: row.extractedSignal?.merchantDescriptorRaw ?? null,
      merchantHint:
        row.extractedSignal?.merchantNameCandidate ??
        row.extractedSignal?.merchantHint ??
        row.extractedSignal?.merchantRaw ??
        null,
      processorHint: row.extractedSignal?.processorNameCandidate ?? null,
      evidenceSnippets: normalizeEvidenceSnippets(row.extractedSignal?.evidenceJson),
      linkReason: row.source?.linkReason ?? "linked_source",
    })),
  }
}

function summarizeIncomingForAi(input: {
  signal: ExtractedSignalSelect
  rawDocument: RawDocumentSelect
  eventDraft: EventDraft
}) {
  return {
    rawDocumentId: input.rawDocument.id,
    signalId: input.signal.id,
    signalType: input.signal.signalType,
    candidateEventType: input.signal.candidateEventType ?? null,
    amountMinor: input.signal.amountMinor!,
    currency: input.signal.currency!,
    occurredAtIso: input.eventDraft.eventOccurredAt.toISOString(),
    confidence: Number(input.signal.confidence),
    merchantName:
      input.signal.merchantNameCandidate ??
      input.signal.merchantHint ??
      input.signal.merchantRaw ??
      input.eventDraft.description ??
      null,
    processorName: input.signal.processorNameCandidate ?? null,
    issuerName: input.signal.issuerNameHint ?? null,
    descriptor: input.signal.merchantDescriptorRaw ?? null,
    sender: input.rawDocument.fromAddress,
    subject: input.rawDocument.subject,
    snippet: input.rawDocument.snippet,
    bodyTextExcerpt: normalizeWhitespace(input.rawDocument.bodyText)?.slice(0, 1200) ?? null,
    evidenceSnippets: normalizeEvidenceSnippets(input.signal.evidenceJson),
    isBankSettlementSource: inferIncomingBankSettlementSource(input.signal, input.rawDocument),
  }
}

function buildAiReviewExplanation(reason: string, confidence: number) {
  return `AI reconciliation could not safely auto-apply this decision. ${reason} (confidence ${Math.round(confidence * 100)}%).`
}

function getShortlistCandidateIds(matchSet: CandidateMatchSet) {
  return [...new Set(matchSet.plausible.map((candidate) => candidate.id))].slice(
    0,
    AI_RECONCILIATION_SHORTLIST_LIMIT,
  )
}

async function buildEventDraft(input: {
  userId: string
  signal: ExtractedSignalSelect
  rawDocument: RawDocumentSelect
  eventType: FinancialEventType
}) {
  const merchantHints = getProvisionalMerchantAliases(input.signal, input.rawDocument)
  const aliasCandidates = await listMerchantAliasCandidatesForUser(input.userId)
  const merchantMatch = resolveExistingMerchantFastPath({
    merchantHints,
    aliasCandidates,
  })
  const merchant =
    merchantMatch.status === "matched_existing_merchant"
      ? await getOrCreateMerchantForAlias({
          userId: input.userId,
          aliasText: merchantMatch.merchantDisplayName,
          source: "reconciliation",
          confidence: input.signal.confidence,
        })
      : null

  const category = await resolveCategoryForSignal(input.userId, input.signal)

  return {
    userId: input.userId,
    eventType: input.eventType,
    direction: getDirectionForEventType(input.eventType),
    amountMinor: input.signal.amountMinor!,
    currency: input.signal.currency!,
    eventOccurredAt: buildOccurredAt(input.signal, input.rawDocument),
    postedAt: input.rawDocument.messageTimestamp,
    merchantId: merchant?.id ?? null,
    paymentInstrumentId: null,
    paymentProcessorId: null,
    categoryId: category?.id ?? null,
    merchantDescriptorRaw: input.signal.merchantDescriptorRaw ?? null,
    description:
      merchant?.displayName ??
      getSafeEventDescription(input.signal, input.rawDocument) ??
      null,
    notes: normalizeWhitespace(
      typeof input.signal.evidenceJson?.explanation === "string"
        ? input.signal.evidenceJson.explanation
        : null,
    ),
    confidence: input.signal.confidence,
    needsReview: false,
    isRecurringCandidate: input.signal.isRecurringHint,
    isTransfer: input.eventType === "transfer",
    sourceCount: 0,
    status: "confirmed",
  } satisfies EventDraft
}

async function resolveAiReconciliationDecision(input: {
  userId: string
  signal: ExtractedSignalSelect
  rawDocument: RawDocumentSelect
  eventDraft: EventDraft
  shortlistCandidates: FinancialEventSelect[]
}) : Promise<{
  outcome: ReconciliationAiDecisionOutcome
  modelRunId: string | null
}> {
  const modelRun = await createModelRun({
    userId: input.userId,
    rawDocumentId: input.rawDocument.id,
    taskType: "reconciliation_resolution",
    provider: "ai-gateway",
    modelName: aiModels.financeReconciliationResolver,
    promptVersion: aiPromptVersions.financeReconciliationResolver,
    status: "running",
  })

  try {
    const candidateIds = input.shortlistCandidates.map((candidate) => candidate.id)
    const candidateContexts = groupCandidateEventSummaries(
      await listFinancialEventReconciliationContexts(candidateIds),
    )
    const candidates = candidateIds
      .map((candidateId) => candidateContexts.get(candidateId))
      .filter((candidate): candidate is ReconciliationCandidateEventSummary => Boolean(candidate))
      .slice(0, AI_RECONCILIATION_SHORTLIST_LIMIT)

    const resolved = await resolveReconciliationWithAi({
      incoming: summarizeIncomingForAi(input),
      candidates: candidates.map(summarizeCandidateForAi),
    })

    const decision = resolved.decision
    const resultJson = buildModelRunResultJson({
      decision: decision.decision,
      confidence: decision.confidence,
      targetFinancialEventId: decision.targetFinancialEventId ?? null,
      canonicalEventType: decision.canonicalEventType ?? null,
      reason: decision.reason,
      supportingCandidateIds: decision.supportingCandidateIds,
      contradictions: decision.contradictions,
      warnings: decision.warnings,
    })

    await updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: resolved.metadata.provider,
      modelName: resolved.metadata.modelName,
      promptVersion: resolved.metadata.promptVersion,
      inputTokens: resolved.metadata.inputTokens,
      outputTokens: resolved.metadata.outputTokens,
      latencyMs: resolved.metadata.latencyMs,
      requestId: resolved.metadata.requestId,
      resultJson,
    })

    if (decision.confidence < AI_RECONCILIATION_CONFIDENCE_THRESHOLD) {
      return {
        outcome: {
          action: "review",
          confidence: decision.confidence,
          resultJson,
          explanation: buildAiReviewExplanation(decision.reason, decision.confidence),
        },
        modelRunId: modelRun.id,
      }
    }

    if (decision.decision === "merge_with_existing_event") {
      const targetFinancialEventId = decision.targetFinancialEventId ?? null
      if (!targetFinancialEventId || !candidateIds.includes(targetFinancialEventId)) {
        return {
          outcome: {
            action: "review",
            confidence: decision.confidence,
            resultJson,
            explanation: "AI selected an invalid reconciliation target.",
          },
          modelRunId: modelRun.id,
        }
      }

      const canonicalEventType =
        decision.canonicalEventType && canUseCrossTypeReconciliation(input.eventDraft.eventType)
          ? (decision.canonicalEventType as FinancialEventType)
          : null

      return {
        outcome: {
          action: "merge",
          confidence: decision.confidence,
          financialEventId: targetFinancialEventId,
          canonicalEventType,
          resultJson,
        },
        modelRunId: modelRun.id,
      }
    }

    if (decision.decision === "create_new_event") {
      const canonicalEventType =
        decision.canonicalEventType && canUseCrossTypeReconciliation(input.eventDraft.eventType)
          ? (decision.canonicalEventType as FinancialEventType)
          : null

      return {
        outcome: {
          action: "create",
          confidence: decision.confidence,
          canonicalEventType,
          resultJson,
        },
        modelRunId: modelRun.id,
      }
    }

    return {
      outcome: {
        action: "review",
        confidence: decision.confidence,
        resultJson,
        explanation: decision.reason,
      },
      modelRunId: modelRun.id,
    }
  } catch (error) {
    await updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown reconciliation resolution failure",
    })

    return {
      outcome: { action: "unavailable" },
      modelRunId: modelRun.id,
    }
  }
}

function pickCandidateMatches(
  candidates: FinancialEventSelect[],
  eventDraft: EventDraft,
) {
  if (candidates.length === 0) {
    return {
      plausible: [] as FinancialEventSelect[],
      exact: [] as FinancialEventSelect[],
    }
  }

  const exact = candidates.filter(
    (candidate) =>
      candidate.merchantId === eventDraft.merchantId &&
      candidate.paymentInstrumentId === eventDraft.paymentInstrumentId,
  )

  if (exact.length > 0) {
    return { plausible: exact, exact }
  }

  const merchantMatches = eventDraft.merchantId
    ? candidates.filter((candidate) => candidate.merchantId === eventDraft.merchantId)
    : []

  if (merchantMatches.length > 0) {
    return {
      plausible: merchantMatches,
      exact: [],
    }
  }

  const instrumentMatches = eventDraft.paymentInstrumentId
    ? candidates.filter(
        (candidate) => candidate.paymentInstrumentId === eventDraft.paymentInstrumentId,
      )
    : []

  if (instrumentMatches.length > 0) {
    return {
      plausible: instrumentMatches,
      exact: [],
    }
  }

  return {
    plausible: candidates,
    exact: [],
  }
}

function getCompatibleAutoUpgradeEventType(input: {
  currentEventType: FinancialEventType
  requestedEventType: FinancialEventType | null
}) {
  if (!input.requestedEventType) {
    return null
  }

  if (input.currentEventType === input.requestedEventType) {
    return null
  }

  const compatibleTypes = getCompatibleDuplicateEventTypes(input.currentEventType)
  return compatibleTypes.includes(input.requestedEventType) ? input.requestedEventType : null
}

function buildCanonicalMergePatch(input: {
  existingEvent: FinancialEventSelect
  eventDraft: EventDraft
  incomingIsBankSettlement: boolean
  existingHasBankSettlement: boolean
  canonicalEventType: FinancialEventType | null
}) {
  const patch: Partial<EventDraft> = {}

  const upgradedEventType = getCompatibleAutoUpgradeEventType({
    currentEventType: input.existingEvent.eventType,
    requestedEventType: input.canonicalEventType,
  })

  if (upgradedEventType) {
    patch.eventType = upgradedEventType
    patch.direction = getDirectionForEventType(upgradedEventType)
    patch.isTransfer = upgradedEventType === "transfer"
  }

  if (
    input.eventDraft.currency !== input.existingEvent.currency &&
    input.incomingIsBankSettlement &&
    !input.existingHasBankSettlement
  ) {
    patch.amountMinor = input.eventDraft.amountMinor
    patch.currency = input.eventDraft.currency
  }

  return patch
}

async function mergeIntoFinancialEvent(input: {
  signal: ExtractedSignalSelect
  rawDocument: RawDocumentSelect
  financialEventId: string
  eventDraft: EventDraft
  reasonCode: string
  canonicalEventType?: FinancialEventType | null
  incomingIsBankSettlement?: boolean
  existingHasBankSettlement?: boolean
  modelRunId?: string | null
  resultJson?: Record<string, unknown> | null
}) {
  const event = await getFinancialEventById(input.financialEventId)

  if (!event) {
    throw new Error(`Missing financial event ${input.financialEventId}`)
  }

  const patch: Partial<EventDraft> = {}

  if (!event.merchantId && input.eventDraft.merchantId) {
    patch.merchantId = input.eventDraft.merchantId
  }

  if (!event.merchantDescriptorRaw && input.eventDraft.merchantDescriptorRaw) {
    patch.merchantDescriptorRaw = input.eventDraft.merchantDescriptorRaw
  }

  if (!event.paymentInstrumentId && input.eventDraft.paymentInstrumentId) {
    patch.paymentInstrumentId = input.eventDraft.paymentInstrumentId
  }

  if (!event.categoryId && input.eventDraft.categoryId) {
    patch.categoryId = input.eventDraft.categoryId
  }

  if (!event.description && input.eventDraft.description) {
    patch.description = input.eventDraft.description
  }

  if (Number(event.confidence) < Number(input.eventDraft.confidence)) {
    patch.confidence = input.eventDraft.confidence
  }

  Object.assign(
    patch,
    buildCanonicalMergePatch({
      existingEvent: event,
      eventDraft: input.eventDraft,
      incomingIsBankSettlement: input.incomingIsBankSettlement ?? false,
      existingHasBankSettlement: input.existingHasBankSettlement ?? false,
      canonicalEventType: input.canonicalEventType ?? null,
    }),
  )

  if (Object.keys(patch).length > 0) {
    await updateFinancialEvent(event.id, patch)
  }

  await createFinancialEventSource({
    financialEventId: event.id,
    rawDocumentId: input.rawDocument.id,
    extractedSignalId: input.signal.id,
    linkReason: input.reasonCode,
  })
  await refreshFinancialEventSourceCount(event.id)
  await updateExtractedSignalStatus(input.signal.id, "reconciled")

  if (input.modelRunId) {
    await updateModelRun(input.modelRunId, {
      financialEventId: event.id,
      resultJson: input.resultJson ?? undefined,
    })
  }

  return event.id
}

async function createReviewForSignal(input: {
  userId: string
  signal: ExtractedSignalSelect
  rawDocument: RawDocumentSelect
  itemType?: "signal_reconciliation" | "duplicate_match" | "merchant_conflict" | "instrument_conflict"
  title: string
  explanation: string
  reasonCode: string
  proposedResolutionJson?: Record<string, unknown>
}) {
  const reviewItem = await createReviewQueueItem({
    userId: input.userId,
    itemType: input.itemType ?? "signal_reconciliation",
    rawDocumentId: input.rawDocument.id,
    extractedSignalId: input.signal.id,
    title: input.title,
    explanation: input.explanation,
    proposedResolutionJson: {
      reasonCode: input.reasonCode,
      ...input.proposedResolutionJson,
    },
  })

  await updateExtractedSignalStatus(input.signal.id, "needs_review")

  return reviewItem.id
}

export async function reconcileExtractedSignal(input: {
  userId: string
  extractedSignalId: string
  rawDocumentId: string
}) : Promise<ReconciliationOutcome> {
  const signal = await getExtractedSignalById(input.extractedSignalId)

  if (!signal) {
    throw new Error(`Missing extracted signal ${input.extractedSignalId}`)
  }

  const existingSource = await getFinancialEventSourceByExtractedSignal(signal.id)
  if (existingSource) {
    return {
      action: "skipped",
      reasonCode: "already_reconciled",
    }
  }

  const rawDocument = await getRawDocumentById(input.rawDocumentId)
  if (!rawDocument) {
    throw new Error(`Missing raw document ${input.rawDocumentId}`)
  }

  const eventType = mapCandidateEventTypeToFinancialEventType(signal.candidateEventType)
  if (!eventType || signal.signalType === "generic_finance_signal") {
    await updateExtractedSignalStatus(signal.id, "ignored")
    return {
      action: "ignored",
      reasonCode: "non_canonical_signal",
    }
  }

  if (looksPromotional(rawDocument, signal) && !hasActionableEvidence(rawDocument, signal)) {
    await updateExtractedSignalStatus(signal.id, "ignored")
    return {
      action: "ignored",
      reasonCode: "promotional_finance_content",
    }
  }

  if (signal.amountMinor === null || !signal.currency) {
    await updateExtractedSignalStatus(signal.id, "ignored")
    return {
      action: "ignored",
      reasonCode: "insufficient_amount_or_currency",
    }
  }

  const eventDraft = await buildEventDraft({
    userId: input.userId,
    signal,
    rawDocument,
    eventType,
  })

  const existingRawDocumentSource = await getFinancialEventSourceByRawDocument(rawDocument.id)
  if (existingRawDocumentSource?.financialEventId) {
    const financialEventId = await mergeIntoFinancialEvent({
      signal,
      rawDocument,
      financialEventId: existingRawDocumentSource.financialEventId,
      eventDraft,
      reasonCode: "same_raw_document",
    })

    return {
      action: "merged",
      reasonCode: "same_raw_document",
      financialEventId,
    }
  }

  const windowHours = getEventWindowHours(eventType)
  const from = new Date(eventDraft.eventOccurredAt.getTime() - windowHours * 60 * 60 * 1000)
  const to = new Date(eventDraft.eventOccurredAt.getTime() + windowHours * 60 * 60 * 1000)

  const candidates = await listCandidateFinancialEvents({
    userId: input.userId,
    eventType,
    amountMinor: signal.amountMinor,
    currency: signal.currency,
    from,
    to,
  })
  const exactMatches = pickCandidateMatches(candidates, eventDraft)
  const duplicateMerchantKey =
    normalizeMerchantName(eventDraft.description) ??
    normalizeMerchantName(signal.merchantHint) ??
    normalizeMerchantName(signal.merchantRaw) ??
    normalizeMerchantName(signal.merchantDescriptorRaw)

  const obligationEventTypes = ["subscription_charge", "emi_payment", "bill_payment"] as const
  const needsObligationReview =
    obligationEventTypes.includes(
      eventType as (typeof obligationEventTypes)[number],
    ) && signal.confidence < 0.88
  const requiresWeakSignalReview =
    hasWeakMerchantIdentity(signal, rawDocument, signal.amountMinor) ||
    (eventType === "transfer" && !eventDraft.paymentInstrumentId && !eventDraft.merchantId) ||
    needsObligationReview ||
    signal.confidence < 0.8

  if (exactMatches.plausible.length === 1) {
    const firstMatch = exactMatches.plausible[0]

    if (!firstMatch) {
      throw new Error("Expected a reconciliation match but none was present")
    }

    const financialEventId = await mergeIntoFinancialEvent({
      signal,
      rawDocument,
      financialEventId: firstMatch.id,
      eventDraft,
      reasonCode: exactMatches.exact.length === 1 ? "exact_duplicate_match" : "candidate_duplicate_match",
    })

    return {
      action: "merged",
      reasonCode:
        exactMatches.exact.length === 1 ? "exact_duplicate_match" : "candidate_duplicate_match",
      financialEventId,
    }
  }

  let aiShortlist = exactMatches.plausible.slice(0, AI_RECONCILIATION_SHORTLIST_LIMIT)

  if (
    aiShortlist.length === 0 &&
    (eventDraft.merchantId || duplicateMerchantKey) &&
    canUseCrossTypeReconciliation(eventType)
  ) {
    const broadCandidates = await listCandidateFinancialEventsByWindow({
      userId: input.userId,
      eventTypes: getCompatibleDuplicateEventTypes(eventType),
      from,
      to,
    })

    const relaxedCandidates: FinancialEventSelect[] = []

    for (const candidate of broadCandidates) {
      if (candidate.id === existingRawDocumentSource?.financialEventId) {
        continue
      }

      const candidateMerchantKey = normalizeMerchantName(candidate.description)
      const sharesMerchantIdentity =
        (eventDraft.merchantId && candidate.merchantId === eventDraft.merchantId) ||
        (duplicateMerchantKey && candidateMerchantKey === duplicateMerchantKey)

      if (!sharesMerchantIdentity) {
        continue
      }

      if (
        await amountsLikelyRepresentSameTransaction({
          signalAmountMinor: signal.amountMinor,
          signalCurrency: signal.currency,
          signalOccurredAt: eventDraft.eventOccurredAt,
          candidateAmountMinor: candidate.amountMinor,
          candidateCurrency: candidate.currency,
        })
      ) {
        relaxedCandidates.push(candidate)
      }
    }

    aiShortlist = relaxedCandidates.slice(0, AI_RECONCILIATION_SHORTLIST_LIMIT)
  }

  const shouldRunAiReconciliation =
    aiShortlist.length > 0 || requiresWeakSignalReview

  if (shouldRunAiReconciliation) {
    const aiDecision = await resolveAiReconciliationDecision({
      userId: input.userId,
      signal,
      rawDocument,
      eventDraft,
      shortlistCandidates: aiShortlist,
    })

    if (aiDecision.outcome.action === "merge") {
      const candidateContextMap = groupCandidateEventSummaries(
        await listFinancialEventReconciliationContexts([aiDecision.outcome.financialEventId]),
      )
      const candidateSummary = candidateContextMap.get(aiDecision.outcome.financialEventId)

      const financialEventId = await mergeIntoFinancialEvent({
        signal,
        rawDocument,
        financialEventId: aiDecision.outcome.financialEventId,
        eventDraft: aiDecision.outcome.canonicalEventType
          ? {
              ...eventDraft,
              eventType: aiDecision.outcome.canonicalEventType,
              direction: getDirectionForEventType(aiDecision.outcome.canonicalEventType),
              isTransfer: aiDecision.outcome.canonicalEventType === "transfer",
            }
          : eventDraft,
        reasonCode: "ai_reconciliation_merge",
        canonicalEventType: aiDecision.outcome.canonicalEventType,
        incomingIsBankSettlement: inferIncomingBankSettlementSource(signal, rawDocument),
        existingHasBankSettlement: candidateSummary?.isBankSettlementSource ?? false,
        modelRunId: aiDecision.modelRunId,
        resultJson: aiDecision.outcome.resultJson,
      })

      return {
        action: "merged",
        reasonCode: "ai_reconciliation_merge",
        financialEventId,
      }
    }

    if (aiDecision.outcome.action === "create") {
      const createDraft =
        aiDecision.outcome.canonicalEventType &&
        aiDecision.outcome.canonicalEventType !== eventDraft.eventType
          ? {
              ...eventDraft,
              eventType: aiDecision.outcome.canonicalEventType,
              direction: getDirectionForEventType(aiDecision.outcome.canonicalEventType),
              isTransfer: aiDecision.outcome.canonicalEventType === "transfer",
            }
          : eventDraft

      const financialEvent = await createFinancialEvent(createDraft)
      await createFinancialEventSource({
        financialEventId: financialEvent.id,
        rawDocumentId: rawDocument.id,
        extractedSignalId: signal.id,
        linkReason: "ai_reconciliation_create",
      })
      await refreshFinancialEventSourceCount(financialEvent.id)
      await updateExtractedSignalStatus(signal.id, "reconciled")

      if (aiDecision.modelRunId) {
        await updateModelRun(aiDecision.modelRunId, {
          financialEventId: financialEvent.id,
          resultJson: aiDecision.outcome.resultJson,
        })
      }

      return {
        action: "created",
        reasonCode: "ai_reconciliation_create",
        financialEventId: financialEvent.id,
      }
    }

    if (aiDecision.outcome.action === "review") {
      const reviewQueueItemId = await createReviewForSignal({
        userId: input.userId,
        signal,
        rawDocument,
        itemType: aiShortlist.length > 0 ? "duplicate_match" : "signal_reconciliation",
        title:
          aiShortlist.length > 0
            ? "AI reconciliation requires review"
            : "AI reconciliation could not confirm creation",
        explanation: aiDecision.outcome.explanation,
        reasonCode: "ai_reconciliation_review",
        proposedResolutionJson: {
          action: aiShortlist.length > 0 ? "merge_or_create" : "create",
          matchedEventIds: aiShortlist.map((event) => event.id),
          eventDraft: serializeEventDraft(eventDraft),
          aiDecision: aiDecision.outcome.resultJson,
          modelRunId: aiDecision.modelRunId,
        },
      })

      return {
        action: "review",
        reasonCode: "ai_reconciliation_review",
        reviewQueueItemId,
      }
    }
  }

  if (exactMatches.plausible.length > 1) {
    const reviewQueueItemId = await createReviewForSignal({
      userId: input.userId,
      signal,
      rawDocument,
      itemType: "duplicate_match",
      title: "Multiple canonical matches found",
      explanation:
        "This extracted signal overlaps with more than one plausible ledger event, so it needs manual review before merging.",
      reasonCode: "multiple_candidate_matches",
      proposedResolutionJson: {
        action: "merge",
        matchedEventIds: getShortlistCandidateIds(exactMatches),
        eventDraft: serializeEventDraft(eventDraft),
      },
    })

    return {
      action: "review",
      reasonCode: "multiple_candidate_matches",
      reviewQueueItemId,
    }
  }

  if (requiresWeakSignalReview) {
    const reviewQueueItemId = await createReviewForSignal({
      userId: input.userId,
      signal,
      rawDocument,
      itemType: hasWeakMerchantIdentity(signal, rawDocument, signal.amountMinor)
        ? "merchant_conflict"
        : "signal_reconciliation",
      title: "Signal requires review before ledger entry",
      explanation:
        "The extracted signal is plausible, but the reconciliation engine found weak merchant identity or medium-confidence event evidence, so it was held for manual confirmation.",
      reasonCode: "needs_manual_review",
      proposedResolutionJson: {
        action: "create",
        eventDraft: serializeEventDraft(eventDraft),
      },
    })

    return {
      action: "review",
      reasonCode: "needs_manual_review",
      reviewQueueItemId,
    }
  }

  const financialEvent = await createFinancialEvent(eventDraft)
  await createFinancialEventSource({
    financialEventId: financialEvent.id,
    rawDocumentId: rawDocument.id,
    extractedSignalId: signal.id,
    linkReason: "direct_signal_create",
  })
  await refreshFinancialEventSourceCount(financialEvent.id)
  await updateExtractedSignalStatus(signal.id, "reconciled")

  return {
    action: "created",
    reasonCode: "direct_signal_create",
    financialEventId: financialEvent.id,
  }
}
