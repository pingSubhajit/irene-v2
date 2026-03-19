import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  gte,
  ne,
} from "drizzle-orm"

import { db } from "./client"
import { listLedgerEventsForUser } from "./ledger"
import { financialEvents, financialEventValuations, fxRatesDaily, userSettings } from "./schema"

function sameOptionalNumber(left: number | null | undefined, right: number | null | undefined) {
  return (left ?? null) === (right ?? null)
}

function sameOptionalString(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? null) === (right ?? null)
}

export async function upsertFxRateDaily(input: {
  provider: typeof fxRatesDaily.$inferInsert.provider
  baseCurrency: string
  quoteCurrency: string
  rateDate: string
  rate: number
  fetchedAt?: Date
}) {
  const [row] = await db
    .insert(fxRatesDaily)
    .values({
      provider: input.provider,
      baseCurrency: input.baseCurrency,
      quoteCurrency: input.quoteCurrency,
      rateDate: input.rateDate,
      rate: input.rate,
      fetchedAt: input.fetchedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        fxRatesDaily.provider,
        fxRatesDaily.baseCurrency,
        fxRatesDaily.quoteCurrency,
        fxRatesDaily.rateDate,
      ],
      set: {
        rate: input.rate,
        fetchedAt: input.fetchedAt ?? new Date(),
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to upsert fx_rate_daily row")
  }

  return row
}

export async function getLatestFxRateDailyOnOrBefore(input: {
  provider: typeof fxRatesDaily.$inferSelect.provider
  baseCurrency: string
  quoteCurrency: string
  rateDate: string
}) {
  const [row] = await db
    .select()
    .from(fxRatesDaily)
    .where(
      and(
        eq(fxRatesDaily.provider, input.provider),
        eq(fxRatesDaily.baseCurrency, input.baseCurrency),
        eq(fxRatesDaily.quoteCurrency, input.quoteCurrency),
        lte(fxRatesDaily.rateDate, input.rateDate),
      ),
    )
    .orderBy(desc(fxRatesDaily.rateDate))
    .limit(1)

  return row ?? null
}

export async function getActiveFinancialEventValuation(input: {
  financialEventId: string
  targetCurrency: string
}) {
  const [row] = await db
    .select()
    .from(financialEventValuations)
    .where(
      and(
        eq(financialEventValuations.financialEventId, input.financialEventId),
        eq(financialEventValuations.targetCurrency, input.targetCurrency),
        isNull(financialEventValuations.supersededAt),
      ),
    )
    .orderBy(desc(financialEventValuations.createdAt))
    .limit(1)

  return row ?? null
}

export async function setActiveFinancialEventValuation(input: {
  financialEventId: string
  targetCurrency: string
  valuationKind: typeof financialEventValuations.$inferInsert.valuationKind
  normalizedAmountMinor: number
  fxRate?: number | null
  fxRateDate?: string | null
  provider?: typeof financialEventValuations.$inferInsert.provider | null
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(financialEventValuations)
      .where(
        and(
          eq(financialEventValuations.financialEventId, input.financialEventId),
          eq(financialEventValuations.targetCurrency, input.targetCurrency),
          isNull(financialEventValuations.supersededAt),
        ),
      )
      .orderBy(desc(financialEventValuations.createdAt))
      .limit(1)

    if (
      existing &&
      existing.valuationKind === input.valuationKind &&
      existing.normalizedAmountMinor === input.normalizedAmountMinor &&
      sameOptionalNumber(existing.fxRate, input.fxRate) &&
      sameOptionalString(existing.fxRateDate, input.fxRateDate) &&
      sameOptionalString(existing.provider, input.provider)
    ) {
      return existing
    }

    if (existing) {
      await tx
        .update(financialEventValuations)
        .set({
          supersededAt: new Date(),
        })
        .where(eq(financialEventValuations.id, existing.id))
    }

    const [created] = await tx
      .insert(financialEventValuations)
      .values({
        financialEventId: input.financialEventId,
        targetCurrency: input.targetCurrency,
        valuationKind: input.valuationKind,
        normalizedAmountMinor: input.normalizedAmountMinor,
        fxRate: input.fxRate ?? null,
        fxRateDate: input.fxRateDate ?? null,
        provider: input.provider ?? null,
      })
      .returning()

    if (!created) {
      throw new Error("Failed to create active financial event valuation")
    }

    return created
  })
}

