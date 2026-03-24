import { getReviewQueueContext } from "@workspace/db"

import { formatInUserTimeZone } from "@/lib/date-format"

type ProposedResolution = {
  action?: "create" | "merge"
  matchedEventIds?: string[]
  matchedRecurringModelIds?: string[]
  matchedPaymentInstrumentIds?: string[]
  kind?:
    | "event"
    | "recurring_obligation"
    | "emi_plan"
    | "income_stream"
    | "payment_instrument_resolution"
    | "merchant_resolution"
    | "category_resolution"
  recurringType?: "subscription" | "bill" | "emi"
  incomeType?: "salary" | "freelance" | "reimbursement" | "transfer_in" | "other"
  canonicalInstitutionName?: string | null
  canonicalInstrumentType?: string | null
  canonicalMerchantName?: string | null
  canonicalProcessorName?: string | null
  categorySlug?: string | null
  matchedMerchantIds?: string[]
  matchedProcessorIds?: string[]
  eventDraft?: {
    eventType?: string
    amountMinor?: number
    currency?: string
  }
}

export type ReviewEntry = {
  id: string
  itemType: string
  title: string
  explanation: string
  rawDocumentTitle: string
  rawDocumentSubtitle: string
  signalType: string
  candidateEventType: string
  confidenceLabel: string
  proposedAction: string
  proposedType: string
  proposedAmount: string
  matchedIds: string[]
  reviewKind:
    | "event"
    | "recurring_obligation"
    | "emi_plan"
    | "income_stream"
    | "payment_instrument_resolution"
    | "merchant_resolution"
    | "category_resolution"
}

export function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function formatAmount(amountMinor: number | undefined, currency: string | undefined) {
  if (typeof amountMinor !== "number" || !currency) {
    return "Amount unclear"
  }

  const amount = amountMinor / 100

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function formatStatusMessage(value: string | undefined) {
  switch (value) {
    case "resolved":
      return "Resolution saved. Irene updated the ledger."
    case "merged":
      return "Resolution merged into an existing event."
    case "ignored":
      return "Signal ignored."
    case "already-reconciled":
      return "This item was already reconciled earlier."
    default:
      return null
  }
}

export function buildReviewItemHref(itemId: string) {
  return `/review/${itemId}`
}

export function buildReviewEntry(
  context: NonNullable<Awaited<ReturnType<typeof getReviewQueueContext>>>,
  timeZone: string,
): ReviewEntry {
  const proposal = (context.item.proposedResolutionJson ?? {}) as ProposedResolution
  const confidence = Number(
    context.signal?.confidence ??
      (typeof context.item.proposedResolutionJson?.confidence === "number"
        ? context.item.proposedResolutionJson.confidence
        : 0),
  ).toFixed(2)
  const rawDocumentTitle =
    context.rawDocument?.subject ??
    context.event?.description ??
    "Supporting context unavailable"
  const rawDocumentSubtitle = [
    context.rawDocument?.fromAddress ?? "Unknown sender",
    context.rawDocument?.messageTimestamp
      ? formatInUserTimeZone(context.rawDocument.messageTimestamp, timeZone, {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const reviewKind = proposal.kind ?? "event"
  const proposedType =
    reviewKind === "payment_instrument_resolution"
      ? `${proposal.canonicalInstitutionName ?? "Unknown issuer"} · ${
          proposal.canonicalInstrumentType ?? "unknown"
        }`
      : reviewKind === "merchant_resolution" || reviewKind === "category_resolution"
        ? [
            proposal.canonicalMerchantName ?? "Unknown merchant",
            proposal.canonicalProcessorName ? `via ${proposal.canonicalProcessorName}` : null,
            proposal.categorySlug ?? null,
          ]
            .filter(Boolean)
            .join(" · ")
      : reviewKind === "income_stream"
        ? proposal.incomeType ?? "income stream"
      : reviewKind === "recurring_obligation" || reviewKind === "emi_plan"
        ? proposal.recurringType ?? "recurring model"
        : proposal.eventDraft?.eventType ?? "generic_finance"
  const matchedIds =
    proposal.matchedProcessorIds ??
    proposal.matchedMerchantIds ??
    proposal.matchedPaymentInstrumentIds ??
    proposal.matchedRecurringModelIds ??
    proposal.matchedEventIds ??
    []

  return {
    id: context.item.id,
    itemType: context.item.itemType.replaceAll("_", " "),
    title: context.item.title,
    explanation: context.item.explanation,
    rawDocumentTitle,
    rawDocumentSubtitle,
    signalType: context.signal?.signalType ?? "signal unavailable",
    candidateEventType: context.signal?.candidateEventType ?? "untyped",
    confidenceLabel: `confidence ${confidence}`,
    proposedAction: proposal.action ?? "review",
    proposedType,
    proposedAmount: formatAmount(
      proposal.eventDraft?.amountMinor,
      proposal.eventDraft?.currency,
    ),
    matchedIds,
    reviewKind,
  }
}
