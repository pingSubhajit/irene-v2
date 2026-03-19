import { createHash } from "node:crypto"

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { db } from "./client"
import {
  extractedSignals,
  financialEventSources,
  financialEvents,
  financialInstitutionAliases,
  financialInstitutions,
  incomeStreams,
  merchants,
  paymentInstrumentObservations,
  paymentInstruments,
  rawDocuments,
  recurringObligations,
  reviewQueueItems,
  type ObservationResolutionStatus,
  type PaymentInstrumentInsert,
  type PaymentInstrumentObservationInsert,
  type PaymentInstrumentType,
  type ReviewQueueItemSelect,
} from "./schema"

export function normalizeInstrumentMaskedIdentifier(input: string | null | undefined) {
  const digits = input?.replace(/\D+/g, "").slice(-4) ?? ""
  return digits.length === 4 ? digits : null
}

export function normalizeInstitutionAlias(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const withoutAngles = input.replace(/<[^>]*>/g, " ")
  const lowered = withoutAngles.toLowerCase()
  const normalized = lowered.replace(/[^a-z0-9@.]+/g, " ").replace(/\s+/g, " ").trim()
  return normalized.length > 1 ? normalized : null
}

export function hashInstrumentAlias(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

export function normalizeInstitutionDisplayName(input: string) {
  const normalized = normalizeInstitutionAlias(input)

  if (!normalized) {
    return input.trim()
  }

  if (normalized.includes("icicibank") || /\bicici\b/.test(normalized)) {
    return "ICICI Bank"
  }

  if (normalized.includes("rbl")) {
    return "RBL Bank"
  }

  if (normalized.includes("hdfc")) {
    return "HDFC Bank"
  }

  if (normalized.includes("axis")) {
    return "Axis Bank"
  }

  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
}

export async function createPaymentInstrumentObservations(
  values: PaymentInstrumentObservationInsert[],
) {
  if (values.length === 0) {
    return []
  }

  return db.insert(paymentInstrumentObservations).values(values).returning()
}

export async function listPaymentInstrumentObservationsByMaskedIdentifier(input: {
  userId: string
  maskedIdentifier: string
}) {
  return db
    .select()
    .from(paymentInstrumentObservations)
    .where(
      and(
        eq(paymentInstrumentObservations.userId, input.userId),
        eq(paymentInstrumentObservations.maskedIdentifier, input.maskedIdentifier),
      ),
    )
    .orderBy(desc(paymentInstrumentObservations.createdAt))
}

export async function listPaymentInstrumentObservationsForEvent(financialEventId: string) {
  return db
    .select()
    .from(paymentInstrumentObservations)
    .where(eq(paymentInstrumentObservations.financialEventId, financialEventId))
    .orderBy(desc(paymentInstrumentObservations.createdAt))
}

export async function updatePaymentInstrumentObservationStatus(
  observationIds: string[],
  status: ObservationResolutionStatus,
  paymentInstrumentId?: string | null,
) {
  if (observationIds.length === 0) {
    return []
  }

  return db
    .update(paymentInstrumentObservations)
    .set({
      resolutionStatus: status,
      paymentInstrumentId: paymentInstrumentId ?? undefined,
      updatedAt: new Date(),
    })
    .where(inArray(paymentInstrumentObservations.id, observationIds))
    .returning()
}

export async function getFinancialEventInstrumentContext(financialEventId: string) {
  const [row] = await db
    .select({
      event: financialEvents,
      merchant: merchants,
      paymentInstrument: paymentInstruments,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(
      paymentInstruments,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id),
    )
    .where(eq(financialEvents.id, financialEventId))
    .limit(1)

  if (!row) {
    return null
  }

  const sources = await db
    .select({
      source: financialEventSources,
      rawDocument: rawDocuments,
      extractedSignal: extractedSignals,
    })
    .from(financialEventSources)
    .leftJoin(rawDocuments, eq(financialEventSources.rawDocumentId, rawDocuments.id))
    .leftJoin(
      extractedSignals,
      eq(financialEventSources.extractedSignalId, extractedSignals.id),
    )
    .where(eq(financialEventSources.financialEventId, financialEventId))
    .orderBy(desc(financialEventSources.createdAt))

  return {
    ...row,
    sources,
  }
}

export async function listCandidatePaymentInstrumentsByMaskedIdentifier(input: {
  userId: string
  maskedIdentifier: string
}) {
  const rows = await db
    .select({
      instrument: paymentInstruments,
      institution: financialInstitutions,
      linkedEventCount: sql<number>`count(${financialEvents.id})`,
    })
    .from(paymentInstruments)
    .leftJoin(
      financialInstitutions,
      eq(paymentInstruments.financialInstitutionId, financialInstitutions.id),
    )
    .leftJoin(
      financialEvents,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id),
    )
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.maskedIdentifier, input.maskedIdentifier),
      ),
    )
    .groupBy(paymentInstruments.id, financialInstitutions.id)
    .orderBy(desc(sql<number>`count(${financialEvents.id})`), asc(paymentInstruments.createdAt))

  return rows
}

