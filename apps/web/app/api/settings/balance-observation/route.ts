import { NextResponse } from "next/server"

import { getBalanceObservationById, updateBalanceObservationStatus } from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const observationId = String(formData.get("observationId") ?? "").trim()
  const nextStatus = String(formData.get("status") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/settings/accounts/baseline").trim()
  const redirectUrl = new URL(redirectTo.startsWith("/") ? redirectTo : "/settings/accounts/baseline", request.url)

  if (!observationId || (nextStatus !== "active" && nextStatus !== "ignored")) {
    redirectUrl.searchParams.set("balances", "observation-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const previousObservation = await getBalanceObservationById(observationId)
  if (!previousObservation || previousObservation.userId !== session.user.id) {
    redirectUrl.searchParams.set("balances", "observation-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const observation = await updateBalanceObservationStatus({
    userId: session.user.id,
    observationId,
    status: nextStatus,
  })

  if (!observation) {
    redirectUrl.searchParams.set("balances", "observation-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "balance_observation",
    targetId: observation.id,
    correctionType: nextStatus === "ignored" ? "ignore_balance_observation" : "restore_balance_observation",
    sourceSurface: "settings",
    previousValue: {
      status: previousObservation.status,
      amountMinor: previousObservation.amountMinor,
      observedAt: previousObservation.observedAt.toISOString(),
    },
    newValue: {
      status: observation.status,
      amountMinor: observation.amountMinor,
      observedAt: observation.observedAt.toISOString(),
    },
  })

  redirectUrl.searchParams.set(
    "balances",
    nextStatus === "ignored" ? "observation-ignored" : "observation-restored",
  )
  return NextResponse.redirect(redirectUrl, 303)
}
