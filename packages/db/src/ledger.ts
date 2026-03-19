import { createHash } from "node:crypto"

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm"

import { db } from "./client"
import {
  categories,
  extractedSignals,
  financialEvents,
  financialEventSources,
  paymentProcessors,
  merchants,
  merchantAliases,
  paymentInstruments,
  rawDocuments,
  reviewQueueItems,
  type CategoryKind,
  type ExtractedSignalSelect,
  type FinancialEventDirection,
  type FinancialEventInsert,
  type FinancialEventType,
  type MerchantType,
  type PaymentInstrumentType,
  type ReviewQueueItemSelect,
} from "./schema"

const SYSTEM_CATEGORY_DEFINITIONS: Array<{
  slug: string
  name: string
  kind: CategoryKind
}> = [
  { slug: "income", name: "Income", kind: "income" },
  { slug: "salary", name: "Salary", kind: "income" },
  { slug: "shopping", name: "Shopping", kind: "expense" },
  { slug: "food", name: "Food", kind: "expense" },
  { slug: "transport", name: "Transport", kind: "expense" },
  { slug: "subscriptions", name: "Subscriptions", kind: "expense" },
  { slug: "bills", name: "Bills", kind: "expense" },
  { slug: "gaming", name: "Gaming", kind: "expense" },
  { slug: "software", name: "Software", kind: "expense" },
  { slug: "digital_goods", name: "Digital Goods", kind: "expense" },
  { slug: "entertainment", name: "Entertainment", kind: "expense" },
  { slug: "travel", name: "Travel", kind: "expense" },
  { slug: "utilities", name: "Utilities", kind: "expense" },
  { slug: "debt", name: "Debt", kind: "debt" },
  { slug: "transfers", name: "Transfers", kind: "transfer" },
  { slug: "refunds", name: "Refunds", kind: "refund" },
  { slug: "uncategorized", name: "Uncategorized", kind: "uncategorized" },
]

export function normalizeMerchantName(input: string | null | undefined) {
  if (!input) {
    return null
  }

  const withoutAngles = input.replace(/<[^>]*>/g, " ")
  const withoutQuotes = withoutAngles.replace(/["'`]/g, " ")
  const lowered = withoutQuotes.toLowerCase()
  const alphanumeric = lowered.replace(/[^a-z0-9]+/g, " ")
  const collapsed = alphanumeric.replace(/\s+/g, " ").trim()

  return collapsed.length > 1 ? collapsed : null
}

function hashAlias(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

function inferMerchantType(alias: string): MerchantType {
  const lowered = alias.toLowerCase()

  if (/\b(bank|credit cards?|debit cards?|instaalert|transaction)\b/.test(lowered)) {
    return "bank"
  }

  if (/\b(payroll|salary|hr|careers)\b/.test(lowered)) {
    return "employer"
  }

  if (/\b(google play|uber|apple|amazon|netflix|spotify|youtube)\b/.test(lowered)) {
    return "platform"
  }

  return "merchant"
}

function inferCategorySlug(signal: ExtractedSignalSelect) {
  const hint = signal.categoryHint?.toLowerCase().trim()

  if (hint) {
    if (hint.includes("income")) return "income"
    if (hint.includes("salary")) return "salary"
    if (hint.includes("food")) return "food"
    if (hint.includes("transport")) return "transport"
    if (hint.includes("subscription")) return "subscriptions"
    if (hint.includes("bill")) return "bills"
    if (hint.includes("gaming")) return "gaming"
    if (hint.includes("software")) return "software"
    if (hint.includes("digital")) return "digital_goods"
    if (hint.includes("entertainment")) return "entertainment"
    if (hint.includes("travel")) return "travel"
    if (hint.includes("utilities")) return "utilities"
    if (hint.includes("debt")) return "debt"
    if (hint.includes("refund")) return "refunds"
    if (hint.includes("transfer")) return "transfers"
    if (hint.includes("shop")) return "shopping"
  }

  switch (signal.candidateEventType) {
    case "income":
      return "income"
    case "subscription_charge":
      return "subscriptions"
    case "bill_payment":
      return "bills"
    case "emi_payment":
      return "debt"
    case "refund":
      return "refunds"
    case "transfer":
      return "transfers"
    case "purchase":
      return "shopping"
    default:
      return "uncategorized"
  }
}

export function getDirectionForEventType(
  eventType: FinancialEventType,
): FinancialEventDirection {
  switch (eventType) {
    case "income":
    case "refund":
      return "inflow"
    case "purchase":
    case "subscription_charge":
    case "emi_payment":
    case "bill_payment":
      return "outflow"
    case "transfer":
      return "neutral"
  }
}

export async function ensureSystemCategories(userId: string) {
  await db
    .insert(categories)
    .values(
      SYSTEM_CATEGORY_DEFINITIONS.map((category) => ({
        userId,
        name: category.name,
        slug: category.slug,
        kind: category.kind,
        isSystem: true,
      })),
    )
    .onConflictDoNothing()

  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name))
}

export async function getCategoryBySlug(userId: string, slug: string) {
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.slug, slug)))
    .limit(1)

  return category ?? null
}

