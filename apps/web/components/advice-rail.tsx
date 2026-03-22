import Link from "next/link"

import { RiArrowRightLine } from "@remixicon/react"
import { Card } from "@workspace/ui/components/card"

type AdviceRailItem = {
  id: string
  title: string
  summary: string
  detail: string
  priority: 1 | 2 | 3
  status: string
  href: string
  merchantName?: string | null
  goalName?: string | null
  updatedAtLabel: string
}

function getPriorityLabel(priority: AdviceRailItem["priority"]) {
  if (priority === 1) {
    return "Now"
  }

  if (priority === 2) {
    return "Soon"
  }

  return "Watch"
}

export function AdviceRail({
  items,
  showOpenAll = true,
}: {
  items: AdviceRailItem[]
  showOpenAll?: boolean
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
                    {getPriorityLabel(item.priority)}
                  </span>
                </div>
                <p className="mt-2 text-[18px] font-medium text-white">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-white/46">{item.summary}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.28em] text-white/18">
                  {[item.goalName, item.merchantName, item.updatedAtLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link
                href={item.href}
                className="inline-flex items-center gap-2 text-sm text-white/38 transition hover:text-white"
              >
                View
                <RiArrowRightLine className="size-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function AdviceList({
  items,
}: {
  items: AdviceRailItem[]
}) {
  return (
    <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
      {items.map((item) => (
        <div key={item.id} className="py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-medium text-white">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-white/46">{item.summary}</p>
              <p className="mt-3 text-sm leading-6 text-white/32">{item.detail}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.28em] text-white/18">
                {[getPriorityLabel(item.priority), item.goalName, item.merchantName, item.updatedAtLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={item.href}
                  className="text-sm text-white transition hover:text-white/70"
                >
                  Open context
                </Link>
                {item.status === "active" ? (
                  <>
                    <form action="/api/advice" method="post">
                      <input type="hidden" name="action" value="dismiss" />
                      <input type="hidden" name="adviceItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value="/advice" />
                      <button
                        type="submit"
                        className="text-sm text-white/42 transition hover:text-white"
                      >
                        Dismiss
                      </button>
                    </form>
                    <form action="/api/advice" method="post">
                      <input type="hidden" name="action" value="done" />
                      <input type="hidden" name="adviceItemId" value={item.id} />
                      <input type="hidden" name="redirectTo" value="/advice" />
                      <button
                        type="submit"
                        className="text-sm text-[var(--neo-green)] transition hover:text-white"
                      >
                        Mark done
                      </button>
                    </form>
                  </>
                ) : (
                  <form action="/api/advice" method="post">
                    <input type="hidden" name="action" value="restore" />
                    <input type="hidden" name="adviceItemId" value={item.id} />
                    <input type="hidden" name="redirectTo" value="/advice" />
                    <button
                      type="submit"
                      className="text-sm text-white/42 transition hover:text-white"
                    >
                      Restore
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