export async function listCandidateFinancialInstitutions(input: {
  userId: string
  aliasHints: string[]
}) {
  const normalizedAliases = input.aliasHints
    .map((alias) => normalizeInstitutionAlias(alias))
    .filter((alias): alias is string => Boolean(alias))

  if (normalizedAliases.length === 0) {
    const rows = await db
      .select()
      .from(financialInstitutions)
      .where(eq(financialInstitutions.userId, input.userId))
      .orderBy(asc(financialInstitutions.displayName))

    return rows.map((institution) => ({
      institution,
      alias: null,
    }))
  }

  const aliasHashes = normalizedAliases.map(hashInstrumentAlias)

  return db
    .select({
      institution: financialInstitutions,
      alias: financialInstitutionAliases,
    })
    .from(financialInstitutionAliases)
    .innerJoin(
      financialInstitutions,
      eq(financialInstitutionAliases.financialInstitutionId, financialInstitutions.id),
    )
    .where(
      and(
        eq(financialInstitutions.userId, input.userId),
        inArray(financialInstitutionAliases.aliasHash, aliasHashes),
      ),
    )
    .orderBy(asc(financialInstitutions.displayName))
}

export async function getPaymentInstrumentById(paymentInstrumentId: string) {
  const [row] = await db
    .select({
      instrument: paymentInstruments,
      institution: financialInstitutions,
    })
    .from(paymentInstruments)
    .leftJoin(
      financialInstitutions,
      eq(paymentInstruments.financialInstitutionId, financialInstitutions.id),
    )
    .where(eq(paymentInstruments.id, paymentInstrumentId))
    .limit(1)

  return row ?? null
}

export async function getOrCreateFinancialInstitution(input: {
  userId: string
  displayName: string
}) {
  const normalizedName = normalizeInstitutionAlias(input.displayName)

  if (!normalizedName) {
    throw new Error("Missing canonical institution name")
  }

  const [existing] = await db
    .select()
    .from(financialInstitutions)
    .where(
      and(
        eq(financialInstitutions.userId, input.userId),
        eq(financialInstitutions.normalizedName, normalizedName),
      ),
    )
    .limit(1)

  if (existing) {
    return existing
  }

  const displayName = normalizeInstitutionDisplayName(input.displayName)
  const [created] = await db
    .insert(financialInstitutions)
    .values({
      userId: input.userId,
      displayName,
      normalizedName,
    })
    .onConflictDoNothing()
    .returning()

  if (created) {
    return created
  }

  const [resolved] = await db
    .select()
    .from(financialInstitutions)
    .where(
      and(
        eq(financialInstitutions.userId, input.userId),
        eq(financialInstitutions.normalizedName, normalizedName),
      ),
    )
    .limit(1)

  if (!resolved) {
    throw new Error("Failed to resolve financial institution")
  }

  return resolved
}