export async function resolveCategoryForSignal(userId: string, signal: ExtractedSignalSelect) {
  await ensureSystemCategories(userId)
  return getCategoryBySlug(userId, inferCategorySlug(signal))
}

export async function listCategoriesForUser(userId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name))
}

export async function getOrCreateMerchantForAlias(input: {
  userId: string
  aliasText: string
  source: string
  confidence?: number
}) {
  const normalizedName = normalizeMerchantName(input.aliasText)

  if (!normalizedName) {
    return null
  }

  const [existing] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.userId, input.userId), eq(merchants.normalizedName, normalizedName)))
    .limit(1)

  const merchant =
    existing ??
    (
      await db
        .insert(merchants)
        .values({
          userId: input.userId,
          displayName: input.aliasText.trim(),
          normalizedName,
          merchantType: inferMerchantType(input.aliasText),
          isSubscriptionProne: /\b(subscription|renewal|apple|netflix|spotify)\b/i.test(
            input.aliasText,
          ),
          isEmiLender: /\b(bank|cards?|emi|installment)\b/i.test(input.aliasText),
          lastSeenAt: new Date(),
        })
        .onConflictDoNothing()
        .returning()
    )[0]

  const resolvedMerchant =
    merchant ??
    (
      await db
        .select()
        .from(merchants)
        .where(
          and(eq(merchants.userId, input.userId), eq(merchants.normalizedName, normalizedName)),
        )
        .limit(1)
    )[0]

  if (!resolvedMerchant) {
    throw new Error("Failed to resolve merchant")
  }

  await db
    .insert(merchantAliases)
    .values({
      merchantId: resolvedMerchant.id,
      aliasText: input.aliasText,
      aliasHash: hashAlias(input.aliasText.toLowerCase()),
      source: input.source,
      confidence: input.confidence ?? 1,
    })
    .onConflictDoNothing()

  await db
    .update(merchants)
    .set({
      displayName: resolvedMerchant.displayName || input.aliasText.trim(),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(merchants.id, resolvedMerchant.id))

  const [updated] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, resolvedMerchant.id))
    .limit(1)

  return updated ?? resolvedMerchant
}

export async function maybeResolvePaymentInstrument(input: {
  userId: string
  hint: string | null
  merchantName: string | null
  currency: string
}) {
  const maskedIdentifier = input.hint?.replace(/\D+/g, "").slice(-4) ?? null

  if (!maskedIdentifier || maskedIdentifier.length !== 4) {
    return null
  }

  const providerName = input.merchantName?.trim() || null
  const loweredProvider = providerName?.toLowerCase() ?? ""
  const instrumentType: PaymentInstrumentType =
    /\bupi\b/.test(loweredProvider)
      ? "upi"
      : /\bdebit\b/.test(loweredProvider)
        ? "debit_card"
        : /\bcredit|card|bank\b/.test(loweredProvider)
          ? "credit_card"
          : "unknown"
  const providerNameCondition = providerName
    ? eq(paymentInstruments.providerName, providerName)
    : isNull(paymentInstruments.providerName)

  const [existing] = await db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.instrumentType, instrumentType),
        providerNameCondition,
        eq(paymentInstruments.maskedIdentifier, maskedIdentifier),
      ),
    )
    .limit(1)

  if (existing) {
    return existing
  }

  const [created] = await db
    .insert(paymentInstruments)
    .values({
      userId: input.userId,
      instrumentType,
      providerName,
      displayName:
        instrumentType === "credit_card" || instrumentType === "debit_card"
          ? `${providerName ?? "Card"} •${maskedIdentifier}`
          : `${providerName ?? "Account"} •${maskedIdentifier}`,
      maskedIdentifier,
      currency: input.currency,
      status: "active",
    })
    .onConflictDoNothing()
    .returning()

  if (created) {
    return created
  }

  const [resolved] = await db
    .select()
    .from(paymentInstruments)
    .where(
      and(
        eq(paymentInstruments.userId, input.userId),
        eq(paymentInstruments.instrumentType, instrumentType),
        providerNameCondition,
        eq(paymentInstruments.maskedIdentifier, maskedIdentifier),
      ),
    )
    .limit(1)

  return resolved ?? null
}

