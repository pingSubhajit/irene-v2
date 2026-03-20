import {
  getUserSettings,
  listIncomeStreamsForUser,
  listFinancialEventSourcesForEventIds,
  listLedgerEventsForUser,
  listRecurringObligationsForUser,
} from "@workspace/db"
import { Input } from "@workspace/ui/components/input"

import { RecurringModelCard } from "@/components/recurring-model-card"
import { TransactionCard } from "@/components/transaction-card"
import {
  formatInUserTimeZone,
  getUserTimeZoneMonthKey,
} from "@/lib/date-format"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type ActivityPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const primaryViews = [
  { value: "all", label: "All" },
  { value: "outflow", label: "Outflows" },
  { value: "inflow", label: "Inflows" },
  { value: "review", label: "Review" },
  { value: "subscriptions", label: "Subs" },
  { value: "emis", label: "EMIs" },
  { value: "income", label: "Income" },
] as const

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatCurrency(amountMinor: number, currency = "INR") {
  const amount = amountMinor / 100

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatMonthGroup(dateKey: string) {
  const date = new Date(`${dateKey}-01T00:00:00.000Z`)
  const month = date
    .toLocaleDateString("en-IN", { month: "short" })
    .toUpperCase()
  const year = date.getFullYear().toString().slice(-2)
  return `${month} '${year}`
}

function formatScheduleDate(date: Date | null, timeZone: string) {
  if (!date) return "still estimating"

  return formatInUserTimeZone(date, timeZone, {
    day: "numeric",
    month: "short",
  })
}

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const query = asSingleValue(params.query)?.trim() || undefined
  const view = asSingleValue(params.view) || "all"

  const [settings, events, subscriptions, emis, incomeStreams] = await Promise.all([
    getUserSettings(session.user.id),
    listLedgerEventsForUser({
      userId: session.user.id,
      query,
      needsReview: view === "review" ? true : undefined,
      limit: 160,
    }),
    listRecurringObligationsForUser({
      userId: session.user.id,
      obligationType: "subscription",
      limit: 40,
    }),
    listRecurringObligationsForUser({
      userId: session.user.id,
      obligationType: "emi",
      limit: 40,
    }),
    listIncomeStreamsForUser({
      userId: session.user.id,
      limit: 40,
    }),
  ])

  const isRecurringView =
    view === "subscriptions" || view === "emis" || view === "income"

  const recurringRows =
    view === "subscriptions"
      ? subscriptions
      : view === "emis"
        ? emis
        : []
  const filteredRecurringRows = recurringRows.filter(
    ({ obligation, merchant }) => {
      if (!query) return true

      const haystack = [
        obligation.name,
        merchant?.displayName,
        obligation.obligationType,
        obligation.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query.toLowerCase())
    },
  )

  const filteredIncomeStreams = incomeStreams.filter(
    ({ incomeStream, merchant }) => {
      if (!query) return true

      const haystack = [
        incomeStream.name,
        merchant?.displayName,
        incomeStream.incomeType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query.toLowerCase())
    },
  )

  const eventsInputView = isRecurringView ? "all" : view
  const filteredEvents = events.filter(({ event }) => {
    if (eventsInputView === "outflow") return event.direction === "outflow"
    if (eventsInputView === "inflow") return event.direction === "inflow"
    return true
  })

  const eventIds = filteredEvents.map(({ event }) => event.id)
  const sources = await listFinancialEventSourcesForEventIds(eventIds)
  const sourcesByEventId = new Map<string, typeof sources>()

  for (const source of sources) {
    const existing =
      sourcesByEventId.get(source.source.financialEventId) ?? []
    existing.push(source)
    sourcesByEventId.set(source.source.financialEventId, existing)
  }

  const grouped = new Map<string, typeof filteredEvents>()
  for (const row of filteredEvents) {
    const key = getUserTimeZoneMonthKey(
      row.event.eventOccurredAt,
      settings.timeZone,
    )
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }

  const orderedGroups = [...grouped.entries()].sort((left, right) =>
    right[0].localeCompare(left[0]),
  )

  const resultCount = isRecurringView
    ? view === "income"
      ? filteredIncomeStreams.length
      : filteredRecurringRows.length
    : filteredEvents.length

  return (
    <section className="mx-auto max-w-lg">
      {/* Header */}
      <h1 className="py-6 text-[1.65rem] font-semibold tracking-tight text-white">
        activity
      </h1>

      {/* Filters */}
      <form className="sticky top-[76px] z-30 -mx-4 border-b border-white/[0.06] bg-[var(--neo-black)] px-4 pb-4 md:-mx-6 md:top-[84px] md:px-6">
        <Input
          type="search"
          name="query"
          defaultValue={query}
          placeholder="search merchant or note"
          className="mb-3 h-10 border-white/[0.06] bg-white/[0.03] text-sm placeholder:text-white/24"
        />

        <div className="neo-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {primaryViews.map((chip) => {
            const active = view === chip.value
            const nextParams = new URLSearchParams()
            if (query) nextParams.set("query", query)
            if (chip.value !== "all") nextParams.set("view", chip.value)

            return (
              <a
                key={chip.value}
                href={`/activity${nextParams.size > 0 ? `?${nextParams.toString()}` : ""}`}
                className={[
                  "shrink-0 border px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] transition",
                  active
                    ? "border-[var(--neo-yellow)] bg-[var(--neo-yellow)] text-[var(--neo-black)]"
                    : "border-white/10 bg-transparent text-white/40 hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {chip.label}
              </a>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-white/24">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </p>
      </form>

      {/* Content */}
      <div className="mt-2">
        {view === "income" ? (
          filteredIncomeStreams.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {filteredIncomeStreams.map(({ incomeStream, merchant }) => (
                <RecurringModelCard
                  key={incomeStream.id}
                  eyebrow={incomeStream.incomeType.replace("_", " ")}
                  title={merchant?.displayName ?? incomeStream.name}
                  subtitle=""
                  amount={formatCurrency(
                    incomeStream.expectedAmountMinor ?? 0,
                    incomeStream.currency ?? "INR",
                  )}
                  cadence={
                    incomeStream.expectedDayOfMonth
                      ? `monthly · day ${incomeStream.expectedDayOfMonth}`
                      : "pattern building"
                  }
                  scheduleLabel={
                    incomeStream.nextExpectedAt
                      ? `next ${formatScheduleDate(incomeStream.nextExpectedAt, settings.timeZone)}`
                      : "still estimating"
                  }
                  confidenceLabel={`${Math.round(Number(incomeStream.confidence) * 100)}%`}
                  status={incomeStream.status}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="no income streams match the current filters." />
          )
        ) : view === "subscriptions" || view === "emis" ? (
          filteredRecurringRows.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {filteredRecurringRows.map(({ obligation, merchant }) => (
                <RecurringModelCard
                  key={obligation.id}
                  eyebrow={obligation.obligationType.replace("_", " ")}
                  title={merchant?.displayName ?? obligation.name}
                  subtitle=""
                  amount={formatCurrency(
                    obligation.amountMinor ?? 0,
                    obligation.currency ?? "INR",
                  )}
                  cadence={obligation.cadence}
                  scheduleLabel={
                    obligation.nextDueAt
                      ? `next ${formatScheduleDate(obligation.nextDueAt, settings.timeZone)}`
                      : "still estimating"
                  }
                  confidenceLabel={`${Math.round(Number(obligation.detectionConfidence) * 100)}%`}
                  status={obligation.status}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="no recurring models match the current filters." />
          )
        ) : orderedGroups.length > 0 ? (
          orderedGroups.map(([monthKey, rows]) => (
            <section key={monthKey}>
              <p className="mb-1 mt-8 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/28 first:mt-4">
                {formatMonthGroup(monthKey)}
              </p>
              <div className="divide-y divide-white/[0.06]">
                {rows.map(
                  ({
                    event,
                    merchant,
                    category,
                    paymentInstrument,
                    paymentProcessor,
                  }) => (
                    <TransactionCard
                      key={event.id}
                      eventId={event.id}
                      merchant={
                        merchant?.displayName ??
                        event.description ??
                        "Unmapped event"
                      }
                      amount={formatCurrency(
                        event.amountMinor,
                        event.currency,
                      )}
                      dateLabel={event.eventOccurredAt.toISOString()}
                      category={category?.name ?? "Uncategorized"}
                      direction={event.direction}
                      eventType={event.eventType}
                      needsReview={event.needsReview}
                      processor={paymentProcessor?.displayName ?? null}
                      paymentInstrument={
                        paymentInstrument?.displayName ?? null
                      }
                      traceCount={
                        (sourcesByEventId.get(event.id) ?? []).length
                      }
                      timeZone={settings.timeZone}
                    />
                  ),
                )}
              </div>
            </section>
          ))
        ) : (
          <EmptyState message="no activity matches the current filters." />
        )}
      </div>
    </section>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-white/32">{message}</p>
    </div>
  )
}
