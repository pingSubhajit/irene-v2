import Link from "next/link"

import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiErrorWarningLine,
  RiSwapLine,
} from "@remixicon/react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { formatInUserTimeZone } from "@/lib/date-format"

type TransactionCardProps = {
  eventId: string
  merchant: string
  merchantLogoUrl?: string | null
  processor?: string | null
  amount: string
  dateLabel: string
  category: string
  direction: "inflow" | "outflow" | "neutral"
  eventType: string
  needsReview: boolean
  paymentInstrument: string | null
  traceCount?: number
  timeZone?: string
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

function DirectionIcon({
  direction,
  needsReview,
}: {
  direction: TransactionCardProps["direction"]
  needsReview: boolean
}) {
  if (needsReview) {
    return <RiErrorWarningLine className="size-3.5 text-[var(--neo-yellow)]" />
  }

  if (direction === "inflow") {
    return <RiArrowLeftDownLine className="size-3.5 text-[var(--neo-green)]" />
  }

  if (direction === "neutral") {
    return <RiSwapLine className="size-3.5 text-white/36" />
  }

  return <RiArrowRightUpLine className="size-3.5 text-[var(--neo-coral)]" />
}

function formatRowTime(isoString: string, timeZone: string | undefined) {
  try {
    const date = new Date(isoString)
    return formatInUserTimeZone(date, timeZone, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return isoString
  }
}

export function TransactionCard({
  eventId,
  merchant,
  merchantLogoUrl,
  processor,
  amount,
  dateLabel,
  direction,
  needsReview,
  traceCount = 0,
  timeZone,
}: TransactionCardProps) {
  const content = (
    <div className="flex items-center gap-3.5 py-4">
      <Avatar className="size-10 shrink-0 rounded-full bg-white/[0.07]">
        {merchantLogoUrl ? (
          <AvatarImage src={merchantLogoUrl} alt={merchant} />
        ) : (
          <AvatarFallback className="bg-white/[0.07] text-xs font-semibold tracking-wide text-white/50">
            {getInitials(merchant)}
          </AvatarFallback>
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-white">
          {merchant}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <DirectionIcon direction={direction} needsReview={needsReview} />
          <p className="truncate text-sm text-white/32">
            {processor ? `via ${processor} · ` : ""}
            {formatRowTime(dateLabel, timeZone)}
          </p>
        </div>
      </div>
      <p className="shrink-0 text-[15px] font-semibold tabular-nums text-white">
        {amount}
      </p>
    </div>
  )

  if (traceCount > 0) {
    return (
      <Link
        href={`/activity/${eventId}/trace`}
        className="block transition hover:bg-white/[0.02]"
      >
        {content}
      </Link>
    )
  }

  return content
}
