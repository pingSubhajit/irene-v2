import {
  getUserSettings,
  listCashPaymentInstrumentsForUser,
} from "@workspace/db"

import {
  asSingleValue,
  getBalancesStatusMessage,
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import { SettingsCashAccountActions } from "@/components/settings-cash-account-actions"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type CashPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SettingsAccountsCashPage({
  searchParams,
}: CashPageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [settings, cashAccounts] = await Promise.all([
    getUserSettings(session.user.id),
    listCashPaymentInstrumentsForUser(session.user.id),
  ])
  const statusMessage = getBalancesStatusMessage(asSingleValue(params.balances))

  return (
    <SettingsSubpageShell
      title="cash accounts"
      description="Inspect the bank accounts or wallets Irene inferred, and add a manual one when inbox evidence has not created it yet."
    >
      {statusMessage ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
        </div>
      ) : null}

      {cashAccounts.length > 0 ? (
        <SettingsCashAccountActions
          accounts={cashAccounts.map((account) => ({
            id: account.id,
            displayName: account.displayName,
            instrumentLabel: `${account.instrumentType.replace("_", " ")}${account.maskedIdentifier ? ` • ${account.maskedIdentifier}` : ""}`,
            sourceLabel: account.financialInstitutionId ? "inferred" : "manual",
            sourceMetaLabel: account.financialInstitutionId
              ? "Built from explicit bank-email issuer and account evidence."
              : "Created manually because no explicit inbox evidence was available.",
            currencyLabel: account.currency ?? settings.reportingCurrency,
          }))}
        />
      ) : (
        <SettingsCashAccountActions accounts={[]} />
      )}

      <SettingsFootnote>
        Irene auto-creates cash accounts from explicit bank evidence when possible. Manual accounts
        are only needed when inbox evidence is missing.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
