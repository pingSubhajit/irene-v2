import { randomUUID } from "node:crypto"

import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { createLogger } from "@workspace/observability"
import { createGmailConnectUrl } from "@workspace/integrations"

import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

const logger = createLogger("api.integrations.email.google.connect")
const GMAIL_OAUTH_STATE_COOKIE = "irene_gmail_oauth_state"

export async function GET() {
  const session = await requireSession()
  const state = randomUUID()
  const cookieStore = await cookies()
  const url = createGmailConnectUrl({
    state,
    loginHint: session.user.email,
  })

  cookieStore.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  })

  logger.info("Starting Gmail OAuth connect flow", {
    userId: session.user.id,
    email: session.user.email,
  })

  return NextResponse.redirect(url)
}
