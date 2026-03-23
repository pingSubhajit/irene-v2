import { NextResponse } from "next/server"

import { triggerUserForecastRebuild, triggerUserForecastRefresh } from "@/lib/forecasting"
import { requireSession } from "@/lib/session"

function redirectToTarget(request: Request, redirectTo: string, status: string) {
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/settings/recovery", request.url)
  url.searchParams.set("recovery", status)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const action = String(formData.get("action") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/settings/recovery").trim()

  if (action === "rebuild") {
    await triggerUserForecastRebuild({
      userId: session.user.id,
      reason: "manual_rebuild",
    })
    return redirectToTarget(request, redirectTo, "forecast-rebuild-queued")
  }

  await triggerUserForecastRefresh({
    userId: session.user.id,
    reason: "manual_refresh",
  })
  return redirectToTarget(request, redirectTo, "forecast-refresh-queued")
}
