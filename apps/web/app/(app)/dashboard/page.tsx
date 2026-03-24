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
import { HeroBalanceCard } from "@/components/hero-balance-card"
import { HomeCategoryStrip } from "@/components/home-category-strip"
import { SnapshotStatStrip } from "@/components/snapshot-stat-strip"
import { TransactionCard } from "@/components/transaction-card"
import { summarizeCategoryActivity } from "@/lib/category-summary"
import {
  formatInUserTimeZone,
  getUserTimeZoneDayOfMonth,
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

function startOfCurrentMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
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

function formatEventDate(date: Date, timeZone: string) {
  return formatInUserTimeZone(date, timeZone, {
    day: "numeric",
    month: "short",
    weekday: "short",
  })
}

export default async function DashboardPage() {
  const session = await requireSession()
  const settings = await getUserSettings(session.user.id)
  const monthStart = startOfCurrentMonth()
  const valuationCoverage = await ensureUserFinancialEventValuationCoverage(
    session.user.id,
    {
      dateFrom: monthStart,
      limit: 240,
    }
  )
  const reportingCurrency = valuationCoverage.reportingCurrency

  const [
    gmailState,
    openReviewCount,
    monthEvents,
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
      dateFrom: monthStart,
      limit: 240,
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
      jobNames: [FORECAST_REFRESH_USER_JOB_NAME, FORECAST_REBUILD_USER_JOB_NAME],
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

  let monthSpendMinor = 0
  let monthIncomeMinor = 0
  let monthRefundMinor = 0
  const dailySpendMap = new Map<
    number,
    { amountMinor: number; originalCurrencies: Set<string> }
  >()

  for (const { event, reportingAmountMinor } of monthEvents) {
    if (reportingAmountMinor === null) {
      continue
    }

    if (event.direction === "outflow" && !event.isTransfer) {
      monthSpendMinor += reportingAmountMinor
      const day = getUserTimeZoneDayOfMonth(
        event.eventOccurredAt,
        settings.timeZone
      )
      const dailySpend = dailySpendMap.get(day) ?? {
        amountMinor: 0,
        originalCurrencies: new Set<string>(),
      }
      dailySpend.amountMinor += reportingAmountMinor
      dailySpend.originalCurrencies.add(event.currency)
      dailySpendMap.set(day, dailySpend)
    }

    if (event.direction === "inflow") {
      monthIncomeMinor += reportingAmountMinor
      if (event.eventType === "refund") {
        monthRefundMinor += reportingAmountMinor
      }
    }
  }

  const todayDate = getUserTimeZoneDayOfMonth(new Date(), settings.timeZone)
  const dailySpend = Array.from({ length: todayDate }, (_, i) => ({
    day: i + 1,
    amount: (dailySpendMap.get(i + 1)?.amountMinor ?? 0) / 100,
    originalCurrencies: Array.from(
      dailySpendMap.get(i + 1)?.originalCurrencies ?? []
    ),
  }))

  const netFlowMinor = monthIncomeMinor - monthSpendMinor
  const topCategories = summarizeCategoryActivity(monthEvents).slice(0, 6)
  const forecastNeedsRecovery =
    latestForecastJob?.status === "failed" || latestForecastJob?.status === "dead_lettered"

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

  const adviceRailItems = rankedAdvice.map(({ adviceItem, merchant, goal }) => ({
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
    updatedAtLabel: formatInUserTimeZone(adviceItem.updatedAt, settings.timeZone, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  }))

  return (
    <section className="grid gap-6">
      <div className="grid gap-6">
        <div>
          <h1 className="mt-4 max-w-[14ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4.2rem]">
            your money,
            <br />
            this month.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            A calm snapshot of what moved, what needs attention, and where
            your money is clustering right now.
          </p>
        </div>

        <HeroBalanceCard
          label="Primary snapshot"
          headline="total spend so far"
          amount={formatCurrency(monthSpendMinor, reportingCurrency)}
          income={formatCurrency(monthIncomeMinor, reportingCurrency)}
          netFlow={formatCurrency(netFlowMinor, reportingCurrency)}
          netFlowDirection={
            netFlowMinor > 0
              ? "positive"
              : netFlowMinor < 0
                ? "negative"
                : "zero"
          }
          refunds={formatCurrency(monthRefundMinor, reportingCurrency)}
          dailySpend={dailySpend}
          reportingCurrency={reportingCurrency}
        />

        <SnapshotStatStrip
          stats={[
            {
              label: "Income",
              value: formatCurrency(monthIncomeMinor, reportingCurrency),
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
                The latest forecast job did not finish cleanly. Rebuild it before relying on downstream advice.
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
              <div className="flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.18em] text-white/36">
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
          <div className="flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.18em] text-white/36">
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
                  dateLabel={formatEventDate(
                    event.eventOccurredAt,
                    settings.timeZone
                  )}
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
