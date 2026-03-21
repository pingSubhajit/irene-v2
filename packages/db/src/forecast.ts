import { createHash } from "node:crypto"

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm"

import { db } from "./client"
import {
  balanceAnchors,
  balanceObservations,
  categories,
  emiPlans,
  financialEvents,
  forecastRuns,
  forecastSnapshots,
  incomeStreams,
  merchants,
  paymentInstruments,
  recurringObligations,
  type BalanceAnchorInsert,
  type BalanceObservationInsert,
  type ForecastRunInsert,
  type ForecastSnapshotInsert,
  type PaymentInstrumentInsert,
} from "./schema"

export function hashForecastInputs(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export async function createForecastRun(input: ForecastRunInsert) {
  const [row] = await db.insert(forecastRuns).values(input).returning()

  if (!row) {
    throw new Error("Failed to create forecast run")
  }

  return row
}

export async function getForecastRunByIdentity(input: {
  userId: string
  runType: "anchored" | "net_only"
  baselineDate: string
  inputsHash: string
}) {
  const [row] = await db
    .select()
    .from(forecastRuns)
    .where(
      and(
        eq(forecastRuns.userId, input.userId),
        eq(forecastRuns.runType, input.runType),
        eq(forecastRuns.baselineDate, input.baselineDate),
        eq(forecastRuns.inputsHash, input.inputsHash),
      ),
    )
    .limit(1)

  return row ?? null
}

export async function updateForecastRun(
  forecastRunId: string,
  input: Partial<ForecastRunInsert>,
) {
  const [row] = await db
    .update(forecastRuns)
    .set(input)
    .where(eq(forecastRuns.id, forecastRunId))
    .returning()

  return row ?? null
}

export async function replaceForecastSnapshots(
  forecastRunId: string,
  snapshots: ForecastSnapshotInsert[],
) {
  await db.delete(forecastSnapshots).where(eq(forecastSnapshots.forecastRunId, forecastRunId))

  if (snapshots.length === 0) {
    return []
  }

  return db.insert(forecastSnapshots).values(snapshots).returning()
}

export async function getLatestSuccessfulForecastRunForUser(userId: string) {
  const [run] = await db
    .select()
    .from(forecastRuns)
    .where(and(eq(forecastRuns.userId, userId), eq(forecastRuns.status, "succeeded")))
    .orderBy(desc(forecastRuns.createdAt))
    .limit(1)

  return run ?? null
}

export async function listForecastSnapshotsForRun(forecastRunId: string) {
  return db
    .select()
    .from(forecastSnapshots)
    .where(eq(forecastSnapshots.forecastRunId, forecastRunId))
    .orderBy(asc(forecastSnapshots.snapshotDate))
}

export async function getLatestForecastRunWithSnapshots(userId: string) {
  const run = await getLatestSuccessfulForecastRunForUser(userId)

  if (!run) {
    return null
  }

  const snapshots = await listForecastSnapshotsForRun(run.id)

  return {
    run,
    snapshots,
  }
}

export async function createBalanceObservation(input: BalanceObservationInsert) {
  const conditions = [
    eq(balanceObservations.userId, input.userId),
    eq(balanceObservations.paymentInstrumentId, input.paymentInstrumentId),
    eq(balanceObservations.observationKind, input.observationKind),
    eq(balanceObservations.amountMinor, input.amountMinor),
    eq(balanceObservations.observedAt, input.observedAt),
  ]

  if (input.rawDocumentId) {
    conditions.push(eq(balanceObservations.rawDocumentId, input.rawDocumentId))
  } else {
    conditions.push(isNull(balanceObservations.rawDocumentId))
  }

  if (input.extractedSignalId) {
    conditions.push(eq(balanceObservations.extractedSignalId, input.extractedSignalId))
  } else {
    conditions.push(isNull(balanceObservations.extractedSignalId))
  }

  const [existing] = await db
    .select()
    .from(balanceObservations)
    .where(and(...conditions))
    .limit(1)

  if (existing) {
    return existing
  }

  const [row] = await db.insert(balanceObservations).values(input).returning()

  if (!row) {
    throw new Error("Failed to create balance observation")
  }

  return row
}

export async function listRecentBalanceObservationsForUser(userId: string, limit = 20) {
  return db
    .select({
      observation: balanceObservations,
      paymentInstrument: paymentInstruments,
    })
    .from(balanceObservations)
    .innerJoin(
      paymentInstruments,
      eq(balanceObservations.paymentInstrumentId, paymentInstruments.id),
    )
    .where(eq(balanceObservations.userId, userId))
    .orderBy(desc(balanceObservations.observedAt))
    .limit(limit)
}

export async function listSuggestedBalanceObservationsForUser(userId: string, limit = 12) {
  return db
    .select({
      observation: balanceObservations,
      paymentInstrument: paymentInstruments,
      anchor: balanceAnchors,
    })
    .from(balanceObservations)
    .innerJoin(
      paymentInstruments,
      eq(balanceObservations.paymentInstrumentId, paymentInstruments.id),
    )
    .leftJoin(
      balanceAnchors,
      and(
        eq(balanceAnchors.userId, userId),
        eq(balanceAnchors.paymentInstrumentId, balanceObservations.paymentInstrumentId),
      ),
    )
    .where(
      and(
        eq(balanceObservations.userId, userId),
        eq(balanceObservations.observationKind, "available_balance"),
      ),
    )
    .orderBy(desc(balanceObservations.observedAt))
    .limit(limit)
}

export async function upsertBalanceAnchor(input: BalanceAnchorInsert) {
  const [row] = await db
    .insert(balanceAnchors)
    .values(input)
    .onConflictDoUpdate({
      target: [balanceAnchors.userId, balanceAnchors.paymentInstrumentId],
      set: {
        amountMinor: input.amountMinor,
        currency: input.currency,
        anchoredAt: input.anchoredAt,
        sourceObservationId: input.sourceObservationId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to upsert balance anchor")
  }

  return row
}

export async function listBalanceAnchorsForUser(userId: string) {
  return db
    .select({
      anchor: balanceAnchors,
      paymentInstrument: paymentInstruments,
      sourceObservation: balanceObservations,
    })
    .from(balanceAnchors)
    .innerJoin(
      paymentInstruments,
      eq(balanceAnchors.paymentInstrumentId, paymentInstruments.id),
    )
    .leftJoin(
      balanceObservations,
      eq(balanceAnchors.sourceObservationId, balanceObservations.id),
    )
    .where(eq(balanceAnchors.userId, userId))
    .orderBy(desc(balanceAnchors.anchoredAt))
}

export async function getBalanceAnchorForInstrument(input: {
  userId: string
  paymentInstrumentId: string
}) {
  const [row] = await db
    .select()
    .from(balanceAnchors)
    .where(
      and(
        eq(balanceAnchors.userId, input.userId),
        eq(balanceAnchors.paymentInstrumentId, input.paymentInstrumentId),
      ),
    )
    .limit(1)

  return row ?? null
}

export async function getBalanceObservationById(observationId: string) {
  const [row] = await db
    .select()
    .from(balanceObservations)
    .where(eq(balanceObservations.id, observationId))
    .limit(1)

  return row ?? null
}

export async function listCashPaymentInstrumentsForUser(userId: string) {
  return db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, userId),
        inArray(paymentInstruments.instrumentType, ["bank_account", "wallet"]),
      ),
    )
    .orderBy(asc(paymentInstruments.displayName))
}

