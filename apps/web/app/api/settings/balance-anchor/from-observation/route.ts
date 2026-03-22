import { NextResponse } from "next/server"

import {
  getBalanceAnchorForInstrument,
  getBalanceObservationById,
  upsertBalanceAnchor,
} from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
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
    observation.observationKind !== "available_balance" ||
    observation.status !== "active"
  ) {
    redirectUrl.searchParams.set("balances", "observation-invalid")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const previousAnchor = await getBalanceAnchorForInstrument({
    userId: session.user.id,
    paymentInstrumentId: observation.paymentInstrumentId,
  })

  const anchor = await upsertBalanceAnchor({
    userId: session.user.id,
    paymentInstrumentId: observation.paymentInstrumentId,
    amountMinor: observation.amountMinor,
    currency: observation.currency,
    anchoredAt: observation.observedAt,
    sourceObservationId: observation.id,
  })

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "balance_anchor",
    targetId: anchor.id,
    correctionType: previousAnchor ? "accept_observation_replace_anchor" : "accept_observation_anchor",
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
    metadata: {
      observationId: observation.id,
    },
  })

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "balance_anchor_changed",
  })

  redirectUrl.searchParams.set("balances", "observation-accepted")
  return NextResponse.redirect(redirectUrl, 303)
}
