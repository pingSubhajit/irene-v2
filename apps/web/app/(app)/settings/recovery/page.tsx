import type { Metadata } from "next"
import Link from "next/link"
import { RiArrowLeftLine, RiRefreshLine } from "@remixicon/react"
import {
  getLatestForecastRunWithSnapshots,
  getLatestJobRunForUser,
  listAdviceItemsForUser,
  listRecoverableJobRunsForUser,
} from "@workspace/db"
import {
  ADVICE_QUEUE_NAME,
  ADVICE_RANK_USER_JOB_NAME,
  ADVICE_REFRESH_USER_JOB_NAME,
  ADVICE_REBUILD_USER_JOB_NAME,
  EMAIL_SYNC_QUEUE_NAME,
  FORECASTING_QUEUE_NAME,
  FORECAST_REFRESH_USER_JOB_NAME,
  FORECAST_REBUILD_USER_JOB_NAME,
  GMAIL_INCREMENTAL_POLL_JOB_NAME,
  MEMORY_LEARNING_QUEUE_NAME,
  FEEDBACK_PROCESS_JOB_NAME,
  MEMORY_REBUILD_USER_JOB_NAME,
} from "@workspace/workflows"
import { Button } from "@workspace/ui/components/button"

import { AppEmptyState } from "@/components/app-empty-state"
import { isAdviceEnabled, isMemoryLearningEnabled } from "@/lib/feature-flags"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Recovery",
  description: "Recovery tools in Irene.",
})

type RecoveryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(value: string | undefined) {
  switch (value) {
    case "replay-queued":
      return "Retry queued."
    case "replay-failed":
      return "That retry could not be started."
    case "forecast-refresh-queued":
      return "Forecast refresh queued."
    case "forecast-rebuild-queued":
      return "Forecast rebuild queued."
    case "advice-refresh-queued":
      return "Advice refresh queued."
    case "advice-rebuild-queued":
      return "Advice rebuild queued."
    case "advice-rank-queued":
      return "Advice ranking queued."
    case "advice-disabled":
      return "Advice is currently disabled."
    case "sync-queued":
      return "Recent mail sync queued."
    case "invalid":
    case "sync-invalid":
      return "That recovery action is no longer available."
    default:
      return null
  }
}

function formatRelativeAge(date: Date | null | undefined) {
  if (!date) {
    return "not yet"
  }

  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60_000)

  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function describeJobName(jobName: string) {
  switch (jobName) {
    case FORECAST_REFRESH_USER_JOB_NAME:
      return "forecast refresh"
    case FORECAST_REBUILD_USER_JOB_NAME:
      return "forecast rebuild"
    case ADVICE_REFRESH_USER_JOB_NAME:
      return "advice refresh"
    case ADVICE_REBUILD_USER_JOB_NAME:
      return "advice rebuild"
    case ADVICE_RANK_USER_JOB_NAME:
      return "advice ranking"
    case GMAIL_INCREMENTAL_POLL_JOB_NAME:
      return "recent mail sync"
    default:
      return jobName
  }
}

