import {
  countIncomeStreams,
  countOpenReviewQueueItemsForUser,
  countRecurringObligationsByType,
  getUserSettings,
  listAdviceItemsForUser,
  listDashboardLedgerEventsForUser,
  listFinancialGoalsForUser,
  listFinancialEventSourcesForEventIds,
  listHomeRankedAdviceItemsForUser,
  listLatestGoalContributionSnapshotsForGoalIds,
  listIncomeStreamsForUser,
  listLedgerEventsForUser,
  listRecurringObligationsForUser,
} from "@workspace/db"

import { ActionTile } from "@/components/action-tile"
import { AdviceHomeCarousel } from "@/components/advice-rail"
import { GoalSnapshotPanel } from "@/components/goal-snapshot-panel"
import { HeroBalanceCard } from "@/components/hero-balance-card"
import { RecurringModelCard } from "@/components/recurring-model-card"
import { SnapshotStatStrip } from "@/components/snapshot-stat-strip"
import { TransactionCard } from "@/components/transaction-card"
import {
  formatInUserTimeZone,
  getUserTimeZoneDayOfMonth,
} from "@/lib/date-format"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { resolveAdviceContextHref } from "@/lib/advice"
import { requireSession } from "@/lib/session"
import Link from "next/link"

export const dynamic = "force-dynamic"

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