export async function listDebitAndUpiPaymentInstrumentsForUser(userId: string) {
  return db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, userId),
        inArray(paymentInstruments.instrumentType, ["debit_card", "upi", "wallet"]),
      ),
    )
    .orderBy(asc(paymentInstruments.displayName))
}

export async function createManualCashPaymentInstrument(input: {
  userId: string
  displayName: string
  maskedIdentifier?: string | null
  currency: string
}) {
  const [row] = await db
    .insert(paymentInstruments)
    .values({
      userId: input.userId,
      instrumentType: "bank_account",
      providerName: input.displayName,
      displayName: input.displayName,
      maskedIdentifier: input.maskedIdentifier ?? null,
      currency: input.currency,
      status: "active",
    } satisfies PaymentInstrumentInsert)
    .returning()

  if (!row) {
    throw new Error("Failed to create cash payment instrument")
  }

  return row
}

export async function updatePaymentInstrumentBackingLink(input: {
  userId: string
  paymentInstrumentId: string
  backingPaymentInstrumentId: string | null
}) {
  const [row] = await db
    .update(paymentInstruments)
    .set({
      backingPaymentInstrumentId: input.backingPaymentInstrumentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentInstruments.id, input.paymentInstrumentId),
        eq(paymentInstruments.userId, input.userId),
      ),
    )
    .returning()

  return row ?? null
}

export async function listLatestCreditHeadroomObservationsForUser(userId: string, limit = 6) {
  return db
    .select({
      observation: balanceObservations,
      paymentInstrument: paymentInstruments,
    })
    .from(balanceObservations)
    .innerJoin(
      paymentInstruments,
      eq(balanceObservations.paymentInstrumentId, paymentInstruments.id),
    )
    .where(
      and(
        eq(balanceObservations.userId, userId),
        eq(balanceObservations.observationKind, "available_credit_limit"),
      ),
    )
    .orderBy(desc(balanceObservations.observedAt))
    .limit(limit)
}

