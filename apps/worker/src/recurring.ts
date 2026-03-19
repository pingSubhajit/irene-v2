import {
  createReviewQueueItem,
  findMatchingIncomeStream,
  findMatchingRecurringObligation,
  findOpenReviewQueueItem,
  getFinancialEventForRecurring,
  getIncomeStreamById,
  getRecurringObligationById,
  listRecurringCandidateEvents,
  upsertEmiPlan,
  updateIncomeStream,
  updateRecurringObligation,
  createIncomeStream,
  createRecurringObligation,
  findLatestIncomeEventForStream,
  type FinancialEventType,
} from "@workspace/db"

type RecurringDetectionOutcome =
  | { action: "ignored"; reasonCode: string }
  | {
      action: "created" | "updated"
      reasonCode: string
      recurringObligationId?: string
      incomeStreamId?: string
      reviewQueueItemId?: string
    }
  | { action: "review"; reasonCode: string; reviewQueueItemId: string }
  | { action: "skipped"; reasonCode: string }

function dayDiff(left: Date, right: Date) {
  return Math.round((right.getTime() - left.getTime()) / 86_400_000)
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function addMonths(date: Date, count: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + count)
  return next
}

function inferObligationType(eventType: FinancialEventType) {
  switch (eventType) {
    case "subscription_charge":
      return "subscription" as const
    case "bill_payment":
      return "bill" as const
    case "emi_payment":
      return "emi" as const
    default:
      return null
  }
}

function inferIncomeType(label: string | null, merchantType: string | null) {
  const combined = (label ?? "").toLowerCase()

  if (/\bsalary|payroll|pay day|monthly pay\b/.test(combined) || merchantType === "employer") {
    return "salary" as const
  }

  if (/\breimburse|expense claim\b/.test(combined)) {
    return "reimbursement" as const
  }

  if (/\bfreelance|consulting|invoice paid|client payment\b/.test(combined)) {
    return "freelance" as const
  }

  if (/\btransfer\b/.test(combined)) {
    return "transfer_in" as const
  }

  return "other" as const
}

function looksTransferLike(label: string | null) {
  const combined = (label ?? "").toLowerCase()
  return /\b(self|own account|transfer from|transfer to|upi collect|upi transfer)\b/.test(combined)
}

function looksPromotional(label: string | null) {
  const combined = (label ?? "").toLowerCase()
  return /\b(save up to|offer|offers|deal|deals|discount|cashback|upgrade|exclusive|starting at|sale|win now|need funds)\b/.test(
    combined,
  )
}

function inferCadence(intervals: number[]) {
  if (intervals.length === 0) {
    return {
      cadence: "irregular" as const,
      intervalCount: 1,
      monthlyLike: false,
      semiMonthlyLike: false,
    }
  }

  const avg = average(intervals)
  const monthlyLike = avg >= 25 && avg <= 35
  const semiMonthlyLike = avg >= 12 && avg <= 18

  if (monthlyLike) {
    return {
      cadence: "monthly" as const,
      intervalCount: 1,
      monthlyLike,
      semiMonthlyLike,
    }
  }

  if (semiMonthlyLike) {
    return {
      cadence: "monthly" as const,
      intervalCount: 1,
      monthlyLike,
      semiMonthlyLike,
    }
  }

  return {
    cadence: "irregular" as const,
    intervalCount: 1,
    monthlyLike,
    semiMonthlyLike,
  }
}

function amountStats(amounts: number[]) {
  const sorted = [...amounts].sort((left, right) => left - right)
  const min = sorted[0] ?? 0
  const max = sorted.at(-1) ?? 0
  const avg = Math.round(average(amounts))
  const stable = max - min <= Math.max(Math.round(avg * 0.12), 1_000)

  return { min, max, avg, stable }
}

function nextMonthlyDate(lastDate: Date) {
  return addMonths(lastDate, 1)
}

