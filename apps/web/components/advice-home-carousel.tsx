"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Card } from "@workspace/ui/components/card"

type AdviceHomeCarouselClientItem = {
  id: string
  href: string
  title: string
  summary: string
  updatedAtIso: string | null
}

function clampIndex(index: number, itemCount: number) {
  if (itemCount <= 0) {
    return 0
  }

  return Math.min(Math.max(index, 0), itemCount - 1)
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
})

function formatRelativeAdviceTime(isoTimestamp: string | null) {
  if (!isoTimestamp) {
    return "Recently updated"
  }

  const timestamp = new Date(isoTimestamp)
  if (Number.isNaN(timestamp.getTime())) {
    return "Recently updated"
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

export function AdviceHomeCarouselClient({
  items,
}: {
  items: AdviceHomeCarouselClientItem[]
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleScroll = () => {
      const width = container.clientWidth
      if (width <= 0) {
        return
      }

      const nextIndex = clampIndex(Math.round(container.scrollLeft / width), items.length)
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex))
    }

    handleScroll()
    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [items.length])

  const scrollToIndex = (index: number) => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const nextIndex = clampIndex(index, items.length)
    container.scrollTo({
      left: container.clientWidth * nextIndex,
      behavior: "smooth",
    })
    setActiveIndex(nextIndex)
  }

  return (
    <div className="grid gap-3">
      <div
        ref={containerRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="block min-w-full flex-[0_0_100%] snap-start px-2"
          >
            <Card className="min-h-[10.75rem] border-white/8 bg-[rgba(18,18,20,0.92)] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.18)] transition hover:border-white/14 hover:bg-[rgba(22,22,24,0.96)] hover:shadow-[0_18px_36px_rgba(0,0,0,0.24)]">
              <div className="flex min-h-full flex-col">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/22">
                    {formatRelativeAdviceTime(item.updatedAtIso)}
                  </p>
                  <p className="mt-2 text-[18px] font-medium leading-7 text-white">
                    {item.title}
                  </p>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/46">
                  {item.summary}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {items.length > 1 ? (
        <div className="flex items-center justify-center gap-1.5">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Go to advice ${index + 1}`}
              aria-pressed={index === activeIndex}
              onClick={() => scrollToIndex(index)}
              className={
                index === activeIndex
                  ? "size-1.5 rounded-full bg-white"
                  : "size-1.5 rounded-full bg-white/18 transition hover:bg-white/36"
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