export async function listForecastableRecurringObligationsForUser(userId: string) {
  return db
    .select({
      obligation: recurringObligations,
      merchant: merchants,
      category: categories,
    })
    .from(recurringObligations)
    .leftJoin(merchants, eq(recurringObligations.merchantId, merchants.id))
    .leftJoin(categories, eq(recurringObligations.categoryId, categories.id))
    .where(
      and(
        eq(recurringObligations.userId, userId),
        inArray(recurringObligations.status, ["active", "suspected"]),
      ),
    )
}

export async function listForecastableIncomeStreamsForUser(userId: string) {
  return db
    .select({
      incomeStream: incomeStreams,
      merchant: merchants,
    })
    .from(incomeStreams)
    .leftJoin(merchants, eq(incomeStreams.sourceMerchantId, merchants.id))
    .where(
      and(eq(incomeStreams.userId, userId), inArray(incomeStreams.status, ["active", "suspected"])),
    )
}

export async function listForecastableEmiPlansForUser(userId: string) {
  return db
    .select({
      emiPlan: emiPlans,
      recurringObligation: recurringObligations,
      merchant: merchants,
    })
    .from(emiPlans)
    .innerJoin(
      recurringObligations,
      eq(emiPlans.recurringObligationId, recurringObligations.id),
    )
    .leftJoin(merchants, eq(emiPlans.merchantId, merchants.id))
    .where(and(eq(emiPlans.userId, userId), inArray(emiPlans.status, ["active", "suspected"])))
}

export async function listConfirmedForecastBaseEventsForUser(input: {
  userId: string
  fromDate: Date
}) {
  return db
    .select()
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.userId, input.userId),
        eq(financialEvents.status, "confirmed"),
        sql`${financialEvents.eventOccurredAt} >= ${input.fromDate}`,
      ),
    )
    .orderBy(asc(financialEvents.eventOccurredAt))
}

export async function listUserIdsForForecasting() {
  const [eventRows, recurringRows, incomeRows, anchorRows, instrumentRows] = await Promise.all([
    db.selectDistinct({ userId: financialEvents.userId }).from(financialEvents),
    db.selectDistinct({ userId: recurringObligations.userId }).from(recurringObligations),
    db.selectDistinct({ userId: incomeStreams.userId }).from(incomeStreams),
    db.selectDistinct({ userId: balanceAnchors.userId }).from(balanceAnchors),
    db.selectDistinct({ userId: paymentInstruments.userId }).from(paymentInstruments),
  ])

  return [...new Set([...eventRows, ...recurringRows, ...incomeRows, ...anchorRows, ...instrumentRows].map((row) => row.userId))]
}

export async function getPaymentInstrumentByUserAndLast4(input: {
  userId: string
  last4: string
}) {
  const [row] = await db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.maskedIdentifier, input.last4),
      ),
    )
    .orderBy(
      desc(
        sql`case when ${paymentInstruments.instrumentType} in ('bank_account', 'wallet', 'credit_card', 'debit_card') then 1 else 0 end`,
      ),
      asc(paymentInstruments.createdAt),
    )
    .limit(1)

  return row ?? null
}

export async function listLinkedCashAccountsForInstrument(input: {
  userId: string
  paymentInstrumentId: string
}) {
  return db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.backingPaymentInstrumentId, input.paymentInstrumentId),
      ),
    )
}

export async function listUnanchoredCashPaymentInstrumentsForUser(userId: string) {
  return db
    .select({
      paymentInstrument: paymentInstruments,
      anchor: balanceAnchors,
    })
    .from(paymentInstruments)
    .leftJoin(
      balanceAnchors,
      and(
        eq(balanceAnchors.userId, userId),
        eq(balanceAnchors.paymentInstrumentId, paymentInstruments.id),
      ),
    )
    .where(
      and(
        eq(paymentInstruments.userId, userId),
        inArray(paymentInstruments.instrumentType, ["bank_account", "wallet"]),
      ),
    )
    .orderBy(asc(paymentInstruments.displayName))
}

export async function getLatestBalanceObservationForInstrument(input: {
  userId: string
  paymentInstrumentId: string
  observationKind?: "available_balance" | "available_credit_limit"
}) {
  const conditions = [
    eq(balanceObservations.userId, input.userId),
    eq(balanceObservations.paymentInstrumentId, input.paymentInstrumentId),
  ]

  if (input.observationKind) {
    conditions.push(eq(balanceObservations.observationKind, input.observationKind))
  }

  const [row] = await db
    .select()
    .from(balanceObservations)
    .where(and(...conditions))
    .orderBy(desc(balanceObservations.observedAt))
    .limit(1)

  return row ?? null
}