async function maybeCreateRecurringReview(input: {
  userId: string
  itemType: "recurring_obligation_ambiguity" | "emi_plan_ambiguity" | "income_stream_ambiguity"
  financialEventId: string
  title: string
  explanation: string
  proposedResolutionJson: Record<string, unknown>
}) {
  const existing = await findOpenReviewQueueItem({
    userId: input.userId,
    itemType: input.itemType,
    financialEventId: input.financialEventId,
  })

  if (existing) {
    return existing
  }

  return createReviewQueueItem({
    userId: input.userId,
    itemType: input.itemType,
    financialEventId: input.financialEventId,
    title: input.title,
    explanation: input.explanation,
    proposedResolutionJson: input.proposedResolutionJson,
  })
}

export async function detectRecurringObligationFromEvent(
  financialEventId: string,
): Promise<RecurringDetectionOutcome> {
  const row = await getFinancialEventForRecurring(financialEventId)

  if (!row) {
    return { action: "skipped", reasonCode: "event_missing" }
  }

  const { event, merchant, category, paymentInstrument } = row
  const obligationType = inferObligationType(event.eventType)

  if (!obligationType) {
    return { action: "ignored", reasonCode: "event_type_not_recurring" }
  }

  if (event.status !== "confirmed" || event.needsReview) {
    return { action: "ignored", reasonCode: "event_not_confirmed" }
  }

  if (!event.merchantId && !event.paymentInstrumentId) {
    return { action: "ignored", reasonCode: "missing_recurring_identity" }
  }

  const label = [event.description, event.notes, merchant?.displayName].filter(Boolean).join(" ")

  if (obligationType === "emi" && looksPromotional(label)) {
    return { action: "ignored", reasonCode: "emi_promotional_event" }
  }

  const dateFrom = new Date(event.eventOccurredAt)
  dateFrom.setUTCMonth(dateFrom.getUTCMonth() - 6)
  const dateTo = new Date(event.eventOccurredAt)
  dateTo.setUTCDate(dateTo.getUTCDate() + 7)

  const candidateEvents = await listRecurringCandidateEvents({
    userId: event.userId,
    eventType: event.eventType,
    merchantId: event.merchantId,
    paymentInstrumentId: event.paymentInstrumentId,
    dateFrom,
    dateTo,
  })

  if (candidateEvents.length < 2) {
    return { action: "ignored", reasonCode: "insufficient_event_history" }
  }

  const intervals = candidateEvents.slice(1).map((candidate, index) => {
    return dayDiff(candidateEvents[index]!.eventOccurredAt, candidate.eventOccurredAt)
  })
  const cadence = inferCadence(intervals)
  const amounts = candidateEvents.map((candidate) => candidate.amountMinor)
  const amount = amountStats(amounts)
  const confidence = clamp(
    0.38 +
      (merchant ? 0.14 : 0) +
      (paymentInstrument ? 0.12 : 0) +
      Math.min(candidateEvents.length * 0.08, 0.24) +
      (cadence.monthlyLike ? 0.15 : 0) +
      (amount.stable ? 0.12 : 0),
  )
  const status: "active" | "suspected" | null =
    confidence >= 0.82 && cadence.monthlyLike
      ? "active"
      : confidence >= 0.58
        ? "suspected"
        : null

  if (!status) {
    return { action: "ignored", reasonCode: "confidence_too_low" }
  }

  const latestEvent = candidateEvents.at(-1) ?? event
  const existing = await findMatchingRecurringObligation({
    userId: event.userId,
    obligationType,
    merchantId: event.merchantId,
    paymentInstrumentId: event.paymentInstrumentId,
    currency: event.currency,
  })

  const values = {
    userId: event.userId,
    obligationType,
    status,
    merchantId: event.merchantId,
    paymentInstrumentId: event.paymentInstrumentId,
    categoryId: event.categoryId ?? category?.id ?? null,
    name:
      merchant?.displayName ??
      event.description ??
      `${obligationType.replace("_", " ")} plan`,
    amountMinor: amount.avg,
    currency: event.currency,
    cadence: cadence.cadence,
    intervalCount: cadence.intervalCount,
    dayOfMonth: latestEvent.eventOccurredAt.getUTCDate(),
    nextDueAt: cadence.monthlyLike ? nextMonthlyDate(latestEvent.eventOccurredAt) : null,
    lastChargedAt: latestEvent.eventOccurredAt,
    detectionConfidence: confidence,
    sourceEventId: event.id,
  }

  const obligation = existing
    ? await updateRecurringObligation(existing.id, values)
    : await createRecurringObligation(values)

  if (!obligation) {
    throw new Error("Failed to persist recurring obligation")
  }

  let reviewQueueItemId: string | undefined

  if (status === "suspected") {
    const review = await maybeCreateRecurringReview({
      userId: event.userId,
      itemType: obligationType === "emi" ? "emi_plan_ambiguity" : "recurring_obligation_ambiguity",
      financialEventId: event.id,
      title:
        obligationType === "emi"
          ? "confirm this EMI pattern"
          : `confirm this ${obligationType} pattern`,
      explanation:
        obligationType === "emi"
          ? "Irene saw repeated EMI-like payments but still needs your confirmation before treating this as an active EMI plan."
          : `Irene saw repeated ${obligationType.replace("_", " ")} payments and marked them as suspected until you confirm the cadence.`,
      proposedResolutionJson: {
        kind: obligationType === "emi" ? "emi_plan" : "recurring_obligation",
        action: "approve",
        recurringObligationId: obligation.id,
        recurringType: obligationType,
        confidence,
      },
    })
    reviewQueueItemId = review.id
  }

  if (obligationType === "emi") {
    await upsertEmiPlan({
      recurringObligationId: obligation.id,
      values: {
        userId: event.userId,
        recurringObligationId: obligation.id,
        merchantId: event.merchantId,
        paymentInstrumentId: event.paymentInstrumentId,
        installmentAmountMinor: amount.avg,
        currency: event.currency,
        nextDueAt: obligation.nextDueAt,
        status: status === "active" ? "active" : "suspected",
        confidence,
      },
    })
  }

  return {
    action: existing ? "updated" : "created",
    reasonCode: status === "active" ? "strong_monthly_pattern" : "suspected_monthly_pattern",
    recurringObligationId: obligation.id,
    reviewQueueItemId,
  }
}

