"use client"

import { Bar, BarChart, Tooltip } from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"

const chartConfig = {
  amount: {
    label: "Spend",
    color: "rgba(255, 255, 255, 0.25)",
  },
} satisfies ChartConfig

export function DailySpendChart({
  data,
  currency,
}: {
  data: { label: string; amount: number; originalCurrencies: string[] }[]
  currency: string
}) {
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  })

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[100px] w-full"
    >
      <BarChart
        data={data}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        barCategoryGap={1}
      >
        <Tooltip
          content={
            <ChartTooltipContent
              labelFormatter={(
                _label: unknown,
                payload?: Array<{
                  payload?: {
                    label?: string
                  }
                }>
              ) => {
                return payload?.[0]?.payload?.label ?? ""
              }}
              formatter={(
                _value: unknown,
                _name: unknown,
                item: {
                  payload?: {
                    amount: number
                    originalCurrencies: string[]
                  }
                }
              ) => {
                const point = item.payload

                if (!point) {
                  return null
                }

                const currencies = point.originalCurrencies.filter(
                  (code) => code !== currency
                )

                return (
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />
                      <span className="text-muted-foreground">Spend</span>
                      <span className="ml-auto font-medium text-foreground">
                        {formatter.format(point.amount)}
                      </span>
                    </div>
                    {currencies.length > 0 ? (
                      <div className="text-[0.7rem] text-muted-foreground">
                        Includes {Array.from(new Set(currencies)).join(", ")}{" "}
                        normalized to {currency}.
                      </div>
                    ) : null}
                  </div>
                )
              }}
            />
          }
          cursor={false}
        />
        <Bar
          dataKey="amount"
          fill="rgba(255, 255, 255, 0.9)"
          radius={0}
          activeBar={{
            fill: "#ffffff",
          }}
        />
      </BarChart>
    </ChartContainer>
  )
}
