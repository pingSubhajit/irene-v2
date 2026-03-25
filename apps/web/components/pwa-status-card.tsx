"use client"

import { useEffect, useState } from "react"

import { PWA_STATE_EVENT } from "@/lib/pwa/client-mutations"
import { getLastSyncAt } from "@/lib/pwa/store"

type PwaStatusCardProps = {
  mode?: "settings" | "footer"
  offlineOnly?: boolean
  className?: string
}

function formatLastSync(value: string | null) {
  if (!value) {
    return "No recent sync available."
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Last sync time unavailable."
  }

  return `Last synced ${date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })}.`
}

export function PwaStatusCard({
  mode = "settings",
  offlineOnly = false,
  className,
}: PwaStatusCardProps) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  )
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      const nextLastSyncAt = await getLastSyncAt()

      if (cancelled) {
        return
      }

      setLastSyncAt(nextLastSyncAt)
    }

    void refresh()

    const onOnline = () => {
      setIsOnline(true)
      void refresh()
    }

    const onOffline = () => {
      setIsOnline(false)
      void refresh()
    }

    const onPwaStateChanged = () => {
      void refresh()
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    window.addEventListener(PWA_STATE_EVENT, onPwaStateChanged)

    return () => {
      cancelled = true
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      window.removeEventListener(PWA_STATE_EVENT, onPwaStateChanged)
    }
  }, [])

  if (offlineOnly && isOnline) {
    return null
  }

  const title = isOnline ? "Online" : "Offline"
  const body = isOnline
    ? "Irene is connected and can sync live changes."
    : "You are offline. Irene is showing cached data where available."

  if (mode === "footer") {
    return (
      <div
        className={[
          "mx-auto max-w-6xl px-4 pb-2 md:px-6",
          className ?? "",
        ].join(" ")}
      >
        <div className="rounded-[1.25rem] border border-white/8 bg-[rgba(10,10,12,0.72)] px-4 py-3 text-xs backdrop-blur-2xl">
          <p className="font-medium tracking-[0.16em] text-[var(--neo-coral)] uppercase">
            {title}
          </p>
          <p className="mt-1 text-white/68">{body}</p>
          <p className="mt-1 text-white/44">{formatLastSync(lastSyncAt)}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        "mt-5 border-l-2 px-4 py-3",
        isOnline
          ? "border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)]"
          : "border-[var(--neo-coral)] bg-[rgba(255,122,92,0.06)]",
        className ?? "",
      ].join(" ")}
    >
      <p
        className={[
          "text-sm font-medium tracking-[0.16em] uppercase",
          isOnline ? "text-[var(--neo-green)]" : "text-[var(--neo-coral)]",
        ].join(" ")}
      >
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-white/68">{body}</p>
      <p className="mt-1 text-sm leading-relaxed text-white/44">
        {formatLastSync(lastSyncAt)}
      </p>
    </div>
  )
}
