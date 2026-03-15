import type { JobRunSelect } from "@workspace/db"

import { ResetIngestionButton } from "@/components/reset-ingestion-button"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

function getBackfillStatus(input: {
  backfillStartedAt: Date | null | undefined
  backfillCompletedAt: Date | null | undefined
}) {
  if (input.backfillCompletedAt) {
    return "Completed"
  }

  if (input.backfillStartedAt) {
    return "In progress"
  }

  return "Not started"
}

function getNumber(value: unknown) {
  return typeof value === "number" ? value : 0
}

function summarizeJobRuns(jobRuns: JobRunSelect[]) {
  return jobRuns.reduce(
    (summary, jobRun) => {
      const payload = jobRun.payloadJson

      summary.acceptedTransactionalCount += getNumber(
        payload?.acceptedTransactionalCount,
      )
      summary.acceptedObligationCount += getNumber(payload?.acceptedObligationCount)
      summary.skippedMarketingCount += getNumber(payload?.skippedMarketingCount)
      summary.skippedNonFinanceCount += getNumber(payload?.skippedNonFinanceCount)

      return summary
    },
    {
      acceptedTransactionalCount: 0,
      acceptedObligationCount: 0,
      skippedMarketingCount: 0,
      skippedNonFinanceCount: 0,
    },
  )
}

export default async function DashboardPage() {
  const session = await requireSession()
  const gmailState = await getGmailIntegrationState(session.user.id)
  const jobSummary = summarizeJobRuns(gmailState.recentJobRuns)
  const backfillStatus = getBackfillStatus({
    backfillStartedAt: gmailState.cursor?.backfillStartedAt,
    backfillCompletedAt: gmailState.cursor?.backfillCompletedAt,
  })

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          Phase 2.5
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Gmail ingestion operations
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          This dashboard shows the state of your Gmail ingestion pipeline. It reflects
          connection health, backfill progress, accepted document volume, recent
          ingestion filtering outcomes, and the owner-only reset control for rerunning
          a clean backfill.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Connected inbox</p>
          <p className="mt-2 text-sm text-zinc-600">
            {gmailState.connection?.providerAccountEmail ?? "Not connected"}
          </p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Connection state</p>
          <p className="mt-2 text-sm text-zinc-600">
            {gmailState.connection?.status ?? "Not connected"}
          </p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Backfill</p>
          <p className="mt-2 text-sm text-zinc-600">{backfillStatus}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Accepted raw documents</p>
          <p className="mt-2 text-sm text-zinc-600">{gmailState.rawDocumentCount}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Recent accepted transactions</p>
          <p className="mt-2 text-sm text-zinc-600">
            {jobSummary.acceptedTransactionalCount}
          </p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Recent accepted obligations</p>
          <p className="mt-2 text-sm text-zinc-600">
            {jobSummary.acceptedObligationCount}
          </p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Recent skipped marketing</p>
          <p className="mt-2 text-sm text-zinc-600">{jobSummary.skippedMarketingCount}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Recent skipped non-finance</p>
          <p className="mt-2 text-sm text-zinc-600">{jobSummary.skippedNonFinanceCount}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent accepted documents</h2>
          <div className="mt-5 space-y-3">
            {gmailState.recentRawDocuments.length > 0 ? (
              gmailState.recentRawDocuments.map((document) => (
                <div
                  key={document.id}
                  className="rounded-2xl border border-zinc-200 p-4"
                >
                  <p className="text-sm font-medium text-zinc-950">
                    {document.subject ?? "(no subject)"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {document.fromAddress ?? "Unknown sender"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    {document.relevanceLabel ?? "unknown"} ·{" "}
                    {document.messageTimestamp.toISOString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600">
                No accepted finance-related raw documents have been ingested yet.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-rose-950">Debug reset</h2>
          <p className="mt-2 text-sm leading-6 text-rose-900/80">
            Use this only when you want to wipe current Gmail ingestion evidence and
            rerun a clean backfill with the current filter rules.
          </p>
          <div className="mt-5">
            <ResetIngestionButton />
          </div>
        </div>
      </div>
    </section>
  )
}