function formatShortDate(date: Date | null, timeZone: string) {
  if (!date) {
    return "date still unclear"
  }

  return formatInUserTimeZone(date, timeZone, {
    day: "numeric",
    month: "short",
  })
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`)
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
    incomeStreamCounts,
    recurringObligations,
    incomeStreams,
    rankedAdvice,
    activeAdvice,
    activeGoals,
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
    countIncomeStreams(session.user.id),
    listRecurringObligationsForUser({
      userId: session.user.id,
      status: "active",
      limit: 4,
    }),
    listIncomeStreamsForUser({
      userId: session.user.id,
      limit: 3,
    }),
    listHomeRankedAdviceItemsForUser({
      userId: session.user.id,
      limit: 3,
    }),
    listAdviceItemsForUser({
      userId: session.user.id,
      statuses: ["active"],
      limit: 24,
    }),
    listFinancialGoalsForUser({
      userId: session.user.id,
      statuses: ["active"],
      limit: 3,
    }),
  ])

  const goalSnapshotRows = await listLatestGoalContributionSnapshotsForGoalIds(
    activeGoals.map((row) => row.goal.id),
  )
  const goalSnapshotsByGoalId = new Map(
    goalSnapshotRows.map((row) => [row.snapshot.financialGoalId, row.snapshot]),
  )

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
  let pendingValuationCount = 0
  const categoryTotals = new Map<string, number>()
  const dailySpendMap = new Map<
    number,
    { amountMinor: number; originalCurrencies: Set<string> }
  >()

  for (const { event, category, reportingAmountMinor } of monthEvents) {
    if (reportingAmountMinor === null) {
      pendingValuationCount += 1
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
      if (category?.name) {
        categoryTotals.set(
          category.name,
          (categoryTotals.get(category.name) ?? 0) + reportingAmountMinor
        )
      }
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
  const topCategories = [...categoryTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)

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
    : recentEvents.length === 0
      ? {
          eyebrow: "Next step",
          title: "build your feed",
          description:
            "Your inbox is connected, but Irene still needs more reconciled activity to paint the month clearly.",
          href: "/settings",
          badge: "Sync",
          badgeVariant: "cream" as const,
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
    updatedAtLabel: formatInUserTimeZone(adviceItem.updatedAt, settings.timeZone, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  }))

  const goalPanelItems = activeGoals.map(({ goal }) => {
    const snapshot = goalSnapshotsByGoalId.get(goal.id)
    const projectedAmountMinor =
      snapshot?.projectedAmountMinor ?? goal.startingAmountMinor ?? 0
    const gapAmountMinor =
      snapshot?.gapAmountMinor ??
      Math.max(goal.targetAmountMinor - projectedAmountMinor, 0)
    const progressRatio =
      goal.targetAmountMinor > 0 ? projectedAmountMinor / goal.targetAmountMinor : 0

    return {
      id: goal.id,
      name: goal.name,
      status: goal.status,
      targetAmountLabel: formatCurrency(goal.targetAmountMinor, goal.currency),
      projectedAmountLabel: formatCurrency(projectedAmountMinor, goal.currency),
      gapAmountLabel: formatCurrency(gapAmountMinor, goal.currency),
      targetDateLabel: formatShortDate(parseDateKey(goal.targetDate), settings.timeZone),
      progressRatio,
      riskLabel: gapAmountMinor > goal.targetAmountMinor * 0.25 ? "At risk" : "On track",
    }
  })

  return (
    <section className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="grid gap-6">
          <div>
            <p className="neo-kicker">Home</p>
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
            amountCaption={
              pendingValuationCount > 0
                ? `${pendingValuationCount} transactions are still being normalized to ${reportingCurrency}.`
                : `Normalized to ${reportingCurrency} using historical FX on the transaction date.`
            }
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
            actionHref="/activity"
            actionLabel="Open activity"
          />

          {adviceRailItems.length > 0 ? (
            <section className="grid gap-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="neo-kicker">Advice</p>
                  <h2 className="mt-3 text-[1.6rem] font-medium text-white">
                    top next moves
                  </h2>
                </div>
                <Link
                  href="/advice"
                  className="text-sm text-white/52 transition hover:text-white"
                >
                  Open all
                </Link>
              </div>
              <AdviceHomeCarousel
                items={adviceRailItems}
                actionRedirectTo="/dashboard"
              />
            </section>
          ) : null}

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
        </div>

        <div className="grid gap-4 self-start">
          <ActionTile
            href="/review"
            eyebrow="Attention rail"
            title={
              openReviewCount > 0 ? `${openReviewCount} items` : "review clear"
            }
            description={
              openReviewCount > 0
                ? "A few transactions still need your decision before Irene treats them as truth."
                : "No ambiguous financial events are waiting on you right now."
            }
            badge={openReviewCount > 0 ? "Review" : "Clear"}
            badgeVariant={openReviewCount > 0 ? "warning" : "success"}
          />
          <ActionTile
            href="/advice"
            eyebrow="Advice queue"
            title={activeAdvice.length > 0 ? `${activeAdvice.length} active` : "no active advice"}
            description={
              activeAdvice.length > 0
                ? "Forecast, goals, and recurring patterns are already surfacing specific next moves."
                : "No active planning prompts are open right now. Irene will surface new advice when the underlying state changes."
            }
            badge={activeAdvice.length > 0 ? "Live" : "Quiet"}
            badgeVariant={activeAdvice.length > 0 ? "violet" : "cream"}
          />
          <GoalSnapshotPanel goals={goalPanelItems} />
          <ActionTile
            href="/settings"
            eyebrow="Inbox state"
            title={gmailState.connection ? "sync active" : "sync offline"}
            description={
              gmailState.connection
                ? `Connected to ${gmailState.connection.providerAccountEmail ?? "your inbox"}. Manage sync, reconnection, and advanced controls in settings.`
                : "Connect Gmail to start building a real snapshot from your receipts, alerts, and obligations."
            }
            badge={gmailState.connection ? "Connected" : "Connect"}
            badgeVariant={gmailState.connection ? "success" : "warning"}
          />
          <ActionTile
            href="/activity?view=subscriptions"
            eyebrow="Recurring layer"
            title={`${recurringCounts.subscriptions} subscriptions · ${recurringCounts.emis} EMIs`}
            description={`${incomeStreamCounts.active} active income streams and ${recurringCounts.suspected + incomeStreamCounts.suspected} suspected patterns are now shaping next-step finance views.`}
            badge={
              recurringCounts.suspected + incomeStreamCounts.suspected > 0
                ? "Suspected"
                : "Stable"
            }
            badgeVariant={
              recurringCounts.suspected + incomeStreamCounts.suspected > 0
                ? "warning"
                : "cream"
            }
          />
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
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="neo-panel p-5 md:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="neo-kicker">Category pulse</p>
              <h2 className="mt-3 font-display text-[2.1rem] leading-none text-white">
                where money clustered
              </h2>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {topCategories.length > 0 ? (
              topCategories.map(([categoryName, amountMinor], index) => (
                <div
                  key={categoryName}
                  className="flex items-center justify-between border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4"
                >
                  <div>
                    <p className="neo-kicker">Top {index + 1}</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {categoryName}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-white">
                    {formatCurrency(amountMinor, reportingCurrency)}
                  </p>
                </div>
              ))
            ) : (
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/54">
                Once reconciled events build up, Irene will show the categories
                shaping your month here.
              </div>
            )}
          </div>
        </div>

        <div className="neo-panel p-5 md:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="neo-kicker">Recent activity</p>
              <h2 className="mt-3 font-display text-[2.1rem] leading-none text-white">
                movement in focus
              </h2>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
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
                    amount={formatCurrency(event.amountMinor, event.currency)}
                    dateLabel={formatEventDate(
                      event.eventOccurredAt,
                      settings.timeZone
                    )}
                    categoryName={category?.name ?? "Uncategorized"}
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
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/54">
                No canonical activity yet. Connect Gmail or wait for more
                ingestion to finish reconciling.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="neo-panel p-5 md:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="neo-kicker">Recurring rail</p>
              <h2 className="mt-3 font-display text-[2.1rem] leading-none text-white">
                obligations ahead
              </h2>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            {recurringObligations.length > 0 ? (
              recurringObligations.map(({ obligation, merchant }) => (
                <RecurringModelCard
                  key={obligation.id}
                  eyebrow={obligation.obligationType.replace("_", " ")}
                  title={merchant?.displayName ?? obligation.name}
                  subtitle={`Tracks the pattern Irene sees around this ${obligation.obligationType}.`}
                  amount={formatCurrency(
                    obligation.amountMinor ?? 0,
                    obligation.currency ?? "INR"
                  )}
                  cadence={obligation.cadence}
                  scheduleLabel={
                    obligation.nextDueAt
                      ? `next ${formatShortDate(obligation.nextDueAt, settings.timeZone)}`
                      : "still estimating"
                  }
                  confidenceLabel={`${Math.round(Number(obligation.detectionConfidence) * 100)}%`}
                  status={obligation.status}
                />
              ))
            ) : (
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/54">
                As recurring patterns harden, Irene will surface subscriptions,
                bills, and EMIs here before forecasting begins.
              </div>
            )}
          </div>
        </div>

        <div className="neo-panel p-5 md:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="neo-kicker">Income rhythm</p>
              <h2 className="mt-3 font-display text-[2.1rem] leading-none text-white">
                expected credits
              </h2>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            {incomeStreams.length > 0 ? (
              incomeStreams.map(({ incomeStream, merchant }) => (
                <RecurringModelCard
                  key={incomeStream.id}
                  eyebrow={incomeStream.incomeType.replace("_", " ")}
                  title={merchant?.displayName ?? incomeStream.name}
                  subtitle="Repeatable inflows Irene now treats as recurring income signals."
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
                      ? `next ${formatShortDate(incomeStream.nextExpectedAt, settings.timeZone)}`
                      : "still estimating"
                  }
                  confidenceLabel={`${Math.round(Number(incomeStream.confidence) * 100)}%`}
                  status={incomeStream.status}
                />
              ))
            ) : (
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/54">
                Once repeatable credits are stable enough, Irene will show them
                here as income streams you can trust.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
