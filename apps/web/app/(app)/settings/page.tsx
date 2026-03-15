import { getEnvSanityChecks } from "@workspace/config/server"
import {
  checkDatabaseHealth,
  getLatestJobRun,
} from "@workspace/db"
import { checkAiGatewayHealth } from "@workspace/ai"
import { checkGoogleCloudStorageHealth } from "@workspace/integrations"
import { checkRedisHealth } from "@workspace/workflows"

import { GmailIntegrationActions } from "@/components/gmail-integration-actions"
import { RunSmokeTestButton } from "@/components/run-smoke-test-button"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getStatusMessage(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value

  switch (normalized) {
    case "connected":
      return "Gmail connected and backfill enqueued."
    case "account-mismatch":
      return "The Gmail account did not match the signed-in owner account."
    case "invalid-state":
      return "The Gmail OAuth state was invalid. Try connecting again."
    case "oauth-error":
      return "Google returned an OAuth error before the inbox could be connected."
    case "connect-failed":
      return "The Gmail connection callback failed."
    default:
      return null
  }
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await requireSession()
  const envChecks = getEnvSanityChecks()
  const params = (await searchParams) ?? {}
  const [database, redis, storage, aiGateway, latestJobRun, gmailState] = await Promise.all([
    checkDatabaseHealth()
      .then(() => true)
      .catch(() => false),
    checkRedisHealth()
      .then((result) => result.ok)
      .catch(() => false),
    checkGoogleCloudStorageHealth()
      .then((result) => result.ok)
      .catch(() => false),
    checkAiGatewayHealth()
      .then((result) => result.ok)
      .catch(() => false),
    getLatestJobRun("system", "system.healthcheck"),
    getGmailIntegrationState(session.user.id),
  ])
  const statusMessage = getStatusMessage(params.gmail)

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          This phase extends the owner account into real Gmail ingestion: connection
          status, storage readiness, finance-email sync activity, and worker-backed
          ingestion jobs.
        </p>
      </div>

      {statusMessage ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Signed-in owner</p>
          <p className="mt-2 text-sm text-zinc-600">{session.user.email}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Allowlist</p>
          <p className="mt-2 text-sm text-zinc-600">
            {envChecks.allowlistSize} account{envChecks.allowlistSize === 1 ? "" : "s"} configured
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Environment sanity</h2>
        <div className="mt-4 grid gap-3 text-sm text-zinc-600 md:grid-cols-3 xl:grid-cols-6">
          <div>Auth: {envChecks.auth ? "Configured" : "Missing env"}</div>
          <div>Database: {envChecks.database ? "Configured" : "Missing env"}</div>
          <div>Redis: {envChecks.redis ? "Configured" : "Missing env"}</div>
          <div>Security: {envChecks.security ? "Configured" : "Missing env"}</div>
          <div>Storage: {envChecks.storage ? "Configured" : "Missing env"}</div>
          <div>AI Gateway: {envChecks.ai ? "Configured" : "Missing env"}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">DB status</p>
          <p className="mt-2 text-sm text-zinc-600">{database ? "Ready" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Queue status</p>
          <p className="mt-2 text-sm text-zinc-600">{redis ? "Connected" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">GCS status</p>
          <p className="mt-2 text-sm text-zinc-600">{storage ? "Reachable" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">AI Gateway status</p>
          <p className="mt-2 text-sm text-zinc-600">{aiGateway ? "Reachable" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Last worker smoke test</p>
          <p className="mt-2 text-sm text-zinc-600">
            {latestJobRun ? latestJobRun.status : "No runs yet"}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Gmail integration</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm font-medium text-zinc-950">Connection</p>
            <p className="mt-2 text-sm text-zinc-600">
              {gmailState.connection ? gmailState.connection.status : "Not connected"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-950">Connected inbox</p>
            <p className="mt-2 text-sm text-zinc-600">
              {gmailState.connection?.providerAccountEmail ?? "None"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-950">Last sync</p>
            <p className="mt-2 text-sm text-zinc-600">
              {gmailState.connection?.lastSuccessfulSyncAt?.toISOString() ?? "No successful sync yet"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-950">Backfill</p>
            <p className="mt-2 text-sm text-zinc-600">
              {gmailState.cursor?.backfillCompletedAt
                ? "Completed"
                : gmailState.cursor?.backfillStartedAt
                  ? "In progress"
                  : "Not started"}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <GmailIntegrationActions connected={Boolean(gmailState.connection)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Ingestion activity</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-zinc-950">Raw documents</p>
              <p className="mt-2 text-sm text-zinc-600">{gmailState.rawDocumentCount}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-950">Recent sync jobs</p>
              <p className="mt-2 text-sm text-zinc-600">{gmailState.recentJobRuns.length}</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {gmailState.recentJobRuns.length > 0 ? (
              gmailState.recentJobRuns.map((jobRun) => (
                <div key={jobRun.id} className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-sm font-medium text-zinc-950">{jobRun.jobName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    {jobRun.queueName}
                  </p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {jobRun.status} · attempts {jobRun.attemptCount}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600">No Gmail sync jobs have run yet.</p>
            )}
          </div>
        </div>

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
                    {document.messageTimestamp.toISOString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600">
                No finance-related raw documents have been ingested yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Operational checks</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Enqueue a safe system job to confirm that the web app, Redis queue, worker,
          and `job_run` persistence are all wired correctly.
        </p>
        <div className="mt-5">
          <RunSmokeTestButton />
        </div>
      </div>
    </section>
  )
}
