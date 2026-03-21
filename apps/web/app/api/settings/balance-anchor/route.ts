import { NextResponse } from "next/server"

import { upsertBalanceAnchor } from "@workspace/db"

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

  await upsertBalanceAnchor({
    userId: session.user.id,
    paymentInstrumentId,
    amountMinor,
    currency,
    anchoredAt: new Date(),
    sourceObservationId: null,
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "balance_anchor_changed",
  })

  redirectUrl.searchParams.set("balances", "anchor-updated")
  return NextResponse.redirect(redirectUrl, 303)
}
