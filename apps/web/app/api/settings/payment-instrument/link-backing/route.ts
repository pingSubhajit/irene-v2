import { NextResponse } from "next/server"

import { updatePaymentInstrumentBackingLink } from "@workspace/db"

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

  const result = await updatePaymentInstrumentBackingLink({
    userId: session.user.id,
    paymentInstrumentId,
    backingPaymentInstrumentId: backingPaymentInstrumentIdRaw || null,
  })

  if (!result) {
    redirectUrl.searchParams.set("balances", "link-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "manual_refresh",
  })

  redirectUrl.searchParams.set("balances", "link-updated")
  return NextResponse.redirect(redirectUrl, 303)
}
