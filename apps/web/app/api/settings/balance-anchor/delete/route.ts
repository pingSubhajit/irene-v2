import { NextResponse } from "next/server"

import { deleteBalanceAnchor, getBalanceAnchorForInstrument } from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()
  const redirectUrl = new URL("/settings/accounts/baseline", request.url)

  if (!paymentInstrumentId) {
    redirectUrl.searchParams.set("balances", "invalid-anchor")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const previousAnchor = await getBalanceAnchorForInstrument({
    userId: session.user.id,
    paymentInstrumentId,
  })

  if (!previousAnchor) {
    redirectUrl.searchParams.set("balances", "invalid-anchor")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await deleteBalanceAnchor({
    userId: session.user.id,
    paymentInstrumentId,
  })

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "balance_anchor",
    targetId: previousAnchor.id,
    correctionType: "remove_anchor",
    sourceSurface: "settings",
    previousValue: {
      amountMinor: previousAnchor.amountMinor,
      currency: previousAnchor.currency,
      anchoredAt: previousAnchor.anchoredAt.toISOString(),
      sourceObservationId: previousAnchor.sourceObservationId,
    },
    newValue: null,
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "balance_anchor_changed",
  })

  redirectUrl.searchParams.set("balances", "anchor-removed")
  return NextResponse.redirect(redirectUrl, 303)
}
