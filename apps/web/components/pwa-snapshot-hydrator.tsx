"use client"

import { useEffect } from "react"

import type { AnyPwaRouteSnapshot } from "@/lib/pwa/contracts"
import {
  saveRouteSnapshot,
  setCurrentUserMeta,
  setLastSyncAt,
} from "@/lib/pwa/store"

type PwaSnapshotHydratorProps = {
  snapshot: AnyPwaRouteSnapshot
}

export function PwaSnapshotHydrator({ snapshot }: PwaSnapshotHydratorProps) {
  useEffect(() => {
    void (async () => {
      await setCurrentUserMeta(snapshot.payload.user)
      await setLastSyncAt(snapshot.capturedAt)
      await saveRouteSnapshot(snapshot)
      window.dispatchEvent(new CustomEvent("irene-pwa-state-changed"))
    })()
  }, [snapshot])

  return null
}
