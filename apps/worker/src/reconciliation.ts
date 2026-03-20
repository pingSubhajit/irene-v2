import {
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
  listMerchantAliasCandidatesForUser,
  listCandidateFinancialEvents,
  refreshFinancialEventSourceCount,
  resolveCategoryForSignal,
  updateExtractedSignalStatus,
  updateFinancialEvent,
  type ExtractedSignalSelect,
  type FinancialEventInsert,
  type FinancialEventSelect,
  type FinancialEventType,
  type RawDocumentSelect,
} from "@workspace/db"

import { deriveMerchantDisplayName } from "./merchant-name"
import { resolveExistingMerchantFastPath } from "./merchant-fast-path"

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

async function mergeIntoFinancialEvent(input: {
  signal: ExtractedSignalSelect
  rawDocument: RawDocumentSelect
  financialEventId: string
  eventDraft: EventDraft
  reasonCode: string
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
  const matches = pickCandidateMatches(candidates, eventDraft)

  if (matches.plausible.length > 1) {
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
        matchedEventIds: matches.plausible.map((event) => event.id),
        eventDraft: serializeEventDraft(eventDraft),
      },
    })

    return {
      action: "review",
      reasonCode: "multiple_candidate_matches",
      reviewQueueItemId,
    }
  }

  if (matches.plausible.length === 1) {
    const firstMatch = matches.plausible[0]

    if (!firstMatch) {
      throw new Error("Expected a reconciliation match but none was present")
    }

    const financialEventId = await mergeIntoFinancialEvent({
      signal,
      rawDocument,
      financialEventId: firstMatch.id,
      eventDraft,
      reasonCode: matches.exact.length === 1 ? "exact_duplicate_match" : "candidate_duplicate_match",
    })

    return {
      action: "merged",
      reasonCode:
        matches.exact.length === 1 ? "exact_duplicate_match" : "candidate_duplicate_match",
      financialEventId,
    }
  }

  const obligationEventTypes = ["subscription_charge", "emi_payment", "bill_payment"] as const
  const needsObligationReview =
    obligationEventTypes.includes(
      eventType as (typeof obligationEventTypes)[number],
    ) && signal.confidence < 0.88

  if (
    hasWeakMerchantIdentity(signal, rawDocument, signal.amountMinor) ||
    (eventType === "transfer" && !eventDraft.paymentInstrumentId && !eventDraft.merchantId) ||
    needsObligationReview ||
    signal.confidence < 0.8
  ) {
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
