"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import type {
  AnyPwaRouteSnapshot,
  PwaRouteKey,
  StoredPwaMutation,
} from "@/lib/pwa/contracts"
import { applyOptimisticSnapshotOverlays } from "@/lib/pwa/offline-overlays"
import { getPwaRouteKeyForPathname } from "@/lib/pwa/route-key"
import {
  getCurrentUserMeta,
  loadRouteSnapshot,
  listStoredMutationsForUser,
} from "@/lib/pwa/store"

type OfflinePwaPageProps = {
  requestedPathname: string
}

const offlineNav: Array<{
  href: string
  label: string
  routeKey: PwaRouteKey
}> = [
  { href: "/dashboard", label: "Dashboard", routeKey: "dashboard" },
  { href: "/activity", label: "Activity", routeKey: "activity" },
  { href: "/review", label: "Review", routeKey: "review" },
  { href: "/goals", label: "Goals", routeKey: "goals" },
  { href: "/settings", label: "Settings", routeKey: "settings" },
]

function formatCapturedAt(value: string) {
  const date = new Date(value)
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function OfflinePwaPage({ requestedPathname }: OfflinePwaPageProps) {
  const [snapshot, setSnapshot] = useState<AnyPwaRouteSnapshot | null>(null)
  const [mutations, setMutations] = useState<StoredPwaMutation[]>([])
  const [loading, setLoading] = useState(true)
  const routeKey = useMemo(
    () => getPwaRouteKeyForPathname(requestedPathname),
    [requestedPathname]
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const user = await getCurrentUserMeta()

      if (!user || !routeKey) {
        if (!cancelled) {
          setLoading(false)
          setSnapshot(null)
        }
        return
      }

      const [storedSnapshot, storedMutations] = await Promise.all([
        loadRouteSnapshot({
          userId: user.userId,
          routeKey,
        }),
        listStoredMutationsForUser(user.userId),
      ])

      if (cancelled) {
        return
      }

      setMutations(storedMutations)
      setSnapshot(storedSnapshot as AnyPwaRouteSnapshot | null)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [routeKey])

  if (loading) {
    return (
      <div className="p-6 text-sm text-white/56">Loading offline snapshot…</div>
    )
  }

  if (!routeKey) {
    return (
      <div className="p-6 text-sm text-white/56">
        This route is not available offline yet. Try one of the core views
        below.
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="p-6 text-sm text-white/56">
        Irene has no cached snapshot for this screen yet. Open it once online
        first.
      </div>
    )
  }

  const resolvedSnapshot = applyOptimisticSnapshotOverlays(
    snapshot,
    mutations
  ) as AnyPwaRouteSnapshot
  const renderedBody = renderSnapshotBody(resolvedSnapshot)

  return (
    <div className="mx-auto min-h-svh max-w-4xl px-4 pt-6 pb-24 text-white md:px-6">
      <div className="rounded-[1.6rem] border border-white/8 bg-[rgba(12,12,14,0.92)] p-5">
        <p className="text-[0.7rem] font-semibold tracking-[0.22em] text-white/32 uppercase">
          Offline snapshot
        </p>
        <h1 className="mt-3 text-[2rem] font-semibold tracking-tight text-white">
          {resolvedSnapshot.payload.user.name}
        </h1>
        <p className="mt-2 text-sm text-white/48">
          Last captured {formatCapturedAt(resolvedSnapshot.capturedAt)}
        </p>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2">
        {offlineNav.map((item) => (
          <Link
            key={item.routeKey}
            href={`/offline?pathname=${encodeURIComponent(item.href)}`}
            className={[
              "rounded-full border px-3 py-2 text-sm transition",
              item.routeKey === routeKey
                ? "border-[var(--neo-yellow)] text-white"
                : "border-white/10 text-white/52 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 rounded-[1.6rem] border border-white/8 bg-[rgba(10,10,12,0.76)] p-5">
        {renderedBody}
      </div>

      <div className="mt-6">
        <Link
          href={requestedPathname}
          className="text-sm text-white/56 transition hover:text-white"
        >
          Try live page again
        </Link>
      </div>
    </div>
  )
}

function renderSnapshotBody(snapshot: AnyPwaRouteSnapshot) {
  switch (snapshot.routeKey) {
    case "dashboard": {
      const payload = snapshot.payload
      return (
        <div className="grid gap-5">
          <div className="grid gap-2">
            <p className="text-sm text-white/40">This month</p>
            <p className="text-3xl font-semibold text-white">
              {payload.monthSpendLabel}
            </p>
            <p className="text-sm text-white/50">
              Income {payload.monthIncomeLabel} · Net {payload.netFlowLabel}
            </p>
          </div>
          <div className="grid gap-3">
            {payload.recentTransactions.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 border-t border-white/6 pt-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <p className="text-white">{item.title}</p>
                  <p className="text-sm text-white/38">{item.subtitle}</p>
                </div>
                <p className="text-sm text-white/62">
                  {item.amountLabel}
                  {item.pending ? " · pending" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case "activity": {
      const payload = snapshot.payload
      return (
        <div className="grid gap-4">
          <div>
            <p className="text-sm text-white/40">{payload.viewLabel}</p>
            <p className="mt-1 text-sm text-white/52">{payload.filtersLabel}</p>
          </div>
          {payload.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-4 border-t border-white/6 pt-3 first:border-t-0 first:pt-0"
            >
              <div>
                <p className="text-white">{item.title}</p>
                <p className="text-sm text-white/38">{item.subtitle}</p>
              </div>
              <p className="text-sm text-white/62">
                {item.amountLabel}
                {item.pending ? " · pending" : ""}
              </p>
            </div>
          ))}
        </div>
      )
    }
    case "review": {
      const payload = snapshot.payload
      return (
        <div className="grid gap-3">
          {payload.items.map((item) => (
            <div
              key={item.id}
              className="border-t border-white/6 pt-3 first:border-t-0 first:pt-0"
            >
              <p className="text-white">{item.title}</p>
              <p className="mt-1 text-sm text-white/38">
                {item.subtitle} · {item.itemType}
                {item.pending ? " · pending" : ""}
              </p>
            </div>
          ))}
        </div>
      )
    }
    case "goals": {
      const payload = snapshot.payload
      return (
        <div className="grid gap-6">
          <div>
            <p className="text-sm text-white/40">Active</p>
            <div className="mt-3 grid gap-3">
              {payload.active.map((goal) => (
                <div
                  key={goal.id}
                  className="border-t border-white/6 pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="text-white">{goal.name}</p>
                  <p className="mt-1 text-sm text-white/38">
                    {goal.projectedLabel} projected by {goal.targetDateLabel}
                  </p>
                  <p className="mt-1 text-sm text-white/52">
                    {goal.gapLabel}
                    {goal.pending ? " · pending" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-white/40">Closed</p>
            <div className="mt-3 grid gap-3">
              {payload.closed.map((goal) => (
                <div
                  key={goal.id}
                  className="border-t border-white/6 pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="text-white">{goal.name}</p>
                  <p className="mt-1 text-sm text-white/38">
                    {goal.status} · {goal.targetDateLabel}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case "settings": {
      const payload = snapshot.payload
      return (
        <div className="grid gap-3">
          {[
            ["inbox", payload.inboxLabel],
            ["reporting currency", payload.reportingCurrency],
            ["time zone", payload.timeZone],
            ["last sync", payload.lastSyncLabel],
            ["cash accounts", `${payload.cashAccountsCount}`],
            ["linked instruments", payload.linkedInstrumentSummary],
            ["memory facts", `${payload.memoryFactsCount}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 first:border-t-0 first:pt-0"
            >
              <p className="text-sm text-white/40">{label}</p>
              <p className="text-sm text-white">{value}</p>
            </div>
          ))}
        </div>
      )
    }
  }
}
