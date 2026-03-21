import { NextResponse } from "next/server"

import { createManualCashPaymentInstrument, getUserSettings } from "@workspace/db"

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

  await createManualCashPaymentInstrument({
    userId: session.user.id,
    displayName,
    maskedIdentifier,
    currency: settings.reportingCurrency,
  })

  redirectUrl.searchParams.set("balances", "account-created")
  return NextResponse.redirect(redirectUrl, 303)
}
