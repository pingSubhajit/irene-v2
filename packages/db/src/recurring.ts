import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm"

import { db } from "./client"
import {
  categories,
  emiPlans,
  financialEvents,
  incomeStreams,
  merchants,
  paymentInstruments,
  recurringObligations,
  type EmiPlanInsert,
  type FinancialEventType,
  type IncomeStreamInsert,
  type IncomeStreamSelect,
  type RecurringObligationInsert,
  type RecurringObligationSelect,
} from "./schema"

export type RecurringObligationSummary = Awaited<
  ReturnType<typeof listRecurringObligationsForUser>
>[number]

export type IncomeStreamSummary = Awaited<ReturnType<typeof listIncomeStreamsForUser>>[number]

export async function getFinancialEventForRecurring(eventId: string) {
  const [row] = await db
    .select({
      event: financialEvents,
      merchant: merchants,
      category: categories,
      paymentInstrument: paymentInstruments,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
    .leftJoin(
      paymentInstruments,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id),
    )
    .where(eq(financialEvents.id, eventId))
    .limit(1)

  return row ?? null
}

export async function listRecurringCandidateEvents(input: {
  userId: string
  eventType: FinancialEventType
  merchantId?: string | null
  paymentInstrumentId?: string | null
  dateFrom: Date
  dateTo: Date
  excludeEventId?: string
}) {
  const conditions = [
    eq(financialEvents.userId, input.userId),
    eq(financialEvents.eventType, input.eventType),
    eq(financialEvents.status, "confirmed"),
    gte(financialEvents.eventOccurredAt, input.dateFrom),
    lte(financialEvents.eventOccurredAt, input.dateTo),
  ]

  if (input.excludeEventId) {
    conditions.push(ne(financialEvents.id, input.excludeEventId))
  }

  const identityCondition =
    input.merchantId || input.paymentInstrumentId
      ? or(
          input.merchantId ? eq(financialEvents.merchantId, input.merchantId) : undefined,
          input.paymentInstrumentId
            ? eq(financialEvents.paymentInstrumentId, input.paymentInstrumentId)
            : undefined,
        )
      : undefined

  return db
    .select()
    .from(financialEvents)
    .where(and(...conditions, identityCondition))
    .orderBy(asc(financialEvents.eventOccurredAt))
}

export async function findLatestIncomeEventForStream(input: {
  userId: string
  sourceMerchantId?: string | null
  paymentInstrumentId?: string | null
  currency?: string | null
}) {
  const conditions = [
    eq(financialEvents.userId, input.userId),
    eq(financialEvents.eventType, "income"),
    eq(financialEvents.status, "confirmed"),
  ]

  if (input.currency) {
    conditions.push(eq(financialEvents.currency, input.currency))
  }

  if (input.sourceMerchantId || input.paymentInstrumentId) {
    conditions.push(
      or(
        input.sourceMerchantId
          ? eq(financialEvents.merchantId, input.sourceMerchantId)
          : undefined,
        input.paymentInstrumentId
          ? eq(financialEvents.paymentInstrumentId, input.paymentInstrumentId)
          : undefined,
      )!,
    )
  } else {
    conditions.push(
      and(isNull(financialEvents.merchantId), isNull(financialEvents.paymentInstrumentId))!,
    )
  }

  const [event] = await db
    .select()
    .from(financialEvents)
    .where(and(...conditions))
    .orderBy(desc(financialEvents.eventOccurredAt))
    .limit(1)

  return event ?? null
}

export async function findMatchingRecurringObligation(input: {
  userId: string
  obligationType: RecurringObligationSelect["obligationType"]
  merchantId?: string | null
  paymentInstrumentId?: string | null
  currency?: string | null
}) {
  const conditions = [
    eq(recurringObligations.userId, input.userId),
    eq(recurringObligations.obligationType, input.obligationType),
  ]

  if (input.currency) {
    conditions.push(eq(recurringObligations.currency, input.currency))
  }

  if (input.merchantId || input.paymentInstrumentId) {
    conditions.push(
      or(
        input.merchantId ? eq(recurringObligations.merchantId, input.merchantId) : undefined,
        input.paymentInstrumentId
          ? eq(recurringObligations.paymentInstrumentId, input.paymentInstrumentId)
          : undefined,
      )!,
    )
  } else {
    conditions.push(
      and(isNull(recurringObligations.merchantId), isNull(recurringObligations.paymentInstrumentId))!,
    )
  }

  const [row] = await db
    .select()
    .from(recurringObligations)
    .where(and(...conditions))
    .orderBy(desc(recurringObligations.updatedAt))
    .limit(1)

  return row ?? null
}

export async function createRecurringObligation(input: RecurringObligationInsert) {
  const [row] = await db.insert(recurringObligations).values(input).returning()

  if (!row) {
    throw new Error("Failed to create recurring obligation")
  }

  return row
}

export async function updateRecurringObligation(
  recurringObligationId: string,
  input: Partial<RecurringObligationInsert>,
) {
  const [row] = await db
    .update(recurringObligations)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(recurringObligations.id, recurringObligationId))
    .returning()

  return row ?? null
}

