import type { Metadata } from "next"
import {
  getUserSettings,
  listActivityMerchantsForUser,
  listActivityPaymentInstrumentsForUser,
  listActivityPaymentProcessorsForUser,
  listCategoriesForUser,
  listIncomeStreamsForUser,
  listFinancialEventSourcesForEventIds,
  listLedgerEventsForUser,
  listRecurringObligationsForUser,
} from "@workspace/db"

import { ActivityToolbar } from "@/components/activity-toolbar"
import { AppEmptyState } from "@/components/app-empty-state"
import { RecurringModelCard } from "@/components/recurring-model-card"
import { TransactionCard } from "@/components/transaction-card"
import {
  formatInUserTimeZone,
  getDateRangeForPreset,
  getUserTimeZoneMonthKey,
  getUtcEndOfUserDay,
  getUtcStartOfUserDay,
} from "@/lib/date-format"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"
import type { FinancialEventType } from "@workspace/db"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Activity",
  description: "Activity in Irene.",
})

type ActivityPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function asArrayValue(value: string | string[] | undefined) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function resolveSort(value: string | undefined) {
  switch (value) {
    case "oldest":
    case "amount_desc":
    case "amount_asc":
      return value
    default:
      return "recent"
  }
}

function resolveDatePreset(value: string | undefined) {
  switch (value) {
    case "today":
    case "last_7_days":
    case "this_month":
    case "last_month":
      return value
    default:
      return undefined
  }
}

function resolveEventTypes(values: string[]): FinancialEventType[] {
  return values.filter((value): value is FinancialEventType =>
    [
      "purchase",
      "income",
      "subscription_charge",
      "emi_payment",
      "bill_payment",
      "refund",
      "transfer",
    ].includes(value)
  )
}

