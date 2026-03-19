import {
  getActiveFinancialEventValuation,
  getFinancialEventById,
  getLatestFxRateDailyOnOrBefore,
  listDistinctFxCurrencyPairsForWarmup,
  listFinancialEventsForUserValuation,
  setActiveFinancialEventValuation,
  upsertFxRateDaily,
} from "@workspace/db"
import { fetchCurrencyApiHistoricalRate } from "@workspace/integrations"

const FX_PROVIDER = "currencyapi" as const
const MAX_LOOKBACK_DAYS = 7

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function shiftDate(dateKey: string, offsetDays: number) {
  const value = new Date(`${dateKey}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return formatDateKey(value)
}

async function resolveHistoricalRate(input: {
  baseCurrency: string
  quoteCurrency: string
  eventDate: string
}) {
  const cached = await getLatestFxRateDailyOnOrBefore({
    provider: FX_PROVIDER,
    baseCurrency: input.baseCurrency,
    quoteCurrency: input.quoteCurrency,
    rateDate: input.eventDate,
  })

  if (cached) {
    return cached
  }

  for (let offset = 0; offset < MAX_LOOKBACK_DAYS; offset += 1) {
    const rateDate = shiftDate(input.eventDate, -offset)
    const remote = await fetchCurrencyApiHistoricalRate({
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      date: rateDate,
    })

    if (!remote) {
      continue
    }

    return upsertFxRateDaily({
      provider: remote.provider,
      baseCurrency: remote.baseCurrency,
      quoteCurrency: remote.quoteCurrency,
      rateDate: remote.rateDate,
      rate: remote.rate,
      fetchedAt: new Date(),
    })
  }

  throw new Error(
    `Unable to resolve historical FX rate for ${input.baseCurrency}/${input.quoteCurrency} on or before ${input.eventDate}`,
  )
}

export async function refreshFinancialEventValuation(input: {
  financialEventId: string
  targetCurrency: string
}) {
  const event = await getFinancialEventById(input.financialEventId)

  if (!event) {
    throw new Error(`Financial event ${input.financialEventId} not found`)
  }

  const existing = await getActiveFinancialEventValuation({
    financialEventId: event.id,
    targetCurrency: input.targetCurrency,
  })

  if (existing?.valuationKind === "settlement_confirmed") {
    return existing
  }

  const eventDate = formatDateKey(event.eventOccurredAt)

  if (event.currency === input.targetCurrency) {
    return setActiveFinancialEventValuation({
      financialEventId: event.id,
      targetCurrency: input.targetCurrency,
      valuationKind: "identity",
      normalizedAmountMinor: event.amountMinor,
      fxRate: 1,
      fxRateDate: eventDate,
    })
  }

  const rate = await resolveHistoricalRate({
    baseCurrency: event.currency,
    quoteCurrency: input.targetCurrency,
    eventDate,
  })

  return setActiveFinancialEventValuation({
    financialEventId: event.id,
    targetCurrency: input.targetCurrency,
    valuationKind: "historical_reference",
    normalizedAmountMinor: Math.round(event.amountMinor * rate.rate),
    fxRate: rate.rate,
    fxRateDate: rate.rateDate,
    provider: rate.provider,
  })
}

export async function backfillFinancialEventValuationsForUser(input: {
  userId: string
  targetCurrency: string
}) {
  const events = await listFinancialEventsForUserValuation({
    userId: input.userId,
  })

  for (const event of events) {
    await refreshFinancialEventValuation({
      financialEventId: event.id,
      targetCurrency: input.targetCurrency,
    })
  }

  return {
    eventCount: events.length,
  }
}

export async function warmRecentFxRates(input: { lookbackDays: number }) {
  const pairs = await listDistinctFxCurrencyPairsForWarmup()
  let warmedCount = 0

  for (const pair of pairs) {
    for (let offset = 0; offset < input.lookbackDays; offset += 1) {
      const date = shiftDate(formatDateKey(new Date()), -offset)
      const existing = await getLatestFxRateDailyOnOrBefore({
        provider: FX_PROVIDER,
        baseCurrency: pair.baseCurrency,
        quoteCurrency: pair.targetCurrency,
        rateDate: date,
      })

      if (existing?.rateDate === date) {
        continue
      }

      const remote = await fetchCurrencyApiHistoricalRate({
        baseCurrency: pair.baseCurrency,
        quoteCurrency: pair.targetCurrency,
        date,
      })

      if (!remote) {
        continue
      }

      await upsertFxRateDaily({
        provider: remote.provider,
        baseCurrency: remote.baseCurrency,
        quoteCurrency: remote.quoteCurrency,
        rateDate: remote.rateDate,
        rate: remote.rate,
        fetchedAt: new Date(),
      })
      warmedCount += 1
    }
  }

  return {
    pairCount: pairs.length,
    warmedCount,
  }
}
