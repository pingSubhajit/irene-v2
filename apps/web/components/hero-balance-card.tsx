import Link from "next/link"

import { Card, CardContent, CardHeader } from "@workspace/ui/components/card"

type HeroBalanceCardProps = {
  label: string
  headline: string
  amount: string
  summary: string
  actionHref: string
  actionLabel: string
  accent?: "yellow" | "green" | "violet"
}

export function HeroBalanceCard({
  label,
  headline,
  amount,
  summary,
  actionHref,
  actionLabel,
  accent = "yellow",
}: HeroBalanceCardProps) {
  return (
    <Card variant="spotlight" className="overflow-hidden">
      <CardHeader className="gap-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="neo-kicker text-white/72">{label}</p>
            <h1 className="mt-4 max-w-[16ch] font-display text-[2.1rem] leading-[0.95] text-white md:text-[2.8rem]">
              {headline}
            </h1>
          </div>
          <div className="hidden size-20 border border-white/16 bg-black/10 md:block" />
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="rounded-none border border-white/16 bg-black/10 p-5">
          <p className="neo-kicker text-white/72">Month to date</p>
          <p className="mt-3 font-display text-5xl leading-none text-white md:text-6xl">
            {amount}
          </p>
          <p className="mt-4 max-w-[28ch] text-sm leading-6 text-white/74">{summary}</p>
        </div>
        <div className="mt-6">
          <Link
            href={actionHref}
            className={[
              "inline-flex h-14 items-center justify-center border px-6 text-base font-semibold transition",
              accent === "yellow"
                ? "border-[rgba(255,231,90,0.35)] bg-[var(--neo-yellow)] text-[var(--neo-black)] shadow-[0_8px_0_var(--neo-shadow-yellow)] hover:-translate-y-px hover:shadow-[0_10px_0_var(--neo-shadow-yellow)] active:translate-y-[4px] active:shadow-[0_3px_0_var(--neo-shadow-yellow)]"
                : "border-[rgba(255,255,255,0.12)] bg-[var(--neo-cream)] text-[var(--neo-black)] shadow-[0_8px_0_var(--neo-shadow-cream)] hover:-translate-y-px hover:shadow-[0_10px_0_var(--neo-shadow-cream)] active:translate-y-[4px] active:shadow-[0_3px_0_var(--neo-shadow-cream)]",
            ].join(" ")}
          >
            {actionLabel}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
