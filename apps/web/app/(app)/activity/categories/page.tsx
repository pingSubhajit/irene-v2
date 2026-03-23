import Link from "next/link"
import { RiArrowLeftLine } from "@remixicon/react"
import {
  getUserSettings,
  listCategoriesForUser,
} from "@workspace/db"
import { listDashboardLedgerEventsForUser } from "@workspace/db"

import { CategoryExplorerTile } from "@/components/category-explorer-tile"
import { summarizeCategoryActivity } from "@/lib/category-summary"
import { ensureUserFinancialEventValuationCoverage } from "@/lib/fx-valuation"
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
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(0)}`
  }
}

export default async function CategoriesIndexPage() {
  const session = await requireSession()
  const settings = await getUserSettings(session.user.id)
  const monthStart = startOfCurrentMonth()

  await ensureUserFinancialEventValuationCoverage(session.user.id, {
    dateFrom: monthStart,
    limit: 360,
  })

  const [categories, monthEvents] = await Promise.all([
    listCategoriesForUser(session.user.id),
    listDashboardLedgerEventsForUser({
      userId: session.user.id,
      targetCurrency: settings.reportingCurrency,
      dateFrom: monthStart,
      limit: 360,
    }),
  ])

  const activitySummaries = summarizeCategoryActivity(monthEvents)
  const activityByCategoryId = new Map(
    activitySummaries.map((summary) => [summary.id, summary]),
  )

  const sortedCategories = categories
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

  const activeCount = sortedCategories.filter(
    (category) => category.totalOutflowMinor > 0,
  ).length

  return (
    <section className="grid gap-8">
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-white/46 transition hover:text-white"
        >
          <RiArrowLeftLine className="size-4" />
          Back to home
        </Link>
      </div>

      <div className="grid gap-3 text-center">
        <p className="neo-kicker">Category board</p>
        <h1 className="mx-auto max-w-[12ch] font-display text-[3rem] leading-[0.92] text-white md:text-[4.5rem]">
          everything your month is spending through
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-white/52">
          A quieter view of the categories Irene is tracking this month, ordered by actual outflow before the quieter corners.
        </p>
        <p className="text-[0.82rem] uppercase tracking-[0.18em] text-white/28">
          {activeCount} active this month
        </p>
      </div>

      {sortedCategories.length > 0 ? (
        <div className="grid grid-cols-3 gap-x-5 gap-y-8 sm:gap-x-6 sm:gap-y-10">
          {sortedCategories.map((category) => (
            <div key={category.id} className="grid gap-3">
              <CategoryExplorerTile
                href={`/activity/categories/${category.id}`}
                label={category.name}
                amountLabel={
                  category.totalOutflowMinor > 0
                    ? formatCurrency(
                        category.totalOutflowMinor,
                        settings.reportingCurrency,
                      )
                    : null
                }
                iconName={category.iconName}
                colorToken={category.colorToken}
                variant="grid"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] p-6 text-center text-sm leading-6 text-white/54">
          Category tiles appear once reconciled activity starts clustering into the month.
        </div>
      )}
    </section>
  )
}