export async function listActiveFinancialEventValuationsForEventIds(input: {
  eventIds: string[]
  targetCurrency: string
}) {
  if (input.eventIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(financialEventValuations)
    .where(
      and(
        inArray(financialEventValuations.financialEventId, input.eventIds),
        eq(financialEventValuations.targetCurrency, input.targetCurrency),
        isNull(financialEventValuations.supersededAt),
      ),
    )
}

export async function listFinancialEventsForUserValuation(input: {
  userId: string
}) {
  return db
    .select({
      id: financialEvents.id,
      amountMinor: financialEvents.amountMinor,
      currency: financialEvents.currency,
      eventOccurredAt: financialEvents.eventOccurredAt,
    })
    .from(financialEvents)
    .where(eq(financialEvents.userId, input.userId))
    .orderBy(desc(financialEvents.eventOccurredAt), desc(financialEvents.createdAt))
}

export async function countMissingFinancialEventValuationsForUser(input: {
  userId: string
  targetCurrency: string
  dateFrom?: Date
  dateTo?: Date
}) {
  const conditions = [eq(financialEvents.userId, input.userId), isNull(financialEventValuations.id)]

  if (input.dateFrom) {
    conditions.push(gte(financialEvents.eventOccurredAt, input.dateFrom))
  }

  if (input.dateTo) {
    conditions.push(lte(financialEvents.eventOccurredAt, input.dateTo))
  }

  const rows = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .leftJoin(
      financialEventValuations,
      and(
        eq(financialEventValuations.financialEventId, financialEvents.id),
        eq(financialEventValuations.targetCurrency, input.targetCurrency),
        isNull(financialEventValuations.supersededAt),
      ),
    )
    .where(and(...conditions))

  return rows.length
}

export async function listFinancialEventsMissingValuationForUser(input: {
  userId: string
  targetCurrency: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
}) {
  const conditions = [eq(financialEvents.userId, input.userId), isNull(financialEventValuations.id)]

  if (input.dateFrom) {
    conditions.push(gte(financialEvents.eventOccurredAt, input.dateFrom))
  }

  if (input.dateTo) {
    conditions.push(lte(financialEvents.eventOccurredAt, input.dateTo))
  }

  return db
    .select({
      id: financialEvents.id,
      amountMinor: financialEvents.amountMinor,
      currency: financialEvents.currency,
      eventOccurredAt: financialEvents.eventOccurredAt,
    })
    .from(financialEvents)
    .leftJoin(
      financialEventValuations,
      and(
        eq(financialEventValuations.financialEventId, financialEvents.id),
        eq(financialEventValuations.targetCurrency, input.targetCurrency),
        isNull(financialEventValuations.supersededAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(financialEvents.eventOccurredAt), desc(financialEvents.createdAt))
    .limit(input.limit ?? 100)
}

export async function listDistinctFxCurrencyPairsForWarmup() {
  return db
    .selectDistinct({
      baseCurrency: financialEvents.currency,
      targetCurrency: userSettings.reportingCurrency,
    })
    .from(financialEvents)
    .innerJoin(userSettings, eq(userSettings.userId, financialEvents.userId))
    .where(ne(financialEvents.currency, userSettings.reportingCurrency))
}

export async function listDashboardLedgerEventsForUser(input: {
  userId: string
  targetCurrency: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
}) {
  const rows = await listLedgerEventsForUser({
    userId: input.userId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit: input.limit,
  })

  const valuations = await listActiveFinancialEventValuationsForEventIds({
    eventIds: rows.map(({ event }) => event.id),
    targetCurrency: input.targetCurrency,
  })
  const valuationsByEventId = new Map(
    valuations.map((valuation) => [valuation.financialEventId, valuation]),
  )

  return rows.map((row) => {
    const valuation = valuationsByEventId.get(row.event.id) ?? null
    const reportingAmountMinor =
      valuation?.normalizedAmountMinor ??
      (row.event.currency === input.targetCurrency ? row.event.amountMinor : null)

    return {
      ...row,
      valuation,
      reportingAmountMinor,
      reportingCurrency: input.targetCurrency,
    }
  })
}
