"use client"

import { useTransition } from "react"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RiArrowDownSLine } from "@remixicon/react"
import { Select } from "@workspace/ui/components/select"

type DashboardTimeframe = "week" | "month" | "year"

export function DashboardTimeframeSelect({
  value,
}: {
  value: DashboardTimeframe
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  return (
    <div className="relative w-[7.15rem] shrink-0">
      <Select
        aria-label="Select dashboard timeframe"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value as DashboardTimeframe
          const nextSearchParams = new URLSearchParams(searchParams.toString())

          if (nextValue === "month") {
            nextSearchParams.delete("range")
          } else {
            nextSearchParams.set("range", nextValue)
          }

          const nextSearch = nextSearchParams.toString()
          const nextHref = nextSearch ? `${pathname}?${nextSearch}` : pathname

          startTransition(() => {
            router.replace(nextHref)
          })
        }}
        className="h-8 w-full border-0 bg-transparent px-0 pr-4 text-[0.68rem] font-semibold text-white/72 uppercase shadow-none focus:border-0 focus:text-white"
      >
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="year">This year</option>
      </Select>
      <RiArrowDownSLine className="pointer-events-none absolute top-1/2 right-0.5 size-4 -translate-y-1/2 text-white/48" />
    </div>
  )
}
