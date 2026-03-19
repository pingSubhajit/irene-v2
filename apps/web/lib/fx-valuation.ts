import {
  countFinancialEventsForUser,
  countMissingFinancialEventValuationsForUser,
  createJobRun,
  ensureJobRun,
  getLatestFxRateDailyOnOrBefore,
  listFinancialEventsMissingValuationForUser,
  setActiveFinancialEventValuation,
  upsertFxRateDaily,
  getUserSettings,
} from "@workspace/db"
import { fetchCurrencyApiHistoricalRate } from "@workspace/integrations"
import { createCorrelationId } from "@workspace/observability"
import { createLogger } from "@workspace/observability"
import {
  enqueueFxEventRefresh,
  enqueueFxRateWarm,
  enqueueFxUserBackfill,
  FX_EVENT_REFRESH_JOB_NAME,
  FX_QUEUE_NAME,
  FX_RATE_WARM_JOB_NAME,
  FX_USER_BACKFILL_JOB_NAME,
} from "@workspace/workflows"

export const FX_WARM_LOOKBACK_DAYS = 7
const FX_PROVIDER = "currencyapi" as const
const MAX_LOOKBACK_DAYS = 7
const logger = createLogger("web.fx")

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

async function hydrateMissingFinancialEventValuationsForUser(input: {
  userId: string
  targetCurrency: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
}) {
  const events = await listFinancialEventsMissingValuationForUser({
    userId: input.userId,
    targetCurrency: input.targetCurrency,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit: input.limit,
  })

  for (const event of events) {
    const eventDate = formatDateKey(event.eventOccurredAt)

    if (event.currency === input.targetCurrency) {
      await setActiveFinancialEventValuation({
        financialEventId: event.id,
        targetCurrency: input.targetCurrency,
        valuationKind: "identity",
        normalizedAmountMinor: event.amountMinor,
        fxRate: 1,
        fxRateDate: eventDate,
      })
      continue
    }

    const rate = await resolveHistoricalRate({
      baseCurrency: event.currency,
      quoteCurrency: input.targetCurrency,
      eventDate,
    })

    await setActiveFinancialEventValuation({
      financialEventId: event.id,
      targetCurrency: input.targetCurrency,
      valuationKind: "historical_reference",
      normalizedAmountMinor: Math.round(event.amountMinor * rate.rate),
      fxRate: rate.rate,
      fxRateDate: rate.rateDate,
      provider: rate.provider,
    })
  }

  return {
    hydratedCount: events.length,
  }
}

export async function triggerFinancialEventValuationRefresh(input: {
  userId: string
  financialEventId: string
  targetCurrency?: string
}) {
  const settings = input.targetCurrency
    ? null
    : await getUserSettings(input.userId)
  const targetCurrency = input.targetCurrency ?? settings?.reportingCurrency ?? "INR"
  const correlationId = createCorrelationId()
  const jobKey = `${FX_EVENT_REFRESH_JOB_NAME}:${input.financialEventId}:${targetCurrency}`
  const jobRun = await ensureJobRun({
    queueName: FX_QUEUE_NAME,
    jobName: FX_EVENT_REFRESH_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      financialEventId: input.financialEventId,
      targetCurrency,
    },
  })

  await enqueueFxEventRefresh({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    financialEventId: input.financialEventId,
    targetCurrency,
  })

  return {
    jobRun,
    targetCurrency,
  }
}

export async function triggerUserFinancialEventValuationBackfill(input: {
  userId: string
  targetCurrency?: string
}) {
  const settings = input.targetCurrency
    ? null
    : await getUserSettings(input.userId)
  const targetCurrency = input.targetCurrency ?? settings?.reportingCurrency ?? "INR"
  const correlationId = createCorrelationId()
  const jobKey = `${FX_USER_BACKFILL_JOB_NAME}:${input.userId}:${targetCurrency}`
  const jobRun = await ensureJobRun({
    queueName: FX_QUEUE_NAME,
    jobName: FX_USER_BACKFILL_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      targetCurrency,
    },
  })

  await enqueueFxUserBackfill({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    targetCurrency,
  })

  return {
    jobRun,
    targetCurrency,
  }
}

export async function triggerFxRateWarmup(lookbackDays = FX_WARM_LOOKBACK_DAYS) {
  const correlationId = createCorrelationId()
  const jobKey = `${FX_RATE_WARM_JOB_NAME}:${lookbackDays}:${new Date().toISOString().slice(0, 10)}`
  const jobRun = await createJobRun({
    queueName: FX_QUEUE_NAME,
    jobName: FX_RATE_WARM_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      lookbackDays,
    },
  })

  await enqueueFxRateWarm({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    lookbackDays,
  })

  return {
    jobRun,
  }
}

export async function ensureUserFinancialEventValuationCoverage(
  userId: string,
  options?: {
    dateFrom?: Date
    dateTo?: Date
    limit?: number
  },
) {
  const settings = await getUserSettings(userId)
  const [eventCount, missingCount] = await Promise.all([
    countFinancialEventsForUser(userId),
    countMissingFinancialEventValuationsForUser({
      userId,
      targetCurrency: settings.reportingCurrency,
      dateFrom: options?.dateFrom,
      dateTo: options?.dateTo,
    }),
  ])

  if (eventCount > 0 && missingCount > 0) {
    try {
      await hydrateMissingFinancialEventValuationsForUser({
        userId,
        targetCurrency: settings.reportingCurrency,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
        limit: options?.limit,
      })
    } catch (error) {
      logger.errorWithCause("Failed to hydrate missing financial event valuations inline", error, {
        userId,
        reportingCurrency: settings.reportingCurrency,
      })
    }
  }

  const remainingMissingCount = await countMissingFinancialEventValuationsForUser({
    userId,
    targetCurrency: settings.reportingCurrency,
    dateFrom: options?.dateFrom,
    dateTo: options?.dateTo,
  })

  if (eventCount > 0 && remainingMissingCount > 0) {
    await triggerUserFinancialEventValuationBackfill({
      userId,
      targetCurrency: settings.reportingCurrency,
    })
  }

  return {
    reportingCurrency: settings.reportingCurrency,
    eventCount,
    missingCount: remainingMissingCount,
  }
}
