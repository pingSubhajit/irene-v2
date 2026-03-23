import { RiRefreshLine } from "@remixicon/react"
import { getLatestJobRunForUser, getUserSettings, listAdviceItemsForUser } from "@workspace/db"
import {
  ADVICE_QUEUE_NAME,
  ADVICE_RANK_USER_JOB_NAME,
  ADVICE_REFRESH_USER_JOB_NAME,
  ADVICE_REBUILD_USER_JOB_NAME,
} from "@workspace/workflows"

import { AdviceList } from "@/components/advice-rail"
import { resolveAdviceContextHref } from "@/lib/advice"
import { formatInUserTimeZone } from "@/lib/date-format"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type AdvicePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(status: string | null | undefined) {
  switch (status) {
    case "dismissed":
      return "Advice dismissed."
    case "done":
      return "Advice marked done."
    case "restored":
      return "Advice restored."
    case "refresh-queued":
      return "Advice refresh queued."
    case "advice-refresh-queued":
      return "Advice refresh queued."
    case "advice-rebuild-queued":
      return "Advice rebuild queued."
    case "advice-rank-queued":
      return "Advice ranking queued."
    default:
      return null
  }
}

export default async function AdvicePage({ searchParams }: AdvicePageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [rows, settings, latestAdviceJob] = await Promise.all([
    listAdviceItemsForUser({
      userId: session.user.id,
      statuses: ["active", "dismissed", "done", "expired"],
      limit: 80,
    }),
    getUserSettings(session.user.id),
    getLatestJobRunForUser({
      userId: session.user.id,
      queueName: ADVICE_QUEUE_NAME,
      jobNames: [ADVICE_REFRESH_USER_JOB_NAME, ADVICE_REBUILD_USER_JOB_NAME, ADVICE_RANK_USER_JOB_NAME],
    }),
  ])

  const message =
    getStatusMessage(asSingleValue(params.advice)) ??
    getStatusMessage(asSingleValue(params.recovery))
  const active = rows.filter(({ adviceItem }) => adviceItem.status === "active")
  const closed = rows.filter(({ adviceItem }) => adviceItem.status !== "active")
  const latestAdviceUpdatedAt = rows[0]?.adviceItem.updatedAt ?? null
  const adviceStale = !latestAdviceUpdatedAt

  const mapItem = (row: (typeof rows)[number]) => ({
    id: row.adviceItem.id,
    title: row.adviceItem.title,
    summary: row.adviceItem.summary,
    detail: row.adviceItem.detail,
    priority: row.adviceItem.priority,
    status: row.adviceItem.status,
    contextHref: resolveAdviceContextHref({
      goalId: row.goal?.id,
      triggerType: row.adviceItem.triggerType,
    }),
    primaryAction: row.adviceItem.primaryActionJson,
    secondaryAction: row.adviceItem.secondaryActionJson,
    merchantName: row.merchant?.displayName ?? null,
    goalName: row.goal?.name ?? null,
    updatedAtIso: row.adviceItem.updatedAt.toISOString(),
    updatedAtLabel: formatInUserTimeZone(row.adviceItem.updatedAt, settings.timeZone, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  })

  return (
    <section className="grid gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="neo-kicker">Advice</p>
          <div className="mt-4 flex items-start justify-between gap-4">
            <h1 className="max-w-[14ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
              grounded
              <br />
              next steps.
            </h1>

            <form action="/api/advice" method="post" className="shrink-0">
              <input type="hidden" name="action" value="refresh" />
              <input type="hidden" name="redirectTo" value="/advice" />
              <button
                type="submit"
                aria-label="Refresh advice"
                className="inline-flex size-11 items-center justify-center rounded-full text-white/44 transition hover:bg-white/[0.04] hover:text-white"
              >
                <RiRefreshLine className="size-5" />
              </button>
            </form>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            Irene only surfaces prompts that can be tied back to forecast runs, recurring models,
            goals, or review state.
          </p>
        </div>
      </div>

      {message ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{message}</p>
        </div>
      ) : null}

      {latestAdviceJob?.status === "failed" || latestAdviceJob?.status === "dead_lettered" || adviceStale ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border border-white/[0.06] px-4 py-4">
          <div>
            <p className="text-sm text-white">
              {latestAdviceJob?.status === "failed" || latestAdviceJob?.status === "dead_lettered"
                ? "Advice needs recovery."
                : "Advice looks stale."}
            </p>
            <p className="mt-1 text-sm text-white/42">
              {latestAdviceJob?.status === "failed" || latestAdviceJob?.status === "dead_lettered"
                ? "The latest advice generation did not complete cleanly."
                : "The current advice set has not been refreshed recently."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action="/api/recovery/advice" method="post">
              <input type="hidden" name="action" value="refresh" />
              <input type="hidden" name="redirectTo" value="/advice" />
              <button className="inline-flex h-9 items-center rounded-full border border-white/[0.1] px-3 text-sm text-white/72 transition hover:bg-white/[0.04] hover:text-white">
                Retry generation
              </button>
            </form>
            <form action="/api/recovery/advice" method="post">
              <input type="hidden" name="action" value="rank" />
              <input type="hidden" name="redirectTo" value="/advice" />
              <button className="inline-flex h-9 items-center rounded-full border border-white/[0.08] px-3 text-sm text-white/48 transition hover:bg-white/[0.04] hover:text-white">
                Retry ranking
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="grid gap-10">
        <details open className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="neo-kicker">Active</p>
              <span className="text-sm text-white/24">{active.length}</span>
            </div>
            <span className="text-xs uppercase tracking-[0.18em] text-white/24 transition group-open:rotate-180">
              ˅
            </span>
          </summary>
          <div className="mt-4">
            {active.length > 0 ? (
              <AdviceList items={active.map(mapItem)} actionRedirectTo="/advice" />
            ) : (
              <p className="text-sm leading-6 text-white/42">
                No active advice right now.
              </p>
            )}
          </div>
        </details>

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="neo-kicker">Closed</p>
              <span className="text-sm text-white/24">{closed.length}</span>
            </div>
            <span className="text-xs uppercase tracking-[0.18em] text-white/24 transition group-open:rotate-180">
              ˅
            </span>
          </summary>
          <div className="mt-4">
            {closed.length > 0 ? (
              <AdviceList items={closed.map(mapItem)} actionRedirectTo="/advice" />
            ) : (
              <p className="text-sm leading-6 text-white/42">
                Nothing dismissed or completed yet.
              </p>
            )}
          </div>
        </details>
      </div>
    </section>
  )
}
