import {
  listFinancialEventSourcesForEventIds,
  listLedgerEventsForUser,
} from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"

import { TransactionCard } from "@/components/transaction-card"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type ActivityPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const primaryViews = [
  { value: "all", label: "All" },
  { value: "outflow", label: "Outflows" },
  { value: "inflow", label: "Inflows" },
  { value: "review", label: "Needs review" },
] as const

const eventTypes = [
  { value: "", label: "Everything" },
  { value: "purchase", label: "Purchases" },
  { value: "income", label: "Income" },
  { value: "subscription_charge", label: "Subscriptions" },
  { value: "emi_payment", label: "EMIs" },
  { value: "bill_payment", label: "Bills" },
  { value: "refund", label: "Refunds" },
  { value: "transfer", label: "Transfers" },
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

function formatGroupLabel(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const query = asSingleValue(params.query)?.trim() || undefined
  const view = asSingleValue(params.view) || "all"
  const eventType = asSingleValue(params.eventType) || undefined

  const events = await listLedgerEventsForUser({
    userId: session.user.id,
    query,
    eventType:
      eventType && eventType !== "all"
        ? (eventType as Parameters<typeof listLedgerEventsForUser>[0]["eventType"])
        : undefined,
    needsReview: view === "review" ? true : undefined,
    limit: 160,
  })

  const filteredEvents = events.filter(({ event }) => {
    if (view === "outflow") {
      return event.direction === "outflow"
    }

    if (view === "inflow") {
      return event.direction === "inflow"
    }

    return true
  })

  const eventIds = filteredEvents.map(({ event }) => event.id)
  const sources = await listFinancialEventSourcesForEventIds(eventIds)
  const sourcesByEventId = new Map<string, typeof sources>()

  for (const source of sources) {
    const existing = sourcesByEventId.get(source.source.financialEventId) ?? []
    existing.push(source)
    sourcesByEventId.set(source.source.financialEventId, existing)
  }

  const grouped = new Map<string, typeof filteredEvents>()
  for (const row of filteredEvents) {
    const key = row.event.eventOccurredAt.toISOString().slice(0, 10)
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }

  const orderedGroups = [...grouped.entries()].sort((left, right) => right[0].localeCompare(left[0]))

  return (
    <section className="grid gap-6">
      <div>
        <p className="neo-kicker">Activity</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[3rem] leading-[0.92] text-white md:text-[4rem]">
              your transaction
              <br />
              timeline.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
              Canonical activity, grouped by time, with traceable evidence available only when you need to go deeper.
            </p>
          </div>
          <Badge variant="cream">{filteredEvents.length} events</Badge>
        </div>
      </div>

      <form className="sticky top-[84px] z-30 grid gap-4 neo-shell border border-white/8 p-4 md:top-[92px]">
        <div className="flex gap-3">
          <Input
            type="search"
            name="query"
            defaultValue={query}
            placeholder="Search merchant or note"
            className="flex-1"
          />
          <button type="submit" className="hidden" />
        </div>

        <div className="neo-scrollbar flex gap-3 overflow-x-auto pb-1">
          {primaryViews.map((chip) => {
            const active = view === chip.value
            const nextParams = new URLSearchParams()
            if (query) nextParams.set("query", query)
            if (eventType) nextParams.set("eventType", eventType)
            if (chip.value !== "all") nextParams.set("view", chip.value)

            return (
              <a
                key={chip.value}
                href={`/activity${nextParams.size > 0 ? `?${nextParams.toString()}` : ""}`}
                className={[
                  "shrink-0 border px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] transition",
                  active
                    ? "border-[var(--neo-yellow)] bg-[var(--neo-yellow)] text-[var(--neo-black)]"
                    : "border-white/10 bg-white/5 text-white/56",
                ].join(" ")}
              >
                {chip.label}
              </a>
            )
          })}
        </div>

        <div className="neo-scrollbar flex gap-3 overflow-x-auto pb-1">
          {eventTypes.map((chip) => {
            const active = (eventType ?? "") === chip.value
            const nextParams = new URLSearchParams()
            if (query) nextParams.set("query", query)
            if (view && view !== "all") nextParams.set("view", view)
            if (chip.value) nextParams.set("eventType", chip.value)

            return (
              <a
                key={chip.label}
                href={`/activity${nextParams.size > 0 ? `?${nextParams.toString()}` : ""}`}
                className={[
                  "shrink-0 border px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] transition",
                  active
                    ? "border-white/16 bg-white/10 text-white"
                    : "border-white/8 bg-transparent text-white/46",
                ].join(" ")}
              >
                {chip.label}
              </a>
            )
          })}
        </div>
      </form>

      <div className="grid gap-6">
        {orderedGroups.length > 0 ? (
          orderedGroups.map(([dateKey, rows]) => (
            <section key={dateKey} className="grid gap-4">
              <div className="flex items-center gap-3">
                <span className="neo-kicker">Date</span>
                <h2 className="font-display text-3xl leading-none text-white">
                  {formatGroupLabel(new Date(`${dateKey}T00:00:00.000Z`))}
                </h2>
              </div>
              <div className="grid gap-4">
                {rows.map(({ event, merchant, category, paymentInstrument }) => (
                  <TransactionCard
                    key={event.id}
                    merchant={merchant?.displayName ?? event.description ?? "Unmapped event"}
                    amount={formatCurrency(event.amountMinor, event.currency)}
                    dateLabel={event.eventOccurredAt.toISOString()}
                    category={category?.name ?? "Uncategorized"}
                    direction={event.direction}
                    eventType={event.eventType}
                    needsReview={event.needsReview}
                    paymentInstrument={paymentInstrument?.displayName ?? null}
                    traces={(sourcesByEventId.get(event.id) ?? []).map(({ source, rawDocument, extractedSignal }) => ({
                      linkReason: source.linkReason,
                      signalType: extractedSignal?.signalType ?? null,
                      rawDocumentLabel: rawDocument?.subject ?? rawDocument?.id ?? "source unavailable",
                    }))}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-8 text-sm leading-6 text-white/56">
            No activity matches the current search and filter state.
          </div>
        )}
      </div>
    </section>
  )
}
