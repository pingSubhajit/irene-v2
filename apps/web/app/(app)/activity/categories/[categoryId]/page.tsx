import type { Metadata } from "next"
import { cookies } from "next/headers"
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
import { GlobalTimeframeSelect } from "@/components/global-timeframe-select"
import { HomeCategoryStrip } from "@/components/home-category-strip"
import { TransactionCard } from "@/components/transaction-card"
import { summarizeCategoryActivity } from "@/lib/category-summary"
import {
  GLOBAL_TIMEFRAME_COOKIE_NAME,
  GLOBAL_TIMEFRAME_QUERY_PARAM,
  resolveGlobalTimeframe,
  buildGlobalTimeframeRange,
  appendGlobalTimeframeToHref,
} from "@/lib/global-timeframe"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
import { createPrivateMetadata } from "@/lib/metadata"
import { getServerSession, requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
const fallbackMetadata = createPrivateMetadata({
  title: "Category",
  description: "Category detail in Irene.",
})

type CategoryDetailPageProps = {
  params: Promise<{
    categoryId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
}: CategoryDetailPageProps): Promise<Metadata> {
  const session = await getServerSession()

  if (!session) {
    return fallbackMetadata
  }

  const { categoryId } = await params
  const settings = await getUserSettings(session.user.id)
  const detail = await getCategoryDetailForUser({
    userId: session.user.id,
    categoryId,
    reportingCurrency: settings.reportingCurrency,
    timeZone: settings.timeZone,
  })

  if (!detail) {
    return fallbackMetadata
  }

  return createPrivateMetadata({
    title: detail.category.name,
    description: `${detail.category.name} activity in Irene.`,
  })
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

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value)
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

function mapTimeframeToRangePreset(
  timeframe: ReturnType<typeof resolveGlobalTimeframe>
) {
  switch (timeframe) {
    case "this_week":
      return "this_week" as const
    case "this_month":
      return "this_month" as const
    case "last_three_months":
      return "last_three_months" as const
    case "this_year":
      return "this_year" as const
  }
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: CategoryDetailPageProps) {
  const cookieStore = await cookies()
  const session = await requireSession()
  const { categoryId } = await params
  const query = (await searchParams) ?? {}

  const settings = await getUserSettings(session.user.id)
  const timeframe = resolveGlobalTimeframe(
    (Array.isArray(query[GLOBAL_TIMEFRAME_QUERY_PARAM])
      ? query[GLOBAL_TIMEFRAME_QUERY_PARAM]?.[0]
      : query[GLOBAL_TIMEFRAME_QUERY_PARAM]) ??
      cookieStore.get(GLOBAL_TIMEFRAME_COOKIE_NAME)?.value
  )
  const timeframeRange = buildGlobalTimeframeRange(timeframe, settings.timeZone)

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
      dateFrom: timeframeRange.dateFrom,
      dateTo: timeframeRange.dateTo,
      rangePreset: mapTimeframeToRangePreset(timeframe),
    }),
    listCategoriesForUser(session.user.id),
    listDashboardLedgerEventsForUser({
      userId: session.user.id,
      targetCurrency: settings.reportingCurrency,
      dateFrom: timeframeRange.dateFrom,
      dateTo: timeframeRange.dateTo,
      limit: 240,
    }),
  ])

  if (!detail) {
    notFound()
  }

  const accent = getAccentStyles(detail.category.colorToken)
  const periodLabel = timeframeRange.label
  const categoryActivityHref = appendGlobalTimeframeToHref(
    `/activity?category=${detail.category.slug}`,
    timeframe
  )

  const activitySummaries = summarizeCategoryActivity(monthEvents)
  const activityByCategoryId = new Map(
    activitySummaries.map((summary) => [summary.id, summary])
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
        className="pointer-events-none absolute top-[-10rem] left-1/2 h-[30rem] w-[100vw] -translate-x-1/2 blur-3xl"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${accent.glow}, transparent 72%)`,
        }}
      />
      <div
        className="pointer-events-none absolute top-[-2rem] left-1/2 h-[24rem] w-[100vw] -translate-x-1/2 blur-[120px]"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${accent.soft}, transparent 74%)`,
        }}
      />
      <section className="relative mx-auto grid w-full max-w-4xl min-w-0 gap-8">
        <div className="flex items-center justify-between gap-4 pt-2">
          <Link
            href={appendGlobalTimeframeToHref("/activity", timeframe)}
            className="inline-flex items-center gap-2 text-sm text-white/46 transition hover:text-white"
          >
            <RiArrowLeftLine className="size-4" />
            Back to activity
          </Link>
          <GlobalTimeframeSelect value={timeframe} />
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
                {formatCurrency(
                  detail.summary.totalOutflowMinor,
                  settings.reportingCurrency
                )}
              </p>
              <div className="mx-auto grid w-full max-w-2xl grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.06]">
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] tracking-[0.18em] text-white/28 uppercase">
                    Period
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {periodLabel}
                  </p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] tracking-[0.18em] text-white/28 uppercase">
                    Activity
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {detail.summary.transactionCount}{" "}
                    {detail.summary.transactionCount === 1
                      ? "transaction"
                      : "transactions"}
                  </p>
                  {detail.summary.shareOfTotalOutflow > 0 ? (
                    <p className="mt-1 text-xs text-white/42">
                      {formatPercent(detail.summary.shareOfTotalOutflow)} of
                      outflow
                    </p>
                  ) : null}
                </div>
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] tracking-[0.18em] text-white/28 uppercase">
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-[0.82rem] tracking-[0.18em] text-white/32 uppercase">
              {timeframeRange.label}
            </div>
            <Link
              href={categoryActivityHref}
              className="text-sm text-white/50 transition hover:text-white"
            >
              view all activity
            </Link>
          </div>
          {detail.rangeBuckets.length > 0 ? (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${detail.rangeBuckets.length}, minmax(0, 1fr))`,
              }}
            >
              {detail.rangeBuckets.map((bucket) => (
                <div key={bucket.key}>
                  <div className="relative h-2">
                    <div className="absolute inset-x-0 top-0 h-px bg-white/16" />
                    <div
                      className="absolute inset-x-0 top-0 h-0.5"
                      style={{
                        backgroundColor:
                          bucket.transactionCount > 0
                            ? accent.line
                            : "rgba(255,255,255,0.1)",
                        boxShadow:
                          bucket.transactionCount > 0
                            ? `0 0 18px ${accent.glow}`
                            : "none",
                      }}
                    />
                  </div>
                  <div className="mt-2 min-w-0">
                    <span className="block truncate text-[0.62rem] tracking-[0.18em] text-white/32 uppercase">
                      {bucket.label}
                    </span>
                    <span className="mt-1 block truncate text-[0.9rem] font-medium tracking-[-0.01em] text-white/54">
                      {formatCurrency(
                        bucket.totalMinor,
                        settings.reportingCurrency
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {detail.topMerchants.length > 0 ? (
          <div className="mt-10 grid min-w-0 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="min-w-0 px-1 md:px-0">
              <div className="grid gap-4">
                <CategoryTopMerchantsChart
                  merchants={detail.topMerchants}
                  currency={settings.reportingCurrency}
                  colorToken={detail.category.colorToken}
                  timeframe={timeframe}
                />
              </div>
            </div>
          </div>
        ) : null}

        <section className="mt-10 grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[0.82rem] tracking-[0.18em] text-white/36 uppercase">
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
                    row.reportingAmountMinor
                      ? settings.reportingCurrency
                      : row.event.currency
                  )}
                  occurredAt={row.event.eventOccurredAt}
                  categoryName={row.category?.name ?? detail.category.name}
                  categoryId={
                    row.category?.id ??
                    row.event.categoryId ??
                    detail.category.id
                  }
                  categoryIconName={
                    row.category?.iconName ?? detail.category.iconName
                  }
                  categoryColorToken={
                    row.category?.colorToken ?? detail.category.colorToken
                  }
                  direction={row.event.direction}
                  eventType={row.event.eventType}
                  needsReview={row.event.needsReview}
                  paymentInstrument={row.paymentInstrument?.displayName ?? null}
                  traceCount={1}
                  timeZone={settings.timeZone}
                  timeframe={timeframe}
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
            timeframe={timeframe}
          />
        </div>
      ) : null}
    </div>
  )
}
