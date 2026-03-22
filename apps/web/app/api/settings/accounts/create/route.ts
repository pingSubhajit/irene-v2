import { NextResponse } from "next/server"

import { createManualCashPaymentInstrument, getUserSettings } from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const displayName = String(formData.get("displayName") ?? "").trim()
  const maskedIdentifierRaw = String(formData.get("maskedIdentifier") ?? "").trim()
  const redirectUrl = new URL("/settings/accounts/cash", request.url)

  if (!displayName) {
    redirectUrl.searchParams.set("balances", "invalid-account-name")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const settings = await getUserSettings(session.user.id)
  const maskedIdentifier = maskedIdentifierRaw ? maskedIdentifierRaw.replace(/\D+/g, "").slice(-4) : null

  const instrument = await createManualCashPaymentInstrument({
    userId: session.user.id,
    displayName,
    maskedIdentifier,
    currency: settings.reportingCurrency,
  })

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "payment_instrument",
    targetId: instrument.id,
    correctionType: "create_manual_cash_account",
    sourceSurface: "settings",
    previousValue: null,
    newValue: {
      displayName: instrument.displayName,
      instrumentType: instrument.instrumentType,
      maskedIdentifier: instrument.maskedIdentifier,
      currency: instrument.currency,
    },
  })

  redirectUrl.searchParams.set("balances", "account-created")
  return NextResponse.redirect(redirectUrl, 303)
}
