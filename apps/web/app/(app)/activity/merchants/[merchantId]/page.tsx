import Link from "next/link"
import { notFound } from "next/navigation"
import { RiArrowLeftLine } from "@remixicon/react"
import { getMerchantDetailForUser, getUserSettings } from "@workspace/db"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"

import { AppEmptyState } from "@/components/app-empty-state"
import { MerchantTopCategoriesChart } from "@/components/merchant-top-categories-chart"
import { TransactionCard } from "@/components/transaction-card"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type MerchantDetailPageProps = {
  params: Promise<{
    merchantId: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type MerchantAccent = {
  glow: string
  soft: string
  line: string
  amount: string
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

function hashString(input: string) {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0
  }

  return hash
}

function getMerchantAccent(displayName: string, logoUrl?: string | null): MerchantAccent {
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

  if (subject.includes("macpaw") || subject.includes("figma") || subject.includes("adobe")) {
    return palettes[3]!
  }

  if (subject.includes("uber")) {
    return palettes[4]!
  }

  return palettes[hashString(displayName) % palettes.length] ?? palettes[0]!
}

export default async function MerchantDetailPage({
  params,
  searchParams,
}: MerchantDetailPageProps) {
  const session = await requireSession()
  const { merchantId } = await params
  const query = (await searchParams) ?? {}

  const settings = await getUserSettings(session.user.id)

  await ensureUserFinancialEventValuationCoverage(session.user.id, {
    dateFrom: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    limit: 600,
  })

  const detail = await getMerchantDetailForUser({
    userId: session.user.id,
    merchantId,
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

  const accent = getMerchantAccent(detail.merchant.displayName, detail.merchant.logoUrl)
  const periodLabel =
    detail.mode === "month"
      ? formatMonthLabel(detail.selectedMonthKey ?? "")
      : `${formatMonthLabel(detail.selectedMonthKey ?? "")} · W${detail.selectedWeek ?? 1}`

  const merchantActivityHref = (() => {
    const search = new URLSearchParams()
    search.append("merchant", detail.merchant.id)

    if (detail.mode === "month") {
      const bucket = detail.monthBuckets.find((row) => row.monthKey === detail.selectedMonthKey)
      if (bucket) {
        const [year, month] = bucket.monthKey.split("-")
        const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
        search.set("dateFrom", `${bucket.monthKey}-01`)
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
    <div>
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
                  {detail.summary.averageTransactionMinor > 0 ? (
                    <p className="mt-1 text-xs text-white/42">
                      Avg{" "}
                      {formatCurrency(
                        detail.summary.averageTransactionMinor,
                        settings.reportingCurrency,
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="px-3 py-3">
                  <p className="text-[0.64rem] uppercase tracking-[0.18em] text-white/28">
                    Top category
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/82">
                    {detail.summary.topCategoryName ?? "Still forming"}
                  </p>
                  {detail.summary.shareOfTotalOutflow > 0 ? (
                    <p className="mt-1 text-xs text-white/42">
                      {formatPercent(detail.summary.shareOfTotalOutflow)} of outflow
                    </p>
                  ) : null}
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
              href={merchantActivityHref}
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
                  ? `/activity/merchants/${detail.merchant.id}?month=${"monthKey" in bucket ? bucket.monthKey : ""}`
                  : `/activity/merchants/${detail.merchant.id}?week=${"week" in bucket ? bucket.week : ""}`

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

        {detail.topCategories.length > 0 ? (
          <section className="mt-10 grid gap-3">
            <div className="grid gap-4">
              <MerchantTopCategoriesChart
                categories={detail.topCategories}
                currency={settings.reportingCurrency}
              />
            </div>
          </section>
        ) : null}

        <section className="mt-10 grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.18em] text-white/36">
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
                merchant={row.merchant?.displayName ?? detail.merchant.displayName}
                merchantLogoUrl={row.merchant?.logoUrl ?? detail.merchant.logoUrl ?? null}
                merchantId={row.merchant?.id ?? row.event.merchantId ?? detail.merchant.id}
                processor={row.paymentProcessor?.displayName ?? null}
                amount={formatCurrency(
                  row.reportingAmountMinor ?? row.event.amountMinor,
                    row.reportingAmountMinor ? settings.reportingCurrency : row.event.currency,
                )}
                dateLabel={row.event.eventOccurredAt.toISOString()}
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