export async function getRecurringObligationById(recurringObligationId: string) {
  const [row] = await db
    .select()
    .from(recurringObligations)
    .where(eq(recurringObligations.id, recurringObligationId))
    .limit(1)

  return row ?? null
}

export async function upsertEmiPlan(input: {
  recurringObligationId: string
  values: EmiPlanInsert
}) {
  const [existing] = await db
    .select()
    .from(emiPlans)
    .where(eq(emiPlans.recurringObligationId, input.recurringObligationId))
    .limit(1)

  if (!existing) {
    const [created] = await db.insert(emiPlans).values(input.values).returning()

    if (!created) {
      throw new Error("Failed to create EMI plan")
    }

    return created
  }

  const [updated] = await db
    .update(emiPlans)
    .set({
      ...input.values,
      updatedAt: new Date(),
    })
    .where(eq(emiPlans.id, existing.id))
    .returning()

  return updated ?? existing
}

export async function getEmiPlanByRecurringObligationId(recurringObligationId: string) {
  const [row] = await db
    .select()
    .from(emiPlans)
    .where(eq(emiPlans.recurringObligationId, recurringObligationId))
    .limit(1)

  return row ?? null
}

export async function findMatchingIncomeStream(input: {
  userId: string
  incomeType: IncomeStreamSelect["incomeType"]
  sourceMerchantId?: string | null
  paymentInstrumentId?: string | null
  currency?: string | null
}) {
  const conditions = [
    eq(incomeStreams.userId, input.userId),
    eq(incomeStreams.incomeType, input.incomeType),
  ]

  if (input.currency) {
    conditions.push(eq(incomeStreams.currency, input.currency))
  }

  if (input.sourceMerchantId || input.paymentInstrumentId) {
    conditions.push(
      or(
        input.sourceMerchantId
          ? eq(incomeStreams.sourceMerchantId, input.sourceMerchantId)
          : undefined,
        input.paymentInstrumentId
          ? eq(incomeStreams.paymentInstrumentId, input.paymentInstrumentId)
          : undefined,
      )!,
    )
  } else {
    conditions.push(
      and(
        isNull(incomeStreams.sourceMerchantId),
        isNull(incomeStreams.paymentInstrumentId),
      )!,
    )
  }

  const [row] = await db
    .select()
    .from(incomeStreams)
    .where(and(...conditions))
    .orderBy(desc(incomeStreams.updatedAt))
    .limit(1)

  return row ?? null
}

export async function createIncomeStream(input: IncomeStreamInsert) {
  const [row] = await db.insert(incomeStreams).values(input).returning()

  if (!row) {
    throw new Error("Failed to create income stream")
  }

  return row
}

