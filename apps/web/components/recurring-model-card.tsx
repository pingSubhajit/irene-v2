"use client"

import Link from "next/link"
import { RiArrowRightSLine } from "@remixicon/react"

type RecurringModelCardProps = {
  eyebrow: string
  title: string
  subtitle: string
  amount: string
  cadence: string
  scheduleLabel: string
  confidenceLabel: string
  status: "active" | "suspected" | "paused" | "closed" | "inactive"
  href?: string | null
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

function getStatusColor(status: RecurringModelCardProps["status"]) {
  if (status === "active") return "bg-[var(--neo-green)]"
  if (status === "suspected") return "bg-[var(--neo-yellow)]"
  return "bg-white/24"
}

export function RecurringModelCard({
  title,
  amount,
  cadence,
  scheduleLabel,
  status,
  href,
}: RecurringModelCardProps) {
  const content = (
    <div className="flex items-center gap-3.5 py-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs font-semibold tracking-wide text-white/50">
        {getInitials(title)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-white">{title}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`size-2 shrink-0 rounded-full ${getStatusColor(status)}`}
          />
          <p className="truncate text-sm text-white/32">
            {cadence} · {scheduleLabel}
          </p>
        </div>
      </div>
      <p className="shrink-0 text-[15px] font-semibold tabular-nums text-white">
        {amount}
      </p>
      {href ? <RiArrowRightSLine className="size-5 shrink-0 text-white/16" /> : null}
    </div>
  )

  if (!href) {
    return content
  }

  return (
    <Link href={href} className="block transition hover:bg-white/[0.02]">
      {content}
    </Link>
  )
}
