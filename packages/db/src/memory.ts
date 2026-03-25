import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm"

import { db } from "./client"
import { hashCanonicalJson } from "./hash"
import {
  categories,
  financialInstitutionAliases,
  financialInstitutions,
  incomeStreams,
  memoryFacts,
  merchantAliases,
  merchants,
  paymentInstruments,
  paymentProcessors,
  type MemoryFactInsert,
  type MemoryFactSelect,
  type MemoryFactType,
} from "./schema"
import { users } from "./schema/auth"

export type MemoryLookupInput = {
  userId: string
  merchantHints?: Array<string | null | undefined>
  senderHints?: Array<string | null | undefined>
  processorHints?: Array<string | null | undefined>
  instrumentHints?: Array<string | null | undefined>
}

export type MemoryPromptFact = Pick<
  MemoryFactSelect,
  | "id"
  | "factType"
  | "subjectType"
  | "subjectId"
  | "key"
  | "summaryText"
  | "detailText"
  | "valueJson"
  | "confidence"
  | "source"
  | "sourceReferenceId"
  | "isUserPinned"
  | "lastConfirmedAt"
  | "expiresAt"
>

export type MemoryBundle = {
  facts: MemoryPromptFact[]
  summaryLines: string[]
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function humanizeUnderscoreText(value: string | null | undefined) {
  if (!value) {
    return null
  }

  return value.replaceAll("_", " ")
}

function titleCase(input: string | null | undefined) {
  if (!input) {
    return null
  }

  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function renderMemorySummary(input: {
  factType: MemoryFactType
  key: string
  valueJson: Record<string, unknown>
}) {
  const value = input.valueJson

  switch (input.factType) {
    case "merchant_category_default": {
      const merchantName = asString(value.merchantName) ?? titleCase(input.key) ?? "This merchant"
      const categoryName =
        asString(value.categoryName) ??
        titleCase(humanizeUnderscoreText(asString(value.categorySlug))) ??
        "the right category"
      return `${merchantName} usually belongs in ${categoryName}.`
    }
    case "merchant_alias": {
      const alias = asString(value.alias) ?? titleCase(input.key) ?? "This alias"
      const merchantName = asString(value.merchantName) ?? "the same merchant"
      return `${alias} refers to ${merchantName}.`
    }
    case "merchant_recurring_hint": {
      const merchantName = asString(value.merchantName) ?? titleCase(input.key) ?? "This merchant"
      return `${merchantName} is usually a recurring charge.`
    }
    case "merchant_preferred_processor": {
      const merchantName = asString(value.merchantName) ?? titleCase(input.key) ?? "This merchant"
      const processorName = asString(value.processorName) ?? "the same processor"
      return `${merchantName} usually comes through ${processorName}.`
    }
    case "merchant_preferred_event_type": {
      const merchantName = asString(value.merchantName) ?? titleCase(input.key) ?? "This merchant"
      const eventType =
        titleCase(humanizeUnderscoreText(asString(value.eventType))) ?? "the same event type"
      return `${merchantName} is usually treated as ${eventType}.`
    }
    case "sender_institution_alias": {
      const alias = asString(value.alias) ?? input.key
      const institutionName = asString(value.institutionName) ?? "the same institution"
      return `Emails from ${alias} refer to ${institutionName}.`
    }
    case "instrument_type_preference": {
      const displayName =
        asString(value.displayName) ??
        asString(value.maskedIdentifier) ??
        titleCase(input.key) ??
        "This instrument"
      const instrumentType =
        titleCase(humanizeUnderscoreText(asString(value.instrumentType))) ?? "the current type"
      return `${displayName} should be treated as ${instrumentType}.`
    }
    case "instrument_backing_account_link": {
      const displayName =
        asString(value.displayName) ??
        asString(value.maskedIdentifier) ??
        titleCase(input.key) ??
        "This instrument"
      const backingDisplayName =
        asString(value.backingDisplayName) ??
        asString(value.backingMaskedIdentifier) ??
        "its linked cash account"
      return `${displayName} is usually linked to ${backingDisplayName}.`
    }
    case "income_timing_expectation": {
      const name = asString(value.name) ?? titleCase(input.key) ?? "This income"
      const cadence =
        titleCase(humanizeUnderscoreText(asString(value.cadence))) ?? "its usual cadence"
      const expectedDay = asNumber(value.expectedDayOfMonth)
      if (expectedDay) {
        return `${name} usually arrives ${cadence.toLowerCase()} around day ${expectedDay}.`
      }

      return `${name} usually arrives ${cadence.toLowerCase()}.`
    }
    default:
      return titleCase(input.key) ?? "Memory"
  }
}

export function renderMemoryDetail(input: {
  factType: MemoryFactType
  valueJson: Record<string, unknown>
}) {
  const value = input.valueJson

  switch (input.factType) {
    case "merchant_category_default": {
      const sampleCount = asNumber(value.sampleCount)
      return sampleCount ? `Learned from ${sampleCount} matching examples.` : null
    }
    case "merchant_preferred_processor": {
      const sampleCount = asNumber(value.sampleCount)
      return sampleCount ? `Seen repeatedly across ${sampleCount} similar transactions.` : null
    }
    case "merchant_preferred_event_type": {
      const sampleCount = asNumber(value.sampleCount)
      return sampleCount ? `Seen repeatedly across ${sampleCount} similar transactions.` : null
    }
    case "merchant_recurring_hint": {
      const obligationType = titleCase(humanizeUnderscoreText(asString(value.obligationType)))
      return obligationType ? `Stored as a ${obligationType.toLowerCase()} pattern.` : null
    }
    case "income_timing_expectation": {
      const nextExpectedAt = asString(value.nextExpectedAt)
      return nextExpectedAt ? `Next expected time is tracked separately in Irene.` : null
    }
    default:
      return null
  }
}

function applyMemoryPresentation(input: MemoryFactInsert): MemoryFactInsert {
  const summaryText =
    input.summaryText && input.summaryText.trim()
      ? input.summaryText.trim()
      : renderMemorySummary({
          factType: input.factType,
          key: input.key,
          valueJson: input.valueJson ?? {},
        })
  const detailText =
    input.detailText && input.detailText.trim()
      ? input.detailText.trim()
      : renderMemoryDetail({
          factType: input.factType,
          valueJson: input.valueJson ?? {},
        })

  return {
    ...input,
    summaryText,
    detailText: detailText ?? null,
    authoredText: input.authoredText?.trim() ? input.authoredText.trim() : null,
  }
}

export function normalizeMemoryKey(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9@._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return normalized || null
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string => {
    if (!value) {
      return false
    }

    return array.indexOf(value) === index
  })
}

export function buildMemoryFactContentHash(input: {
  factType: MemoryFactType
  key: string
  valueJson: Record<string, unknown>
  subjectType: MemoryFactSelect["subjectType"]
  subjectId?: string | null
  source: MemoryFactSelect["source"]
  sourceReferenceId?: string | null
}) {
  return hashCanonicalJson({
    factType: input.factType,
    key: input.key,
    valueJson: input.valueJson,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    source: input.source,
    sourceReferenceId: input.sourceReferenceId ?? null,
  })
}

export function buildMemoryFactSummarySourceHash(input: {
  factType: MemoryFactType
  key: string
  valueJson: Record<string, unknown>
  promptVersion: string
  modelName: string
}) {
  return hashCanonicalJson({
    factType: input.factType,
    key: input.key,
    valueJson: input.valueJson,
    promptVersion: input.promptVersion,
    modelName: input.modelName,
  })
}

export async function createMemoryFact(input: MemoryFactInsert) {
  const nextInput = {
    ...applyMemoryPresentation(input),
    contentHash: buildMemoryFactContentHash({
      factType: input.factType,
      key: input.key,
      valueJson: input.valueJson ?? {},
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      source: input.source,
      sourceReferenceId: input.sourceReferenceId ?? null,
    }),
  }
  const [row] = await db.insert(memoryFacts).values(nextInput).returning()

  if (!row) {
    throw new Error("Failed to create memory fact")
  }

  return row
}

export async function upsertMemoryFact(input: MemoryFactInsert) {
  const presentedInput = applyMemoryPresentation(input)
  const contentHash = buildMemoryFactContentHash({
    factType: input.factType,
    key: input.key,
    valueJson: input.valueJson ?? {},
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    source: input.source,
    sourceReferenceId: input.sourceReferenceId ?? null,
  })

  const [existing] = await db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.userId, input.userId),
        eq(memoryFacts.factType, input.factType),
        eq(memoryFacts.key, input.key),
      ),
    )
    .limit(1)

  const nextInput = {
    ...presentedInput,
    contentHash,
  }

  const shouldPreserveExistingSummary = existing?.contentHash === contentHash
  const [row] = await db
    .insert(memoryFacts)
    .values(nextInput)
    .onConflictDoUpdate({
      target: [memoryFacts.userId, memoryFacts.factType, memoryFacts.key],
      set: {
        subjectType: nextInput.subjectType,
        subjectId: nextInput.subjectId ?? null,
        summaryText: shouldPreserveExistingSummary
          ? (existing?.summaryText ?? nextInput.summaryText)
          : nextInput.summaryText,
        detailText: shouldPreserveExistingSummary
          ? (existing?.detailText ?? nextInput.detailText ?? null)
          : (nextInput.detailText ?? null),
        authoredText: nextInput.authoredText ?? null,
        contentHash,
        summarySourceHash: shouldPreserveExistingSummary
          ? (existing?.summarySourceHash ?? null)
          : null,
        summaryModelRunId: shouldPreserveExistingSummary
          ? (existing?.summaryModelRunId ?? null)
          : null,
        summarizedAt: shouldPreserveExistingSummary
          ? (existing?.summarizedAt ?? null)
          : null,
        valueJson: nextInput.valueJson,
        confidence: nextInput.confidence ?? 1,
        source: nextInput.source,
        sourceReferenceId: nextInput.sourceReferenceId ?? null,
        isUserPinned: nextInput.isUserPinned ?? false,
        firstObservedAt: nextInput.firstObservedAt ?? null,
        lastConfirmedAt: nextInput.lastConfirmedAt ?? null,
        expiresAt: nextInput.expiresAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to upsert memory fact")
  }

  return row
}

export async function updateMemoryFact(
  memoryFactId: string,
  input: Partial<MemoryFactInsert>,
) {
  const [row] = await db
    .update(memoryFacts)
    .set({
      factType: input.factType ?? undefined,
      subjectType: input.subjectType ?? undefined,
      subjectId: input.subjectId === null ? null : (input.subjectId ?? undefined),
      key: input.key ?? undefined,
      summaryText: input.summaryText === null ? "" : (input.summaryText ?? undefined),
      detailText: input.detailText === null ? null : (input.detailText ?? undefined),
      authoredText: input.authoredText === null ? null : (input.authoredText ?? undefined),
      contentHash: input.contentHash === null ? null : (input.contentHash ?? undefined),
      summarySourceHash:
        input.summarySourceHash === null ? null : (input.summarySourceHash ?? undefined),
      summaryModelRunId:
        input.summaryModelRunId === null ? null : (input.summaryModelRunId ?? undefined),
      summarizedAt:
        input.summarizedAt === null ? null : (input.summarizedAt ?? undefined),
      valueJson: input.valueJson ?? undefined,
      confidence: input.confidence ?? undefined,
      source: input.source ?? undefined,
      sourceReferenceId:
        input.sourceReferenceId === null
          ? null
          : (input.sourceReferenceId ?? undefined),
      isUserPinned: input.isUserPinned ?? undefined,
      firstObservedAt:
        input.firstObservedAt === null
          ? null
          : (input.firstObservedAt ?? undefined),
      lastConfirmedAt:
        input.lastConfirmedAt === null
          ? null
          : (input.lastConfirmedAt ?? undefined),
      expiresAt: input.expiresAt === null ? null : (input.expiresAt ?? undefined),
      updatedAt: new Date(),
    })
    .where(eq(memoryFacts.id, memoryFactId))
    .returning()

  return row ?? null
}

export async function getMemoryFactById(memoryFactId: string) {
  const [row] = await db
    .select()
    .from(memoryFacts)
    .where(eq(memoryFacts.id, memoryFactId))
    .limit(1)

  return row ?? null
}

export async function expireMemoryFact(memoryFactId: string, expiresAt = new Date()) {
  return updateMemoryFact(memoryFactId, {
    expiresAt,
    isUserPinned: false,
  })
}

export async function listMemoryFactsForUser(input: {
  userId: string
  search?: string | null
  includeExpired?: boolean
  limit?: number
}) {
  const conditions = [eq(memoryFacts.userId, input.userId)]

  if (!input.includeExpired) {
    conditions.push(or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, new Date()))!)
  }

  const normalizedSearch = normalizeMemoryKey(input.search ?? null)
  if (normalizedSearch) {
    conditions.push(
      or(
        ilike(memoryFacts.key, `%${normalizedSearch}%`),
        ilike(memoryFacts.summaryText, `%${normalizedSearch}%`),
        ilike(memoryFacts.detailText, `%${normalizedSearch}%`),
        ilike(memoryFacts.authoredText, `%${normalizedSearch}%`),
        ilike(memoryFacts.factType, `%${normalizedSearch}%`),
        sql`${memoryFacts.valueJson}::text ilike ${`%${normalizedSearch}%`}`,
      )!,
    )
  }

  return db
    .select()
    .from(memoryFacts)
    .where(and(...conditions))
    .orderBy(desc(memoryFacts.isUserPinned), desc(memoryFacts.updatedAt), desc(memoryFacts.createdAt))
    .limit(input.limit ?? 100)
}