export default async function RecoveryPage({ searchParams }: RecoveryPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const message = getStatusMessage(asSingleValue(params.recovery))
  const adviceEnabled = isAdviceEnabled()
  const memoryLearningEnabled = isMemoryLearningEnabled()

  const [gmailState, latestForecast, latestForecastJob, latestAdviceJob, latestSyncJob, adviceRows, recoverableJobs] =
    await Promise.all([
      getGmailIntegrationState(session.user.id),
      getLatestForecastRunWithSnapshots(session.user.id),
      getLatestJobRunForUser({
        userId: session.user.id,
        queueName: FORECASTING_QUEUE_NAME,
        jobNames: [FORECAST_REFRESH_USER_JOB_NAME, FORECAST_REBUILD_USER_JOB_NAME],
      }),
      adviceEnabled
        ? getLatestJobRunForUser({
            userId: session.user.id,
            queueName: ADVICE_QUEUE_NAME,
            jobNames: [ADVICE_REFRESH_USER_JOB_NAME, ADVICE_REBUILD_USER_JOB_NAME, ADVICE_RANK_USER_JOB_NAME],
          })
        : Promise.resolve(null),
      getLatestJobRunForUser({
        userId: session.user.id,
        queueName: EMAIL_SYNC_QUEUE_NAME,
        jobNames: [GMAIL_INCREMENTAL_POLL_JOB_NAME],
      }),
      adviceEnabled
        ? listAdviceItemsForUser({
            userId: session.user.id,
            statuses: ["active", "dismissed", "done", "expired"],
            limit: 1,
          })
        : Promise.resolve([]),
      listRecoverableJobRunsForUser({
        userId: session.user.id,
        limit: 24,
      }),
    ])

  const visibleRecoverableJobs = adviceEnabled
    ? recoverableJobs
    : recoverableJobs.filter(
        (jobRun) =>
          !(
            jobRun.queueName === ADVICE_QUEUE_NAME &&
            [
              ADVICE_REFRESH_USER_JOB_NAME,
              ADVICE_REBUILD_USER_JOB_NAME,
              ADVICE_RANK_USER_JOB_NAME,
            ].includes(jobRun.jobName)
          ),
      )

  const filteredRecoverableJobs = memoryLearningEnabled
    ? visibleRecoverableJobs
    : visibleRecoverableJobs.filter(
        (jobRun) =>
          !(
            jobRun.queueName === MEMORY_LEARNING_QUEUE_NAME &&
            [FEEDBACK_PROCESS_JOB_NAME, MEMORY_REBUILD_USER_JOB_NAME].includes(jobRun.jobName)
          ),
      )

  const latestAdviceUpdatedAt = adviceRows[0]?.adviceItem.updatedAt ?? null
  const forecastStale = !latestForecast?.run.completedAt
  const adviceStale = !latestAdviceUpdatedAt
  const gmailConnected = Boolean(
    gmailState.connection && gmailState.connection.status !== "revoked"
  )

  return (
    <section className="mx-auto max-w-lg">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 py-6 text-white/50 transition hover:text-white"
      >
        <RiArrowLeftLine className="size-5" />
        Back to settings
      </Link>

      <h1 className="text-[1.65rem] font-semibold tracking-tight text-white">recovery</h1>
      <p className="mt-2 max-w-[30ch] text-sm leading-relaxed text-white/36">
        Retry stuck processing, rebuild stale state, and recover user-facing flows without touching raw evidence.
      </p>

      {message ? (
        <div className="mt-8 border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{message}</p>
        </div>
      ) : null}

      <SectionHeader>Current state</SectionHeader>
      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        <RecoveryActionRow
          label="forecast"
          value={
            latestForecastJob?.status === "failed" || latestForecastJob?.status === "dead_lettered"
              ? latestForecastJob.status.replace("_", " ")
              : forecastStale
                ? "stale"
                : "healthy"
          }
          description={
            latestForecast?.run.completedAt
              ? `Last completed ${formatRelativeAge(latestForecast.run.completedAt)}`
              : "No successful forecast yet"
          }
          action={
            <form action="/api/recovery/forecast" method="post">
              <input type="hidden" name="redirectTo" value="/settings/recovery" />
              <input
                type="hidden"
                name="action"
                value={
                  latestForecastJob?.status === "dead_lettered" || !latestForecast
                    ? "rebuild"
                    : "refresh"
                }
              />
              <Button type="submit" variant="outline" size="xs">
                <RiRefreshLine className="size-3.5" />
                {latestForecastJob?.status === "dead_lettered" || !latestForecast ? "Rebuild" : "Refresh"}
              </Button>
            </form>
          }
        />
        {adviceEnabled ? (
          <RecoveryActionRow
            label="advice"
            value={
              latestAdviceJob?.status === "failed" || latestAdviceJob?.status === "dead_lettered"
                ? latestAdviceJob.status.replace("_", " ")
                : adviceStale
                  ? "stale"
                  : "healthy"
            }
            description={
              latestAdviceUpdatedAt
                ? `Last updated ${formatRelativeAge(latestAdviceUpdatedAt)}`
                : "No advice generated yet"
            }
            action={
              <div className="flex items-center gap-2">
                <form action="/api/recovery/advice" method="post">
                  <input type="hidden" name="redirectTo" value="/settings/recovery" />
                  <input type="hidden" name="action" value="refresh" />
                  <Button type="submit" variant="outline" size="xs">
                    Refresh
                  </Button>
                </form>
                <form action="/api/recovery/advice" method="post">
                  <input type="hidden" name="redirectTo" value="/settings/recovery" />
                  <input type="hidden" name="action" value="rank" />
                  <Button type="submit" variant="ghost" size="xs">
                    Rank
                  </Button>
                </form>
              </div>
            }
          />
        ) : null}
        <RecoveryActionRow
          label="recent mail sync"
          value={
            !gmailConnected
              ? "reconnect required"
              : latestSyncJob?.status === "failed" || latestSyncJob?.status === "dead_lettered"
              ? latestSyncJob.status.replace("_", " ")
              : gmailState.connection?.lastSuccessfulSyncAt
                ? "healthy"
                : "waiting"
          }
          description={
            gmailState.connection?.lastFailedSyncAt
              ? `Last failed ${formatRelativeAge(gmailState.connection.lastFailedSyncAt)}`
              : gmailState.connection?.lastSuccessfulSyncAt
                ? `Last successful ${formatRelativeAge(gmailState.connection.lastSuccessfulSyncAt)}`
                : "No sync has completed yet"
          }
          action={
            gmailConnected ? (
              <form action="/api/recovery/sync" method="post">
                <input type="hidden" name="redirectTo" value="/settings/recovery" />
                <Button type="submit" variant="outline" size="xs">
                  <RiRefreshLine className="size-3.5" />
                  Retry sync
                </Button>
              </form>
            ) : null
          }
        />
      </div>

      <SectionHeader>Recent failures</SectionHeader>
      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {filteredRecoverableJobs.length > 0 ? (
          filteredRecoverableJobs.map((jobRun) => (
            <RecoveryActionRow
              key={jobRun.id}
              label={describeJobName(jobRun.jobName)}
              value={jobRun.status.replace("_", " ")}
              description={
                jobRun.lastErrorAt
                  ? `${formatRelativeAge(jobRun.lastErrorAt)} · attempt ${jobRun.attemptCount}/${jobRun.maxAttempts}`
                  : `attempt ${jobRun.attemptCount}/${jobRun.maxAttempts}`
              }
              action={
                <form action="/api/recovery/job" method="post">
                  <input type="hidden" name="jobRunId" value={jobRun.id} />
                  <input type="hidden" name="redirectTo" value="/settings/recovery" />
                  <Button type="submit" variant="outline" size="xs">
                    Retry
                  </Button>
                </form>
              }
            />
          ))
        ) : (
          <div className="py-4">
            <AppEmptyState
              compact
              title="Nothing needs recovery"
              description="Everything looks healthy right now."
            />
          </div>
        )}
      </div>
    </section>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-10 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/28">
      {children}
    </p>
  )
}

function RecoveryActionRow({
  label,
  value,
  description,
  action,
}: {
  label: string
  value: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-white">{label}</span>
          <span className="text-[15px] text-white/36">{value}</span>
        </div>
        {description ? (
          <p className="mt-1 text-sm text-white/28">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