export async function upsertFinancialInstitutionAliases(input: {
  financialInstitutionId: string
  aliases: Array<{ aliasText: string; source: string; confidence?: number }>
}) {
  const values = input.aliases
    .map((alias) => {
      const normalized = normalizeInstitutionAlias(alias.aliasText)

      if (!normalized) {
        return null
      }

      return {
        financialInstitutionId: input.financialInstitutionId,
        aliasText: alias.aliasText.trim(),
        aliasHash: hashInstrumentAlias(normalized),
        source: alias.source,
        confidence: alias.confidence ?? 1,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (values.length === 0) {
    return []
  }

  return db.insert(financialInstitutionAliases).values(values).onConflictDoNothing().returning()
}

export async function createPaymentInstrument(input: PaymentInstrumentInsert) {
  const [row] = await db.insert(paymentInstruments).values(input).returning()

  if (!row) {
    throw new Error("Failed to create payment instrument")
  }

  return row
}

export async function updatePaymentInstrument(
  paymentInstrumentId: string,
  input: Partial<PaymentInstrumentInsert>,
) {
  const [row] = await db
    .update(paymentInstruments)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(paymentInstruments.id, paymentInstrumentId))
    .returning()

  return row ?? null
}

export async function findExistingCanonicalPaymentInstrument(input: {
  userId: string
  financialInstitutionId?: string | null
  instrumentType: PaymentInstrumentType
  maskedIdentifier?: string | null
}) {
  const conditions = [
    eq(paymentInstruments.userId, input.userId),
    eq(paymentInstruments.instrumentType, input.instrumentType),
  ]

  if (input.financialInstitutionId) {
    conditions.push(eq(paymentInstruments.financialInstitutionId, input.financialInstitutionId))
  }

  if (input.maskedIdentifier) {
    conditions.push(eq(paymentInstruments.maskedIdentifier, input.maskedIdentifier))
  }

  const [row] = await db
    .select()
    .from(paymentInstruments)
    .where(and(...conditions))
    .orderBy(asc(paymentInstruments.createdAt))
    .limit(1)

  return row ?? null
}

export async function mergePaymentInstruments(input: {
  canonicalPaymentInstrumentId: string
  duplicatePaymentInstrumentIds: string[]
}) {
  const duplicateIds = input.duplicatePaymentInstrumentIds.filter(
    (id) => id !== input.canonicalPaymentInstrumentId,
  )

  if (duplicateIds.length === 0) {
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .update(financialEvents)
      .set({
        paymentInstrumentId: input.canonicalPaymentInstrumentId,
        updatedAt: new Date(),
      })
      .where(inArray(financialEvents.paymentInstrumentId, duplicateIds))

    await tx
      .update(recurringObligations)
      .set({
        paymentInstrumentId: input.canonicalPaymentInstrumentId,
        updatedAt: new Date(),
      })
      .where(inArray(recurringObligations.paymentInstrumentId, duplicateIds))

    await tx
      .update(incomeStreams)
      .set({
        paymentInstrumentId: input.canonicalPaymentInstrumentId,
        updatedAt: new Date(),
      })
      .where(inArray(incomeStreams.paymentInstrumentId, duplicateIds))

    await tx
      .update(paymentInstrumentObservations)
      .set({
        paymentInstrumentId: input.canonicalPaymentInstrumentId,
        updatedAt: new Date(),
      })
      .where(inArray(paymentInstrumentObservations.paymentInstrumentId, duplicateIds))

    await tx.delete(paymentInstruments).where(inArray(paymentInstruments.id, duplicateIds))
  })
}

export async function listUserIdsForInstrumentRepair() {
  const eventRows = await db
    .selectDistinct({ userId: financialEvents.userId })
    .from(financialEvents)
    .where(isNotNull(financialEvents.userId))

  const instrumentRows = await db
    .selectDistinct({ userId: paymentInstruments.userId })
    .from(paymentInstruments)
    .where(isNotNull(paymentInstruments.userId))

  return Array.from(
    new Set([...eventRows.map((row) => row.userId), ...instrumentRows.map((row) => row.userId)]),
  )
}

export async function listFinancialEventIdsForInstrumentRepair(userId: string) {
  const rows = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .where(eq(financialEvents.userId, userId))
    .orderBy(asc(financialEvents.eventOccurredAt))

  return rows.map((row) => row.id)
}

export async function findOpenPaymentInstrumentReview(input: {
  userId: string
  financialEventId?: string | null
}) {
  const [item] = await db
    .select()
    .from(reviewQueueItems)
    .where(
      and(
        eq(reviewQueueItems.userId, input.userId),
        eq(reviewQueueItems.itemType, "payment_instrument_resolution"),
        eq(reviewQueueItems.status, "open"),
        input.financialEventId
          ? eq(reviewQueueItems.financialEventId, input.financialEventId)
          : sql`true`,
      ),
    )
    .orderBy(desc(reviewQueueItems.createdAt))
    .limit(1)

  return item ?? null
}

export async function listRecentPaymentInstrumentsForUser(userId: string) {
  return db
    .select({
      instrument: paymentInstruments,
      institution: financialInstitutions,
    })
    .from(paymentInstruments)
    .leftJoin(
      financialInstitutions,
      eq(paymentInstruments.financialInstitutionId, financialInstitutions.id),
    )
    .where(eq(paymentInstruments.userId, userId))
    .orderBy(asc(paymentInstruments.displayName))
}

export type InstrumentReviewItem = ReviewQueueItemSelect
export type CandidatePaymentInstrument = Awaited<
  ReturnType<typeof listCandidatePaymentInstrumentsByMaskedIdentifier>
>[number]
export type CandidateInstitution = Awaited<
  ReturnType<typeof listCandidateFinancialInstitutions>
>[number]
