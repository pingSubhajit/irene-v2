import Link from "next/link"
import { RiArrowLeftLine, RiShieldCheckLine } from "@remixicon/react"

import { formatInUserTimeZone } from "@/lib/date-format"

export const panelClassName = "border border-white/8 bg-[rgba(16,16,18,0.96)]"
export const insetPanelClassName = "border border-white/8 bg-white/[0.03]"
export const settingsRowClassName =
  "flex w-full items-center justify-between py-5 text-left transition hover:bg-white/[0.02]"

export function asSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function getBalancesStatusMessage(value: string | undefined) {
  switch (value) {
    case "account-created":
      return "Cash account created. Irene can now use it as a forecast baseline when a balance is anchored."
    case "invalid-account-name":
      return "Add a short account name before creating a manual cash account."
    case "invalid-anchor":
      return "The balance anchor could not be saved. Check the amount and try again."
    case "anchor-updated":
      return "Balance anchor updated. Irene has started refreshing your forecast."
    case "observation-accepted":
      return "Inbox balance evidence accepted as the current anchor."
    case "observation-invalid":
      return "That balance suggestion was no longer valid."
    case "link-updated":
      return "Backing account link updated."
    case "link-invalid":
      return "The instrument link could not be updated."
    default:
      return null
  }
}

export function formatDateTime(value: Date | null | undefined, timeZone: string) {
  if (!value) {
    return "not yet"
  }

  return formatInUserTimeZone(value, timeZone, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatCurrencyMinor(amountMinor: number, currency = "INR") {
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

export function SettingsSubpageShell({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto max-w-lg">
      <Link
        href="/settings"
        className="inline-flex py-6 text-white/50 transition hover:text-white"
      >
        <RiArrowLeftLine className="size-5" />
      </Link>

      <h1 className="text-[1.65rem] font-semibold tracking-tight text-white">{title}</h1>
      <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-white/36">{description}</p>

      <div className="mt-8 grid gap-6">
        {children}
      </div>
    </section>
  )
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="neo-kicker mb-1 mt-10">{children}</p>
}

export function SettingsFootnote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 flex items-center gap-3 border border-white/[0.06] px-4 py-3.5">
      <span className="flex size-8 items-center justify-center border border-white/10 bg-white/4 text-white/40">
        <RiShieldCheckLine className="size-4" />
      </span>
      <p className="text-sm text-white/36">{children}</p>
    </div>
  )
}

export function MetaRow({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] py-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-white">{label}</p>
        {description ? <p className="mt-1 text-sm leading-6 text-white/30">{description}</p> : null}
      </div>
      <p className="max-w-[11rem] text-right text-[15px] text-white/42">{value}</p>
    </div>
  )
}