export async function updateIncomeStream(
  incomeStreamId: string,
  input: Partial<IncomeStreamInsert>,
) {
  const [row] = await db
    .update(incomeStreams)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(incomeStreams.id, incomeStreamId))
    .returning()

  return row ?? null
}

export async function getIncomeStreamById(incomeStreamId: string) {
  const [row] = await db
    .select()
    .from(incomeStreams)
    .where(eq(incomeStreams.id, incomeStreamId))
    .limit(1)

  return row ?? null
}

export async function listRecurringObligationsForUser(input: {
  userId: string
  obligationType?: RecurringObligationSelect["obligationType"]
  status?: RecurringObligationSelect["status"]
  limit?: number
}) {
  const conditions = [eq(recurringObligations.userId, input.userId)]

  if (input.obligationType) {
    conditions.push(eq(recurringObligations.obligationType, input.obligationType))
  }

  if (input.status) {
    conditions.push(eq(recurringObligations.status, input.status))
  }

  return db
    .select({
      obligation: recurringObligations,
      merchant: merchants,
      category: categories,
      paymentInstrument: paymentInstruments,
      emiPlan: emiPlans,
    })
    .from(recurringObligations)
    .leftJoin(merchants, eq(recurringObligations.merchantId, merchants.id))
    .leftJoin(categories, eq(recurringObligations.categoryId, categories.id))
    .leftJoin(
      paymentInstruments,
      eq(recurringObligations.paymentInstrumentId, paymentInstruments.id),
    )
    .leftJoin(emiPlans, eq(emiPlans.recurringObligationId, recurringObligations.id))
    .where(and(...conditions))
    .orderBy(
      asc(recurringObligations.status),
      asc(recurringObligations.nextDueAt),
      desc(recurringObligations.updatedAt),
    )
    .limit(input.limit ?? 50)
}

export async function listIncomeStreamsForUser(input: {
  userId: string
  status?: IncomeStreamSelect["status"]
  limit?: number
}) {
  const conditions = [eq(incomeStreams.userId, input.userId)]

  if (input.status) {
    conditions.push(eq(incomeStreams.status, input.status))
  }

  return db
    .select({
      incomeStream: incomeStreams,
      merchant: merchants,
      paymentInstrument: paymentInstruments,
    })
    .from(incomeStreams)
    .leftJoin(merchants, eq(incomeStreams.sourceMerchantId, merchants.id))
    .leftJoin(
      paymentInstruments,
      eq(incomeStreams.paymentInstrumentId, paymentInstruments.id),
    )
    .where(and(...conditions))
    .orderBy(
      asc(incomeStreams.status),
      asc(incomeStreams.nextExpectedAt),
      desc(incomeStreams.updatedAt),
    )
    .limit(input.limit ?? 50)
}

export async function countRecurringObligationsByType(userId: string) {
  const rows = await db
    .select()
    .from(recurringObligations)
    .where(
      and(
        eq(recurringObligations.userId, userId),
        inArray(recurringObligations.status, ["suspected", "active"]),
      ),
    )

  return rows.reduce(
    (acc, row) => {
      if (row.obligationType === "subscription") acc.subscriptions += 1
      if (row.obligationType === "emi") acc.emis += 1
      if (row.obligationType === "bill") acc.bills += 1
      if (row.status === "suspected") acc.suspected += 1
      return acc
    },
    { subscriptions: 0, emis: 0, bills: 0, suspected: 0 },
  )
}

export async function countIncomeStreams(userId: string) {
  const rows = await db
    .select()
    .from(incomeStreams)
    .where(
      and(eq(incomeStreams.userId, userId), inArray(incomeStreams.status, ["suspected", "active"])),
    )

  return rows.reduce(
    (acc, row) => {
      if (row.status === "active") acc.active += 1
      if (row.status === "suspected") acc.suspected += 1
      return acc
    },
    { active: 0, suspected: 0 },
  )
}
