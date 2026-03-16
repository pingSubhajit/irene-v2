import {
  countFinancialEventsForUser,
  countOpenReviewQueueItemsForUser,
  ensureSystemCategories,
  listCategoriesForUser,
  listFinancialEventSourcesForEventIds,
  listLedgerEventsForUser,
} from "@workspace/db"

import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type LedgerPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const eventTypeOptions = [
  { value: "", label: "All event types" },
  { value: "purchase", label: "Purchase" },
  { value: "income", label: "Income" },
  { value: "subscription_charge", label: "Subscription" },
  { value: "emi_payment", label: "EMI" },
  { value: "bill_payment", label: "Bill" },
  { value: "refund", label: "Refund" },
  { value: "transfer", label: "Transfer" },
] as const

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseDateInput(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function formatAmount(amountMinor: number, currency: string) {
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

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}

  await ensureSystemCategories(session.user.id)

  const query = asSingleValue(params.query)?.trim() || undefined
  const eventType = asSingleValue(params.eventType) || undefined
  const categoryId = asSingleValue(params.categoryId) || undefined
  const reviewFilter = asSingleValue(params.review) || undefined
  const dateFrom = parseDateInput(asSingleValue(params.dateFrom))
  const dateTo = parseDateInput(asSingleValue(params.dateTo))

  const [categories, totalEvents, openReviewCount, events] = await Promise.all([
    listCategoriesForUser(session.user.id),
    countFinancialEventsForUser(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    listLedgerEventsForUser({
      userId: session.user.id,
      query,
      eventType:
        eventType && eventType !== "all"
          ? (eventType as Parameters<typeof listLedgerEventsForUser>[0]["eventType"])
          : undefined,
      categoryId: categoryId && categoryId !== "all" ? categoryId : undefined,
      needsReview:
        reviewFilter === "needs_review"
          ? true
          : reviewFilter === "clean"
            ? false
            : undefined,
      dateFrom,
      dateTo,
      limit: 100,
    }),
  ])

  const eventIds = events.map(({ event }) => event.id)
  const sources = await listFinancialEventSourcesForEventIds(eventIds)
  const sourcesByEventId = new Map<string, typeof sources>()

  for (const source of sources) {
    const existing = sourcesByEventId.get(source.source.financialEventId) ?? []
    existing.push(source)
    sourcesByEventId.set(source.source.financialEventId, existing)
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          Phase 4
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Canonical ledger</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
          This is the first owner-facing ledger built from reconciled extraction signals.
          Every row here is a canonical financial event with traceable source evidence
          back to the originating email and extracted signal.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Canonical events" value={totalEvents} />
        <MetricCard label="Open review items" value={openReviewCount} />
        <MetricCard label="Currently filtered events" value={events.length} />
      </div>

      <form className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-6">
          <label className="grid gap-2 text-sm text-zinc-700 lg:col-span-2">
            <span className="font-medium text-zinc-950">Search</span>
            <input
              type="search"
              name="query"
              defaultValue={query}
              placeholder="Merchant or description"
              className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
            />
          </label>

          <label className="grid gap-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-950">Event type</span>
            <select
              name="eventType"
              defaultValue={eventType ?? ""}
              className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
            >
              {eventTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-950">Category</span>
            <select
              name="categoryId"
              defaultValue={categoryId ?? ""}
              className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-950">Review status</span>
            <select
              name="review"
              defaultValue={reviewFilter ?? ""}
              className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
            >
              <option value="">All</option>
              <option value="needs_review">Needs review</option>
              <option value="clean">Clean</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-950">From</span>
            <input
              type="date"
              name="dateFrom"
              defaultValue={asSingleValue(params.dateFrom)}
              className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
            />
          </label>

          <label className="grid gap-2 text-sm text-zinc-700">
            <span className="font-medium text-zinc-950">To</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={asSingleValue(params.dateTo)}
              className="rounded-2xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-zinc-400"
            />
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="submit"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Apply filters
          </button>
          <a
            href="/ledger"
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Reset
          </a>
        </div>
      </form>

      <div className="grid gap-4">
        {events.length > 0 ? (
          events.map(({ event, merchant, category, paymentInstrument }) => {
            const eventSources = sourcesByEventId.get(event.id) ?? []

            return (
              <article
                key={event.id}
                className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-zinc-950">
                      {merchant?.displayName ?? event.description ?? "Unmapped event"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {event.eventType} · {event.direction} ·{" "}
                      {event.eventOccurredAt.toISOString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold tracking-tight text-zinc-950">
                      {formatAmount(event.amountMinor, event.currency)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      Confidence {Number(event.confidence).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  <InfoCell label="Category" value={category?.name ?? "Uncategorized"} />
                  <InfoCell
                    label="Payment instrument"
                    value={paymentInstrument?.displayName ?? "Unlinked"}
                  />
                  <InfoCell
                    label="Review state"
                    value={event.needsReview ? "Needs review" : "Clean"}
                  />
                  <InfoCell label="Source count" value={String(event.sourceCount)} />
                </div>

                {eventSources.length > 0 ? (
                  <div className="mt-6 rounded-2xl bg-zinc-50 p-4">
                    <h2 className="text-sm font-medium text-zinc-950">Source traceability</h2>
                    <ul className="mt-3 grid gap-3 text-sm text-zinc-700">
                      {eventSources.map(({ source, rawDocument, extractedSignal }) => (
                        <li key={source.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <p className="font-medium text-zinc-950">{source.linkReason}</p>
                          <p className="mt-1 text-zinc-600">
                            Signal: {extractedSignal?.signalType ?? "n/a"} · Raw document:{" "}
                            {rawDocument?.subject ?? rawDocument?.id ?? "n/a"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-10 text-sm text-zinc-600">
            No canonical events match the current filters yet.
          </div>
        )}
      </div>
    </section>
  )
}

function MetricCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-zinc-950">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
        {props.value}
      </p>
    </div>
  )
}

function InfoCell(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
        {props.label}
      </p>
      <p className="mt-2 text-sm text-zinc-950">{props.value}</p>
    </div>
  )
}
