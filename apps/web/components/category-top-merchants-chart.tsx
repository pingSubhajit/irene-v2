"use client"

import Link from "next/link"
import { Pie, PieChart, Sector, Tooltip } from "recharts"
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import type { CategoryColorToken } from "@workspace/config/category-presentation"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"

type MerchantSlice = {
  merchantId: string | null
  merchantName: string
  merchantLogoUrl: string | null
  spendMinor: number
  shareOfCategorySpend: number
  transactionCount: number
}

const chartConfig = {
  spend: {
    label: "Spend share",
    color: "#f8a23e",
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

function getCategorySliceColors(
  colorToken: CategoryColorToken | null | undefined,
) {
  switch (colorToken) {
    case "yellow":
      return ["#ffd95f", "#ffe78e", "#fff0b5", "#f4c852", "#ddaa39"] as const
    case "green":
      return ["#58efb1", "#82f5c7", "#acf7da", "#35d39a", "#1fb97f"] as const
    case "violet":
      return ["#b488ff", "#c9a7ff", "#decbff", "#9260ef", "#7646d5"] as const
    case "blue":
      return ["#72c8ff", "#97d9ff", "#bee9ff", "#46acf0", "#2e8fd7"] as const
    case "coral":
      return ["#ff9b7b", "#ffb8a1", "#ffd2c3", "#ef7554", "#d55a3a"] as const
    case "graphite":
      return ["#d3dcff", "#e0e6ff", "#edf0ff", "#abb9f0", "#8798d4"] as const
    case "cream":
    default:
      return ["#ffde92", "#ffebba", "#fff3d8", "#f1c66a", "#dca645"] as const
  }
}

export function CategoryTopMerchantsChart({
  merchants,
  currency,
  colorToken,
}: {
  merchants: MerchantSlice[]
  currency: string
  colorToken?: CategoryColorToken | null
}) {
  const leadMerchant = merchants[0] ?? null
  const sliceColors = getCategorySliceColors(colorToken)

  const data = merchants.map((merchant, index) => ({
    name: merchant.merchantName,
    value: merchant.spendMinor / 100,
    spendMinor: merchant.spendMinor,
    share: merchant.shareOfCategorySpend,
    transactionCount: merchant.transactionCount,
    fill: sliceColors[index % sliceColors.length],
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
                          {formatPercent(point.share)} of this category
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
              className="font-sans text-[18px] font-semibold"
            >
              {leadMerchant ? formatCurrency(leadMerchant.spendMinor, currency) : formatCurrency(0, currency)}
            </text>
            <text
              x="50%"
              y="59%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={sliceColors[0]}
              className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em]"
            >
              {leadMerchant ? leadMerchant.merchantName.slice(0, 18).toUpperCase() : "NO MERCHANT"}
            </text>
          </PieChart>
        </ChartContainer>
      </div>

      <div className="-mt-12 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {merchants.map((merchant, index) => (
          <Link
            key={`${merchant.merchantId ?? merchant.merchantName}-${index}`}
            href={
              merchant.merchantId
                ? `/activity/merchants/${merchant.merchantId}`
                : "#"
            }
            className={merchant.merchantId ? "block transition hover:bg-white/[0.02]" : "pointer-events-none block"}
          >
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar className="size-9 shrink-0 rounded-full bg-white/[0.05]">
                  {merchant.merchantLogoUrl ? (
                    <AvatarImage src={merchant.merchantLogoUrl} alt={merchant.merchantName} />
                  ) : (
                    <AvatarFallback className="bg-white/[0.05] text-[0.68rem] font-semibold tracking-wide text-white/48">
                      {getInitials(merchant.merchantName)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[15px] font-medium"
                    style={{
                      color: sliceColors[index % sliceColors.length],
                    }}
                  >
                    {merchant.merchantName}
                  </p>
                  <p className="mt-1 text-sm text-white/38">
                    {merchant.transactionCount}{" "}
                    {merchant.transactionCount === 1 ? "transaction" : "transactions"} ·{" "}
                    {formatPercent(merchant.shareOfCategorySpend)}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-semibold text-white tabular-nums">
                  {formatCurrency(merchant.spendMinor, currency)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