export async function getExtractedSignalById(signalId: string) {
  const [signal] = await db
    .select()
    .from(extractedSignals)
    .where(eq(extractedSignals.id, signalId))
    .limit(1)

  return signal ?? null
}

export async function updateExtractedSignalStatus(
  signalId: string,
  status: ExtractedSignalSelect["status"],
) {
  const [signal] = await db
    .update(extractedSignals)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(extractedSignals.id, signalId))
    .returning()

  return signal ?? null
}

export async function getFinancialEventSourceByExtractedSignal(signalId: string) {
  const [source] = await db
    .select()
    .from(financialEventSources)
    .where(eq(financialEventSources.extractedSignalId, signalId))
    .limit(1)

  return source ?? null
}

export async function getFinancialEventSourceByRawDocument(rawDocumentId: string) {
  const [source] = await db
    .select()
    .from(financialEventSources)
    .where(eq(financialEventSources.rawDocumentId, rawDocumentId))
    .orderBy(desc(financialEventSources.createdAt))
    .limit(1)

  return source ?? null
}

export async function getFinancialEventById(eventId: string) {
  const [event] = await db
    .select()
    .from(financialEvents)
    .where(eq(financialEvents.id, eventId))
    .limit(1)

  return event ?? null
}

export async function listCandidateFinancialEvents(input: {
  userId: string
  eventType: FinancialEventType
  amountMinor: number
  currency: string
  from: Date
  to: Date
}) {
  return db
    .select()
    .from(financialEvents)
    .where(
      and(
        eq(financialEvents.userId, input.userId),
        eq(financialEvents.eventType, input.eventType),
        eq(financialEvents.amountMinor, input.amountMinor),
        eq(financialEvents.currency, input.currency),
        gte(financialEvents.eventOccurredAt, input.from),
        lte(financialEvents.eventOccurredAt, input.to),
      ),
    )
    .orderBy(desc(financialEvents.eventOccurredAt))
}

export async function createFinancialEvent(input: FinancialEventInsert) {
  const [event] = await db.insert(financialEvents).values(input).returning()

  if (!event) {
    throw new Error("Failed to create financial event")
  }

  return event
}

export async function updateFinancialEvent(
  eventId: string,
  input: Partial<FinancialEventInsert>,
) {
  const [event] = await db
    .update(financialEvents)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(financialEvents.id, eventId))
    .returning()

  return event ?? null
}

export async function createFinancialEventSource(input: {
  financialEventId: string
  rawDocumentId?: string | null
  extractedSignalId?: string | null
  linkReason: string
}) {
  const [source] = await db
    .insert(financialEventSources)
    .values({
      financialEventId: input.financialEventId,
      rawDocumentId: input.rawDocumentId ?? null,
      extractedSignalId: input.extractedSignalId ?? null,
      linkReason: input.linkReason,
    })
    .returning()

  if (!source) {
    throw new Error("Failed to create financial event source")
  }

  return source
}

export async function refreshFinancialEventSourceCount(financialEventId: string) {
  const rows = await db
    .select({ id: financialEventSources.id })
    .from(financialEventSources)
    .where(eq(financialEventSources.financialEventId, financialEventId))

  const [event] = await db
    .update(financialEvents)
    .set({
      sourceCount: rows.length,
      updatedAt: new Date(),
    })
    .where(eq(financialEvents.id, financialEventId))
    .returning()

  return event ?? null
}

