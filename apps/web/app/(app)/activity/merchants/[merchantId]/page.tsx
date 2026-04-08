import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { RiArrowLeftLine } from "@remixicon/react"
import { getMerchantDetailForUser, getUserSettings } from "@workspace/db"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { AppEmptyState } from "@/components/app-empty-state"
import { GlobalTimeframeSelect } from "@/components/global-timeframe-select"
import { MerchantTopCategoriesChart } from "@/components/merchant-top-categories-chart"
import { TransactionCard } from "@/components/transaction-card"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
import {
  appendGlobalTimeframeToHref,
  buildGlobalTimeframeRange,
  GLOBAL_TIMEFRAME_COOKIE_NAME,
  GLOBAL_TIMEFRAME_QUERY_PARAM,
  resolveGlobalTimeframe,
} from "@/lib/global-timeframe"
import { createPrivateMetadata } from "@/lib/metadata"
import { getServerSession, requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
const fallbackMetadata = createPrivateMetadata({
  title: "Merchant",
  description: "Merchant detail in Irene.",
})

type MerchantDetailPageProps = {
  params: Promise<{
    merchantId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
}: MerchantDetailPageProps): Promise<Metadata> {
  const session = await getServerSession()

  if (!session) {
    return fallbackMetadata
  }

  const { merchantId } = await params
  const settings = await getUserSettings(session.user.id)
  const detail = await getMerchantDetailForUser({
    userId: session.user.id,
    merchantId,
    reportingCurrency: settings.reportingCurrency,
    timeZone: settings.timeZone,
  })

  if (!detail) {
    return fallbackMetadata
  }

  return createPrivateMetadata({
    title: detail.merchant.displayName,
    description: `${detail.merchant.displayName} activity in Irene.`,
  })
}

type MerchantAccent = {
  glow: string
  soft: string
  line: string
  amount: string
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

function hashString(input: string) {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }

  return hash
}

function getMerchantAccent(
  displayName: string,
  logoUrl?: string | null
): MerchantAccent {
  const subject = `${displayName} ${logoUrl ?? ""}`.toLowerCase()
  const palettes = [
    {
      glow: "rgba(90, 188, 255, 0.18)",
      soft: "rgba(90, 188, 255, 0.1)",
      line: "#5abcff",
      amount: "#edf5fd",
    },
    {
      glow: "rgba(255, 178, 92, 0.18)",
      soft: "rgba(255, 178, 92, 0.1)",
      line: "#ffb25c",
      amount: "#f8efe2",
    },
    {
      glow: "rgba(255, 126, 104, 0.18)",
      soft: "rgba(255, 126, 104, 0.1)",
      line: "#ff7e68",
      amount: "#f6e6e1",
    },
    {
      glow: "rgba(191, 138, 255, 0.18)",
      soft: "rgba(191, 138, 255, 0.1)",
      line: "#bf8aff",
      amount: "#efe8f9",
    },
    {
      glow: "rgba(102, 237, 182, 0.18)",
      soft: "rgba(102, 237, 182, 0.1)",
      line: "#66edb6",
      amount: "#e4f2eb",
    },
  ] satisfies MerchantAccent[]

  if (subject.includes("google") || subject.includes("microsoft")) {
    return palettes[0]!
  }

  if (subject.includes("amazon")) {
    return palettes[1]!
  }

  if (
    subject.includes("swiggy") ||
    subject.includes("zomato") ||
    subject.includes("food")
  ) {
    return palettes[2]!
  }

  if (
    subject.includes("macpaw") ||
    subject.includes("figma") ||
    subject.includes("adobe")
  ) {
    return palettes[3]!
  }

  if (subject.includes("uber")) {
    return palettes[4]!
  }

  return palettes[hashString(displayName) % palettes.length] ?? palettes[0]!
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

export default async function MerchantDetailPage({
  params,
  searchParams,
}: MerchantDetailPageProps) {
  const cookieStore = await cookies()
  const session = await requireSession()
  const { merchantId } = await params
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

  const detail = await getMerchantDetailForUser({
    userId: session.user.id,
    merchantId,
    reportingCurrency: settings.reportingCurrency,
    timeZone: settings.timeZone,
    dateFrom: timeframeRange.dateFrom,
    dateTo: timeframeRange.dateTo,
    rangePreset: mapTimeframeToRangePreset(timeframe),
  })

  if (!detail) {
    notFound()
  }

  const accent = getMerchantAccent(
    detail.merchant.displayName,
    detail.merchant.logoUrl
  )
  const periodLabel = timeframeRange.label
  const merchantActivityHref = appendGlobalTimeframeToHref(
    `/activity?merchant=${detail.merchant.id}`,
    timeframe
  )

  return (
    <div>
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
              className="mx-auto flex size-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] shadow-[0_12px_30px_rgba(0,0,0,0.16)]"
              style={{
                boxShadow: `0 12px 30px rgba(0,0,0,0.16), 0 0 28px ${accent.soft}`,
              }}
            >
              <Avatar className="size-10 rounded-full bg-white/[0.06]">
                {detail.merchant.logoUrl ? (
                  <AvatarImage
                    src={detail.merchant.logoUrl}
                    alt={detail.merchant.displayName}
                  />
                ) : (
                  <AvatarFallback className="bg-white/[0.06] text-sm font-semibold tracking-wide text-white/60">
                    {getInitials(detail.merchant.displayName)}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>

            <div className="grid gap-1">
              <p className="neo-kicker">Merchant detail</p>
              <h1 className="mx-auto max-w-[12ch] font-display text-[3.25rem] leading-[0.9] tracking-tight text-white md:text-[5rem]">
                {detail.merchant.displayName}
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
                  {detail.summary.averageTransactionMinor > 0 ? (
                    <p className="mt-1 text-xs text-white/42">
                      Avg{" "}
                      {formatCurrency(
                        detail.summary.averageTransactionMinor,
                        settings.reportingCurrency
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] tracking-[0.18em] text-white/28 uppercase">
                    Top category
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {detail.summary.topCategoryName ?? "Still forming"}
                  </p>
                  {detail.summary.shareOfTotalOutflow > 0 ? (
                    <p className="mt-1 text-xs text-white/42">
                      {formatPercent(detail.summary.shareOfTotalOutflow)} of
                      outflow
                    </p>
                  ) : null}
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
              href={merchantActivityHref}
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

        {detail.topCategories.length > 0 ? (
          <section className="mt-10 grid gap-3">
            <div className="grid gap-4">
              <MerchantTopCategoriesChart
                categories={detail.topCategories}
                currency={settings.reportingCurrency}
                timeframe={timeframe}
              />
            </div>
          </section>
        ) : null}

        <section className="mt-10 grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[0.82rem] tracking-[0.18em] text-white/36 uppercase">
              <span>Recent transactions</span>
              <span>({detail.recentTransactions.length})</span>
            </div>
            <Link
              href={merchantActivityHref}
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
                    row.merchant?.displayName ?? detail.merchant.displayName
                  }
                  merchantLogoUrl={
                    row.merchant?.logoUrl ?? detail.merchant.logoUrl ?? null
                  }
                  merchantId={
                    row.merchant?.id ??
                    row.event.merchantId ??
                    detail.merchant.id
                  }
                  processor={row.paymentProcessor?.displayName ?? null}
                  amount={formatCurrency(
                    row.reportingAmountMinor ?? row.event.amountMinor,
                    row.reportingAmountMinor
                      ? settings.reportingCurrency
                      : row.event.currency
                  )}
                  occurredAt={row.event.eventOccurredAt}
                  categoryName={row.category?.name ?? "Uncategorized"}
                  categoryId={row.category?.id ?? row.event.categoryId}
                  categoryIconName={row.category?.iconName}
                  categoryColorToken={row.category?.colorToken}
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
                description="No transactions landed for this merchant in this window."
              />
            )}
          </div>
        </section>
      </section>
    </div>
  )
}
