import { NextResponse } from "next/server"

import {
  accounts,
  db,
  ensureEmailSyncCursor,
  getGmailOauthConnectionForUser,
  updateUserSettings,
  upsertGmailOauthConnection,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"
import { encryptSecret } from "@workspace/integrations"
import { and, desc, eq } from "drizzle-orm"

import { isSupportedReportingCurrency } from "@/lib/currency-options"
import { triggerUserFinancialEventValuationBackfill } from "@/lib/fx-valuation"
import {
  GMAIL_CURSOR_NAME,
  triggerGmailSyncAfterConnect,
} from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"
import { isSupportedTimeZone } from "@/lib/time-zone-options"

export const runtime = "nodejs"

const logger = createLogger("api.onboarding.complete")
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

type OnboardingPayload = {
  reportingCurrency?: unknown
  timeZone?: unknown
}

function parseGrantedScopes(scope: string | null | undefined) {
  if (!scope) {
    return []
  }

  return scope
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const body = (await request.json().catch(() => null)) as OnboardingPayload | null
  const reportingCurrency = String(body?.reportingCurrency ?? "").toUpperCase()
  const timeZone = String(body?.timeZone ?? "").trim()

  if (!isSupportedReportingCurrency(reportingCurrency)) {
    return NextResponse.json(
      { error: "Choose a supported reporting currency." },
      { status: 400 },
    )
  }

  if (!isSupportedTimeZone(timeZone)) {
    return NextResponse.json(
      { error: "Choose a supported time zone." },
      { status: 400 },
    )
  }

  const [existingConnection, googleAccounts] = await Promise.all([
    getGmailOauthConnectionForUser(session.user.id),
    db
      .select()
      .from(accounts)
      .where(
        and(
        eq(accounts.userId, session.user.id),
        eq(accounts.providerId, "google"),
        ),
      )
      .orderBy(desc(accounts.updatedAt))
      .limit(1),
  ])
  const googleAccount = googleAccounts[0] ?? null

  if (!googleAccount?.accessToken) {
    logger.warn("Missing Google access token during onboarding completion", {
      userId: session.user.id,
    })

    return NextResponse.json(
      { error: "Google access is missing. Sign in again to continue." },
      { status: 409 },
    )
  }

  const grantedScopes = parseGrantedScopes(googleAccount.scope)

  if (!grantedScopes.includes(GMAIL_READONLY_SCOPE)) {
    logger.warn("Missing Gmail scope during onboarding completion", {
      userId: session.user.id,
      scope: googleAccount.scope,
    })

    return NextResponse.json(
      { error: "Gmail access was not granted. Sign in again to continue." },
      { status: 409 },
    )
  }

  if (!googleAccount.refreshToken && !existingConnection?.refreshTokenEncrypted) {
    logger.warn("Missing Google refresh token during onboarding completion", {
      userId: session.user.id,
    })

    return NextResponse.json(
      { error: "Google offline access is missing. Sign in again to continue." },
      { status: 409 },
    )
  }

  await updateUserSettings(session.user.id, {
    reportingCurrency,
    timeZone,
  })

  try {
    const connection = await upsertGmailOauthConnection({
      userId: session.user.id,
      providerAccountEmail: session.user.email.toLowerCase(),
      accessTokenEncrypted: encryptSecret(googleAccount.accessToken),
      refreshTokenEncrypted: googleAccount.refreshToken
        ? encryptSecret(googleAccount.refreshToken)
        : existingConnection?.refreshTokenEncrypted ?? null,
      tokenExpiresAt: googleAccount.accessTokenExpiresAt ?? null,
      scope: googleAccount.scope ?? null,
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

    await updateUserSettings(session.user.id, {
      onboardingCompletedAt: new Date(),
    })

    try {
      await triggerUserFinancialEventValuationBackfill({
        userId: session.user.id,
        targetCurrency: reportingCurrency,
      })
    } catch (error) {
      logger.warn("Failed to enqueue FX valuation backfill during onboarding", {
        userId: session.user.id,
        reportingCurrency,
        error: error instanceof Error ? error.message : "unknown",
      })
    }

    return NextResponse.json({
      ok: true,
      backfillRunning: sync.mode === "backfill",
      syncMode: sync.mode,
    })
  } catch (error) {
    logger.errorWithCause("Failed to finish onboarding", error, {
      userId: session.user.id,
    })

    return NextResponse.json(
      { error: "We could not start your backfill yet. Please try again." },
      { status: 500 },
    )
  }
}
