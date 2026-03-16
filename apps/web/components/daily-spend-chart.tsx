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
}: {
  data: { day: number; amount: number }[]
}) {
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
              labelFormatter={(_, payload) => {
                const day = payload?.[0]?.payload?.day
                return day ? `Day ${day}` : ""
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
