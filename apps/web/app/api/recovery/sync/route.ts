import { NextResponse } from "next/server"

import {
  requireActiveGmailConnection,
  triggerGmailIncrementalSync,
} from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

function redirectToTarget(request: Request, redirectTo: string, status: string) {
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/settings/recovery", request.url)
  url.searchParams.set("recovery", status)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const redirectTo = String(formData.get("redirectTo") ?? "/settings/recovery").trim()
  const integration = await requireActiveGmailConnection(session.user.id)

  if (!integration) {
    return redirectToTarget(request, redirectTo, "sync-invalid")
  }

  await triggerGmailIncrementalSync({
    userId: session.user.id,
    oauthConnectionId: integration.connection.id,
    cursorId: integration.cursor.id,
    source: "web",
  })

  return redirectToTarget(request, redirectTo, "sync-queued")
}
