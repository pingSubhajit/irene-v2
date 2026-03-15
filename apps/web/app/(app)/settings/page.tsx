import { getEnvSanityChecks } from "@workspace/config/server"
import { checkDatabaseHealth, getLatestJobRun } from "@workspace/db"
import { checkRedisHealth } from "@workspace/workflows"

import { RunSmokeTestButton } from "@/components/run-smoke-test-button"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const session = await requireSession()
  const envChecks = getEnvSanityChecks()
  const [database, redis, latestJobRun] = await Promise.all([
    checkDatabaseHealth()
      .then(() => true)
      .catch(() => false),
    checkRedisHealth()
      .then((result) => result.ok)
      .catch(() => false),
    getLatestJobRun("system", "system.healthcheck"),
  ])

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          This phase focuses on the owner account, runtime sanity, and worker smoke
          tests. Sensitive values stay server-side; only readiness and configuration
          status are exposed here.
        </p>
      </div>

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
        <div className="mt-4 grid gap-3 text-sm text-zinc-600 md:grid-cols-3">
          <div>Auth: {envChecks.auth ? "Configured" : "Missing env"}</div>
          <div>Database: {envChecks.database ? "Configured" : "Missing env"}</div>
          <div>Redis: {envChecks.redis ? "Configured" : "Missing env"}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">DB status</p>
          <p className="mt-2 text-sm text-zinc-600">{database ? "Ready" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Queue status</p>
          <p className="mt-2 text-sm text-zinc-600">{redis ? "Connected" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Last worker smoke test</p>
          <p className="mt-2 text-sm text-zinc-600">
            {latestJobRun ? latestJobRun.status : "No runs yet"}
          </p>
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
