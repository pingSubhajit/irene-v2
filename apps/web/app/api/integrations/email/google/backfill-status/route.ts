import { NextResponse } from "next/server"

import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ running: false }, { status: 401 })
  }

  const gmailState = await getGmailIntegrationState(session.user.id)
  const running = Boolean(
    gmailState.cursor?.backfillStartedAt && !gmailState.cursor?.backfillCompletedAt,
  )

  return NextResponse.json({ running })
}
