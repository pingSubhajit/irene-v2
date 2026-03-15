import { NextResponse } from "next/server"

import {
  getGmailOauthConnectionForUser,
  markOauthConnectionRevoked,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"

import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

const logger = createLogger("api.integrations.email.google.disconnect")

export async function POST() {
  const session = await requireSession()
  const connection = await getGmailOauthConnectionForUser(session.user.id)

  if (!connection) {
    return NextResponse.json(
      {
        error: "No Gmail connection found.",
      },
      {
        status: 404,
      },
    )
  }

  await markOauthConnectionRevoked(connection.id)

  logger.info("Revoked Gmail connection", {
    userId: session.user.id,
    oauthConnectionId: connection.id,
  })

  return NextResponse.json({
    ok: true,
  })
}
