import Link from "next/link"
import { notFound } from "next/navigation"
import {
  RiArrowLeftLine,
  RiArrowRightSLine,
} from "@remixicon/react"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import {
  getCategoryDetailForUser,
  getUserSettings,
} from "@workspace/db"
import type { CategoryColorToken } from "@workspace/config"

import { CategoryBadge } from "@/components/category-badge"
import { TransactionCard } from "@/components/transaction-card"
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

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1))
      .join("")
      .toUpperCase() || "?"
  )
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

  await ensureUserFinancialEventValuationCoverage(session.user.id, {
    dateFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    limit: 600,
  })

  const detail = await getCategoryDetailForUser({
    userId: session.user.id,
    categoryId,
    reportingCurrency: settings.reportingCurrency,
    timeZone: settings.timeZone,
    monthKey: asSingleValue(query.month) ?? null,
    week: (() => {
      const value = Number(asSingleValue(query.week))
      return value >= 1 && value <= 4 ? value : null
    })(),
  })

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
      <section className="relative mx-auto grid w-full max-w-4xl gap-8">
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
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] shadow-[0_12px_30px_rgba(0,0,0,0.16)]">
              <CategoryBadge
                categoryName={detail.category.name}
                iconName={detail.category.iconName}
                colorToken={detail.category.colorToken}
                className="size-5"
              />
            </div>

            <div className="grid gap-1">
              <p className="neo-kicker">Category detail</p>
              <h1 className="mx-auto max-w-[12ch] font-display text-[3.25rem] leading-[0.9] tracking-tight text-white md:text-[5rem]">
                {detail.category.name}
              </h1>
            </div>

            <div className="grid gap-5">
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

      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[0.82rem] uppercase tracking-[0.18em] text-white/32">
            {detail.mode === "month" ? "Monthly view" : "Current month by week"}
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
                <div className="h-px w-full bg-white/16 transition group-hover:bg-white/34" />
                <div
                  className="mt-2 h-0.5 w-full transition"
                  style={{
                    backgroundColor: isActive ? accent.line : "transparent",
                    boxShadow: isActive ? `0 0 18px ${accent.glow}` : "none",
                  }}
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-sm uppercase tracking-[0.18em] text-white/34 transition group-hover:text-white/60">
                  <span>{"label" in bucket ? bucket.label : ""}</span>
                  <span>
                    {formatCurrency(bucket.totalMinor, settings.reportingCurrency)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="neo-panel p-5 md:p-6">
          <p className="neo-kicker">Category overview</p>
          <div className="mt-5 grid gap-4">
            <MetricRow
              label="total spend"
              value={formatCurrency(detail.summary.totalOutflowMinor, settings.reportingCurrency)}
              accentColor={accent.line}
            />
            <MetricRow
              label="transactions"
              value={String(detail.summary.transactionCount)}
            />
            <MetricRow
              label="average ticket"
              value={formatCurrency(
                detail.summary.averageTransactionMinor,
                settings.reportingCurrency,
              )}
            />
            <MetricRow
              label="share of outflow"
              value={formatPercent(detail.summary.shareOfTotalOutflow)}
            />
          </div>
          <div
            className="mt-6 border border-white/[0.06] px-4 py-4 text-sm leading-6 text-white/44"
            style={{ backgroundColor: accent.soft }}
          >
            {detail.summary.topMerchantName
              ? `${detail.summary.topMerchantName} contributed the most to ${detail.category.name.toLowerCase()} during this period.`
              : `No merchant stands out yet for ${detail.category.name.toLowerCase()} in this period.`}
          </div>
        </div>

        <div className="neo-panel p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="neo-kicker">Top merchants</p>
              <h2 className="mt-3 text-[1.35rem] font-medium text-white">
                where this category concentrated
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {detail.topMerchants.length > 0 ? (
              detail.topMerchants.map((merchant, index) => (
                <div
                  key={`${merchant.merchantId ?? merchant.merchantName}-${index}`}
                  className="flex items-center gap-3 border border-white/[0.06] bg-[rgba(255,255,255,0.02)] px-4 py-4"
                >
                  <Avatar className="size-11 rounded-full bg-white/[0.07]">
                    {merchant.merchantLogoUrl ? (
                      <AvatarImage src={merchant.merchantLogoUrl} alt={merchant.merchantName} />
                    ) : (
                      <AvatarFallback className="bg-white/[0.07] text-xs font-semibold tracking-wide text-white/50">
                        {getInitials(merchant.merchantName)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-white/24">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="truncate text-[15px] font-medium text-white">
                        {merchant.merchantName}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-white/38">
                      {merchant.transactionCount} {merchant.transactionCount === 1 ? "transaction" : "transactions"} ·{" "}
                      {formatPercent(merchant.shareOfCategorySpend)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-semibold text-white tabular-nums">
                    {formatCurrency(merchant.spendMinor, settings.reportingCurrency)}
                  </p>
                </div>
              ))
            ) : (
              <div className="border border-dashed border-white/[0.08] px-4 py-5 text-sm leading-6 text-white/42">
                No merchant concentration is available for this period yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="neo-panel p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="neo-kicker">Recent transactions</p>
            <h2 className="mt-3 text-[1.35rem] font-medium text-white">
              movement inside this category
            </h2>
          </div>
          <Link
            href={categoryActivityHref}
            className="text-sm text-white/50 transition hover:text-white"
          >
            open filtered feed
            <RiArrowRightSLine className="ml-1 inline size-4" />
          </Link>
        </div>

        <div className="mt-5 divide-y divide-white/[0.06]">
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
                processor={row.paymentProcessor?.displayName ?? null}
                amount={formatCurrency(
                  row.reportingAmountMinor ?? row.event.amountMinor,
                  row.reportingAmountMinor ? settings.reportingCurrency : row.event.currency,
                )}
                dateLabel={row.event.eventOccurredAt.toISOString()}
                categoryName={row.category?.name ?? detail.category.name}
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
            <div className="border border-dashed border-white/[0.08] px-4 py-5 text-sm leading-6 text-white/42">
              No transactions landed in this category for the selected period.
            </div>
          )}
        </div>
      </div>
      </section>
    </div>
  )
}

function MetricRow({
  label,
  value,
  accentColor,
}: {
  label: string
  value: string
  accentColor?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm uppercase tracking-[0.18em] text-white/28">
        {label}
      </span>
      <span
        className="text-base font-medium text-white tabular-nums"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </span>
    </div>
  )
}
