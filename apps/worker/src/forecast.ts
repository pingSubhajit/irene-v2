import {
  createBalanceObservation,
  createPaymentInstrument,
  createForecastRun,
  findExistingCanonicalPaymentInstrument,
  type ForecastSnapshotInsert,
  getBalanceAnchorForInstrument,
  getFinancialEventById,
  getForecastRunByIdentity,
  getLatestBalanceObservationForInstrument,
  getLatestForecastRunWithSnapshots,
  getOrCreateFinancialInstitution,
  getPaymentInstrumentById,
  getPaymentInstrumentByUserAndLast4,
  getRawDocumentById,
  getUserSettings,
  hashForecastInputs,
  listExtractedSignalsForRawDocumentIds,
  listBalanceAnchorsForUser,
  listConfirmedForecastBaseEventsForUser,
  listFinancialEventSourcesForEventIds,
  listForecastableEmiPlansForUser,
  listForecastableIncomeStreamsForUser,
  listForecastableRecurringObligationsForUser,
  normalizeInstitutionDisplayName,
  normalizeInstrumentMaskedIdentifier,
  replaceForecastSnapshots,
  updateFinancialEvent,
  updateForecastRun,
  updatePaymentInstrument,
  upsertBalanceAnchor,
  type ExtractedSignalSelect,
  type PaymentInstrumentSelect,
  type PaymentInstrumentType,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"
import type { DocumentBalanceInferenceResult } from "@workspace/ai"

const logger = createLogger("worker.forecast")

function toUserDateString(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value ?? "1970"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"
  return `${year}-${month}-${day}`
}

function dateFromYmd(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function addDaysYmd(value: string, days: number) {
  const date = dateFromYmd(value)
  date.setUTCDate(date.getUTCDate() + days)
  return toUserDateString(date, "UTC")
}

function pushProjectedAmount(
  map: Map<string, number>,
  date: string,
  amountMinor: number,
) {
  map.set(date, (map.get(date) ?? 0) + amountMinor)
}

function buildCadenceDates(input: {
  baselineDate: string
  horizonDays: number
  nextDate: Date | null
  cadence: string
  intervalCount: number
  dayOfMonth?: number | null
  secondaryDayOfMonth?: number | null
}) {
  const dates: string[] = []
  const horizonEnd = addDaysYmd(input.baselineDate, input.horizonDays - 1)
  const cadence = input.cadence
  const interval = Math.max(input.intervalCount, 1)

  if (input.nextDate) {
    const first = toUserDateString(input.nextDate, "UTC")
    if (first >= input.baselineDate && first <= horizonEnd) {
      dates.push(first)
    }
  }

  if (cadence === "monthly" && input.dayOfMonth) {
    const base = dateFromYmd(input.baselineDate)
    const secondary = input.secondaryDayOfMonth ?? null

    for (let monthOffset = 0; monthOffset <= 12; monthOffset += interval) {
      const year = base.getUTCFullYear()
      const month = base.getUTCMonth() + monthOffset
      const primaryDate = new Date(Date.UTC(year, month, input.dayOfMonth))
      const primaryYmd = toUserDateString(primaryDate, "UTC")

      if (primaryYmd >= input.baselineDate && primaryYmd <= horizonEnd) {
        dates.push(primaryYmd)
      }

      if (secondary) {
        const secondaryDate = new Date(Date.UTC(year, month, secondary))
        const secondaryYmd = toUserDateString(secondaryDate, "UTC")
        if (secondaryYmd >= input.baselineDate && secondaryYmd <= horizonEnd) {
          dates.push(secondaryYmd)
        }
      }
    }
  } else if (cadence === "weekly" && input.nextDate) {
    const next = new Date(input.nextDate)
    while (toUserDateString(next, "UTC") <= horizonEnd) {
      const nextYmd = toUserDateString(next, "UTC")
      if (nextYmd >= input.baselineDate) {
        dates.push(nextYmd)
      }
      next.setUTCDate(next.getUTCDate() + interval * 7)
    }
  }

  return [...new Set(dates)].sort()
}

function roundMinor(value: number) {
  return Math.round(value)
}

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

type BalanceBearingSignal = Pick<
  ExtractedSignalSelect,
  | "signalType"
  | "candidateEventType"
  | "amountMinor"
  | "currency"
  | "issuerNameHint"
  | "instrumentLast4Hint"
  | "availableBalanceMinor"
  | "availableCreditLimitMinor"
  | "balanceAsOfDate"
  | "balanceInstrumentLast4Hint"
  | "backingAccountLast4Hint"
  | "backingAccountNameHint"
  | "accountRelationshipHint"
  | "balanceEvidenceStrength"
  | "channelHint"
  | "paymentInstrumentHint"
  | "confidence"
> & {
  id: string | null
}

function inferBalanceEvidenceStrength(input: {
  rawStrength: BalanceBearingSignal["balanceEvidenceStrength"]
  confidence: number
}) {
  if (input.rawStrength) {
    return input.rawStrength
  }

  if (input.confidence >= 0.92) {
    return "explicit" as const
  }

  if (input.confidence >= 0.75) {
    return "strong" as const
  }

  return "weak" as const
}

function isStrongBalanceEvidence(strength: ReturnType<typeof inferBalanceEvidenceStrength>) {
  return strength === "explicit" || strength === "strong"
}

function inferCashInstrumentType(signal: BalanceBearingSignal): PaymentInstrumentType {
  return signal.channelHint === "wallet" ? "wallet" : "bank_account"
}

function inferNonCashInstrumentType(input: {
  signal: BalanceBearingSignal
  sender: string | null
  subject: string | null
}): PaymentInstrumentType {
  const combined = [
    input.signal.paymentInstrumentHint,
    input.signal.issuerNameHint,
    input.sender,
    input.subject,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (/\bdebit\b/.test(combined)) {
    return "debit_card"
  }

  if (/\bupi\b/.test(combined)) {
    return "upi"
  }

  if (/\bwallet\b/.test(combined)) {
    return "wallet"
  }

  if (/\bcredit\b/.test(combined) || typeof input.signal.availableCreditLimitMinor === "number") {
    return "credit_card"
  }

  return "unknown"
}

function buildInstrumentDisplayName(input: {
  institutionName: string | null
  fallbackName: string | null
  maskedIdentifier: string | null
  instrumentType: PaymentInstrumentType
}) {
  const baseName =
    input.fallbackName ??
    input.institutionName ??
    (input.instrumentType === "wallet" ? "Wallet" : "Account")
  const suffix = input.maskedIdentifier ? ` •${input.maskedIdentifier}` : ""
  return `${baseName}${suffix}`
}

function getBalanceObservedAt(input: {
  signal: BalanceBearingSignal
  rawDocumentTimestamp: Date | null
  fallbackTimestamp: Date
}) {
  if (input.signal.balanceAsOfDate) {
    return new Date(`${input.signal.balanceAsOfDate}T00:00:00.000Z`)
  }

  return input.rawDocumentTimestamp ?? input.fallbackTimestamp
}

async function ensureInstrumentForIdentity(input: {
  userId: string
  financialInstitutionName: string | null
  instrumentType: PaymentInstrumentType
  maskedIdentifier: string | null
  displayNameHint: string | null
  currency: string
}) {
  if (!input.maskedIdentifier) {
    return null
  }

  const institution = input.financialInstitutionName
    ? await getOrCreateFinancialInstitution({
        userId: input.userId,
        displayName: input.financialInstitutionName,
      })
    : null

  const existing = await findExistingCanonicalPaymentInstrument({
    userId: input.userId,
    financialInstitutionId: institution?.id ?? null,
    instrumentType: input.instrumentType,
    maskedIdentifier: input.maskedIdentifier,
  })

  const providerName = institution?.displayName ?? input.displayNameHint ?? null
  const displayName = buildInstrumentDisplayName({
    institutionName: institution?.displayName ?? null,
    fallbackName: input.displayNameHint,
    maskedIdentifier: input.maskedIdentifier,
    instrumentType: input.instrumentType,
  })

  if (existing) {
    const shouldUpdate =
      (!existing.displayName || existing.displayName === existing.providerName) &&
      existing.displayName !== displayName

    if (
      shouldUpdate ||
      existing.providerName !== providerName ||
      existing.financialInstitutionId !== (institution?.id ?? null)
    ) {
      await updatePaymentInstrument(existing.id, {
        financialInstitutionId: institution?.id ?? null,
        providerName,
        displayName,
        currency: input.currency,
      })
    }

    return (
      (await getPaymentInstrumentById(existing.id))?.instrument ??
      existing
    )
  }

  return createPaymentInstrument({
    userId: input.userId,
    financialInstitutionId: institution?.id ?? null,
    instrumentType: input.instrumentType,
    providerName,
    displayName,
    maskedIdentifier: input.maskedIdentifier,
    currency: input.currency,
    status: "active",
  })
}

async function maybePromoteObservationToAnchor(input: {
  userId: string
  paymentInstrument: PaymentInstrumentSelect
  observationId: string
  observedAt: Date
  amountMinor: number
  currency: string
  evidenceStrength: ReturnType<typeof inferBalanceEvidenceStrength>
}) {
  if (!isStrongBalanceEvidence(input.evidenceStrength)) {
    return false
  }

  if (!["bank_account", "wallet"].includes(input.paymentInstrument.instrumentType)) {
    return false
  }

  const existingAnchor = await getBalanceAnchorForInstrument({
    userId: input.userId,
    paymentInstrumentId: input.paymentInstrument.id,
  })

  if (existingAnchor && existingAnchor.anchoredAt >= input.observedAt) {
    return false
  }

  await upsertBalanceAnchor({
    userId: input.userId,
    paymentInstrumentId: input.paymentInstrument.id,
    amountMinor: input.amountMinor,
    currency: input.currency,
    anchoredAt: input.observedAt,
    sourceObservationId: input.observationId,
  })

  return true
}

async function maybeSyncCreditLimitToInstrument(input: {
  userId: string
  paymentInstrument: PaymentInstrumentSelect
  observationId: string
  amountMinor: number
  evidenceStrength: ReturnType<typeof inferBalanceEvidenceStrength>
}) {
  if (!isStrongBalanceEvidence(input.evidenceStrength)) {
    return false
  }

  if (["bank_account", "wallet"].includes(input.paymentInstrument.instrumentType)) {
    return false
  }

  const latestObservation = await getLatestBalanceObservationForInstrument({
    userId: input.userId,
    paymentInstrumentId: input.paymentInstrument.id,
    observationKind: "available_credit_limit",
  })

  if (!latestObservation || latestObservation.id !== input.observationId) {
    return false
  }

  if (input.paymentInstrument.creditLimitMinor === input.amountMinor) {
    return false
  }

  await updatePaymentInstrument(input.paymentInstrument.id, {
    creditLimitMinor: input.amountMinor,
  })

  return true
}

type BalanceInferenceSignalContext = {
  userId: string
  signal: BalanceBearingSignal
  rawDocumentId: string | null
  rawDocumentTimestamp: Date | null
  rawDocumentSender: string | null
  rawDocumentSubject: string | null
  financialEventId: string | null
  currentPaymentInstrumentId: string | null
  fallbackCurrency: string
  fallbackTimestamp: Date
}

function buildSyntheticBalanceSignal(
  input: DocumentBalanceInferenceResult,
): BalanceBearingSignal {
  return {
    id: null,
    signalType: "generic_finance_signal",
    candidateEventType: null,
    amountMinor: null,
    currency: "INR",
    issuerNameHint: null,
    instrumentLast4Hint: input.balanceInstrumentLast4Hint ?? null,
    availableBalanceMinor: input.availableBalanceMinor ?? null,
    availableCreditLimitMinor: input.availableCreditLimitMinor ?? null,
    balanceAsOfDate: input.balanceAsOfDate ?? null,
    balanceInstrumentLast4Hint: input.balanceInstrumentLast4Hint ?? null,
    backingAccountLast4Hint: input.backingAccountLast4Hint ?? null,
    backingAccountNameHint: input.backingAccountNameHint ?? null,
    accountRelationshipHint: input.accountRelationshipHint ?? null,
    balanceEvidenceStrength: input.balanceEvidenceStrength ?? null,
    channelHint: null,
    paymentInstrumentHint: null,
    confidence: input.balanceEvidenceStrength === "explicit" ? 0.98 : 0.85,
  }
}

async function processBalanceBearingSignal(
  input: BalanceInferenceSignalContext,
) {
  if (
    typeof input.signal.availableBalanceMinor !== "number" &&
    typeof input.signal.availableCreditLimitMinor !== "number"
  ) {
    return {
      createdObservationIds: [] as string[],
      promotedAnchorIds: [] as string[],
      linkedInstrumentIds: [] as string[],
      updatedEventIds: [] as string[],
      updatedInstrumentIds: [] as string[],
    }
  }

  const senderDisplayName = extractSenderDisplayName(input.rawDocumentSender)
  const senderEmail = extractSenderEmail(input.rawDocumentSender)
  const issuerName =
    normalizeWhitespace(input.signal.issuerNameHint) ??
    normalizeWhitespace(senderDisplayName) ??
    normalizeWhitespace(senderEmail)
  const canonicalIssuerName = issuerName ? normalizeInstitutionDisplayName(issuerName) : null
  const evidenceStrength = inferBalanceEvidenceStrength({
    rawStrength: input.signal.balanceEvidenceStrength,
    confidence: Number(input.signal.confidence),
  })
  const observedAt = getBalanceObservedAt({
    signal: input.signal,
    rawDocumentTimestamp: input.rawDocumentTimestamp,
    fallbackTimestamp: input.fallbackTimestamp,
  })
  const currency = input.signal.currency ?? input.fallbackCurrency

  const currentInstrument =
    input.currentPaymentInstrumentId != null
      ? (await getPaymentInstrumentById(input.currentPaymentInstrumentId))?.instrument ?? null
      : null
  const inferredTransactingInstrumentType = inferNonCashInstrumentType({
    signal: input.signal,
    sender: input.rawDocumentSender,
    subject: input.rawDocumentSubject,
  })
  const transactingLast4 =
    normalizeInstrumentMaskedIdentifier(input.signal.instrumentLast4Hint) ??
    normalizeInstrumentMaskedIdentifier(input.signal.balanceInstrumentLast4Hint)
  let transactingInstrument =
    currentInstrument ??
    (transactingLast4
      ? await getPaymentInstrumentByUserAndLast4({
          userId: input.userId,
          last4: transactingLast4,
        })
      : null)

  if (
    transactingInstrument &&
    inferredTransactingInstrumentType !== "unknown" &&
    transactingInstrument.instrumentType !== inferredTransactingInstrumentType
  ) {
    transactingInstrument =
      (await updatePaymentInstrument(transactingInstrument.id, {
        instrumentType: inferredTransactingInstrumentType,
      })) ?? transactingInstrument
  }

  const backingAccountLast4 =
    normalizeInstrumentMaskedIdentifier(input.signal.backingAccountLast4Hint) ??
    ((input.signal.accountRelationshipHint === "direct_account" ||
      input.signal.accountRelationshipHint === "linked_card_account") &&
    typeof input.signal.availableBalanceMinor === "number"
      ? normalizeInstrumentMaskedIdentifier(
          input.signal.balanceInstrumentLast4Hint ?? input.signal.instrumentLast4Hint,
        )
      : null)

  const cashInstrument =
    backingAccountLast4 != null
      ? await ensureInstrumentForIdentity({
          userId: input.userId,
          financialInstitutionName: canonicalIssuerName,
          instrumentType: inferCashInstrumentType(input.signal),
          maskedIdentifier: backingAccountLast4,
          displayNameHint: normalizeWhitespace(input.signal.backingAccountNameHint),
          currency,
        })
      : null

  const createdObservationIds: string[] = []
  const promotedAnchorIds: string[] = []
  const linkedInstrumentIds: string[] = []
  const updatedEventIds: string[] = []
  const updatedInstrumentIds: string[] = []

  if (
    cashInstrument &&
    input.signal.accountRelationshipHint === "linked_card_account" &&
    transactingInstrument &&
    transactingInstrument.id !== cashInstrument.id &&
    transactingInstrument.instrumentType !== "credit_card" &&
    transactingInstrument.backingPaymentInstrumentId !== cashInstrument.id
  ) {
    await updatePaymentInstrument(transactingInstrument.id, {
      backingPaymentInstrumentId: cashInstrument.id,
    })
    linkedInstrumentIds.push(transactingInstrument.id)
  }

  if (
    cashInstrument &&
    input.signal.accountRelationshipHint === "direct_account" &&
    input.financialEventId &&
    !input.currentPaymentInstrumentId
  ) {
    await updateFinancialEvent(input.financialEventId, {
      paymentInstrumentId: cashInstrument.id,
    })
    updatedEventIds.push(input.financialEventId)
  }

  if (typeof input.signal.availableBalanceMinor === "number" && cashInstrument) {
    const observation = await createBalanceObservation({
      userId: input.userId,
      paymentInstrumentId: cashInstrument.id,
      observationKind: "available_balance",
      source: "email",
      amountMinor: input.signal.availableBalanceMinor,
      currency,
      observedAt,
      rawDocumentId: input.rawDocumentId,
      extractedSignalId: input.signal.id,
      confidence: Number(input.signal.confidence),
    })
    createdObservationIds.push(observation.id)

    if (
      await maybePromoteObservationToAnchor({
        userId: input.userId,
        paymentInstrument: cashInstrument,
        observationId: observation.id,
        observedAt,
        amountMinor: input.signal.availableBalanceMinor,
        currency,
        evidenceStrength,
      })
    ) {
      promotedAnchorIds.push(cashInstrument.id)
    }
  }

  const creditLimitTarget =
    transactingInstrument ??
    (transactingLast4
      ? await ensureInstrumentForIdentity({
          userId: input.userId,
          financialInstitutionName: canonicalIssuerName,
          instrumentType:
            inferNonCashInstrumentType({
              signal: input.signal,
              sender: input.rawDocumentSender,
              subject: input.rawDocumentSubject,
            }) === "unknown"
              ? "credit_card"
              : inferNonCashInstrumentType({
                  signal: input.signal,
                  sender: input.rawDocumentSender,
                  subject: input.rawDocumentSubject,
                }),
          maskedIdentifier: transactingLast4,
          displayNameHint: null,
          currency,
        })
      : null)

  if (
    typeof input.signal.availableCreditLimitMinor === "number" &&
    creditLimitTarget &&
    !["bank_account", "wallet"].includes(creditLimitTarget.instrumentType)
  ) {
    const observation = await createBalanceObservation({
      userId: input.userId,
      paymentInstrumentId: creditLimitTarget.id,
      observationKind: "available_credit_limit",
      source: "email",
      amountMinor: input.signal.availableCreditLimitMinor,
      currency,
      observedAt,
      rawDocumentId: input.rawDocumentId,
      extractedSignalId: input.signal.id,
      confidence: Number(input.signal.confidence),
    })
    createdObservationIds.push(observation.id)

    if (
      await maybeSyncCreditLimitToInstrument({
        userId: input.userId,
        paymentInstrument: creditLimitTarget,
        observationId: observation.id,
        amountMinor: input.signal.availableCreditLimitMinor,
        evidenceStrength,
      })
    ) {
      updatedInstrumentIds.push(creditLimitTarget.id)
    }
  }

  return {
    createdObservationIds,
    promotedAnchorIds,
    linkedInstrumentIds,
    updatedEventIds,
    updatedInstrumentIds,
  }
}

export async function inferAccountsAndPromoteBalancesForRawDocument(input: {
  userId: string
  rawDocumentId: string
}) {
  const rawDocument = await getRawDocumentById(input.rawDocumentId)

  if (!rawDocument) {
    return {
      createdObservationIds: [],
      promotedAnchorIds: [],
      linkedInstrumentIds: [],
      updatedEventIds: [],
      updatedInstrumentIds: [],
    }
  }

  const signals = await listExtractedSignalsForRawDocumentIds([input.rawDocumentId])
  const createdObservationIds: string[] = []
  const promotedAnchorIds: string[] = []
  const linkedInstrumentIds: string[] = []
  const updatedEventIds: string[] = []
  const updatedInstrumentIds: string[] = []

  for (const signal of signals) {
    const outcome = await processBalanceBearingSignal({
      userId: input.userId,
      signal,
      rawDocumentId: rawDocument.id,
      rawDocumentTimestamp: rawDocument.messageTimestamp,
      rawDocumentSender: rawDocument.fromAddress,
      rawDocumentSubject: rawDocument.subject,
      financialEventId: null,
      currentPaymentInstrumentId: null,
      fallbackCurrency: signal.currency ?? "INR",
      fallbackTimestamp: rawDocument.messageTimestamp,
    })

    createdObservationIds.push(...outcome.createdObservationIds)
    promotedAnchorIds.push(...outcome.promotedAnchorIds)
    linkedInstrumentIds.push(...outcome.linkedInstrumentIds)
    updatedEventIds.push(...outcome.updatedEventIds)
    updatedInstrumentIds.push(...outcome.updatedInstrumentIds)
  }

  return {
    createdObservationIds: [...new Set(createdObservationIds)],
    promotedAnchorIds: [...new Set(promotedAnchorIds)],
    linkedInstrumentIds: [...new Set(linkedInstrumentIds)],
    updatedEventIds: [...new Set(updatedEventIds)],
    updatedInstrumentIds: [...new Set(updatedInstrumentIds)],
  }
}

export async function inferAccountsAndPromoteBalancesForEvent(input: {
  userId: string
  financialEventId: string
}) {
  const event = await getFinancialEventById(input.financialEventId)
  if (!event) {
    return {
      createdObservationIds: [],
      promotedAnchorIds: [],
      linkedInstrumentIds: [],
      updatedEventIds: [],
      updatedInstrumentIds: [],
    }
  }

  const sources = await listFinancialEventSourcesForEventIds([input.financialEventId])
  const createdObservationIds: string[] = []
  const promotedAnchorIds: string[] = []
  const linkedInstrumentIds: string[] = []
  const updatedEventIds: string[] = []
  const updatedInstrumentIds: string[] = []

  for (const row of sources) {
    const signal = row.extractedSignal

    if (!signal?.id) {
      continue
    }
    const outcome = await processBalanceBearingSignal({
      userId: input.userId,
      signal,
      rawDocumentId: row.rawDocument?.id ?? null,
      rawDocumentTimestamp: row.rawDocument?.messageTimestamp ?? null,
      rawDocumentSender: row.rawDocument?.fromAddress ?? null,
      rawDocumentSubject: row.rawDocument?.subject ?? null,
      financialEventId: event.id,
      currentPaymentInstrumentId: event.paymentInstrumentId,
      fallbackCurrency: event.currency,
      fallbackTimestamp: event.eventOccurredAt,
    })

    createdObservationIds.push(...outcome.createdObservationIds)
    promotedAnchorIds.push(...outcome.promotedAnchorIds)
    linkedInstrumentIds.push(...outcome.linkedInstrumentIds)
    updatedEventIds.push(...outcome.updatedEventIds)
    updatedInstrumentIds.push(...outcome.updatedInstrumentIds)
  }

  return {
    createdObservationIds: [...new Set(createdObservationIds)],
    promotedAnchorIds: [...new Set(promotedAnchorIds)],
    linkedInstrumentIds: [...new Set(linkedInstrumentIds)],
    updatedEventIds: [...new Set(updatedEventIds)],
    updatedInstrumentIds: [...new Set(updatedInstrumentIds)],
  }
}

export async function inferAccountsAndPromoteStandaloneBalanceEvidence(input: {
  userId: string
  rawDocumentId: string
  rawDocumentTimestamp: Date
  rawDocumentSender: string | null
  rawDocumentSubject: string | null
  evidence: DocumentBalanceInferenceResult
}) {
  return processBalanceBearingSignal({
    userId: input.userId,
    signal: buildSyntheticBalanceSignal(input.evidence),
    rawDocumentId: input.rawDocumentId,
    rawDocumentTimestamp: input.rawDocumentTimestamp,
    rawDocumentSender: input.rawDocumentSender,
    rawDocumentSubject: input.rawDocumentSubject,
    financialEventId: null,
    currentPaymentInstrumentId: null,
    fallbackCurrency: "INR",
    fallbackTimestamp: input.rawDocumentTimestamp,
  })
}

export async function refreshForecastForUser(input: {
  userId: string
  reason: string
}) {
  const settings = await getUserSettings(input.userId)
  const baselineDate = toUserDateString(new Date(), settings.timeZone)
  const trailingStart = dateFromYmd(addDaysYmd(baselineDate, -60))

  const [anchors, obligations, emiPlans, incomeStreams, historicalEvents] = await Promise.all([
    listBalanceAnchorsForUser(input.userId),
    listForecastableRecurringObligationsForUser(input.userId),
    listForecastableEmiPlansForUser(input.userId),
    listForecastableIncomeStreamsForUser(input.userId),
    listConfirmedForecastBaseEventsForUser({
      userId: input.userId,
      fromDate: trailingStart,
    }),
  ])

  const runType = anchors.length > 0 ? "anchored" : "net_only"
  const reportingCurrency = settings.reportingCurrency

  const knownInflows = new Map<string, number>()
  const knownFixedOutflows = new Map<string, number>()
  const knownEmiOutflows = new Map<string, number>()
  const obligationIdsWithEmiPlans = new Set(
    emiPlans.map(({ recurringObligation }) => recurringObligation.id),
  )

  for (const { incomeStream } of incomeStreams) {
    const amountMinor = incomeStream.expectedAmountMinor ?? 0
    if (!amountMinor) continue

    const projectedDates = buildCadenceDates({
      baselineDate,
      horizonDays: settings.forecastHorizonDays,
      nextDate: incomeStream.nextExpectedAt,
      cadence: incomeStream.cadence,
      intervalCount: incomeStream.intervalCount,
      dayOfMonth: incomeStream.expectedDayOfMonth,
      secondaryDayOfMonth: incomeStream.secondaryDayOfMonth,
    })

    for (const date of projectedDates) {
      pushProjectedAmount(knownInflows, date, amountMinor)
    }
  }

  for (const { obligation } of obligations) {
    const amountMinor = obligation.amountMinor ?? 0
    if (!amountMinor) continue
    if (
      obligation.obligationType === "emi" &&
      obligationIdsWithEmiPlans.has(obligation.id)
    ) {
      continue
    }

    const projectedDates = buildCadenceDates({
      baselineDate,
      horizonDays: settings.forecastHorizonDays,
      nextDate: obligation.nextDueAt,
      cadence: obligation.cadence,
      intervalCount: obligation.intervalCount,
      dayOfMonth: obligation.dayOfMonth,
    })

    for (const date of projectedDates) {
      pushProjectedAmount(
        obligation.obligationType === "emi" ? knownEmiOutflows : knownFixedOutflows,
        date,
        amountMinor,
      )
    }
  }

  for (const { emiPlan } of emiPlans) {
    const amountMinor = emiPlan.installmentAmountMinor ?? 0
    if (!amountMinor) continue

    const projectedDates = buildCadenceDates({
      baselineDate,
      horizonDays: settings.forecastHorizonDays,
      nextDate: emiPlan.nextDueAt,
      cadence: "monthly",
      intervalCount: 1,
      dayOfMonth: emiPlan.nextDueAt ? dateFromYmd(toUserDateString(emiPlan.nextDueAt, "UTC")).getUTCDate() : null,
    })

    for (const date of projectedDates) {
      pushProjectedAmount(knownEmiOutflows, date, amountMinor)
    }
  }

  const discretionaryEvents = historicalEvents.filter(
    (event) =>
      event.direction === "outflow" &&
      !event.isTransfer &&
      event.status === "confirmed" &&
      !["subscription_charge", "emi_payment", "bill_payment", "refund", "transfer"].includes(
        event.eventType,
      ),
  )
  const variableDailyAverageMinor =
    discretionaryEvents.length > 0
      ? roundMinor(
          discretionaryEvents.reduce((sum, event) => sum + event.amountMinor, 0) / 60,
        )
      : 0

  const anchoredBalanceMinor = anchors
    .filter(({ paymentInstrument }) =>
      ["bank_account", "wallet"].includes(paymentInstrument.instrumentType),
    )
    .reduce((sum, { anchor }) => sum + anchor.amountMinor, 0)

  const inputsHash = hashForecastInputs({
    baselineDate,
    runType,
    reportingCurrency,
    horizonDays: settings.forecastHorizonDays,
    anchors: anchors.map(({ anchor, paymentInstrument }) => ({
      paymentInstrumentId: paymentInstrument.id,
      amountMinor: anchor.amountMinor,
      anchoredAt: anchor.anchoredAt.toISOString(),
      currency: anchor.currency,
    })),
    obligations: obligations.map(({ obligation }) => ({
      id: obligation.id,
      amountMinor: obligation.amountMinor,
      nextDueAt: obligation.nextDueAt?.toISOString() ?? null,
      cadence: obligation.cadence,
      intervalCount: obligation.intervalCount,
      dayOfMonth: obligation.dayOfMonth,
      status: obligation.status,
      type: obligation.obligationType,
    })),
    emiPlans: emiPlans.map(({ emiPlan }) => ({
      id: emiPlan.id,
      amountMinor: emiPlan.installmentAmountMinor,
      nextDueAt: emiPlan.nextDueAt?.toISOString() ?? null,
      status: emiPlan.status,
    })),
    incomeStreams: incomeStreams.map(({ incomeStream }) => ({
      id: incomeStream.id,
      expectedAmountMinor: incomeStream.expectedAmountMinor,
      nextExpectedAt: incomeStream.nextExpectedAt?.toISOString() ?? null,
      cadence: incomeStream.cadence,
      intervalCount: incomeStream.intervalCount,
      expectedDayOfMonth: incomeStream.expectedDayOfMonth,
      secondaryDayOfMonth: incomeStream.secondaryDayOfMonth,
      status: incomeStream.status,
    })),
    variableDailyAverageMinor,
  })

  const existing = await getForecastRunByIdentity({
    userId: input.userId,
    runType,
    baselineDate,
    inputsHash,
  })

  if (existing?.status === "succeeded") {
    const snapshots = await getLatestForecastRunWithSnapshots(input.userId)
    return {
      skipped: true,
      forecastRunId: existing.id,
      snapshotCount: snapshots?.snapshots.length ?? 0,
      runType,
    }
  }

  const forecastRun =
    existing ??
    (await createForecastRun({
      userId: input.userId,
      runType,
      horizonDays: settings.forecastHorizonDays,
      baselineDate,
      status: "running",
      inputsHash,
      explanation:
        runType === "anchored"
          ? "Forecast uses anchored cash balances plus recurring obligations, EMI plans, income streams, and trailing discretionary spend."
          : "Forecast uses recurring inflows and outflows without a confirmed cash balance anchor.",
    }))

  let cumulativeIncome = 0
  let cumulativeFixed = 0
  let cumulativeEmi = 0
  let cumulativeVariable = 0

  const snapshots: ForecastSnapshotInsert[] = []

  const incomeDates = [...knownInflows.keys()].sort()

  for (let dayOffset = 0; dayOffset < settings.forecastHorizonDays; dayOffset += 1) {
    const snapshotDate = addDaysYmd(baselineDate, dayOffset)
    const dayIncome = knownInflows.get(snapshotDate) ?? 0
    const dayFixed = knownFixedOutflows.get(snapshotDate) ?? 0
    const dayEmi = knownEmiOutflows.get(snapshotDate) ?? 0
    const dayVariable = variableDailyAverageMinor

    cumulativeIncome += dayIncome
    cumulativeFixed += dayFixed
    cumulativeEmi += dayEmi
    cumulativeVariable += dayVariable

    const projectedBalanceMinor =
      runType === "anchored"
        ? anchoredBalanceMinor + cumulativeIncome - cumulativeFixed - cumulativeEmi - cumulativeVariable
        : null

    const nextIncomeDate =
      incomeDates.find((date) => date >= snapshotDate) ??
      addDaysYmd(snapshotDate, settings.forecastHorizonDays - dayOffset - 1)

    let remainingFixedCommitments = 0
    for (
      let futureOffset = dayOffset;
      futureOffset < settings.forecastHorizonDays;
      futureOffset += 1
    ) {
      const futureDate = addDaysYmd(baselineDate, futureOffset)
      if (futureDate > nextIncomeDate) {
        break
      }

      remainingFixedCommitments += (knownFixedOutflows.get(futureDate) ?? 0) + (knownEmiOutflows.get(futureDate) ?? 0)
    }

    const safeToSpendMinor =
      projectedBalanceMinor === null
        ? null
        : Math.max(projectedBalanceMinor - remainingFixedCommitments, 0)

    const confidenceSpread = variableDailyAverageMinor * Math.max(dayOffset + 1, 1)

    snapshots.push({
      forecastRunId: forecastRun.id,
      snapshotDate,
      projectedBalanceMinor,
      projectedIncomeMinor: cumulativeIncome,
      projectedFixedOutflowMinor: cumulativeFixed,
      projectedVariableOutflowMinor: cumulativeVariable,
      projectedEmiOutflowMinor: cumulativeEmi,
      safeToSpendMinor,
      confidenceBandLowMinor:
        projectedBalanceMinor === null ? null : projectedBalanceMinor - confidenceSpread,
      confidenceBandHighMinor:
        projectedBalanceMinor === null ? null : projectedBalanceMinor + Math.round(confidenceSpread * 0.35),
    })
  }

  await replaceForecastSnapshots(forecastRun.id, snapshots)
  await updateForecastRun(forecastRun.id, {
    status: "succeeded",
    completedAt: new Date(),
  })

  logger.info("Refreshed forecast for user", {
    userId: input.userId,
    forecastRunId: forecastRun.id,
    runType,
    snapshotCount: snapshots.length,
    reason: input.reason,
  })

  return {
    forecastRunId: forecastRun.id,
    runType,
    snapshotCount: snapshots.length,
    anchoredInstrumentCount: anchors.length,
  }
}
