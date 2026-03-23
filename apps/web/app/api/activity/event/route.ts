import { NextResponse } from "next/server"

import {
  getCategoryById,
  getDirectionForEventType,
  getFinancialEventById,
  getMerchantById,
  getPaymentInstrumentById,
  getUserSettings,
  type FinancialEventType,
  updateFinancialEvent,
} from "@workspace/db"

import { parseUserLocalDateTime } from "@/lib/date-format"
import { recordFeedbackEvent } from "@/lib/feedback"
import { triggerFinancialEventValuationRefresh } from "@/lib/fx-valuation"
import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

function redirectToTarget(request: Request, redirectTo: string, status: string) {
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/activity", request.url)
  url.searchParams.set("status", status)
  return NextResponse.redirect(url, 303)
}

function isFinancialEventType(value: string): value is FinancialEventType {
  return [
    "purchase",
    "income",
    "subscription_charge",
    "emi_payment",
    "bill_payment",
    "refund",
    "transfer",
  ].includes(value)
}

function parseAmountMinor(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()

  if (!raw) {
    return undefined
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return Math.round(parsed * 100)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const eventId = String(formData.get("eventId") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/activity").trim()
  const mode = String(formData.get("mode") ?? "update").trim()
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const categoryId = String(formData.get("categoryId") ?? "").trim()
  const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()
  const eventTypeValue = String(formData.get("eventType") ?? "").trim()
  const amountMinor = parseAmountMinor(formData.get("amount"))
  const occurredAtInput = String(formData.get("eventOccurredAt") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const notes = String(formData.get("notes") ?? "").trim()

  if (!eventId) {
    return redirectToTarget(request, redirectTo, "event-invalid")
  }

  const previousEvent = await getFinancialEventById(eventId)
  if (!previousEvent || previousEvent.userId !== session.user.id) {
    return redirectToTarget(request, redirectTo, "event-invalid")
  }

  if (mode === "ignore" || mode === "restore") {
    const nextStatus = mode === "ignore" ? "ignored" : "confirmed"
    const updatedEvent = await updateFinancialEvent(eventId, {
      status: nextStatus,
      needsReview: false,
    })

    if (!updatedEvent) {
      return redirectToTarget(request, redirectTo, "event-invalid")
    }

    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "financial_event",
      targetId: updatedEvent.id,
      correctionType: mode === "ignore" ? "ignore_event" : "restore_event",
      sourceSurface: "activity_detail",
      previousValue: {
        status: previousEvent.status,
      },
      newValue: {
        status: updatedEvent.status,
      },
    })

    await triggerUserForecastRefresh({
      userId: session.user.id,
      reason: "manual_refresh",
    })

    return redirectToTarget(request, redirectTo, mode === "ignore" ? "event-ignored" : "event-restored")
  }

  if (amountMinor === null) {
    return redirectToTarget(request, redirectTo, "event-invalid")
  }

  const settings = await getUserSettings(session.user.id)
  const parsedOccurredAt = occurredAtInput
    ? parseUserLocalDateTime(occurredAtInput, settings.timeZone)
    : undefined

  if (occurredAtInput && !parsedOccurredAt) {
    return redirectToTarget(request, redirectTo, "event-invalid")
  }

  const update: Parameters<typeof updateFinancialEvent>[1] = {}

  if (merchantId) {
    const merchant = await getMerchantById(merchantId)
    if (!merchant || merchant.userId !== session.user.id) {
      return redirectToTarget(request, redirectTo, "event-invalid")
    }
    update.merchantId = merchant.id
  } else if (formData.has("merchantId")) {
    update.merchantId = null
  }

  if (categoryId) {
    const category = await getCategoryById(session.user.id, categoryId)
    if (!category) {
      return redirectToTarget(request, redirectTo, "event-invalid")
    }
    update.categoryId = category.id
  } else if (formData.has("categoryId")) {
    update.categoryId = null
  }

  if (paymentInstrumentId) {
    const instrument = await getPaymentInstrumentById(paymentInstrumentId)
    if (!instrument || instrument.instrument.userId !== session.user.id) {
      return redirectToTarget(request, redirectTo, "event-invalid")
    }
    update.paymentInstrumentId = instrument.instrument.id
  } else if (formData.has("paymentInstrumentId")) {
    update.paymentInstrumentId = null
  }

  if (eventTypeValue) {
    if (!isFinancialEventType(eventTypeValue)) {
      return redirectToTarget(request, redirectTo, "event-invalid")
    }
    update.eventType = eventTypeValue
    update.direction = getDirectionForEventType(eventTypeValue)
  }

  if (typeof amountMinor === "number") {
    update.amountMinor = amountMinor
  }

  if (occurredAtInput) {
    update.eventOccurredAt = parsedOccurredAt ?? undefined
  }

  if (formData.has("description")) {
    update.description = description || null
  }

  if (formData.has("notes")) {
    update.notes = notes || null
  }

  const updatedEvent = await updateFinancialEvent(eventId, {
    ...update,
    needsReview: false,
  })

  if (!updatedEvent) {
    return redirectToTarget(request, redirectTo, "event-invalid")
  }

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "financial_event",
    targetId: updatedEvent.id,
    correctionType: "update_event",
    sourceSurface: "activity_detail",
    previousValue: {
      amountMinor: previousEvent.amountMinor,
      merchantId: previousEvent.merchantId,
      categoryId: previousEvent.categoryId,
      paymentInstrumentId: previousEvent.paymentInstrumentId,
      eventType: previousEvent.eventType,
      direction: previousEvent.direction,
      eventOccurredAt: previousEvent.eventOccurredAt?.toISOString() ?? null,
      description: previousEvent.description,
      notes: previousEvent.notes,
      status: previousEvent.status,
    },
    newValue: {
      amountMinor: updatedEvent.amountMinor,
      merchantId: updatedEvent.merchantId,
      categoryId: updatedEvent.categoryId,
      paymentInstrumentId: updatedEvent.paymentInstrumentId,
      eventType: updatedEvent.eventType,
      direction: updatedEvent.direction,
      eventOccurredAt: updatedEvent.eventOccurredAt?.toISOString() ?? null,
      description: updatedEvent.description,
      notes: updatedEvent.notes,
      status: updatedEvent.status,
    },
  })

  await triggerFinancialEventValuationRefresh({
    userId: session.user.id,
    financialEventId: updatedEvent.id,
  })
  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "manual_refresh",
  })

  return redirectToTarget(request, redirectTo, "event-updated")
}
