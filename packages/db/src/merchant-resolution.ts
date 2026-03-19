import { createHash } from "node:crypto"

import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm"

import { db } from "./client"
import {
  extractedSignals,
  financialEvents,
  financialEventSources,
  merchants,
  merchantAliases,
  merchantObservations,
  paymentProcessors,
  paymentProcessorAliases,
  rawDocuments,
  recurringObligations,
  reviewQueueItems,
  type MerchantInsert,
  type MerchantObservationInsert,
  type MerchantObservationSelect,
  type ReviewQueueItemSelect,
} from "./schema"

export function normalizeMerchantResolutionName(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const withoutAngles = input.replace(/<[^>]*>/g, " ")
  const withoutQuotes = withoutAngles.replace(/["'`]/g, " ")
  const lowered = withoutQuotes.toLowerCase()
  const normalized = lowered.replace(/[^a-z0-9@.&/]+/g, " ").replace(/\s+/g, " ").trim()
  return normalized.length > 1 ? normalized : null
}

function hashAlias(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

export function normalizePaymentProcessorDisplayName(input: string) {
  const normalized = normalizeMerchantResolutionName(input)

  if (!normalized) {
    return input.trim()
  }

  if (normalized.includes("paypal")) return "PayPal"
  if (normalized.includes("razorpay")) return "Razorpay"
  if (normalized.includes("google")) return "Google"
  if (normalized.includes("amazon pay")) return "Amazon Pay"
  if (normalized.includes("apple")) return "Apple"

  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
}

export async function createMerchantObservations(values: MerchantObservationInsert[]) {
  if (values.length === 0) {
    return []
  }

  return db.insert(merchantObservations).values(values).returning()
}

export async function listMerchantObservationsForEvent(financialEventId: string) {
  return db
    .select()
    .from(merchantObservations)
    .where(eq(merchantObservations.financialEventId, financialEventId))
    .orderBy(desc(merchantObservations.createdAt))
}

export async function listMerchantObservationsByClusterKey(input: {
  userId: string
  merchantDescriptorRaw?: string | null
  merchantNameHint?: string | null
}) {
  const conditions = [eq(merchantObservations.userId, input.userId)]
  const descriptor = normalizeMerchantResolutionName(input.merchantDescriptorRaw)
  const merchantName = normalizeMerchantResolutionName(input.merchantNameHint)

  if (descriptor || merchantName) {
    conditions.push(
      or(
        descriptor
          ? sql`regexp_replace(lower(coalesce(${merchantObservations.merchantDescriptorRaw}, '')), '[^a-z0-9@.&/]+', ' ', 'g') like ${`%${descriptor}%`}`
          : undefined,
        merchantName
          ? sql`regexp_replace(lower(coalesce(${merchantObservations.merchantNameHint}, '')), '[^a-z0-9@.&/]+', ' ', 'g') like ${`%${merchantName}%`}`
          : undefined,
      )!,
    )
  }

  return db
    .select()
    .from(merchantObservations)
    .where(and(...conditions))
    .orderBy(desc(merchantObservations.createdAt))
}

export async function updateMerchantObservationStatus(
  observationIds: string[],
  status: MerchantObservationSelect["resolutionStatus"],
  input?: {
    merchantId?: string | null
    paymentProcessorId?: string | null
  },
) {
  if (observationIds.length === 0) {
    return []
  }

  return db
    .update(merchantObservations)
    .set({
      resolutionStatus: status,
      merchantId: input?.merchantId ?? undefined,
      paymentProcessorId: input?.paymentProcessorId ?? undefined,
      updatedAt: new Date(),
    })
    .where(inArray(merchantObservations.id, observationIds))
    .returning()
}

export async function getFinancialEventMerchantContext(financialEventId: string) {
  const [row] = await db
    .select({
      event: financialEvents,
      merchant: merchants,
      paymentProcessor: paymentProcessors,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(
      paymentProcessors,
      eq(financialEvents.paymentProcessorId, paymentProcessors.id),
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

export async function listCandidateMerchants(input: {
  userId: string
  aliasHints: string[]
}) {
  const normalizedHints = input.aliasHints
    .map((alias) => normalizeMerchantResolutionName(alias))
    .filter((alias): alias is string => Boolean(alias))

  if (normalizedHints.length === 0) {
    const rows = await db
      .select({
        merchant: merchants,
        linkedEventCount: sql<number>`0`,
      })
      .from(merchants)
      .where(eq(merchants.userId, input.userId))
      .orderBy(asc(merchants.displayName))
      .limit(20)

    return rows
  }

  const aliasHashes = normalizedHints.map(hashAlias)

  return db
    .select({
      merchant: merchants,
      linkedEventCount: sql<number>`count(${financialEvents.id})`,
    })
    .from(merchantAliases)
    .innerJoin(merchants, eq(merchantAliases.merchantId, merchants.id))
    .leftJoin(financialEvents, eq(financialEvents.merchantId, merchants.id))
    .where(
      and(
        eq(merchants.userId, input.userId),
        inArray(merchantAliases.aliasHash, aliasHashes),
      ),
    )
    .groupBy(merchants.id)
    .orderBy(desc(sql<number>`count(${financialEvents.id})`), asc(merchants.displayName))
}

export async function listAliasesForMerchantIds(merchantIds: string[]) {
  if (merchantIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(merchantAliases)
    .where(inArray(merchantAliases.merchantId, merchantIds))
    .orderBy(asc(merchantAliases.createdAt))
}

export async function listCandidatePaymentProcessors(input: {
  userId: string
  aliasHints: string[]
}) {
  const normalizedHints = input.aliasHints
    .map((alias) => normalizeMerchantResolutionName(alias))
    .filter((alias): alias is string => Boolean(alias))

  if (normalizedHints.length === 0) {
    const rows = await db
      .select()
      .from(paymentProcessors)
      .where(eq(paymentProcessors.userId, input.userId))
      .orderBy(asc(paymentProcessors.displayName))
      .limit(20)

    return rows.map((processor) => ({
      processor,
      alias: null,
    }))
  }

  const aliasHashes = normalizedHints.map(hashAlias)

  return db
    .select({
      processor: paymentProcessors,
      alias: paymentProcessorAliases,
    })
    .from(paymentProcessorAliases)
    .innerJoin(
      paymentProcessors,
      eq(paymentProcessorAliases.paymentProcessorId, paymentProcessors.id),
    )
    .where(
      and(
        eq(paymentProcessors.userId, input.userId),
        inArray(paymentProcessorAliases.aliasHash, aliasHashes),
      ),
    )
    .orderBy(asc(paymentProcessors.displayName))
}

export async function getOrCreatePaymentProcessor(input: {
  userId: string
  displayName: string
}) {
  const normalizedName = normalizeMerchantResolutionName(input.displayName)

  if (!normalizedName) {
    throw new Error("Missing canonical processor name")
  }

  const [existing] = await db
    .select()
    .from(paymentProcessors)
    .where(
      and(
        eq(paymentProcessors.userId, input.userId),
        eq(paymentProcessors.normalizedName, normalizedName),
      ),
    )
    .limit(1)

  if (existing) {
    return existing
  }

  const displayName = normalizePaymentProcessorDisplayName(input.displayName)
  const [created] = await db
    .insert(paymentProcessors)
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
    .from(paymentProcessors)
    .where(
      and(
        eq(paymentProcessors.userId, input.userId),
        eq(paymentProcessors.normalizedName, normalizedName),
      ),
    )
    .limit(1)

  if (!resolved) {
    throw new Error("Failed to resolve payment processor")
  }

  return resolved
}

export async function upsertPaymentProcessorAliases(input: {
  paymentProcessorId: string
  aliases: Array<{ aliasText: string; source: string; confidence?: number }>
}) {
  const values = input.aliases
    .map((alias) => {
      const normalized = normalizeMerchantResolutionName(alias.aliasText)
      if (!normalized) {
        return null
      }

      return {
        paymentProcessorId: input.paymentProcessorId,
        aliasText: alias.aliasText.trim(),
        aliasHash: hashAlias(normalized),
        source: alias.source,
        confidence: alias.confidence ?? 1,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (values.length === 0) {
    return []
  }

  return db.insert(paymentProcessorAliases).values(values).onConflictDoNothing().returning()
}

export async function getMerchantById(merchantId: string) {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1)
  return merchant ?? null
}

export async function getPaymentProcessorById(paymentProcessorId: string) {
  const [processor] = await db
    .select()
    .from(paymentProcessors)
    .where(eq(paymentProcessors.id, paymentProcessorId))
    .limit(1)
  return processor ?? null
}

export async function updateMerchant(merchantId: string, input: Partial<MerchantInsert>) {
  const [merchant] = await db
    .update(merchants)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(merchants.id, merchantId))
    .returning()

  return merchant ?? null
}

export async function upsertMerchantAliases(input: {
  merchantId: string
  aliases: Array<{ aliasText: string; source: string; confidence?: number }>
}) {
  const values = input.aliases
    .map((alias) => {
      const normalized = normalizeMerchantResolutionName(alias.aliasText)
      if (!normalized) {
        return null
      }

      return {
        merchantId: input.merchantId,
        aliasText: alias.aliasText.trim(),
        aliasHash: hashAlias(normalized),
        source: alias.source,
        confidence: alias.confidence ?? 1,
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))

  if (values.length === 0) {
    return []
  }

  return db.insert(merchantAliases).values(values).onConflictDoNothing().returning()
}

export async function mergeMerchants(input: {
  canonicalMerchantId: string
  duplicateMerchantIds: string[]
}) {
  const duplicateIds = input.duplicateMerchantIds.filter((id) => id !== input.canonicalMerchantId)
  if (duplicateIds.length === 0) {
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .update(financialEvents)
      .set({
        merchantId: input.canonicalMerchantId,
        updatedAt: new Date(),
      })
      .where(inArray(financialEvents.merchantId, duplicateIds))

    await tx
      .update(recurringObligations)
      .set({
        merchantId: input.canonicalMerchantId,
        updatedAt: new Date(),
      })
      .where(inArray(recurringObligations.merchantId, duplicateIds))

    await tx
      .update(merchantObservations)
      .set({
        merchantId: input.canonicalMerchantId,
        updatedAt: new Date(),
      })
      .where(inArray(merchantObservations.merchantId, duplicateIds))

    const duplicateAliases = await tx
      .select()
      .from(merchantAliases)
      .where(inArray(merchantAliases.merchantId, duplicateIds))

    if (duplicateAliases.length > 0) {
      await tx
        .insert(merchantAliases)
        .values(
          duplicateAliases.map((alias) => ({
            merchantId: input.canonicalMerchantId,
            aliasText: alias.aliasText,
            aliasHash: alias.aliasHash,
            source: alias.source,
            confidence: alias.confidence,
          })),
        )
        .onConflictDoNothing()
    }

    await tx.delete(merchants).where(inArray(merchants.id, duplicateIds))
  })
}

export async function mergePaymentProcessors(input: {
  canonicalPaymentProcessorId: string
  duplicatePaymentProcessorIds: string[]
}) {
  const duplicateIds = input.duplicatePaymentProcessorIds.filter(
    (id) => id !== input.canonicalPaymentProcessorId,
  )

  if (duplicateIds.length === 0) {
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .update(financialEvents)
      .set({
        paymentProcessorId: input.canonicalPaymentProcessorId,
        updatedAt: new Date(),
      })
      .where(inArray(financialEvents.paymentProcessorId, duplicateIds))

    await tx
      .update(merchantObservations)
      .set({
        paymentProcessorId: input.canonicalPaymentProcessorId,
        updatedAt: new Date(),
      })
      .where(inArray(merchantObservations.paymentProcessorId, duplicateIds))

    const duplicateAliases = await tx
      .select()
      .from(paymentProcessorAliases)
      .where(inArray(paymentProcessorAliases.paymentProcessorId, duplicateIds))

    if (duplicateAliases.length > 0) {
      await tx
        .insert(paymentProcessorAliases)
        .values(
          duplicateAliases.map((alias) => ({
            paymentProcessorId: input.canonicalPaymentProcessorId,
            aliasText: alias.aliasText,
            aliasHash: alias.aliasHash,
            source: alias.source,
            confidence: alias.confidence,
          })),
        )
        .onConflictDoNothing()
    }

    await tx.delete(paymentProcessors).where(inArray(paymentProcessors.id, duplicateIds))
  })
}

export async function findOpenMerchantReview(input: {
  userId: string
  financialEventId?: string | null
  itemType: ReviewQueueItemSelect["itemType"]
}) {
  const [item] = await db
    .select()
    .from(reviewQueueItems)
    .where(
      and(
        eq(reviewQueueItems.userId, input.userId),
        eq(reviewQueueItems.itemType, input.itemType),
        eq(reviewQueueItems.status, "open"),
        input.financialEventId ? eq(reviewQueueItems.financialEventId, input.financialEventId) : sql`true`,
      ),
    )
    .orderBy(desc(reviewQueueItems.createdAt))
    .limit(1)

  return item ?? null
}

export async function listFinancialEventIdsForMerchantRepair(userId: string) {
  const rows = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .where(eq(financialEvents.userId, userId))
    .orderBy(asc(financialEvents.eventOccurredAt))

  return rows.map((row) => row.id)
}

export async function listUserIdsForMerchantRepair() {
  const eventRows = await db
    .selectDistinct({ userId: financialEvents.userId })
    .from(financialEvents)
    .where(isNotNull(financialEvents.userId))

  return eventRows.map((row) => row.userId)
}
