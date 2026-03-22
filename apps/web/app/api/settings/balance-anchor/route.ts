import { NextResponse } from "next/server"

import { getBalanceAnchorForInstrument, upsertBalanceAnchor } from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

function parseAmountMinor(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? "").trim())
  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  return Math.round(amount * 100)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const paymentInstrumentId = String(formData.get("paymentInstrumentId") ?? "").trim()
  const currency = String(formData.get("currency") ?? "INR").trim().toUpperCase()
  const amountMinor = parseAmountMinor(formData.get("amount"))
  const redirectUrl = new URL("/settings/accounts/baseline", request.url)

  if (!paymentInstrumentId || amountMinor === null) {
    redirectUrl.searchParams.set("balances", "invalid-anchor")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const previousAnchor = await getBalanceAnchorForInstrument({
    userId: session.user.id,
    paymentInstrumentId,
  })

  const anchor = await upsertBalanceAnchor({
    userId: session.user.id,
    paymentInstrumentId,
    amountMinor,
    currency,
    anchoredAt: new Date(),
    sourceObservationId: null,
  })

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "balance_anchor",
    targetId: anchor.id,
    correctionType: previousAnchor ? "replace_anchor" : "set_anchor",
    sourceSurface: "settings",
    previousValue: previousAnchor
      ? {
          amountMinor: previousAnchor.amountMinor,
          currency: previousAnchor.currency,
          anchoredAt: previousAnchor.anchoredAt.toISOString(),
          sourceObservationId: previousAnchor.sourceObservationId,
        }
      : null,
    newValue: {
      amountMinor: anchor.amountMinor,
      currency: anchor.currency,
      anchoredAt: anchor.anchoredAt.toISOString(),
      sourceObservationId: anchor.sourceObservationId,
    },
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "balance_anchor_changed",
  })

  redirectUrl.searchParams.set("balances", "anchor-updated")
  return NextResponse.redirect(redirectUrl, 303)
}
