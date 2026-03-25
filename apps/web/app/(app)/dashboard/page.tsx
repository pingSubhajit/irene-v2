import type { Metadata } from "next"
import {
  countOpenReviewQueueItemsForUser,
  countRecurringObligationsByType,
  getLatestJobRunForUser,
  getUserSettings,
  listDashboardLedgerEventsForUser,
  listFinancialEventSourcesForEventIds,
  listHomeRankedAdviceItemsForUser,
  listLedgerEventsForUser,
} from "@workspace/db"
import {
  FORECASTING_QUEUE_NAME,
  FORECAST_REFRESH_USER_JOB_NAME,
  FORECAST_REBUILD_USER_JOB_NAME,
} from "@workspace/workflows"

import { ActionTile } from "@/components/action-tile"
import { AdviceHomeCarousel } from "@/components/advice-rail"
import { AppEmptyState } from "@/components/app-empty-state"
import { DashboardTimeframeSelect } from "@/components/dashboard-timeframe-select"
import { HeroBalanceCard } from "@/components/hero-balance-card"
import { HomeCategoryStrip } from "@/components/home-category-strip"
import { SnapshotStatStrip } from "@/components/snapshot-stat-strip"
import { TransactionCard } from "@/components/transaction-card"
import { summarizeCategoryActivity } from "@/lib/category-summary"
import {
  formatInUserTimeZone,
  getUserTimeZoneDateParts,
  getUtcEndOfUserDay,
  getUtcStartOfUserDay,
} from "@/lib/date-format"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { createPrivateMetadata } from "@/lib/metadata"
import { resolveAdviceContextHref } from "@/lib/advice"
import { requireSession } from "@/lib/session"
import Link from "next/link"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Dashboard",
  description: "Your Irene money overview.",
})

type DashboardTimeframe = "week" | "month" | "year"
type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}
type DashboardLedgerEvent = Awaited<
  ReturnType<typeof listDashboardLedgerEventsForUser>
>[number]

