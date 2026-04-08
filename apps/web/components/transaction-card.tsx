import React from "react"
import Link from "next/link"

import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiErrorWarningLine,
  RiSwapLine,
} from "@remixicon/react"
import type {
  CategoryColorToken,
  CategoryIconName,
} from "@workspace/config/category-presentation"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { formatInUserTimeZone } from "../lib/date-format"
import {
  appendGlobalTimeframeToHref,
  type GlobalTimeframe,
} from "../lib/global-timeframe"
import { CategoryBadge } from "./category-badge"

type TransactionCardProps = {
  eventId: string
  merchant: string
  merchantLogoUrl?: string | null
  merchantId?: string | null
  processor?: string | null
  amount: string
  occurredAt: Date
  categoryName: string
  categoryId?: string | null
  categoryIconName?: CategoryIconName | null
  categoryColorToken?: CategoryColorToken | null
  direction: "inflow" | "outflow" | "neutral"
  eventType: string
  needsReview: boolean
  paymentInstrument: string | null
  traceCount?: number
  timeZone?: string
  timeframe?: GlobalTimeframe
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

function formatRowTime(value: Date, timeZone: string | undefined) {
  return formatInUserTimeZone(value, timeZone, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function TransactionCard({
  eventId,
  merchant,
  merchantLogoUrl,
  merchantId,
  processor,
  amount,
  occurredAt,
  categoryName,
  categoryId,
  categoryIconName,
  categoryColorToken,
  direction,
  needsReview,
  traceCount = 0,
  timeZone,
  timeframe,
}: TransactionCardProps) {
  const merchantHref = merchantId
    ? appendGlobalTimeframeToHref(
        `/activity/merchants/${merchantId}`,
        timeframe ?? "this_month"
      )
    : null
  const categoryHref = categoryId
    ? appendGlobalTimeframeToHref(
        `/activity/categories/${categoryId}`,
        timeframe ?? "this_month"
      )
    : null

  const avatar = (
    <Avatar className="size-10 shrink-0 rounded-full bg-white/[0.07]">
      {merchantLogoUrl ? (
        <AvatarImage src={merchantLogoUrl} alt={merchant} />
      ) : (
        <AvatarFallback className="bg-white/[0.07] text-xs font-semibold tracking-wide text-white/50">
          {getInitials(merchant)}
        </AvatarFallback>
      )}
    </Avatar>
  )

  return (
    <div className="group/transaction relative">
      {traceCount > 0 ? (
        <Link
          href={`/activity/${eventId}/trace`}
          aria-label={`Open ${merchant} transaction`}
          className="absolute inset-0 z-0 block rounded-[1.25rem] transition hover:bg-white/[0.02] focus-visible:ring-1 focus-visible:ring-white/16 focus-visible:outline-none"
        />
      ) : null}

      <div
        className={`relative z-10 flex items-center gap-3.5 py-4 ${
          traceCount > 0 ? "pointer-events-none" : ""
        }`}
      >
        {merchantHref ? (
          <Link
            href={merchantHref}
            aria-label={`Open ${merchant}`}
            className="pointer-events-auto shrink-0 rounded-full transition hover:opacity-90"
          >
            {avatar}
          </Link>
        ) : (
          avatar
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {merchantHref ? (
              <Link
                href={merchantHref}
                className="pointer-events-auto truncate text-[15px] font-medium text-white transition hover:text-white/76"
              >
                {merchant}
              </Link>
            ) : (
              <p className="truncate text-[15px] font-medium text-white">
                {merchant}
              </p>
            )}
            {categoryHref ? (
              <Link
                href={categoryHref}
                className="pointer-events-auto inline-flex shrink-0 items-center rounded-full transition hover:bg-white/[0.04]"
                aria-label={`Open ${categoryName} category`}
              >
                <CategoryBadge
                  categoryName={categoryName}
                  iconName={categoryIconName}
                  colorToken={categoryColorToken}
                />
              </Link>
            ) : (
              <CategoryBadge
                categoryName={categoryName}
                iconName={categoryIconName}
                colorToken={categoryColorToken}
              />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <DirectionIcon direction={direction} needsReview={needsReview} />
            <p className="truncate text-sm text-white/32">
              {processor ? `via ${processor} · ` : ""}
              {formatRowTime(occurredAt, timeZone)}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-[15px] font-semibold text-white tabular-nums">
          {amount}
        </p>
      </div>
    </div>
  )
}
