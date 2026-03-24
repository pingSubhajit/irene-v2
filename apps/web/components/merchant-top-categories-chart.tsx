"use client"

import Link from "next/link"
import { Pie, PieChart, Sector, Tooltip } from "recharts"
import type {
  CategoryColorToken,
  CategoryIconName,
} from "@workspace/config/category-presentation"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"

import { CategoryBadge } from "./category-badge"

type CategorySlice = {
  categoryId: string | null
  categoryName: string
  categorySlug: string | null
  categoryIconName: CategoryIconName | null
  categoryColorToken: CategoryColorToken | null
  spendMinor: number
  shareOfMerchantSpend: number
  transactionCount: number
}

const chartConfig = {
  spend: {
    label: "Spend mix",
    color: "#7cc8ff",
  },
} satisfies ChartConfig

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

function getCategorySliceColor(
  colorToken: CategoryColorToken | null | undefined,
  index: number,
) {
  const byToken: Record<CategoryColorToken, [string, string]> = {
    yellow: ["#ffd75f", "#efbc3b"],
    green: ["#5bf0b6", "#29c98c"],
    violet: ["#b68bff", "#8b59ec"],
    blue: ["#78caff", "#4ca5ef"],
    coral: ["#ff9d81", "#ee7556"],
    graphite: ["#d5ddff", "#a7b6ef"],
    cream: ["#ffe3a2", "#d7b26a"],
  }

  const pair = byToken[colorToken ?? "cream"] ?? byToken.cream
  return index % 2 === 0 ? pair[0] : pair[1]
}

export function MerchantTopCategoriesChart({
  categories,
  currency,
}: {
  categories: CategorySlice[]
  currency: string
}) {
  const activeCategoryCount = categories.filter((category) => category.spendMinor > 0).length

  const data = categories.map((category, index) => ({
    name: category.categoryName,
    value: category.spendMinor / 100,
    spendMinor: category.spendMinor,
    share: category.shareOfMerchantSpend,
    transactionCount: category.transactionCount,
    categoryId: category.categoryId,
    categorySlug: category.categorySlug,
    categoryIconName: category.categoryIconName,
    categoryColorToken: category.categoryColorToken,
    fill: getCategorySliceColor(category.categoryColorToken, index),
  }))

  return (
    <div className="grid gap-8">
      <div className="mx-auto grid justify-items-center gap-4">
        <ChartContainer
          config={chartConfig}
          className="aspect-square h-[16.5rem] w-full max-w-[19rem]"
        >
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Tooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(
                    _value: unknown,
                    _name: unknown,
                    item: {
                      payload?: {
                        name: string
                        spendMinor: number
                        share: number
                      }
                      color?: string
                    },
                  ) => {
                    const point = item.payload

                    if (!point) {
                      return null
                    }

                    return (
                      <div className="grid min-w-[11rem] gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: item.color ?? "#fff" }}
                          />
                          <span className="text-muted-foreground">{point.name}</span>
                          <span className="ml-auto font-medium text-foreground">
                            {formatCurrency(point.spendMinor, currency)}
                          </span>
                        </div>
                        <div className="text-[0.72rem] text-muted-foreground">
                          {formatPercent(point.share)} of this merchant
                        </div>
                      </div>
                    )
                  }}
                />
              }
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={78}
              outerRadius={106}
              startAngle={215}
              endAngle={-35}
              paddingAngle={3}
              cornerRadius={10}
              activeIndex={0}
              activeShape={(props: unknown) => {
                const sectorProps = props as Record<string, unknown> & {
                  outerRadius?: number
                }

                return (
                  <Sector
                    {...sectorProps}
                    outerRadius={
                      typeof sectorProps.outerRadius === "number"
                        ? sectorProps.outerRadius + 2
                        : 108
                    }
                  />
                )
              }}
              stroke="rgba(10,10,12,0.96)"
              strokeWidth={6}
            />
            <circle cx="50%" cy="50%" r="58" fill="rgba(22,22,24,0.96)" />
            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
              className="font-sans text-[20px] font-semibold"
            >
              {activeCategoryCount}
            </text>
            <text
              x="50%"
              y="59%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.54)"
              className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em]"
            >
              categories
            </text>
          </PieChart>
        </ChartContainer>
      </div>

      <div className="-mt-12 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {categories.map((category, index) => {
          const content = (
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.03] ring-1 ring-white/[0.06]">
                  <CategoryBadge
                    categoryName={category.categoryName}
                    iconName={category.categoryIconName}
                    colorToken={category.categoryColorToken}
                    className="size-5"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[15px] font-medium"
                    style={{
                      color: getCategorySliceColor(category.categoryColorToken, index),
                    }}
                  >
                    {category.categoryName}
                  </p>
                  <p className="mt-1 text-sm text-white/38">
                    {category.transactionCount}{" "}
                    {category.transactionCount === 1 ? "transaction" : "transactions"} ·{" "}
                    {formatPercent(category.shareOfMerchantSpend)}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-semibold text-white tabular-nums">
                  {formatCurrency(category.spendMinor, currency)}
                </p>
              </div>
            </div>
          )

          if (category.categoryId) {
            return (
              <Link
                key={`${category.categoryId}-${index}`}
                href={`/activity/categories/${category.categoryId}`}
                className="block transition hover:bg-white/[0.02]"
              >
                {content}
              </Link>
            )
          }

          return (
            <div key={`${category.categoryName}-${index}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
