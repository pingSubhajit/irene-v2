import { NextResponse } from "next/server"

import { updateUserSettings } from "@workspace/db"

import { isSupportedReportingCurrency } from "@/lib/currency-options"
import { triggerUserFinancialEventValuationBackfill } from "@/lib/fx-valuation"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const reportingCurrency = String(formData.get("reportingCurrency") ?? "").toUpperCase()
  const redirectUrl = new URL("/settings", request.url)

  if (!isSupportedReportingCurrency(reportingCurrency)) {
    redirectUrl.searchParams.set("fx", "invalid-currency")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const settings = await updateUserSettings(session.user.id, {
    reportingCurrency,
  })

  if (!settings) {
    redirectUrl.searchParams.set("fx", "save-failed")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await triggerUserFinancialEventValuationBackfill({
    userId: session.user.id,
    targetCurrency: reportingCurrency,
  })

  redirectUrl.searchParams.set("fx", "updated")
  return NextResponse.redirect(redirectUrl, 303)
}
