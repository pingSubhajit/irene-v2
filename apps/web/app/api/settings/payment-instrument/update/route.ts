import { NextResponse } from "next/server"

import {
  getPaymentInstrumentById,
  updatePaymentInstrument,
  type PaymentInstrumentType,
} from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

function parseCreditLimitMinor(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) {
    return null
  }

  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) {
    return undefined
  }

  return Math.round(amount * 100)
}

function isInstrumentType(value: string): value is PaymentInstrumentType {
  return ["credit_card", "debit_card", "bank_account", "upi", "wallet", "unknown"].includes(value)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()
  const displayName = String(formData.get("displayName") ?? "").trim()
  const instrumentTypeValue = String(formData.get("instrumentType") ?? "").trim()
  const statusValue = String(formData.get("status") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/settings/accounts/cash").trim()
  const creditLimitMinor = parseCreditLimitMinor(formData.get("creditLimit"))
  const redirectUrl = new URL(redirectTo.startsWith("/") ? redirectTo : "/settings/accounts/cash", request.url)

  if (!paymentInstrumentId) {
    redirectUrl.searchParams.set("balances", "instrument-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const previous = await getPaymentInstrumentById(paymentInstrumentId)
  if (!previous || previous.instrument.userId !== session.user.id) {
    redirectUrl.searchParams.set("balances", "instrument-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const update: Parameters<typeof updatePaymentInstrument>[1] = {}
  if (displayName) {
    update.displayName = displayName
  }
  if (instrumentTypeValue && isInstrumentType(instrumentTypeValue)) {
    update.instrumentType = instrumentTypeValue
  }
  if (statusValue === "active" || statusValue === "inactive") {
    update.status = statusValue
  }
  if (creditLimitMinor !== undefined) {
    update.creditLimitMinor = creditLimitMinor
  }

  const instrument = await updatePaymentInstrument(paymentInstrumentId, update)
  if (!instrument) {
    redirectUrl.searchParams.set("balances", "instrument-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "payment_instrument",
    targetId: instrument.id,
    correctionType: "update_payment_instrument",
    sourceSurface: "settings",
    previousValue: {
      displayName: previous.instrument.displayName,
      instrumentType: previous.instrument.instrumentType,
      status: previous.instrument.status,
      creditLimitMinor: previous.instrument.creditLimitMinor,
    },
    newValue: {
      displayName: instrument.displayName,
      instrumentType: instrument.instrumentType,
      status: instrument.status,
      creditLimitMinor: instrument.creditLimitMinor,
    },
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "manual_refresh",
  })

  redirectUrl.searchParams.set("balances", "instrument-updated")
  return NextResponse.redirect(redirectUrl, 303)
}
