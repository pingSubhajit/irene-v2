import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createPrivateMetadata } from "@/lib/metadata"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Accounts",
  description: "Account settings in Irene.",
})

export default function SettingsAccountsPage() {
  redirect("/settings/accounts/baseline")
}
