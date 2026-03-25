import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  countOpenReviewQueueItemsForUser,
  getAuthUserProfile,
  getUserSettings,
} from "@workspace/db"

import { AppShell } from "@/components/app-shell"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { authenticatedAppMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const metadata: Metadata = authenticatedAppMetadata

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await requireSession()
  const settings = await getUserSettings(session.user.id)

  if (!settings.onboardingCompletedAt) {
    redirect("/onboarding")
  }

  const [authUser, reviewAttentionCount, gmailState] = await Promise.all([
    getAuthUserProfile(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    getGmailIntegrationState(session.user.id),
  ])
  const backfillRunning = Boolean(
    gmailState.cursor?.backfillStartedAt &&
    !gmailState.cursor?.backfillCompletedAt
  )

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: authUser?.image ?? session.user.image,
      }}
      reviewAttentionCount={reviewAttentionCount}
      backfillRunning={backfillRunning}
    >
      {children}
    </AppShell>
  )
}
