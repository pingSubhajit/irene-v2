import Link from "next/link"

import { RiArrowRightLine } from "@remixicon/react"

import { Card } from "@workspace/ui/components/card"

type ForecastOverviewCardProps = {
  label: string
  headline: string
  amount: string
  amountCaption: string
  metrics: Array<{ label: string; value: string }>
  actionHref: string
  actionLabel: string
}

export function ForecastOverviewCard({
  label,
  headline,
  amount,
  amountCaption,
  metrics,
  actionHref,
  actionLabel,
}: ForecastOverviewCardProps) {
  return (
    <Card variant="spotlight" className="overflow-hidden">
      <div className="relative z-10 grid gap-6 p-6">
        <div>
          <p className="text-[0.6rem] font-bold tracking-[0.34em] uppercase text-white/50">
            {label}
          </p>
          <h2 className="mt-2 max-w-[12ch] font-display text-[2rem] leading-[0.92] text-white md:text-[2.6rem]">
            {headline}
          </h2>
        </div>

        <div>
          <p className="font-display text-[3.2rem] leading-none tracking-tight text-white md:text-[4.2rem]">
            {amount}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/62">
            {amountCaption}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-white/34">
                {metric.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{metric.value}</p>
            </div>
          ))}
        </div>

        <div>
          <Link
            href={actionHref}
            className="neo-btn-3d neo-btn-3d-yellow inline-flex h-12 items-center gap-2 border border-[rgba(255,231,90,0.35)] bg-[var(--neo-yellow)] px-5 text-sm font-semibold text-[var(--neo-black)] transition-all"
          >
            {actionLabel}
            <RiArrowRightLine className="size-4" />
          </Link>
        </div>
      </div>

      <div className="pointer-events-none absolute -top-8 -right-8 size-32 rotate-12 bg-white/8" />
      <div className="pointer-events-none absolute -bottom-8 -left-6 h-14 w-28 rotate-3 bg-white/6" />
    </Card>
  )
}
