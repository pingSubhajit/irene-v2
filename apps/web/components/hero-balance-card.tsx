import Link from "next/link"

import {
  RiArrowDownLine,
  RiArrowRightLine,
  RiRefund2Line,
  RiSwapLine,
} from "@remixicon/react"

import { Card } from "@workspace/ui/components/card"

import { DailySpendChart } from "./daily-spend-chart"

type HeroBalanceCardProps = {
  label: string
  headline: string
  amount: string
  amountCaption?: string
  income: string
  netFlow: string
  netFlowDirection: "positive" | "negative" | "zero"
  refunds: string
  dailySpend: { day: number; amount: number; originalCurrencies: string[] }[]
  reportingCurrency: string
  actionHref?: string
  actionLabel?: string
  accent?: "yellow" | "green" | "violet"
}

export function HeroBalanceCard({
  label,
  headline,
  amount,
  amountCaption,
  income,
  netFlow,
  netFlowDirection,
  refunds,
  dailySpend,
  reportingCurrency,
  actionHref,
  actionLabel,
  accent = "yellow",
}: HeroBalanceCardProps) {
  return (
    <Card variant="spotlight" className="overflow-hidden">
      <div className="relative z-10 p-6 pb-0">
        <p className="text-[0.6rem] font-bold tracking-[0.34em] uppercase text-white/50">
          {label}
        </p>
        <h1 className="mt-1 max-w-[16ch] font-display text-[1.8rem] leading-[0.95] text-white md:text-[2.4rem]">
          {headline}
        </h1>
      </div>

      <div className="relative z-10 px-6 pt-2 pb-6">
        <p className="font-display text-[3.4rem] leading-none tracking-tight text-white md:text-[4.2rem]">
          {amount}
        </p>
        {amountCaption ? (
          <p className="mt-3 max-w-xl text-xs leading-5 text-white/60">
            {amountCaption}
          </p>
        ) : null}

        <div className="mt-5">
          <DailySpendChart data={dailySpend} currency={reportingCurrency} />
        </div>

        <div className="mt-5 flex justify-between">
          <MetricCell
            icon={<RiArrowDownLine className="size-4" />}
            value={income}
            tone="positive"
          />
          <div className="w-[3px] bg-white/[0.08]" />
          <MetricCell
            icon={<RiSwapLine className="size-4" />}
            value={netFlow}
            tone={netFlowDirection === "positive" ? "positive" : netFlowDirection === "negative" ? "negative" : "neutral"}
          />
          <div className="w-[3px] bg-white/[0.08]" />
          <MetricCell
            icon={<RiRefund2Line className="size-4" />}
            value={refunds}
            tone="neutral"
          />
        </div>

        {actionHref && actionLabel ? (
          <div className="mt-6">
            <Link
              href={actionHref}
              className={[
                "neo-btn-3d inline-flex h-12 items-center gap-2 border px-5 text-sm font-semibold transition-all",
                accent === "yellow"
                  ? "neo-btn-3d-yellow border-[rgba(255,231,90,0.35)] bg-[var(--neo-yellow)] text-[var(--neo-black)]"
                  : "neo-btn-3d-cream border-[rgba(255,255,255,0.12)] bg-[var(--neo-cream)] text-[var(--neo-black)]",
              ].join(" ")}
            >
              {actionLabel}
              <RiArrowRightLine className="size-4" />
            </Link>
          </div>
        ) : null}
      </div>

      {/* Brutalist geometric blocks */}
      <div className="pointer-events-none absolute -top-8 -right-8 size-36 rotate-12 bg-white/[0.06] md:size-44" />
      <div className="pointer-events-none absolute -right-4 top-12 size-20 -rotate-6 bg-white/[0.04] md:size-24" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-16 w-28 rotate-3 bg-white/[0.05]" />
    </Card>
  )
}

function MetricCell({
  icon,
  value,
  tone,
}: {
  icon: React.ReactNode
  value: string
  tone: "positive" | "negative" | "neutral"
}) {
  const toneColor =
    tone === "positive"
      ? "text-[var(--neo-green)]"
      : tone === "negative"
        ? "text-[var(--neo-coral)]"
        : "text-white/60"

  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <span className={toneColor}>{icon}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  )
}
