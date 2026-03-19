"use client"

import { useRef } from "react"

import { RiArrowRightSLine } from "@remixicon/react"

import { REPORTING_CURRENCY_OPTIONS } from "@/lib/currency-options"

type ReportingCurrencyRowProps = {
  currentCurrency: string
}

export function ReportingCurrencyRow({
  currentCurrency,
}: ReportingCurrencyRowProps) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action="/api/settings/reporting-currency"
      method="post"
      className="flex items-center justify-between py-4"
    >
      <span className="text-[15px] text-white">display currency</span>
      <div className="flex items-center gap-1">
        <select
          name="reportingCurrency"
          defaultValue={currentCurrency}
          onChange={() => formRef.current?.submit()}
          className="cursor-pointer appearance-none border-none bg-transparent text-right text-[15px] text-white/40 outline-none"
        >
          {REPORTING_CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <RiArrowRightSLine className="size-5 text-white/16" />
      </div>
    </form>
  )
}
