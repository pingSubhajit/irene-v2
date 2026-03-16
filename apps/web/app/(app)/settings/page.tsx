import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

import { GmailIntegrationActions } from "@/components/gmail-integration-actions"
import { ResetIngestionButton } from "@/components/reset-ingestion-button"
import { SignOutButton } from "@/components/sign-out-button"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(value: string | undefined) {
  switch (value) {
    case "connected":
      return "Gmail connected. Irene has started syncing and backfilling your inbox."
    case "account-mismatch":
      return "The Gmail account you picked did not match your Irene owner account."
    case "invalid-state":
      return "The Gmail connection flow expired. Try connecting again."
    case "oauth-error":
      return "Google returned an OAuth error before the inbox could be connected."
    case "connect-failed":
      return "Irene could not finish the Gmail connection. Try again."
    default:
      return null
  }
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "Not yet"
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(value)
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const gmailState = await getGmailIntegrationState(session.user.id)
  const statusMessage = getStatusMessage(asSingleValue(params.gmail))
  const backfillState = gmailState.cursor?.backfillCompletedAt
    ? "Ready"
    : gmailState.cursor?.backfillStartedAt
      ? "In progress"
      : "Not started"

  return (
    <section className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="neo-kicker">Settings</p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
            keep Irene
            <br />
            connected and
            <br />
            current.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            Manage your inbox connection, refresh the activity picture, and keep your
            personal finance surface healthy without surfacing the underlying system
            machinery.
          </p>
        </div>

        <div className="grid gap-4 self-start">
          <Card className="p-5">
            <p className="neo-kicker">Owner account</p>
            <p className="mt-4 text-lg font-semibold text-white">{session.user.email}</p>
            <p className="mt-3 text-sm leading-6 text-white/56">
              Irene is locked to this owner identity and the matching Gmail inbox.
            </p>
            <div className="mt-5">
              <SignOutButton />
            </div>
          </Card>

          {statusMessage ? (
            <Card className="border-[var(--neo-green)]/25 bg-[rgba(114,255,194,0.06)] p-5">
              <p className="neo-kicker text-[var(--neo-green)]">Status</p>
              <p className="mt-3 text-sm leading-6 text-white/76">{statusMessage}</p>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="neo-kicker">Inbox connection</p>
              <h2 className="mt-4 font-display text-[2.2rem] leading-none text-white">
                {gmailState.connection ? "Gmail is linked." : "Gmail is not connected."}
              </h2>
            </div>
            <Badge variant={gmailState.connection ? "success" : "warning"}>
              {gmailState.connection ? "Connected" : "Action"}
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <InfoBlock
              label="Connected inbox"
              value={gmailState.connection?.providerAccountEmail ?? "None yet"}
            />
            <InfoBlock label="Backfill" value={backfillState} />
            <InfoBlock
              label="Last successful sync"
              value={formatDateTime(gmailState.connection?.lastSuccessfulSyncAt)}
            />
            <InfoBlock
              label="Last failed sync"
              value={formatDateTime(gmailState.connection?.lastFailedSyncAt)}
            />
          </div>

          <div className="mt-6">
            <GmailIntegrationActions connected={Boolean(gmailState.connection)} />
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <p className="neo-kicker">Recent inbox evidence</p>
          <h2 className="mt-4 font-display text-[2.2rem] leading-none text-white">
            what Irene recently pulled in.
          </h2>
          <div className="mt-6 grid gap-3">
            {gmailState.recentRawDocuments.length > 0 ? (
              gmailState.recentRawDocuments.map((document) => (
                <div
                  key={document.id}
                  className="border border-white/8 bg-black/20 p-4"
                >
                  <p className="text-sm font-semibold text-white">
                    {document.subject ?? "(no subject)"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/56">
                    {document.fromAddress ?? "Unknown sender"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-white/34">
                    {formatDateTime(document.messageTimestamp)}
                  </p>
                </div>
              ))
            ) : (
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/56">
                No accepted inbox evidence yet. Connect Gmail or wait for the first sync
                to complete.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5 md:p-6">
        <p className="neo-kicker">Advanced</p>
        <h2 className="mt-4 font-display text-[2.2rem] leading-none text-white">
          low-level controls.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/56">
          Use these only when you want to force a clean resync or inspect internal
          operational pages. They are kept out of the main product flow on purpose.
        </p>

        <details className="mt-6 border border-white/8 bg-black/20 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.22em] text-white/72">
            Show advanced tools
          </summary>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.62fr_0.38fr]">
            <div className="border border-white/8 bg-black/20 p-4">
              <p className="neo-kicker">Reset and reingest</p>
              <p className="mt-3 text-sm leading-6 text-white/56">
                Wipe the current Gmail ingestion data and run a fresh backfill under the
                current filters. Use only when you intentionally want a clean rebuild.
              </p>
              <div className="mt-5">
                <ResetIngestionButton />
              </div>
            </div>

            <div className="grid gap-3">
              <Link
                href="/ops/extraction"
                className="flex h-12 items-center justify-between border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm font-semibold text-[var(--neo-cream)] shadow-[0_8px_0_rgba(0,0,0,0.38)] transition hover:-translate-y-px hover:bg-[rgba(28,28,30,0.98)]"
              >
                <span>Extraction ops</span>
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/ops/queues"
                className="flex h-12 items-center justify-between border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm font-semibold text-[var(--neo-cream)] shadow-[0_8px_0_rgba(0,0,0,0.38)] transition hover:-translate-y-px hover:bg-[rgba(28,28,30,0.98)]"
              >
                <span>Queue ops</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </details>
      </Card>
    </section>
  )
}

function InfoBlock(props: { label: string; value: string }) {
  return (
    <div className="border border-white/8 bg-black/20 p-4">
      <p className="neo-kicker">{props.label}</p>
      <p className="mt-3 text-sm leading-6 text-white/74">{props.value}</p>
    </div>
  )
}
