import type { Metadata } from "next"
import { listCashPaymentInstrumentsForUser, listDebitAndUpiPaymentInstrumentsForUser } from "@workspace/db"

import {
  asSingleValue,
  getBalancesStatusMessage,
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import { SettingsLinkActions } from "@/components/settings-link-actions"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Linked instruments",
  description: "Linked instruments in Irene.",
})

type LinksPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SettingsAccountsLinksPage({
  searchParams,
}: LinksPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [cashAccounts, cardLikeInstruments] = await Promise.all([
    listCashPaymentInstrumentsForUser(session.user.id),
    listDebitAndUpiPaymentInstrumentsForUser(session.user.id),
  ])
  const statusMessage = getBalancesStatusMessage(asSingleValue(params.balances))

  return (
    <SettingsSubpageShell
      title="linked instruments"
      description="Map debit cards, UPI handles, or wallets back to the cash account they actually draw from."
    >
      {statusMessage ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
        </div>
      ) : null}

      {cardLikeInstruments.length > 0 && cashAccounts.length > 0 ? (
        <SettingsLinkActions
          instruments={cardLikeInstruments.map((instrument) => ({
            id: instrument.id,
            displayName: instrument.displayName,
            instrumentLabel: instrument.instrumentType.replace("_", " "),
            backingPaymentInstrumentId: instrument.backingPaymentInstrumentId,
            backingLabel:
              cashAccounts.find((account) => account.id === instrument.backingPaymentInstrumentId)
                ?.displayName ?? "not linked",
            instrumentType: instrument.instrumentType,
            status: instrument.status,
            creditLimitMajor:
              typeof instrument.creditLimitMinor === "number"
                ? (instrument.creditLimitMinor / 100).toFixed(2)
                : "",
            redirectTo: "/settings/accounts/links",
          }))}
          cashAccounts={cashAccounts.map((account) => ({
            id: account.id,
            displayName: account.displayName,
          }))}
        />
      ) : (
        <p className="text-sm leading-relaxed text-white/32">
          Irene needs at least one cash account and one debit, UPI, or wallet instrument before
          links can be managed here.
        </p>
      )}

      <SettingsFootnote>
        These links only control forecast rollups. They do not change the original event evidence
        or instrument history.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
