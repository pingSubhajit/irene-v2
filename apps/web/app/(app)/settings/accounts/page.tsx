import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function SettingsAccountsPage() {
  redirect("/settings/accounts/baseline")
}