export async function detectIncomeStreamFromEvent(
  financialEventId: string,
): Promise<RecurringDetectionOutcome> {
  const row = await getFinancialEventForRecurring(financialEventId)

  if (!row) {
    return { action: "skipped", reasonCode: "event_missing" }
  }

  const { event, merchant, paymentInstrument } = row

  if (event.eventType !== "income" || event.status !== "confirmed" || event.needsReview) {
    return { action: "ignored", reasonCode: "event_not_eligible_for_income" }
  }

  const label = [event.description, event.notes, merchant?.displayName].filter(Boolean).join(" ")

  if (looksTransferLike(label) || event.isTransfer) {
    return { action: "ignored", reasonCode: "transfer_like_credit" }
  }

  if (!event.merchantId && !event.paymentInstrumentId && inferIncomeType(label, merchant?.merchantType ?? null) !== "salary") {
    return { action: "ignored", reasonCode: "missing_income_identity" }
  }

  const dateFrom = new Date(event.eventOccurredAt)
  dateFrom.setUTCMonth(dateFrom.getUTCMonth() - 6)
  const dateTo = new Date(event.eventOccurredAt)
  dateTo.setUTCDate(dateTo.getUTCDate() + 7)

  const candidateEvents = await listRecurringCandidateEvents({
    userId: event.userId,
    eventType: "income",
    merchantId: event.merchantId,
    paymentInstrumentId: event.paymentInstrumentId,
    dateFrom,
    dateTo,
  })

  if (candidateEvents.length < 2) {
    return { action: "ignored", reasonCode: "insufficient_income_history" }
  }

  const intervals = candidateEvents.slice(1).map((candidate, index) => {
    return dayDiff(candidateEvents[index]!.eventOccurredAt, candidate.eventOccurredAt)
  })
  const cadence = inferCadence(intervals)
  const amounts = candidateEvents.map((candidate) => candidate.amountMinor)
  const amount = amountStats(amounts)
  const incomeType = inferIncomeType(label, merchant?.merchantType ?? null)
  const confidence = clamp(
    0.36 +
      (merchant ? 0.12 : 0) +
      (paymentInstrument ? 0.1 : 0) +
      Math.min(candidateEvents.length * 0.09, 0.27) +
      (cadence.monthlyLike || cadence.semiMonthlyLike ? 0.18 : 0) +
      (amount.stable ? 0.12 : 0) +
      (incomeType === "salary" ? 0.1 : 0),
  )
  const status: "active" | "suspected" | null =
    confidence >= 0.82 && (cadence.monthlyLike || cadence.semiMonthlyLike)
      ? "active"
      : confidence >= 0.58
        ? "suspected"
        : null

  if (!status) {
    return { action: "ignored", reasonCode: "income_confidence_too_low" }
  }

  const latestEvent = candidateEvents.at(-1) ?? event
  const existing = await findMatchingIncomeStream({
    userId: event.userId,
    incomeType,
    sourceMerchantId: event.merchantId,
    paymentInstrumentId: event.paymentInstrumentId,
    currency: event.currency,
  })

  const values = {
    userId: event.userId,
    name: merchant?.displayName ?? event.description ?? "Repeatable income",
    incomeType,
    sourceMerchantId: event.merchantId,
    paymentInstrumentId: event.paymentInstrumentId,
    expectedAmountMinor: amount.avg,
    currency: event.currency,
    expectedDayOfMonth: latestEvent.eventOccurredAt.getUTCDate(),
    variabilityScore: clamp(amount.avg ? (amount.max - amount.min) / amount.avg : 0),
    lastReceivedAt: latestEvent.eventOccurredAt,
    nextExpectedAt:
      cadence.monthlyLike || cadence.semiMonthlyLike
        ? nextMonthlyDate(latestEvent.eventOccurredAt)
        : null,
    confidence,
    status,
  }

  const incomeStream = existing
    ? await updateIncomeStream(existing.id, values)
    : await createIncomeStream(values)

  if (!incomeStream) {
    throw new Error("Failed to persist income stream")
  }

  let reviewQueueItemId: string | undefined

  if (status === "suspected") {
    const review = await maybeCreateRecurringReview({
      userId: event.userId,
      itemType: "income_stream_ambiguity",
      financialEventId: event.id,
      title: "confirm this repeatable income",
      explanation:
        "Irene found a recurring credit pattern, but it is still not strong enough to treat as a fully active income stream without your approval.",
      proposedResolutionJson: {
        kind: "income_stream",
        action: "approve",
        incomeStreamId: incomeStream.id,
        incomeType,
        confidence,
      },
    })
    reviewQueueItemId = review.id
  }

  return {
    action: existing ? "updated" : "created",
    reasonCode: status === "active" ? "strong_income_pattern" : "suspected_income_pattern",
    incomeStreamId: incomeStream.id,
    reviewQueueItemId,
  }
}

export async function refreshRecurringObligation(
  recurringObligationId: string,
): Promise<RecurringDetectionOutcome> {
  const obligation = await getRecurringObligationById(recurringObligationId)

  if (!obligation?.sourceEventId) {
    return { action: "ignored", reasonCode: "missing_obligation_source_event" }
  }

  return detectRecurringObligationFromEvent(obligation.sourceEventId)
}

export async function refreshIncomeStream(
  incomeStreamId: string,
): Promise<RecurringDetectionOutcome> {
  const incomeStream = await getIncomeStreamById(incomeStreamId)

  if (!incomeStream) {
    return { action: "ignored", reasonCode: "missing_income_stream" }
  }

  const sourceEvent = await findLatestIncomeEventForStream({
    userId: incomeStream.userId,
    sourceMerchantId: incomeStream.sourceMerchantId,
    paymentInstrumentId: incomeStream.paymentInstrumentId,
    currency: incomeStream.currency,
  })

  if (!sourceEvent) {
    return { action: "ignored", reasonCode: "missing_income_source_event" }
  }

  return detectIncomeStreamFromEvent(sourceEvent.id)
}