export async function listMemoryFactsByKeys(input: {
  userId: string
  keys: string[]
  factTypes?: MemoryFactType[]
}) {
  if (input.keys.length === 0) {
    return []
  }

  const conditions = [
    eq(memoryFacts.userId, input.userId),
    inArray(memoryFacts.key, input.keys),
    or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, new Date()))!,
  ]

  if (input.factTypes?.length) {
    conditions.push(inArray(memoryFacts.factType, input.factTypes))
  }

  return db
    .select()
    .from(memoryFacts)
    .where(and(...conditions))
    .orderBy(desc(memoryFacts.isUserPinned), desc(memoryFacts.confidence), desc(memoryFacts.updatedAt))
}

function summarizeValue(value: Record<string, unknown>) {
  if (typeof value.summaryText === "string") {
    return value.summaryText
  }

  if (typeof value.alias === "string") {
    return value.alias
  }

  if (typeof value.categoryName === "string") {
    return value.categoryName
  }

  if (typeof value.processorName === "string") {
    return value.processorName
  }

  if (typeof value.eventType === "string") {
    return value.eventType
  }

  if (typeof value.institutionName === "string") {
    return value.institutionName
  }

  if (typeof value.instrumentType === "string") {
    return value.instrumentType
  }

  if (typeof value.backingDisplayName === "string") {
    return value.backingDisplayName
  }

  if (typeof value.expectedDayOfMonth === "number") {
    return `day ${value.expectedDayOfMonth}`
  }

  return JSON.stringify(value)
}

