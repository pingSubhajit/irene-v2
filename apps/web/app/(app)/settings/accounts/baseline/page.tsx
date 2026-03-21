import {
  getLatestForecastRunWithSnapshots,
  getUserSettings,
  listBalanceAnchorsForUser,
  listCashPaymentInstrumentsForUser,
  listSuggestedBalanceObservationsForUser,
} from "@workspace/db"

import {
  asSingleValue,
  formatCurrencyMinor,
  formatDateTime,
  getBalancesStatusMessage,
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import { SettingsBaselineActions } from "@/components/settings-baseline-actions"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

type BaselinePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getForecastSummary(input: {
  runType: "anchored" | "net_only" | null
  horizonDays: number | null
  anchorCount: number
}) {
  if (!input.runType || !input.horizonDays) {
    return "No forecast run yet."
  }

  if (input.runType === "anchored") {
    return `Anchored mode across ${input.horizonDays} days using ${input.anchorCount} current balance ${input.anchorCount === 1 ? "anchor" : "anchors"}.`
  }

  return `Net-only mode across ${input.horizonDays} days. Add or confirm a cash balance to unlock projected balance and safe-to-spend.`
}

function getAnchorStateLabel(input: {
  hasAnchor: boolean
  autoAnchored: boolean
}) {
  if (!input.hasAnchor) {
    return "not set yet"
  }

  return input.autoAnchored ? "anchored from inbox" : "confirmed manually"
}

export default async function SettingsAccountsBaselinePage({
  searchParams,
}: BaselinePageProps) {
  const session = await requireSession()
  const params = (await searchParams) ?? {}
  const [settings, cashAccounts, balanceAnchors, suggestedObservations, latestForecast] =
    await Promise.all([
      getUserSettings(session.user.id),
      listCashPaymentInstrumentsForUser(session.user.id),
      listBalanceAnchorsForUser(session.user.id),
      listSuggestedBalanceObservationsForUser(session.user.id),
      getLatestForecastRunWithSnapshots(session.user.id),
    ])

  const statusMessage = getBalancesStatusMessage(asSingleValue(params.balances))
  const anchorByInstrumentId = new Map(
    balanceAnchors.map((row) => [row.paymentInstrument.id, row]),
  )
  const latestObservationByInstrumentId = new Map<string, (typeof suggestedObservations)[number]>()

  for (const row of suggestedObservations) {
    if (!latestObservationByInstrumentId.has(row.paymentInstrument.id)) {
      latestObservationByInstrumentId.set(row.paymentInstrument.id, row)
    }
  }

  return (
    <SettingsSubpageShell
      title="forecast baseline"
      description="Confirm the balance Irene should treat as the live cash starting point for forecasting."
    >
      {statusMessage ? (
        <div className="border-l-2 border-[var(--neo-green)] bg-[rgba(111,247,184,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{statusMessage}</p>
        </div>
      ) : null}

      <div className="divide-y divide-white/[0.06]">
        <div className="flex items-center justify-between py-4">
          <span className="text-[15px] text-white">forecast mode</span>
          <span className="text-[15px] text-white/36">
            {latestForecast?.run.runType === "anchored" ? "anchored" : "net only"}
          </span>
        </div>
        <div className="py-4">
          <p className="text-sm leading-relaxed text-white/32">
            {getForecastSummary({
              runType: latestForecast?.run.runType ?? null,
              horizonDays: latestForecast?.run.horizonDays ?? null,
              anchorCount: balanceAnchors.length,
            })}
          </p>
        </div>
      </div>

      {cashAccounts.length > 0 ? (
        <SettingsBaselineActions
          accounts={cashAccounts.map((account) => {
            const anchorRow = anchorByInstrumentId.get(account.id) ?? null
            const anchor = anchorRow?.anchor ?? null
            const suggestion = latestObservationByInstrumentId.get(account.id) ?? null
            const autoAnchored = Boolean(anchor?.sourceObservationId || anchorRow?.sourceObservation)

            return {
              id: account.id,
              displayName: account.displayName,
              instrumentLabel: `${account.instrumentType.replace("_", " ")}${account.maskedIdentifier ? ` • ${account.maskedIdentifier}` : ""}`,
              anchorAmountLabel: anchor
                ? formatCurrencyMinor(anchor.amountMinor, anchor.currency)
                : "not set",
              anchorStateLabel: getAnchorStateLabel({
                hasAnchor: Boolean(anchor),
                autoAnchored,
              }),
              anchorMetaLabel: anchor
                ? autoAnchored
                  ? `auto-anchored ${formatDateTime(anchor.anchoredAt, settings.timeZone)}`
                  : `confirmed ${formatDateTime(anchor.anchoredAt, settings.timeZone)}`
                : "A current balance anchor is needed before projected balance can become cash-aware.",
              currency: account.currency ?? settings.reportingCurrency,
              suggestionId: suggestion?.observation.id ?? null,
              suggestionAmountLabel: suggestion
                ? formatCurrencyMinor(
                    suggestion.observation.amountMinor,
                    suggestion.observation.currency,
                  )
                : null,
              suggestionSeenLabel: suggestion
                ? formatDateTime(suggestion.observation.observedAt, settings.timeZone)
                : null,
            }
          })}
        />
      ) : (
        <p className="text-sm leading-relaxed text-white/32">
          No bank account or wallet instruments exist yet. Add one first so Irene can anchor
          projected balance and safe-to-spend.
        </p>
      )}

      <SettingsFootnote>
        Balance anchors can be confirmed manually or promoted automatically from explicit inbox
        balance evidence.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
