import { RiRefreshLine } from "@remixicon/react"
import { getUserSettings, listAdviceItemsForUser } from "@workspace/db"

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
    default:
      return null
  }
}

export default async function AdvicePage({ searchParams }: AdvicePageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [rows, settings] = await Promise.all([
    listAdviceItemsForUser({
      userId: session.user.id,
      statuses: ["active", "dismissed", "done", "expired"],
      limit: 80,
    }),
    getUserSettings(session.user.id),
  ])

  const message = getStatusMessage(asSingleValue(params.advice))
  const active = rows.filter(({ adviceItem }) => adviceItem.status === "active")
  const closed = rows.filter(({ adviceItem }) => adviceItem.status !== "active")

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