export async function createReviewQueueItem(input: {
  userId: string
  itemType: ReviewQueueItemSelect["itemType"]
  priority?: number
  rawDocumentId?: string | null
  extractedSignalId?: string | null
  financialEventId?: string | null
  title: string
  explanation: string
  proposedResolutionJson?: Record<string, unknown>
}) {
  const [item] = await db
    .insert(reviewQueueItems)
    .values({
      userId: input.userId,
      itemType: input.itemType,
      priority: input.priority ?? 3,
      rawDocumentId: input.rawDocumentId ?? null,
      extractedSignalId: input.extractedSignalId ?? null,
      financialEventId: input.financialEventId ?? null,
      title: input.title,
      explanation: input.explanation,
      proposedResolutionJson: input.proposedResolutionJson ?? {},
    })
    .returning()

  if (!item) {
    throw new Error("Failed to create review queue item")
  }

  return item
}

export async function updateReviewQueueItem(
  reviewItemId: string,
  input: {
    status?: ReviewQueueItemSelect["status"]
    financialEventId?: string | null
    proposedResolutionJson?: Record<string, unknown>
    resolvedAt?: Date | null
  },
) {
  const [item] = await db
    .update(reviewQueueItems)
    .set({
      status: input.status,
      financialEventId: input.financialEventId,
      proposedResolutionJson: input.proposedResolutionJson,
      resolvedAt: input.resolvedAt,
    })
    .where(eq(reviewQueueItems.id, reviewItemId))
    .returning()

  return item ?? null
}

export async function getReviewQueueItemById(reviewItemId: string) {
  const [item] = await db
    .select()
    .from(reviewQueueItems)
    .where(eq(reviewQueueItems.id, reviewItemId))
    .limit(1)

  return item ?? null
}

export async function listReviewQueueItemsForUser(input: {
  userId: string
  status?: ReviewQueueItemSelect["status"]
  limit?: number
}) {
  let query = db
    .select()
    .from(reviewQueueItems)
    .where(eq(reviewQueueItems.userId, input.userId))
    .orderBy(asc(reviewQueueItems.status), asc(reviewQueueItems.priority), desc(reviewQueueItems.createdAt))
    .limit(input.limit ?? 50)

  if (input.status) {
    query = db
      .select()
      .from(reviewQueueItems)
      .where(
        and(eq(reviewQueueItems.userId, input.userId), eq(reviewQueueItems.status, input.status)),
      )
      .orderBy(asc(reviewQueueItems.priority), desc(reviewQueueItems.createdAt))
      .limit(input.limit ?? 50)
  }

  return query
}

export async function listRecentReviewQueueItemsForRawDocumentIds(rawDocumentIds: string[]) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(reviewQueueItems)
    .where(inArray(reviewQueueItems.rawDocumentId, rawDocumentIds))
    .orderBy(desc(reviewQueueItems.createdAt))
}

export async function findOpenReviewQueueItem(input: {
  userId: string
  itemType: ReviewQueueItemSelect["itemType"]
  financialEventId?: string | null
  rawDocumentId?: string | null
}) {
  const conditions = [
    eq(reviewQueueItems.userId, input.userId),
    eq(reviewQueueItems.itemType, input.itemType),
    eq(reviewQueueItems.status, "open"),
  ]

  if (input.financialEventId || input.rawDocumentId) {
    conditions.push(
      or(
        input.financialEventId
          ? eq(reviewQueueItems.financialEventId, input.financialEventId)
          : undefined,
        input.rawDocumentId ? eq(reviewQueueItems.rawDocumentId, input.rawDocumentId) : undefined,
      )!,
    )
  }

  const [item] = await db
    .select()
    .from(reviewQueueItems)
    .where(and(...conditions))
    .orderBy(desc(reviewQueueItems.createdAt))
    .limit(1)

  return item ?? null
}

