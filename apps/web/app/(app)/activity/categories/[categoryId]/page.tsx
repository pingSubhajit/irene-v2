import Link from "next/link"
import { notFound } from "next/navigation"
import { RiArrowLeftLine } from "@remixicon/react"
import {
  getCategoryDetailForUser,
  getUserSettings,
  listCategoriesForUser,
  listDashboardLedgerEventsForUser,
} from "@workspace/db"
import type { CategoryColorToken } from "@workspace/config"

import { AppEmptyState } from "@/components/app-empty-state"
import { CategoryBadge } from "@/components/category-badge"
import { CategoryTopMerchantsChart } from "@/components/category-top-merchants-chart"
import { HomeCategoryStrip } from "@/components/home-category-strip"
import { TransactionCard } from "@/components/transaction-card"
import { summarizeCategoryActivity } from "@/lib/category-summary"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type CategoryDetailPageProps = {
  params: Promise<{
    categoryId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

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

function formatMonthLabel(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)

  if (!match) {
    return monthKey
  }

  const year = match[1]!
  const month = match[2]!
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
  const monthLabel = date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()
  return `${monthLabel} '${year.slice(-2)}`
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatLocalDateInput(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
}

function startOfCurrentMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function getAccentStyles(colorToken: CategoryColorToken | null | undefined) {
  switch (colorToken) {
    case "yellow":
      return {
        glow: "rgba(255, 233, 77, 0.2)",
        line: "#ffe94d",
        soft: "rgba(255, 233, 77, 0.1)",
        amount: "#f7f0dd",
      }
    case "green":
      return {
        glow: "rgba(77, 255, 184, 0.18)",
        line: "#4dffb8",
        soft: "rgba(77, 255, 184, 0.1)",
        amount: "#e4f1e9",
      }
    case "violet":
      return {
        glow: "rgba(156, 107, 255, 0.18)",
        line: "#9c6bff",
        soft: "rgba(156, 107, 255, 0.1)",
        amount: "#ece7f7",
      }
    case "blue":
      return {
        glow: "rgba(83, 183, 255, 0.18)",
        line: "#53b7ff",
        soft: "rgba(83, 183, 255, 0.1)",
        amount: "#e3eef8",
      }
    case "coral":
      return {
        glow: "rgba(255, 122, 92, 0.18)",
        line: "#ff7a5c",
        soft: "rgba(255, 122, 92, 0.1)",
        amount: "#f6e7e1",
      }
    case "graphite":
      return {
        glow: "rgba(199, 210, 255, 0.18)",
        line: "#c7d2ff",
        soft: "rgba(199, 210, 255, 0.1)",
        amount: "#e8ecf7",
      }
    case "cream":
    default:
      return {
        glow: "rgba(255, 241, 168, 0.18)",
        line: "#fff1a8",
        soft: "rgba(255, 241, 168, 0.08)",
        amount: "#f7f0dc",
      }
  }
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: CategoryDetailPageProps) {
  const session = await requireSession()
  const { categoryId } = await params
  const query = (await searchParams) ?? {}

  const settings = await getUserSettings(session.user.id)
  const monthStart = startOfCurrentMonth()

  await ensureUserFinancialEventValuationCoverage(session.user.id, {
    dateFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    limit: 600,
  })

  const [detail, categories, monthEvents] = await Promise.all([
    getCategoryDetailForUser({
      userId: session.user.id,
      categoryId,
      reportingCurrency: settings.reportingCurrency,
      timeZone: settings.timeZone,
      monthKey: asSingleValue(query.month) ?? null,
      week: (() => {
        const value = Number(asSingleValue(query.week))
        return value >= 1 && value <= 4 ? value : null
      })(),
    }),
    listCategoriesForUser(session.user.id),
    listDashboardLedgerEventsForUser({
      userId: session.user.id,
      targetCurrency: settings.reportingCurrency,
      dateFrom: monthStart,
      limit: 240,
    }),
  ])

  if (!detail) {
    notFound()
  }

  const accent = getAccentStyles(detail.category.colorToken)
  const periodLabel =
    detail.mode === "month"
      ? formatMonthLabel(detail.selectedMonthKey ?? "")
      : `${formatMonthLabel(detail.selectedMonthKey ?? "")} · W${detail.selectedWeek ?? 1}`

  const categoryActivityHref = (() => {
    const search = new URLSearchParams()
    search.append("category", detail.category.slug)

    if (detail.mode === "month") {
      const bucket = detail.monthBuckets.find((row) => row.monthKey === detail.selectedMonthKey)
      if (bucket) {
        const monthRangeStart = `${bucket.monthKey}-01`
        const [year, month] = bucket.monthKey.split("-")
        const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
        search.set("dateFrom", monthRangeStart)
        search.set("dateTo", `${bucket.monthKey}-${String(lastDay).padStart(2, "0")}`)
      }
    } else {
      const bucket = detail.weekBuckets.find((row) => row.week === detail.selectedWeek)
      if (bucket?.dateFrom && bucket.dateTo) {
        search.set("dateFrom", formatLocalDateInput(bucket.dateFrom, settings.timeZone))
        search.set("dateTo", formatLocalDateInput(bucket.dateTo, settings.timeZone))
      }
    }

    return `/activity?${search.toString()}`
  })()

  const activitySummaries = summarizeCategoryActivity(monthEvents)
  const activityByCategoryId = new Map(
    activitySummaries.map((summary) => [summary.id, summary]),
  )
  const relatedCategories = categories
    .map((category) => {
      const summary = activityByCategoryId.get(category.id)

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        iconName: category.iconName,
        colorToken: category.colorToken,
        totalOutflowMinor: summary?.totalOutflowMinor ?? 0,
        transactionCount: summary?.transactionCount ?? 0,
      }
    })
    .sort((left, right) => {
      const leftActive = left.totalOutflowMinor > 0 ? 1 : 0
      const rightActive = right.totalOutflowMinor > 0 ? 1 : 0

      return (
        rightActive - leftActive ||
        right.totalOutflowMinor - left.totalOutflowMinor ||
        left.name.localeCompare(right.name)
      )
    })
    .slice(0, 6)

  return (
    <div className="">
      <div
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-[30rem] w-[100vw] -translate-x-1/2 blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${accent.glow}, transparent 72%)`,
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[-2rem] h-[24rem] w-[100vw] -translate-x-1/2 blur-[120px]"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${accent.soft}, transparent 74%)`,
        }}
      />
      <section className="relative mx-auto grid w-full max-w-4xl min-w-0 gap-8">
        <div className="pt-2">
          <Link
            href="/activity"
            className="inline-flex items-center gap-2 text-sm text-white/46 transition hover:text-white"
          >
            <RiArrowLeftLine className="size-4" />
            Back to activity
          </Link>
        </div>

        <div className="relative pb-8 text-center md:pb-12">
          <div className="relative z-10 mx-auto grid max-w-3xl gap-4">
            <div
              className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] shadow-[0_12px_30px_rgba(0,0,0,0.16)]"
              style={{
                boxShadow: `0 12px 30px rgba(0,0,0,0.16), 0 0 28px ${accent.soft}`,
              }}
            >
              <CategoryBadge
                categoryName={detail.category.name}
                iconName={detail.category.iconName}
                colorToken={detail.category.colorToken}
                className="size-6"
              />
            </div>

            <div className="grid gap-1">
              <p className="neo-kicker">Category detail</p>
              <h1 className="mx-auto max-w-[12ch] font-display text-[3.25rem] leading-[0.9] tracking-tight text-white md:text-[5rem]">
                {detail.category.name}
              </h1>
            </div>

            <div className="grid gap-12">
              <p
                className="font-display text-[3rem] leading-none tracking-tight md:text-[4.3rem]"
                style={{
                  color: accent.amount,
                  textShadow: "0 0 18px rgba(255,255,255,0.02)",
                }}
              >
                {formatCurrency(detail.summary.totalOutflowMinor, settings.reportingCurrency)}
              </p>
              <div className="mx-auto grid w-full max-w-2xl grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.06]">
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] uppercase tracking-[0.18em] text-white/28">
                    Period
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {periodLabel}
                  </p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] uppercase tracking-[0.18em] text-white/28">
                    Activity
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {detail.summary.transactionCount}{" "}
                    {detail.summary.transactionCount === 1 ? "transaction" : "transactions"}
                  </p>
                  {detail.summary.shareOfTotalOutflow > 0 ? (
                    <p className="mt-1 text-xs text-white/42">
                      {formatPercent(detail.summary.shareOfTotalOutflow)} of outflow
                    </p>
                  ) : null}
                </div>
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] uppercase tracking-[0.18em] text-white/28">
                    Top merchant
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {detail.summary.topMerchantName ?? "Still forming"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[0.82rem] uppercase tracking-[0.18em] text-white/32">
            {detail.mode === "month" ? "Current year" : "Current month"}
          </div>
          <Link
            href={categoryActivityHref}
            className="text-sm text-white/50 transition hover:text-white"
          >
            view all activity
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {(detail.mode === "month" ? detail.monthBuckets : detail.weekBuckets).map((bucket) => {
            const isActive =
              detail.mode === "month"
                ? "monthKey" in bucket && bucket.monthKey === detail.selectedMonthKey
                : "week" in bucket && bucket.week === detail.selectedWeek
            const href =
              detail.mode === "month"
                ? `/activity/categories/${detail.category.id}?month=${"monthKey" in bucket ? bucket.monthKey : ""}`
                : `/activity/categories/${detail.category.id}?week=${"week" in bucket ? bucket.week : ""}`

            return (
              <Link key={bucket.key} href={href} className="group">
                <div className="relative h-2">
                  <div className="absolute inset-x-0 top-0 h-px bg-white/16 transition group-hover:bg-white/34" />
                  <div
                    className="absolute inset-x-0 top-0 h-0.5 transition"
                    style={{
                      backgroundColor: isActive ? accent.line : "transparent",
                      boxShadow: isActive ? `0 0 18px ${accent.glow}` : "none",
                    }}
                  />
                </div>
                <div className="mt-1 min-w-0 text-white/34 transition group-hover:text-white/60">
                  <span className="block truncate text-[0.9rem] font-medium tracking-[-0.01em] text-white/54">
                    {formatCurrency(bucket.totalMinor, settings.reportingCurrency)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {detail.topMerchants.length > 0 ? (
        <div className="mt-10 grid min-w-0 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="min-w-0 px-1 md:px-0">
            <div className="grid gap-4">
              <CategoryTopMerchantsChart
                merchants={detail.topMerchants}
                currency={settings.reportingCurrency}
                colorToken={detail.category.colorToken}
              />
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-10 grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.18em] text-white/36">
            <span>Recent transactions</span>
            <span>({detail.recentTransactions.length})</span>
          </div>
          <Link
            href={categoryActivityHref}
            className="text-sm text-white/52 transition hover:text-white"
          >
            view all
          </Link>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {detail.recentTransactions.length > 0 ? (
            detail.recentTransactions.map((row) => (
              <TransactionCard
                key={row.event.id}
                eventId={row.event.id}
                merchant={
                  row.merchant?.displayName ??
                  row.event.description ??
                  "Unmapped event"
                }
                merchantLogoUrl={row.merchant?.logoUrl ?? null}
                merchantId={row.merchant?.id ?? row.event.merchantId}
                processor={row.paymentProcessor?.displayName ?? null}
                amount={formatCurrency(
                  row.reportingAmountMinor ?? row.event.amountMinor,
                  row.reportingAmountMinor ? settings.reportingCurrency : row.event.currency,
                )}
                dateLabel={row.event.eventOccurredAt.toISOString()}
                categoryName={row.category?.name ?? detail.category.name}
                categoryId={row.category?.id ?? row.event.categoryId ?? detail.category.id}
                categoryIconName={row.category?.iconName ?? detail.category.iconName}
                categoryColorToken={row.category?.colorToken ?? detail.category.colorToken}
                direction={row.event.direction}
                eventType={row.event.eventType}
                needsReview={row.event.needsReview}
                paymentInstrument={row.paymentInstrument?.displayName ?? null}
                traceCount={1}
                timeZone={settings.timeZone}
              />
            ))
          ) : (
            <AppEmptyState
              compact
              title="No transactions in this period"
              description="No transactions landed in this category in this window."
            />
          )}
        </div>
      </section>
      </section>

      {relatedCategories.length > 0 ? (
        <div className="relative mt-12">
          <HomeCategoryStrip
            items={relatedCategories}
            formatAmount={(amountMinor) =>
              formatCurrency(amountMinor, settings.reportingCurrency)
            }
            excludeCategoryId={detail.category.id}
          />
        </div>
      ) : null}
    </div>
  )
}
