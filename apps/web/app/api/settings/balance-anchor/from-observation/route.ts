import { NextResponse } from "next/server"

import { getBalanceObservationById, upsertBalanceAnchor } from "@workspace/db"

import { triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const observationId = String(formData.get("observationId") ?? "").trim()
  const redirectUrl = new URL("/settings/accounts/baseline", request.url)

  if (!observationId) {
    redirectUrl.searchParams.set("balances", "observation-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const observation = await getBalanceObservationById(observationId)
  if (
    !observation ||
    observation.userId !== session.user.id ||
    observation.observationKind !== "available_balance"
  ) {
    redirectUrl.searchParams.set("balances", "observation-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await upsertBalanceAnchor({
    userId: session.user.id,
    paymentInstrumentId: observation.paymentInstrumentId,
    amountMinor: observation.amountMinor,
    currency: observation.currency,
    anchoredAt: observation.observedAt,
    sourceObservationId: observation.id,
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "balance_anchor_changed",
  })

  redirectUrl.searchParams.set("balances", "observation-accepted")
  return NextResponse.redirect(redirectUrl, 303)
}
