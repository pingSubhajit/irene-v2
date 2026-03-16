import {
  countOpenReviewQueueItemsForUser,
  listFinancialEventSourcesForEventIds,
  listLedgerEventsForUser,
} from "@workspace/db"

import { ActionTile } from "@/components/action-tile"
import { HeroBalanceCard } from "@/components/hero-balance-card"
import { SnapshotStatStrip } from "@/components/snapshot-stat-strip"
import { TransactionCard } from "@/components/transaction-card"
import { getGmailIntegrationState } from "@/lib/gmail-integration"
import { requireSession } from "@/lib/session"

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

function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date)
}

export default async function DashboardPage() {
  const session = await requireSession()
  const monthStart = startOfCurrentMonth()

  const [gmailState, openReviewCount, monthEvents, recentEvents] = await Promise.all([
    getGmailIntegrationState(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    listLedgerEventsForUser({
      userId: session.user.id,
      dateFrom: monthStart,
      limit: 240,
    }),
    listLedgerEventsForUser({
      userId: session.user.id,
      limit: 6,
    }),
  ])

  const recentEventIds = recentEvents.map(({ event }) => event.id)
  const recentSources = await listFinancialEventSourcesForEventIds(recentEventIds)
  const sourcesByEventId = new Map<string, typeof recentSources>()

  for (const source of recentSources) {
    const existing = sourcesByEventId.get(source.source.financialEventId) ?? []
    existing.push(source)
    sourcesByEventId.set(source.source.financialEventId, existing)
  }

  let monthSpendMinor = 0
  let monthIncomeMinor = 0
  let monthRefundMinor = 0
  let obligationCount = 0
  const categoryTotals = new Map<string, number>()
  const dailySpendMap = new Map<number, number>()

  for (const { event, category } of monthEvents) {
    if (event.direction === "outflow" && !event.isTransfer) {
      monthSpendMinor += event.amountMinor
      const day = event.eventOccurredAt.getUTCDate()
      dailySpendMap.set(day, (dailySpendMap.get(day) ?? 0) + event.amountMinor)
      if (category?.name) {
        categoryTotals.set(category.name, (categoryTotals.get(category.name) ?? 0) + event.amountMinor)
      }
    }

    if (event.direction === "inflow") {
      monthIncomeMinor += event.amountMinor
      if (event.eventType === "refund") {
        monthRefundMinor += event.amountMinor
      }
    }

    if (
      event.eventType === "subscription_charge" ||
      event.eventType === "emi_payment" ||
      event.eventType === "bill_payment"
    ) {
      obligationCount += 1
    }
  }

  const todayDate = new Date().getUTCDate()
  const dailySpend = Array.from({ length: todayDate }, (_, i) => ({
    day: i + 1,
    amount: (dailySpendMap.get(i + 1) ?? 0) / 100,
  }))

  const netFlowMinor = monthIncomeMinor - monthSpendMinor
  const topCategories = [...categoryTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)

  const setupBlocker = !gmailState.connection
    ? {
        eyebrow: "Setup blocker",
        title: "connect Gmail",
        description: "Irene needs your inbox connected before it can keep your money picture current.",
        href: "/settings",
        badge: "Action",
        badgeVariant: "warning" as const,
      }
    : recentEvents.length === 0
      ? {
          eyebrow: "Next step",
          title: "build your feed",
          description: "Your inbox is connected, but Irene still needs more reconciled activity to paint the month clearly.",
          href: "/settings",
          badge: "Sync",
          badgeVariant: "cream" as const,
        }
      : null

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
              A calm snapshot of what moved, what needs attention, and where your money is clustering right now.
            </p>
          </div>

          <HeroBalanceCard
            label="Primary snapshot"
            headline="total spend so far"
            amount={formatCurrency(monthSpendMinor)}
            income={formatCurrency(monthIncomeMinor)}
            netFlow={formatCurrency(netFlowMinor)}
            netFlowDirection={netFlowMinor > 0 ? "positive" : netFlowMinor < 0 ? "negative" : "zero"}
            refunds={formatCurrency(monthRefundMinor)}
            dailySpend={dailySpend}
            actionHref="/activity"
            actionLabel="Open activity"
          />

          <SnapshotStatStrip
            stats={[
              {
                label: "Income",
                value: formatCurrency(monthIncomeMinor),
                tone: "positive",
              },
              {
                label: "Net movement",
                value: formatCurrency(netFlowMinor),
                tone: netFlowMinor >= 0 ? "positive" : "default",
              },
              {
                label: "Review queue",
                value: `${openReviewCount} open`,
                tone: openReviewCount > 0 ? "violet" : "default",
              },
              {
                label: "Obligations",
                value: `${obligationCount} logged`,
                tone: "default",
              },
            ]}
          />
        </div>

        <div className="grid gap-4 self-start">
          <ActionTile
            href="/review"
            eyebrow="Attention rail"
            title={openReviewCount > 0 ? `${openReviewCount} items` : "review clear"}
            description={
              openReviewCount > 0
                ? "A few transactions still need your decision before Irene treats them as truth."
                : "No ambiguous financial events are waiting on you right now."
            }
            badge={openReviewCount > 0 ? "Review" : "Clear"}
            badgeVariant={openReviewCount > 0 ? "warning" : "success"}
          />
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
                    <p className="mt-2 text-lg font-semibold text-white">{categoryName}</p>
                  </div>
                  <p className="text-lg font-semibold text-white">
                    {formatCurrency(amountMinor)}
                  </p>
                </div>
              ))
            ) : (
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/54">
                Once reconciled events build up, Irene will show the categories shaping your month here.
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
              recentEvents.map(({ event, merchant, category, paymentInstrument }) => (
                <TransactionCard
                  key={event.id}
                  merchant={merchant?.displayName ?? event.description ?? "Unmapped event"}
                  amount={formatCurrency(event.amountMinor, event.currency)}
                  dateLabel={formatEventDate(event.eventOccurredAt)}
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
              ))
            ) : (
              <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-5 text-sm leading-6 text-white/54">
                No canonical activity yet. Connect Gmail or wait for more ingestion to finish reconciling.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
