import { NextResponse } from "next/server"

import {
  triggerUserAdviceRank,
  triggerUserAdviceRebuild,
  triggerUserAdviceRefresh,
} from "@/lib/advice"
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
    await triggerUserAdviceRebuild({
      userId: session.user.id,
      reason: "manual_rebuild",
    })
    return redirectToTarget(request, redirectTo, "advice-rebuild-queued")
  }

  if (action === "rank") {
    await triggerUserAdviceRank({
      userId: session.user.id,
      reason: "manual_rank",
    })
    return redirectToTarget(request, redirectTo, "advice-rank-queued")
  }

  await triggerUserAdviceRefresh({
    userId: session.user.id,
    reason: "manual_refresh",
  })
  return redirectToTarget(request, redirectTo, "advice-refresh-queued")
}
