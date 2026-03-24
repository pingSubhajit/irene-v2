import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createPrivateMetadata } from "@/lib/metadata"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Ledger",
  description: "Ledger in Irene.",
})

export default function LedgerAliasPage() {
  redirect("/activity")
}