function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function resolveTimeframe(value: string | undefined): DashboardTimeframe {
  switch (value) {
    case "week":
    case "year":
      return value
    default:
      return "month"
  }
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

function requireDate(value: Date | null, label: string) {
  if (!value) {
    throw new Error(`Missing dashboard date for ${label}`)
  }

  return value
}

function shiftLocalDate(localDate: string, offsetDays: number) {
  const [year = 0, month = 1, day = 1] = localDate.split("-").map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + offsetDays)

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate()
  ).padStart(2, "0")}`
}

function buildSnapshotRange(
  timeframe: DashboardTimeframe,
  timeZone: string,
  now = new Date()
) {
  const todayParts = getUserTimeZoneDateParts(now, timeZone)
  const localDateTo = `${todayParts.year}-${todayParts.month}-${todayParts.day}`
  const dateTo = requireDate(
    getUtcEndOfUserDay(localDateTo, timeZone),
    "snapshot dateTo"
  )

  if (timeframe === "year") {
    const localDateFrom = `${todayParts.year}-01-01`

    return {
      label: "This year",
      pageHeading: "this year.",
      localDateFrom,
      localDateTo,
      dateFrom: requireDate(
        getUtcStartOfUserDay(localDateFrom, timeZone),
        "snapshot year dateFrom"
      ),
      dateTo,
    }
  }

  if (timeframe === "week") {
    const weekday = new Date(
      Date.UTC(
        Number(todayParts.year),
        Number(todayParts.month) - 1,
        Number(todayParts.day)
      )
    ).getUTCDay()
    const daysSinceMonday = (weekday + 6) % 7
    const localDateFrom = shiftLocalDate(localDateTo, -daysSinceMonday)

    return {
      label: "This week",
      pageHeading: "this week.",
      localDateFrom,
      localDateTo,
      dateFrom: requireDate(
        getUtcStartOfUserDay(localDateFrom, timeZone),
        "snapshot week dateFrom"
      ),
      dateTo,
    }
  }

  const localDateFrom = `${todayParts.year}-${todayParts.month}-01`

  return {
    label: "This month",
    pageHeading: "this month.",
    localDateFrom,
    localDateTo,
    dateFrom: requireDate(
      getUtcStartOfUserDay(localDateFrom, timeZone),
      "snapshot month dateFrom"
    ),
    dateTo,
  }
}

function buildRangeCaption(input: {
  label: string
  dateFrom: Date
  dateTo: Date
  timeZone: string
}) {
  const fromLabel = formatInUserTimeZone(input.dateFrom, input.timeZone, {
    month: "short",
    day: "numeric",
  })
  const toLabel = formatInUserTimeZone(input.dateTo, input.timeZone, {
    month: "short",
    day: "numeric",
  })

  return `${input.label} · ${fromLabel} to ${toLabel}`
}

function buildSpendSeries(input: {
  timeframe: DashboardTimeframe
  rows: DashboardLedgerEvent[]
  timeZone: string
  localDateFrom: string
  localDateTo: string
}) {
  const spendByKey = new Map<
    string,
    { amountMinor: number; originalCurrencies: Set<string> }
  >()

  for (const { event, reportingAmountMinor } of input.rows) {
    if (
      reportingAmountMinor === null ||
      event.direction !== "outflow" ||
      event.isTransfer
    ) {
      continue
    }

    const parts = getUserTimeZoneDateParts(
      event.eventOccurredAt,
      input.timeZone
    )
    const key =
      input.timeframe === "year"
        ? `${parts.year}-${parts.month}`
        : `${parts.year}-${parts.month}-${parts.day}`
    const bucket = spendByKey.get(key) ?? {
      amountMinor: 0,
      originalCurrencies: new Set<string>(),
    }

    bucket.amountMinor += reportingAmountMinor
    bucket.originalCurrencies.add(event.currency)
    spendByKey.set(key, bucket)
  }

  if (input.timeframe === "year") {
    const currentYear = Number(input.localDateTo.slice(0, 4))
    const currentMonth = Number(input.localDateTo.slice(5, 7))

    return Array.from({ length: currentMonth }, (_, index) => {
      const month = index + 1
      const key = `${currentYear}-${String(month).padStart(2, "0")}`
      const bucket = spendByKey.get(key)

      return {
        label: formatInUserTimeZone(
          new Date(Date.UTC(currentYear, index, 15)),
          input.timeZone,
          { month: "short" }
        ),
        amount: (bucket?.amountMinor ?? 0) / 100,
        originalCurrencies: Array.from(bucket?.originalCurrencies ?? []),
      }
    })
  }

  const points: Array<{
    label: string
    amount: number
    originalCurrencies: string[]
  }> = []

  for (
    let localDate = input.localDateFrom;
    localDate <= input.localDateTo;
    localDate = shiftLocalDate(localDate, 1)
  ) {
    const bucket = spendByKey.get(localDate)
    const bucketDate = requireDate(
      getUtcStartOfUserDay(localDate, input.timeZone),
      "spend series date"
    )

    points.push({
      label:
        input.timeframe === "week"
          ? formatInUserTimeZone(bucketDate, input.timeZone, {
              weekday: "short",
            })
          : String(Number(localDate.slice(8, 10))),
      amount: (bucket?.amountMinor ?? 0) / 100,
      originalCurrencies: Array.from(bucket?.originalCurrencies ?? []),
    })
  }

  return points
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = searchParams ? await searchParams : undefined
  const session = await requireSession()
  const settings = await getUserSettings(session.user.id)
  const timeframe = resolveTimeframe(asSingleValue(params?.range))
  const snapshotRange = buildSnapshotRange(timeframe, settings.timeZone)
  const valuationCoverage = await ensureUserFinancialEventValuationCoverage(
    session.user.id,
    {
      dateFrom: snapshotRange.dateFrom,
      dateTo: snapshotRange.dateTo,
      limit: timeframe === "year" ? 5000 : 1000,
    }
  )
  const reportingCurrency = valuationCoverage.reportingCurrency

  const [
    gmailState,
    openReviewCount,
    snapshotEvents,
    recentEvents,
    recurringCounts,
    rankedAdvice,
    latestForecastJob,
  ] = await Promise.all([
    getGmailIntegrationState(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    listDashboardLedgerEventsForUser({
      userId: session.user.id,
      targetCurrency: reportingCurrency,
      dateFrom: snapshotRange.dateFrom,
      dateTo: snapshotRange.dateTo,
    }),
    listLedgerEventsForUser({
      userId: session.user.id,
      limit: 6,
    }),
    countRecurringObligationsByType(session.user.id),
    listHomeRankedAdviceItemsForUser({
      userId: session.user.id,
      limit: 3,
    }),
    getLatestJobRunForUser({
      userId: session.user.id,
      queueName: FORECASTING_QUEUE_NAME,
      jobNames: [
        FORECAST_REFRESH_USER_JOB_NAME,
        FORECAST_REBUILD_USER_JOB_NAME,
      ],
    }),
  ])

  const recentEventIds = recentEvents.map(({ event }) => event.id)
  const recentSources =
    await listFinancialEventSourcesForEventIds(recentEventIds)
  const sourcesByEventId = new Map<string, typeof recentSources>()

  for (const source of recentSources) {
    const existing = sourcesByEventId.get(source.source.financialEventId) ?? []
    existing.push(source)
    sourcesByEventId.set(source.source.financialEventId, existing)
  }

  let spendMinor = 0
  let incomeMinor = 0
  let refundMinor = 0

  for (const { event, reportingAmountMinor } of snapshotEvents) {
    if (reportingAmountMinor === null) {
      continue
    }

    if (event.direction === "outflow" && !event.isTransfer) {
      spendMinor += reportingAmountMinor
    }

    if (event.direction === "inflow") {
      incomeMinor += reportingAmountMinor
      if (event.eventType === "refund") {
        refundMinor += reportingAmountMinor
      }
    }
  }

  const spendSeries = buildSpendSeries({
    timeframe,
    rows: snapshotEvents,
    timeZone: settings.timeZone,
    localDateFrom: snapshotRange.localDateFrom,
    localDateTo: snapshotRange.localDateTo,
  })
  const netFlowMinor = incomeMinor - spendMinor
  const topCategories = summarizeCategoryActivity(snapshotEvents).slice(0, 6)
  const forecastNeedsRecovery =
    latestForecastJob?.status === "failed" ||
    latestForecastJob?.status === "dead_lettered"

  const setupBlocker = !gmailState.connection
    ? {
        eyebrow: "Setup blocker",
        title: "connect Gmail",
        description:
          "Irene needs your inbox connected before it can keep your money picture current.",
        href: "/settings",
        badge: "Action",
        badgeVariant: "warning" as const,
      }
    : null

  const adviceRailItems = rankedAdvice.map(
    ({ adviceItem, merchant, goal }) => ({
      id: adviceItem.id,
      title: adviceItem.title,
      summary: adviceItem.summary,
      detail: adviceItem.detail,
      priority: adviceItem.priority,
      status: adviceItem.status,
      contextHref: resolveAdviceContextHref({
        goalId: goal?.id,
        triggerType: adviceItem.triggerType,
      }),
      primaryAction: adviceItem.primaryActionJson,
      secondaryAction: adviceItem.secondaryActionJson,
      merchantName: merchant?.displayName ?? null,
      goalName: goal?.name ?? null,
      updatedAtIso: adviceItem.updatedAt.toISOString(),
      updatedAtLabel: formatInUserTimeZone(
        adviceItem.updatedAt,
        settings.timeZone,
        {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }
      ),
    })
  )

  return (
    <section className="grid gap-6">
      <div className="grid gap-6">
        <div>
          <h1 className="mt-4 max-w-[14ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4.2rem]">
            your money,
            <br />
            {snapshotRange.pageHeading}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            A calm snapshot of what moved, what needs attention, and where your
            money is clustering {snapshotRange.label.toLowerCase()}.
          </p>
        </div>

        <HeroBalanceCard
          label="Primary snapshot"
          headline="total spend"
          amount={formatCurrency(spendMinor, reportingCurrency)}
          amountCaption={buildRangeCaption({
            label: snapshotRange.label,
            dateFrom: snapshotRange.dateFrom,
            dateTo: snapshotRange.dateTo,
            timeZone: settings.timeZone,
          })}
          headerAccessory={<DashboardTimeframeSelect value={timeframe} />}
          income={formatCurrency(incomeMinor, reportingCurrency)}
          netFlow={formatCurrency(netFlowMinor, reportingCurrency)}
          netFlowDirection={
            netFlowMinor > 0
              ? "positive"
              : netFlowMinor < 0
                ? "negative"
                : "zero"
          }
          refunds={formatCurrency(refundMinor, reportingCurrency)}
          dailySpend={spendSeries}
          reportingCurrency={reportingCurrency}
        />

        <SnapshotStatStrip
          stats={[
            {
              label: "Income",
              value: formatCurrency(incomeMinor, reportingCurrency),
              tone: "positive",
            },
            {
              label: "Net movement",
              value: formatCurrency(netFlowMinor, reportingCurrency),
              tone: netFlowMinor >= 0 ? "positive" : "default",
            },
            {
              label: "Review queue",
              value: `${openReviewCount} open`,
              tone: openReviewCount > 0 ? "violet" : "default",
            },
            {
              label: "Obligations",
              value: `${recurringCounts.subscriptions + recurringCounts.emis + recurringCounts.bills} active`,
              tone: "default",
            },
          ]}
        />

        {forecastNeedsRecovery ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border border-white/[0.06] px-4 py-4">
            <div>
              <p className="text-sm text-white">Forecast needs recovery.</p>
              <p className="mt-1 text-sm text-white/42">
                The latest forecast job did not finish cleanly. Rebuild it
                before relying on downstream advice.
              </p>
            </div>
            <form action="/api/recovery/forecast" method="post">
              <input type="hidden" name="action" value="rebuild" />
              <input type="hidden" name="redirectTo" value="/dashboard" />
              <button className="inline-flex h-9 items-center rounded-full border border-white/[0.1] px-3 text-sm text-white/72 transition hover:bg-white/[0.04] hover:text-white">
                Rebuild forecast
              </button>
            </form>
          </div>
        ) : null}

        {setupBlocker ? (
          <ActionTile
            href={setupBlocker.href}
            eyebrow={setupBlocker.eyebrow}
            title={setupBlocker.title}
            description={setupBlocker.description}
            badge={setupBlocker.badge}
            badgeVariant={setupBlocker.badgeVariant}
          />
        ) : null}

        {topCategories.length > 0 ? (
          <HomeCategoryStrip
            items={topCategories}
            formatAmount={(amountMinor) =>
              formatCurrency(amountMinor, reportingCurrency)
            }
          />
        ) : null}

        {adviceRailItems.length > 0 ? (
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[0.82rem] tracking-[0.18em] text-white/36 uppercase">
                <span>Advice</span>
                <span>({adviceRailItems.length})</span>
              </div>
              <Link
                href="/advice"
                className="text-sm text-white/52 transition hover:text-white"
              >
                view all
              </Link>
            </div>
            <AdviceHomeCarousel items={adviceRailItems} />
          </section>
        ) : null}
      </div>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[0.82rem] tracking-[0.18em] text-white/36 uppercase">
            <span>Recent activity</span>
            <span>({recentEvents.length})</span>
          </div>
          <Link
            href="/activity"
            className="text-sm text-white/52 transition hover:text-white"
          >
            view all
          </Link>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {recentEvents.length > 0 ? (
            recentEvents.map(
              ({ event, merchant, category, paymentInstrument }) => (
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
                  occurredAt={event.eventOccurredAt}
                  categoryName={category?.name ?? "Uncategorized"}
                  categoryId={category?.id ?? event.categoryId}
                  categoryIconName={category?.iconName ?? null}
                  categoryColorToken={category?.colorToken ?? null}
                  direction={event.direction}
                  eventType={event.eventType}
                  needsReview={event.needsReview}
                  paymentInstrument={paymentInstrument?.displayName ?? null}
                  traceCount={(sourcesByEventId.get(event.id) ?? []).length}
                  timeZone={settings.timeZone}
                />
              )
            )
          ) : (
            <AppEmptyState
              compact
              title="No activity on the home feed yet"
              description="Recent transactions will appear here soon."
            />
          )}
        </div>
      </section>
    </section>
  )
}
