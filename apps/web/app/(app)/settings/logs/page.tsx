import type { Metadata } from "next"
import Link from "next/link"
import {
  RiArrowLeftLine,
  RiArrowRightUpLine,
  RiEqualizerLine,
} from "@remixicon/react"
import {
  type DiagnosticFilter,
  getUserSettings,
  listDiagnosticTimelineForUser,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

import { formatInUserTimeZone } from "@/lib/date-format"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Logs",
  description: "Diagnostic logs in Irene.",
})

const outlineButtonClassName =
  "neo-btn-3d neo-btn-3d-dark inline-flex h-12 shrink-0 items-center justify-center gap-2 border border-white/12 bg-[rgba(24,24,26,0.92)] px-5 text-sm font-semibold text-[var(--neo-cream)] transition-all hover:bg-[rgba(32,32,36,0.98)]"
const ghostButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 border border-transparent bg-transparent px-4 text-sm font-semibold text-white/72 transition hover:border-white/10 hover:bg-white/6 hover:text-white"

type LogsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const FILTERS: Array<{
  value: DiagnosticFilter
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "sync", label: "Sync" },
  { value: "extraction", label: "Extraction" },
  { value: "reconciliation", label: "Reconciliation" },
  { value: "failures", label: "Failures" },
]

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDateTime(value: Date, timeZone: string) {
  return formatInUserTimeZone(value, timeZone, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function getStatusBadge(status: string) {
  if (status === "succeeded" || status === "accepted" || status === "linked") {
    return "success"
  }

  if (status === "failed") {
    return "danger"
  }

  return "default"
}

export default async function SettingsLogsPage({ searchParams }: LogsPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const requestedFilter = asSingleValue(params.filter)
  const filter = FILTERS.some((entry) => entry.value === requestedFilter)
    ? (requestedFilter as DiagnosticFilter)
    : "all"
  const [settings, timeline] = await Promise.all([
    getUserSettings(session.user.id),
    listDiagnosticTimelineForUser({
      userId: session.user.id,
      filter,
      limit: 80,
    }),
  ])

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="neo-kicker">Diagnostics</p>
          <h1 className="mt-4 max-w-[12ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
            unified debug
            <br />
            timeline.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            End-to-end visibility across sync, extraction, and reconciliation, with
            deep links back into full event traces where Irene has already linked an
            email to ledger truth.
          </p>
        </div>

        <Link
          href="/settings"
          className={outlineButtonClassName}
        >
          <RiArrowLeftLine className="size-4" />
          Back to settings
        </Link>
      </div>

      <div className="neo-shell grid gap-4 border border-white/8 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center border border-white/10 bg-white/4 text-white/70">
            <RiEqualizerLine className="size-4" />
          </span>
          <div>
            <p className="neo-kicker">Filter</p>
            <p className="text-sm text-white/56">
              Narrow the timeline to one stage or only broken runs.
            </p>
          </div>
        </div>
        <div className="neo-scrollbar flex gap-3 overflow-x-auto pb-1">
          {FILTERS.map((entry) => (
            <Link
              key={entry.value}
              href={entry.value === "all" ? "/settings/logs" : `/settings/logs?filter=${entry.value}`}
              className={cn(
                "shrink-0 border px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] transition",
                filter === entry.value
                  ? "border-[var(--neo-yellow)] bg-[var(--neo-yellow)] text-[var(--neo-black)]"
                  : "border-white/10 bg-white/5 text-white/56",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </div>
      </div>

      <ScrollArea className="max-h-[72vh] pr-1">
        <div className="grid gap-4">
          {timeline.length > 0 ? (
            timeline.map((entry) => (
              <Card key={entry.id} className="border-white/8 bg-[rgba(16,16,18,0.96)]">
                <CardHeader className="gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={getStatusBadge(entry.status)}>
                          {entry.status}
                        </Badge>
                        <Badge variant="default">{entry.stage}</Badge>
                      </div>
                      <CardTitle className="mt-4 text-xl text-white">
                        {entry.title}
                      </CardTitle>
                      <p className="mt-2 text-sm leading-6 text-white/56">
                        {entry.description}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="neo-kicker">Recorded</p>
                      <p className="mt-2 text-sm text-white/68">
                        {formatDateTime(entry.occurredAt, settings.timeZone)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex flex-wrap gap-2">
                    {entry.meta.map((item) => (
                      <span
                        key={item}
                        className="border border-white/8 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/48"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  {entry.traceEventId ? (
                    <div className="flex justify-end">
                      <Link
                        href={`/activity/${entry.traceEventId}/trace`}
                        className={ghostButtonClassName}
                      >
                        Open trace
                        <RiArrowRightUpLine className="size-4" />
                      </Link>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="p-6">
              <p className="text-sm leading-6 text-white/56">
                No timeline entries match this filter yet.
              </p>
            </Card>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