export async function listLedgerEventsForUser(input: {
  userId: string
  eventType?: FinancialEventType
  categoryId?: string
  needsReview?: boolean
  query?: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
}) {
  const conditions = [eq(financialEvents.userId, input.userId)]

  if (input.eventType) {
    conditions.push(eq(financialEvents.eventType, input.eventType))
  }

  if (input.categoryId) {
    conditions.push(eq(financialEvents.categoryId, input.categoryId))
  }

  if (typeof input.needsReview === "boolean") {
    conditions.push(eq(financialEvents.needsReview, input.needsReview))
  }

  if (input.dateFrom) {
    conditions.push(gte(financialEvents.eventOccurredAt, input.dateFrom))
  }

  if (input.dateTo) {
    conditions.push(lte(financialEvents.eventOccurredAt, input.dateTo))
  }

  if (input.query?.trim()) {
    const pattern = `%${input.query.trim()}%`
    conditions.push(
      or(
        ilike(financialEvents.description, pattern),
        ilike(financialEvents.notes, pattern),
        existsMerchantMatch(input.query.trim()),
        existsProcessorMatch(input.query.trim()),
      )!,
    )
  }

  return db
    .select({
      event: financialEvents,
      merchant: merchants,
      category: categories,
      paymentInstrument: paymentInstruments,
      paymentProcessor: paymentProcessors,
    })
    .from(financialEvents)
    .leftJoin(merchants, eq(financialEvents.merchantId, merchants.id))
    .leftJoin(categories, eq(financialEvents.categoryId, categories.id))
    .leftJoin(
      paymentInstruments,
      eq(financialEvents.paymentInstrumentId, paymentInstruments.id),
    )
    .leftJoin(
      paymentProcessors,
      eq(financialEvents.paymentProcessorId, paymentProcessors.id),
    )
    .where(and(...conditions))
    .orderBy(desc(financialEvents.eventOccurredAt), desc(financialEvents.createdAt))
    .limit(input.limit ?? 100)
}

function existsMerchantMatch(query: string) {
  const pattern = `%${query}%`

  return sql<boolean>`exists (
    select 1 from merchant
    where merchant.id = ${financialEvents.merchantId}
      and (merchant.display_name ilike ${pattern} or merchant.normalized_name ilike ${pattern})
  )`
}

function existsProcessorMatch(query: string) {
  const pattern = `%${query}%`

  return sql<boolean>`exists (
    select 1 from payment_processor
    where payment_processor.id = ${financialEvents.paymentProcessorId}
      and (payment_processor.display_name ilike ${pattern} or payment_processor.normalized_name ilike ${pattern})
  )`
}

export async function listFinancialEventSourcesForEventIds(eventIds: string[]) {
  if (eventIds.length === 0) {
    return []
  }

  return db
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
    .where(inArray(financialEventSources.financialEventId, eventIds))
    .orderBy(desc(financialEventSources.createdAt))
}

export async function listFinancialEventSourcesForRawDocumentIds(rawDocumentIds: string[]) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select({
      source: financialEventSources,
      event: financialEvents,
    })
    .from(financialEventSources)
    .leftJoin(
      financialEvents,
      eq(financialEventSources.financialEventId, financialEvents.id),
    )
    .where(inArray(financialEventSources.rawDocumentId, rawDocumentIds))
    .orderBy(desc(financialEventSources.createdAt))
}

export async function countOpenReviewQueueItemsForUser(userId: string) {
  const rows = await db
    .select({ id: reviewQueueItems.id })
    .from(reviewQueueItems)
    .where(and(eq(reviewQueueItems.userId, userId), eq(reviewQueueItems.status, "open")))

  return rows.length
}

export async function countFinancialEventsForUser(userId: string) {
  const rows = await db
    .select({ id: financialEvents.id })
    .from(financialEvents)
    .where(eq(financialEvents.userId, userId))

  return rows.length
}

export async function getReviewQueueContext(reviewItemId: string) {
  const item = await getReviewQueueItemById(reviewItemId)

  if (!item) {
    return null
  }

  const [rawDocument] = item.rawDocumentId
    ? await db
        .select()
        .from(rawDocuments)
        .where(eq(rawDocuments.id, item.rawDocumentId))
        .limit(1)
    : []

  const [signal] = item.extractedSignalId
    ? await db
        .select()
        .from(extractedSignals)
        .where(eq(extractedSignals.id, item.extractedSignalId))
        .limit(1)
    : []

  const [event] = item.financialEventId
    ? await db
        .select()
        .from(financialEvents)
        .where(eq(financialEvents.id, item.financialEventId))
        .limit(1)
    : []

  return {
    item,
    rawDocument: rawDocument ?? null,
    signal: signal ?? null,
    event: event ?? null,
  }
}
