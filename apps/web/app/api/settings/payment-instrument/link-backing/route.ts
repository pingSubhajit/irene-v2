import { NextResponse } from "next/server"

import { getPaymentInstrumentById, updatePaymentInstrumentBackingLink } from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()
  const backingPaymentInstrumentIdRaw = String(
    formData.get("backingPaymentInstrumentId") ?? "",
  ).trim()
  const redirectUrl = new URL("/settings/accounts/links", request.url)

  if (!paymentInstrumentId) {
    redirectUrl.searchParams.set("balances", "link-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const previousInstrument = await getPaymentInstrumentById(paymentInstrumentId)
  const result = await updatePaymentInstrumentBackingLink({
    userId: session.user.id,
    paymentInstrumentId,
    backingPaymentInstrumentId: backingPaymentInstrumentIdRaw || null,
  })

  if (!result) {
    redirectUrl.searchParams.set("balances", "link-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "payment_instrument",
    targetId: result.id,
    correctionType: "link_backing_account",
    sourceSurface: "settings",
    previousValue: previousInstrument?.instrument
      ? {
          backingPaymentInstrumentId:
            previousInstrument.instrument.backingPaymentInstrumentId,
        }
      : null,
    newValue: {
      backingPaymentInstrumentId: result.backingPaymentInstrumentId,
    },
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "manual_refresh",
  })

  redirectUrl.searchParams.set("balances", "link-updated")
  return NextResponse.redirect(redirectUrl, 303)
}
