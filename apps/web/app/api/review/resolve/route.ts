import { NextResponse } from "next/server"

import {
  createFinancialEvent,
  createFinancialEventSource,
  getDirectionForEventType,
  getFinancialEventById,
  getFinancialEventSourceByExtractedSignal,
  getOrCreateMerchantForAlias,
  getReviewQueueContext,
  refreshFinancialEventSourceCount,
  updateExtractedSignalStatus,
  updateFinancialEvent,
  updateReviewQueueItem,
  type FinancialEventType,
} from "@workspace/db"

import { getServerSession } from "@/lib/session"

function redirectToReview(request: Request, status: string) {
  const url = new URL("/review", request.url)
  url.searchParams.set("status", status)
  return NextResponse.redirect(url, 303)
}

function isFinancialEventType(value: string | null): value is FinancialEventType {
  return (
    value === "purchase" ||
    value === "income" ||
    value === "subscription_charge" ||
    value === "emi_payment" ||
    value === "bill_payment" ||
    value === "refund" ||
    value === "transfer"
  )
}

type ProposedResolution = {
  action?: "create" | "merge"
  matchedEventIds?: string[]
  eventDraft?: {
    userId: string
    eventType: FinancialEventType
    direction: "inflow" | "outflow" | "neutral"
    amountMinor: number
    currency: string
    eventOccurredAt: string
    postedAt?: string | null
    merchantId?: string | null
    paymentInstrumentId?: string | null
    categoryId?: string | null
    description?: string | null
    notes?: string | null
    confidence: number
    needsReview?: boolean
    isRecurringCandidate?: boolean
    isTransfer?: boolean
    status?: "confirmed" | "needs_review" | "ignored" | "reversed"
    sourceCount?: number
  }
}

export async function POST(request: Request) {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url), 303)
  }

  const formData = await request.formData()
  const reviewItemId = String(formData.get("reviewItemId") ?? "")
  const resolution = String(formData.get("resolution") ?? "")
  const targetEventId = String(formData.get("targetEventId") ?? "").trim()
  const overrideMerchant = String(formData.get("overrideMerchant") ?? "").trim()
  const overrideCategoryId = String(formData.get("overrideCategoryId") ?? "").trim()
  const overrideEventTypeValue = String(formData.get("overrideEventType") ?? "").trim()
  const overrideEventType = isFinancialEventType(overrideEventTypeValue)
    ? overrideEventTypeValue
    : null

  if (!reviewItemId || !resolution) {
    return redirectToReview(request, "invalid-request")
  }

  const context = await getReviewQueueContext(reviewItemId)
  if (!context || context.item.userId !== session.user.id) {
    return redirectToReview(request, "missing-review-item")
  }

  const existingSource = context.signal
    ? await getFinancialEventSourceByExtractedSignal(context.signal.id)
    : null

  if (resolution === "ignore") {
    if (context.signal) {
      await updateExtractedSignalStatus(context.signal.id, "ignored")
    }

    await updateReviewQueueItem(context.item.id, {
      status: "ignored",
      resolvedAt: new Date(),
    })

    return redirectToReview(request, "ignored")
  }

  if (existingSource) {
    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      financialEventId: existingSource.financialEventId,
    })

    return redirectToReview(request, "already-reconciled")
  }

  const proposal = (context.item.proposedResolutionJson ?? {}) as ProposedResolution
  const eventDraft = proposal.eventDraft

  if (!context.signal || !context.rawDocument || !eventDraft) {
    return redirectToReview(request, "missing-proposal")
  }

  const resolvedMerchant =
    overrideMerchant.length > 0
      ? await getOrCreateMerchantForAlias({
          userId: session.user.id,
          aliasText: overrideMerchant,
          source: "review_resolution",
          confidence: 1,
        })
      : null

  const resolvedEventType =
    overrideEventType ?? (isFinancialEventType(eventDraft.eventType) ? eventDraft.eventType : null)

  if (!resolvedEventType) {
    return redirectToReview(request, "invalid-event-type")
  }

  const targetFinancialEventId =
    resolution === "merge"
      ? targetEventId || proposal.matchedEventIds?.[0] || ""
      : targetEventId

  if (resolution === "merge" && !targetFinancialEventId) {
    return redirectToReview(request, "missing-target-event")
  }

  if (resolution === "merge") {
    const existingEvent = await getFinancialEventById(targetFinancialEventId)

    if (!existingEvent || existingEvent.userId !== session.user.id) {
      return redirectToReview(request, "invalid-target-event")
    }

    await updateFinancialEvent(existingEvent.id, {
      eventType: resolvedEventType,
      direction: getDirectionForEventType(resolvedEventType),
      merchantId: resolvedMerchant?.id ?? existingEvent.merchantId,
      categoryId: overrideCategoryId || existingEvent.categoryId,
      needsReview: false,
      status: "confirmed",
      confidence: Math.max(Number(existingEvent.confidence), Number(eventDraft.confidence)),
    })
    await createFinancialEventSource({
      financialEventId: existingEvent.id,
      rawDocumentId: context.rawDocument.id,
      extractedSignalId: context.signal.id,
      linkReason: "review_resolution_merge",
    })
    await refreshFinancialEventSourceCount(existingEvent.id)
    await updateExtractedSignalStatus(context.signal.id, "reconciled")
    await updateReviewQueueItem(context.item.id, {
      status: "resolved",
      resolvedAt: new Date(),
      financialEventId: existingEvent.id,
      proposedResolutionJson: {
        ...proposal,
        resolvedAs: "merge",
      },
    })

    return redirectToReview(request, "merged")
  }

  const createdEvent = await createFinancialEvent({
    userId: session.user.id,
    eventType: resolvedEventType,
    direction: getDirectionForEventType(resolvedEventType),
    amountMinor: eventDraft.amountMinor,
    currency: eventDraft.currency,
    eventOccurredAt: new Date(eventDraft.eventOccurredAt),
    postedAt: eventDraft.postedAt ? new Date(eventDraft.postedAt) : context.rawDocument.messageTimestamp,
    merchantId: resolvedMerchant?.id ?? eventDraft.merchantId ?? null,
    paymentInstrumentId: eventDraft.paymentInstrumentId ?? null,
    categoryId: overrideCategoryId || eventDraft.categoryId || null,
    description: eventDraft.description ?? context.rawDocument.subject ?? null,
    notes: eventDraft.notes ?? null,
    confidence: eventDraft.confidence,
    needsReview: false,
    isRecurringCandidate: eventDraft.isRecurringCandidate ?? false,
    isTransfer: resolvedEventType === "transfer",
    sourceCount: 0,
    status: "confirmed",
  })

  await createFinancialEventSource({
    financialEventId: createdEvent.id,
    rawDocumentId: context.rawDocument.id,
    extractedSignalId: context.signal.id,
    linkReason: "review_resolution_create",
  })
  await refreshFinancialEventSourceCount(createdEvent.id)
  await updateExtractedSignalStatus(context.signal.id, "reconciled")
  await updateReviewQueueItem(context.item.id, {
    status: "resolved",
    resolvedAt: new Date(),
    financialEventId: createdEvent.id,
    proposedResolutionJson: {
      ...proposal,
      resolvedAs: "create",
    },
  })

  return redirectToReview(request, "approved")
}
