import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import {
  ensureEmailSyncCursor,
  getGmailOauthConnectionForUser,
  upsertGmailOauthConnection,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"
import {
  encryptSecret,
  exchangeGmailCodeForTokens,
  getGoogleIdentityFromTokens,
} from "@workspace/integrations"

import {
  GMAIL_CURSOR_NAME,
  triggerGmailSyncAfterConnect,
} from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"

const logger = createLogger("api.integrations.email.google.callback")
const GMAIL_OAUTH_STATE_COOKIE = "irene_gmail_oauth_state"

function redirectToSettings(request: NextRequest, status: string) {
  const url = new URL("/settings", request.url)
  url.searchParams.set("gmail", status)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value
  const receivedState = request.nextUrl.searchParams.get("state")
  const code = request.nextUrl.searchParams.get("code")
  const error = request.nextUrl.searchParams.get("error")

  cookieStore.delete(GMAIL_OAUTH_STATE_COOKIE)

  if (!expectedState || !receivedState || expectedState !== receivedState) {
    logger.warn("Rejected Gmail OAuth callback due to invalid state", {
      userId: session.user.id,
    })
    return redirectToSettings(request, "invalid-state")
  }

  if (error || !code) {
    logger.warn("Rejected Gmail OAuth callback due to provider error", {
      userId: session.user.id,
      error,
    })
    return redirectToSettings(request, "oauth-error")
  }

  try {
    const existingConnection = await getGmailOauthConnectionForUser(session.user.id)
    const exchanged = await exchangeGmailCodeForTokens(code)

    if (!exchanged.accessToken) {
      throw new Error("Google OAuth callback did not return an access token")
    }

    const identity = await getGoogleIdentityFromTokens({
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiryDate: exchanged.expiryDate,
    })

    if (!identity.email || identity.email !== session.user.email.toLowerCase()) {
      logger.warn("Rejected Gmail OAuth callback due to account mismatch", {
        userId: session.user.id,
        expectedEmail: session.user.email.toLowerCase(),
        receivedEmail: identity.email,
      })

      return redirectToSettings(request, "account-mismatch")
    }

    const connection = await upsertGmailOauthConnection({
      userId: session.user.id,
      providerAccountEmail: identity.email,
      accessTokenEncrypted: encryptSecret(exchanged.accessToken),
      refreshTokenEncrypted: exchanged.refreshToken
        ? encryptSecret(exchanged.refreshToken)
        : existingConnection?.refreshTokenEncrypted ?? null,
      tokenExpiresAt: exchanged.expiryDate,
      scope: exchanged.scope,
      status: "active",
    })
    const cursor = await ensureEmailSyncCursor(connection.id, GMAIL_CURSOR_NAME)
    const sync = await triggerGmailSyncAfterConnect({
      userId: session.user.id,
      oauthConnectionId: connection.id,
      cursorId: cursor.id,
      cursor,
      source: "web",
    })

    logger.info("Connected Gmail inbox and enqueued sync", {
      userId: session.user.id,
      oauthConnectionId: connection.id,
      cursorId: cursor.id,
      syncMode: sync.mode,
      jobRunId: sync.jobRun.id,
    })

    return redirectToSettings(request, "connected")
  } catch (error) {
    logger.errorWithCause("Failed to complete Gmail OAuth callback", error, {
      userId: session.user.id,
    })
    return redirectToSettings(request, "connect-failed")
  }
}
