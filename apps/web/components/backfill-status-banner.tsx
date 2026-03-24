"use client"

import { useEffect, useState } from "react"

type BackfillStatusBannerProps = {
  initialRunning: boolean
  forceVisible?: boolean
}

export function BackfillStatusBanner({
  initialRunning,
  forceVisible = false,
}: BackfillStatusBannerProps) {
  const [running, setRunning] = useState(initialRunning)
  const shouldPoll = running && !forceVisible

  useEffect(() => {
    if (!shouldPoll) {
      return
    }

    let cancelled = false

    async function refreshStatus() {
      try {
        const response = await fetch("/api/integrations/email/google/backfill-status", {
          cache: "no-store",
        })

        if (!response.ok) {
          return
        }

        const data = (await response.json()) as { running?: boolean }

        if (!cancelled) {
          setRunning(Boolean(data.running))
        }
      } catch {
        // keep the last known state; polling is best-effort only
      }
    }

    refreshStatus()

    const interval = window.setInterval(refreshStatus, 15_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [shouldPoll])

  if (!forceVisible && !running) {
    return null
  }

  return (
    <div className="bg-[linear-gradient(180deg,rgba(21,178,104,0.9),rgba(16,153,90,0.82))] px-4 py-2 shadow-[0_-10px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="flex items-center justify-center gap-2">
        <span className="size-3 rounded-full border border-white/28 border-t-white/90 animate-spin" />
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/92">
          inbox backfill running
        </p>
      </div>
    </div>
  )
}