export function buildMemoryPromptLines(facts: MemoryPromptFact[]) {
  return facts.map((fact) => {
    const value = fact.valueJson as Record<string, unknown>
    const summary =
      fact.summaryText?.trim() ||
      renderMemorySummary({
        factType: fact.factType,
        key: fact.key,
        valueJson: value,
      }) ||
      summarizeValue(value)
    const tags = [
      fact.isUserPinned ? "pinned" : null,
      fact.source,
      `confidence=${fact.confidence.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join(", ")

    return `${fact.factType}: ${fact.key} -> ${summary} [${tags}]`
  })
}

export async function getMemoryBundleForUser(input: MemoryLookupInput): Promise<MemoryBundle> {
  const merchantKeys = (input.merchantHints ?? []).map((hint) => normalizeMemoryKey(hint))
  const senderKeys = (input.senderHints ?? []).flatMap((hint) => {
    const normalized = normalizeMemoryKey(hint)
    if (!normalized) {
      return []
    }

    const atIndex = normalized.indexOf("@")
    if (atIndex === -1) {
      return [normalized]
    }

    const domain = normalized.slice(atIndex + 1)
    return uniqueNonEmpty([normalized, domain])
  })
  const processorKeys = (input.processorHints ?? []).map((hint) => normalizeMemoryKey(hint))
  const instrumentKeys = (input.instrumentHints ?? []).map((hint) => normalizeMemoryKey(hint))

  const keys = uniqueNonEmpty([
    ...merchantKeys,
    ...senderKeys,
    ...processorKeys,
    ...instrumentKeys,
  ])

  const facts = await listMemoryFactsByKeys({
    userId: input.userId,
    keys,
  })

  return {
    facts,
    summaryLines: buildMemoryPromptLines(facts),
  }
}

export async function expireUnpinnedMemoryFactsForUser(userId: string, expiresAt = new Date()) {
  return db
    .update(memoryFacts)
    .set({
      expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(memoryFacts.userId, userId), eq(memoryFacts.isUserPinned, false)))
    .returning()
}

export async function listActiveMemoryFactsForUser(userId: string) {
  return db
    .select()
    .from(memoryFacts)
    .where(
      and(
        eq(memoryFacts.userId, userId),
        or(isNull(memoryFacts.expiresAt), gt(memoryFacts.expiresAt, new Date()))!,
      ),
    )
    .orderBy(asc(memoryFacts.factType), asc(memoryFacts.key))
}

export async function listUserIdsForMemoryLearning() {
  const rows = await db.select({ id: users.id }).from(users).orderBy(asc(users.id))
  return rows.map((row) => row.id)
}

export async function getMemoryAuthoringCatalogForUser(userId: string) {
  const [
    merchantRows,
    merchantAliasRows,
    categoryRows,
    processorRows,
    institutionRows,
    institutionAliasRows,
    instrumentRows,
    incomeRows,
  ] = await Promise.all([
    db.select().from(merchants).where(eq(merchants.userId, userId)).orderBy(asc(merchants.displayName)),
    db.select().from(merchantAliases),
    db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.name)),
    db.select().from(paymentProcessors).where(eq(paymentProcessors.userId, userId)).orderBy(asc(paymentProcessors.displayName)),
    db.select().from(financialInstitutions).where(eq(financialInstitutions.userId, userId)).orderBy(asc(financialInstitutions.displayName)),
    db.select().from(financialInstitutionAliases),
    db.select().from(paymentInstruments).where(eq(paymentInstruments.userId, userId)).orderBy(asc(paymentInstruments.displayName)),
    db.select().from(incomeStreams).where(eq(incomeStreams.userId, userId)).orderBy(asc(incomeStreams.name)),
  ])

  const merchantIds = new Set(merchantRows.map((merchant) => merchant.id))
  const institutionIds = new Set(institutionRows.map((institution) => institution.id))

  return {
    merchants: merchantRows,
    merchantAliases: merchantAliasRows.filter((alias) => merchantIds.has(alias.merchantId)),
    categories: categoryRows,
    processors: processorRows,
    institutions: institutionRows,
    institutionAliases: institutionAliasRows.filter((alias) =>
      institutionIds.has(alias.financialInstitutionId),
    ),
    instruments: instrumentRows,
    incomeStreams: incomeRows,
  }
}
