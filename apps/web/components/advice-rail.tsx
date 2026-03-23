import Link from "next/link"

import { RiMore2Fill } from "@remixicon/react"
import type { AdviceItemAction } from "@workspace/db"
import { Card } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { AdviceHomeCarouselClient } from "@/components/advice-home-carousel"

export type AdviceRailItem = {
  id: string
  title: string
  summary: string
  detail: string
  priority: 1 | 2 | 3
  status: string
  contextHref: string
  primaryAction?: AdviceItemAction | null
  secondaryAction?: AdviceItemAction | null
  merchantName?: string | null
  goalName?: string | null
  updatedAtLabel: string
  updatedAtIso?: string
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
})

function formatRelativeAdviceTime(isoTimestamp?: string | null) {
  if (!isoTimestamp) {
    return null
  }

  const timestamp = new Date(isoTimestamp)
  if (Number.isNaN(timestamp.getTime())) {
    return null
  }

  const diffMs = timestamp.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / (60 * 1000))
  const absMinutes = Math.abs(diffMinutes)

  if (absMinutes < 1) {
    return "Just now"
  }

  if (absMinutes < 60) {
    return relativeTimeFormatter.format(diffMinutes, "minute")
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, "hour")
  }

  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 7) {
    return relativeTimeFormatter.format(diffDays, "day")
  }

  const diffWeeks = Math.round(diffDays / 7)
  return relativeTimeFormatter.format(diffWeeks, "week")
}

function getAdviceMetaParts(item: AdviceRailItem) {
  return [
    formatRelativeAdviceTime(item.updatedAtIso) ?? item.updatedAtLabel,
    item.goalName,
    item.merchantName,
  ].filter(Boolean)
}

function AdviceActionLink({
  action,
  redirectTo,
  primary = false,
}: {
  action: AdviceItemAction
  redirectTo: string
  primary?: boolean
}) {
  if (action.type === "refresh_advice") {
    return (
      <form action="/api/advice" method="post">
        <input type="hidden" name="action" value="refresh" />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <button
          type="submit"
          className={
            primary
              ? "inline-flex h-8 items-center rounded-full border border-white/[0.1] bg-white px-3 text-xs font-medium text-black transition hover:bg-white/90"
              : "text-sm text-white/46 transition hover:text-white"
          }
        >
          {action.label}
        </button>
      </form>
    )
  }

  const href = "href" in action ? action.href : null
  if (!href) {
    return null
  }

  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex h-8 items-center rounded-full border border-white/[0.1] bg-white px-3 text-xs font-medium text-black transition hover:bg-white/90"
          : "text-sm text-white/46 transition hover:text-white"
      }
    >
      {action.label}
    </Link>
  )
}

function AdviceOverflowMenu({
  item,
  redirectTo,
}: {
  item: AdviceRailItem
  redirectTo: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More advice actions"
          className="inline-flex size-8 items-center justify-center rounded-full text-white/34 transition hover:bg-white/[0.04] hover:text-white"
        >
          <RiMore2Fill className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem asChild>
          <Link href={item.contextHref}>Open context</Link>
        </DropdownMenuItem>
        {item.status === "active" ? (
          <form action="/api/advice" method="post">
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                Dismiss
              </button>
            </DropdownMenuItem>
            <input type="hidden" name="action" value="dismiss" />
            <input type="hidden" name="adviceItemId" value={item.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
          </form>
        ) : (
          <form action="/api/advice" method="post">
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                Restore
              </button>
            </DropdownMenuItem>
            <input type="hidden" name="action" value="restore" />
            <input type="hidden" name="adviceItemId" value={item.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
          </form>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdviceRail({
  items,
  showOpenAll = true,
  actionRedirectTo = "/dashboard",
}: {
  items: AdviceRailItem[]
  showOpenAll?: boolean
  actionRedirectTo?: string
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <Card className="border-white/8 bg-[rgba(18,18,20,0.92)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="neo-kicker">Advice</p>
          <h2 className="mt-3 font-display text-3xl leading-none text-white">
            next useful moves
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
            Grounded suggestions based on your forecast, recurring layer, goals, and review queue.
          </p>
        </div>
        {showOpenAll ? (
          <Link
            href="/advice"
            className="text-sm text-white/52 transition hover:text-white"
          >
            Open all
          </Link>
        ) : null}
      </div>

      <div className="mt-6 divide-y divide-white/[0.06]">
        {items.map((item) => (
          <div key={item.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.28em] text-white/22">
                    {formatRelativeAdviceTime(item.updatedAtIso) ?? item.updatedAtLabel}
                  </span>
                </div>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <p className="text-[18px] font-medium text-white">{item.title}</p>
                  <AdviceOverflowMenu item={item} redirectTo={actionRedirectTo} />
                </div>
                <p className="mt-2 text-sm leading-6 text-white/46">{item.summary}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.28em] text-white/18">
                  {getAdviceMetaParts(item).join(" · ")}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {item.status === "active" && item.primaryAction ? (
                    <AdviceActionLink
                      action={item.primaryAction}
                      redirectTo={actionRedirectTo}
                      primary
                    />
                  ) : null}
                  {item.status === "active" && item.secondaryAction ? (
                    <AdviceActionLink
                      action={item.secondaryAction}
                      redirectTo={actionRedirectTo}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function AdviceList({
  items,
  actionRedirectTo = "/advice",
}: {
  items: AdviceRailItem[]
  actionRedirectTo?: string
}) {
  return (
    <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
      {items.map((item) => (
        <div key={item.id} id={`advice-${item.id}`} className="scroll-mt-24 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[18px] font-medium text-white">{item.title}</p>
                <AdviceOverflowMenu item={item} redirectTo={actionRedirectTo} />
              </div>
              <p className="mt-2 text-sm leading-6 text-white/46">{item.summary}</p>
              <p className="mt-3 text-sm leading-6 text-white/32">{item.detail}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.28em] text-white/18">
                {getAdviceMetaParts(item).join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {item.status === "active" && item.primaryAction ? (
                    <AdviceActionLink
                      action={item.primaryAction}
                      redirectTo={actionRedirectTo}
                      primary
                    />
                  ) : null}
                  {item.status === "active" && !item.primaryAction && item.secondaryAction ? (
                    <AdviceActionLink
                      action={item.secondaryAction}
                      redirectTo={actionRedirectTo}
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {item.status === "active" && item.primaryAction && item.secondaryAction ? (
                    <AdviceActionLink
                      action={item.secondaryAction}
                      redirectTo={actionRedirectTo}
                    />
                  ) : null}
                  {item.status === "active" ? (
                    <form action="/api/advice" method="post">
                      <input type="hidden" name="action" value="done" />
                      <input type="hidden" name="adviceItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value={actionRedirectTo} />
                      <button
                        type="submit"
                        className="text-sm text-[var(--neo-green)] transition hover:text-white"
                      >
                        Mark done
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AdviceHomeCarousel({
  items,
}: {
  items: AdviceRailItem[]
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <AdviceHomeCarouselClient
      items={items.map((item) => ({
        id: item.id,
        href: `/advice#advice-${item.id}`,
        title: item.title,
        summary: item.summary,
        updatedAtIso: item.updatedAtIso ?? null,
      }))}
    />
  )
}