function parseAmountValue(value: string | undefined) {
  if (!value) return undefined

  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

function convertMajorAmountToMinor(value: number | undefined) {
  if (typeof value !== "number") {
    return undefined
  }

  return Math.round(value * 100)
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)]
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
  const sort = resolveSort(asSingleValue(params.sort))
  const selectedCategorySlugs = dedupe(
    asArrayValue(params.category).filter((value) => value && value !== "all")
  )
  const selectedMerchantIds = dedupe(
    asArrayValue(params.merchant).filter(Boolean)
  )
  const selectedInstrumentIds = dedupe(
    asArrayValue(params.instrument).filter(Boolean)
  )
  const selectedProcessorIds = dedupe(
    asArrayValue(params.processor).filter(Boolean)
  )
  const selectedTypes = dedupe(resolveEventTypes(asArrayValue(params.type)))
  const datePreset = resolveDatePreset(asSingleValue(params.datePreset))
  const customDateFrom = asSingleValue(params.dateFrom)
  const customDateTo = asSingleValue(params.dateTo)
  const crossCurrency = asSingleValue(params.crossCurrency) === "true"
  const amountMinMajor = parseAmountValue(asSingleValue(params.amountMin))
  const amountMaxMajor = parseAmountValue(asSingleValue(params.amountMax))

  const [settings, categories] = await Promise.all([
    getUserSettings(session.user.id),
    listCategoriesForUser(session.user.id),
  ])

  const selectedCategoryIds = categories
    .filter((entry) => selectedCategorySlugs.includes(entry.slug))
    .map((entry) => entry.id)

  const presetRange = datePreset
    ? getDateRangeForPreset(datePreset, settings.timeZone)
    : { dateFrom: null, dateTo: null }
  const dateFrom =
    presetRange.dateFrom ??
    (customDateFrom
      ? getUtcStartOfUserDay(customDateFrom, settings.timeZone)
      : null)
  const dateTo =
    presetRange.dateTo ??
    (customDateTo ? getUtcEndOfUserDay(customDateTo, settings.timeZone) : null)

  const isRecurringView =
    view === "subscriptions" || view === "emis" || view === "income"

  const [
    events,
    merchants,
    paymentProcessors,
    paymentInstruments,
    subscriptions,
    emis,
    incomeStreams,
  ] = await Promise.all([
    isRecurringView
      ? Promise.resolve([])
      : listLedgerEventsForUser({
          userId: session.user.id,
          statuses: view === "ignored" ? ["ignored"] : undefined,
          query,
          direction: view === "outflow" || view === "inflow" ? view : undefined,
          needsReview: view === "review" ? true : undefined,
          categoryIds: selectedCategoryIds,
          merchantIds: selectedMerchantIds,
          paymentInstrumentIds: selectedInstrumentIds,
          paymentProcessorIds: selectedProcessorIds,
          eventTypes: selectedTypes,
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          reportingCurrency: settings.reportingCurrency,
          crossCurrency,
          amountMinMinor: convertMajorAmountToMinor(amountMinMajor),
          amountMaxMinor: convertMajorAmountToMinor(amountMaxMajor),
          limit: 160,
        }),
    listActivityMerchantsForUser({
      userId: session.user.id,
      limit: 200,
    }),
    isRecurringView
      ? Promise.resolve([])
      : listActivityPaymentProcessorsForUser({
          userId: session.user.id,
          limit: 200,
        }),
    isRecurringView
      ? Promise.resolve([])
      : listActivityPaymentInstrumentsForUser({
          userId: session.user.id,
          limit: 200,
        }),
    listRecurringObligationsForUser({
      userId: session.user.id,
      obligationType: "subscription",
      merchantIds: selectedMerchantIds,
      limit: 40,
    }),
    listRecurringObligationsForUser({
      userId: session.user.id,
      obligationType: "emi",
      merchantIds: selectedMerchantIds,
      limit: 40,
    }),
    listIncomeStreamsForUser({
      userId: session.user.id,
      merchantIds: selectedMerchantIds,
      limit: 40,
    }),
  ])

  const recurringRows =
    view === "subscriptions" ? subscriptions : view === "emis" ? emis : []
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
    }
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
    }
  )

  const sortedEvents = [...events].sort((left, right) => {
    if (sort === "oldest") {
      return (
        left.event.eventOccurredAt.getTime() -
        right.event.eventOccurredAt.getTime()
      )
    }

    if (sort === "amount_desc") {
      return right.event.amountMinor - left.event.amountMinor
    }

    if (sort === "amount_asc") {
      return left.event.amountMinor - right.event.amountMinor
    }

    return (
      right.event.eventOccurredAt.getTime() -
      left.event.eventOccurredAt.getTime()
    )
  })

  const eventIds = sortedEvents.map(({ event }) => event.id)
  const sources = await listFinancialEventSourcesForEventIds(eventIds)
  const sourcesByEventId = new Map<string, typeof sources>()

  for (const source of sources) {
    const existing = sourcesByEventId.get(source.source.financialEventId) ?? []
    existing.push(source)
    sourcesByEventId.set(source.source.financialEventId, existing)
  }

  const grouped = new Map<string, typeof sortedEvents>()
  for (const row of sortedEvents) {
    const key = getUserTimeZoneMonthKey(
      row.event.eventOccurredAt,
      settings.timeZone
    )
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }

  const orderedGroups = [...grouped.entries()].sort((left, right) =>
    right[0].localeCompare(left[0])
  )

  return (
    <section className="mx-auto max-w-lg">
      {/* Header */}
      <h1 className="py-6 text-[1.65rem] font-semibold tracking-tight text-white">
        activity
      </h1>

      <ActivityToolbar
        query={query}
        view={view}
        sort={sort}
        reportingCurrency={settings.reportingCurrency}
        datePreset={datePreset}
        dateFrom={customDateFrom}
        dateTo={customDateTo}
        categories={categories.map((entry) => ({
          slug: entry.slug,
          name: entry.name,
        }))}
        selectedCategories={selectedCategorySlugs}
        merchants={merchants.map((entry) => ({
          id: entry.id,
          name: entry.displayName,
          logoUrl: entry.logoUrl ?? null,
        }))}
        selectedMerchants={selectedMerchantIds}
        paymentInstruments={paymentInstruments.map((entry) => ({
          id: entry.id,
          name: entry.displayName,
        }))}
        selectedInstruments={selectedInstrumentIds}
        paymentProcessors={paymentProcessors.map((entry) => ({
          id: entry.id,
          name: entry.displayName,
        }))}
        selectedProcessors={selectedProcessorIds}
        selectedTypes={selectedTypes}
        amountMin={amountMinMajor}
        amountMax={amountMaxMajor}
        crossCurrency={crossCurrency}
      />

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
                    incomeStream.currency ?? "INR"
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
                  href={`/activity/recurring/income/${incomeStream.id}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No income streams match"
              description="Try widening the filters."
            />
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
                    obligation.currency ?? "INR"
                  )}
                  cadence={obligation.cadence}
                  scheduleLabel={
                    obligation.nextDueAt
                      ? `next ${formatScheduleDate(obligation.nextDueAt, settings.timeZone)}`
                      : "still estimating"
                  }
                  confidenceLabel={`${Math.round(Number(obligation.detectionConfidence) * 100)}%`}
                  status={obligation.status}
                  href={`/activity/recurring/obligation/${obligation.id}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recurring models match"
              description="Nothing matches these filters."
            />
          )
        ) : orderedGroups.length > 0 ? (
          orderedGroups.map(([monthKey, rows]) => (
            <section key={monthKey}>
              <p className="mt-8 mb-1 text-[0.68rem] font-semibold tracking-[0.22em] text-white/28 uppercase first:mt-4">
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
                      merchantLogoUrl={merchant?.logoUrl ?? null}
                      merchantId={merchant?.id ?? event.merchantId}
                      amount={formatCurrency(event.amountMinor, event.currency)}
                      dateLabel={event.eventOccurredAt.toISOString()}
                      categoryName={category?.name ?? "Uncategorized"}
                      categoryId={category?.id ?? event.categoryId}
                      categoryIconName={category?.iconName ?? null}
                      categoryColorToken={category?.colorToken ?? null}
                      direction={event.direction}
                      eventType={event.eventType}
                      needsReview={event.needsReview}
                      processor={paymentProcessor?.displayName ?? null}
                      paymentInstrument={paymentInstrument?.displayName ?? null}
                      traceCount={(sourcesByEventId.get(event.id) ?? []).length}
                      timeZone={settings.timeZone}
                    />
                  )
                )}
              </div>
            </section>
          ))
        ) : (
          <EmptyState
            title="No activity matches"
            description="Nothing matches these filters."
          />
        )}
      </div>
    </section>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <AppEmptyState compact title={title} description={description} />
  )
}
