import { NextResponse } from "next/server"

import { getJobRunById } from "@workspace/db"

import { isJobRunOwnedByUser, replayRecoverableJobRun } from "@/lib/recovery"
import { requireSession } from "@/lib/session"

function redirectToTarget(request: Request, redirectTo: string, status: string) {
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/settings/recovery", request.url)
  url.searchParams.set("recovery", status)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const jobRunId = String(formData.get("jobRunId") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/settings/recovery").trim()

  if (!jobRunId) {
    return redirectToTarget(request, redirectTo, "invalid")
  }

  const jobRun = await getJobRunById(jobRunId)

  if (!jobRun || !isJobRunOwnedByUser(jobRun, session.user.id)) {
    return redirectToTarget(request, redirectTo, "invalid")
  }

  try {
    await replayRecoverableJobRun(jobRun)
    return redirectToTarget(request, redirectTo, "replay-queued")
  } catch {
    return redirectToTarget(request, redirectTo, "replay-failed")
  }
}
