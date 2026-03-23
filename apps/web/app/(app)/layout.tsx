import {
  countOpenReviewQueueItemsForUser,
  getAuthUserProfile,
} from "@workspace/db"

import { AppShell } from "@/components/app-shell"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export default async function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await requireSession()
  const [authUser, reviewAttentionCount, gmailState] = await Promise.all([
    getAuthUserProfile(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    getGmailIntegrationState(session.user.id),
  ])
  const backfillRunning = Boolean(
    gmailState.cursor?.backfillStartedAt && !gmailState.cursor?.backfillCompletedAt,
  )

  return (
    <AppShell
      user={{
        name: session.user.name,
        image: authUser?.image ?? session.user.image,
      }}
      reviewAttentionCount={reviewAttentionCount}
      backfillRunning={backfillRunning}
    >
      {children}
    </AppShell>
  )
}
