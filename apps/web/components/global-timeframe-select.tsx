"use client"

import { useTransition } from "react"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RiArrowDownSLine } from "@remixicon/react"
import { Select } from "@workspace/ui/components/select"

import {
  GLOBAL_TIMEFRAME_COOKIE_NAME,
  GLOBAL_TIMEFRAME_OPTIONS,
  GLOBAL_TIMEFRAME_QUERY_PARAM,
  type GlobalTimeframe,
} from "@/lib/global-timeframe"

type GlobalTimeframeSelectProps = {
  value: GlobalTimeframe
  clearKeys?: string[]
  className?: string
}

function persistGlobalTimeframe(timeframe: GlobalTimeframe) {
  document.cookie = `${GLOBAL_TIMEFRAME_COOKIE_NAME}=${timeframe}; path=/; max-age=31536000; samesite=lax`
}

export function GlobalTimeframeSelect({
  value,
  clearKeys = [],
  className,
}: GlobalTimeframeSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  return (
    <div className={className ?? "relative w-[8.8rem] shrink-0"}>
      <Select
        aria-label="Select timeframe"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value as GlobalTimeframe
          const nextSearchParams = new URLSearchParams(searchParams.toString())

          nextSearchParams.set(GLOBAL_TIMEFRAME_QUERY_PARAM, nextValue)

          for (const key of clearKeys) {
            nextSearchParams.delete(key)
          }

          const nextSearch = nextSearchParams.toString()
          const nextHref = nextSearch ? `${pathname}?${nextSearch}` : pathname

          persistGlobalTimeframe(nextValue)

          startTransition(() => {
            router.replace(nextHref)
          })
        }}
        className="h-8 w-full border-0 bg-transparent px-0 pr-4 text-[0.68rem] font-semibold text-white/72 uppercase shadow-none focus:border-0 focus:text-white"
      >
        {GLOBAL_TIMEFRAME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <RiArrowDownSLine className="pointer-events-none absolute top-1/2 right-0.5 size-4 -translate-y-1/2 text-white/48" />
    </div>
  )
}
