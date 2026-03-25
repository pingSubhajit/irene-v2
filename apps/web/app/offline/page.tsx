import type { Metadata } from "next"

import { OfflinePwaPage } from "@/components/offline-pwa-page"
import { createPrivateMetadata } from "@/lib/metadata"

export const metadata: Metadata = createPrivateMetadata({
  title: "Offline",
  description: "Offline snapshot for Irene.",
})

type OfflinePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function readPathname(value: string | string[] | undefined) {
  return Array.isArray(value)
    ? (value[0] ?? "/dashboard")
    : (value ?? "/dashboard")
}

export default async function OfflinePage({ searchParams }: OfflinePageProps) {
  const params = (await searchParams) ?? {}
  const pathname = readPathname(params.pathname)

  return <OfflinePwaPage requestedPathname={pathname} />
}
