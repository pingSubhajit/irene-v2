import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getUserSettings } from "@workspace/db"

import { OnboardingFlow } from "@/components/onboarding-flow"
import { REPORTING_CURRENCY_OPTIONS } from "@/lib/currency-options"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"
import { getTimeZoneOptions } from "@/lib/time-zone-options"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Onboarding",
  description: "Set up Irene.",
})

export default async function OnboardingPage() {
  const session = await requireSession()
  const settings = await getUserSettings(session.user.id)

  if (settings.onboardingCompletedAt) {
    redirect("/dashboard")
  }

  return (
    <OnboardingFlow
      initialTimeZone={settings.timeZone}
      initialCurrency={settings.reportingCurrency}
      timeZoneOptions={getTimeZoneOptions(settings.timeZone)}
      currencyOptions={[...REPORTING_CURRENCY_OPTIONS]}
    />
  )
}
