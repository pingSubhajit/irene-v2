import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"

import { aiModels, aiPromptVersions } from "./config"
import { generateStructuredObject, type GeneratedObjectMetadata } from "./object-generation"

const providerName = "ai-gateway"

export const memoryFactTypeSchema = z.enum([
  "merchant_category_default",
  "merchant_alias",
  "merchant_recurring_hint",
  "merchant_preferred_processor",
  "merchant_preferred_event_type",
  "sender_institution_alias",
  "instrument_type_preference",
  "instrument_backing_account_link",
  "income_timing_expectation",
])

export const authoredCandidateSchema = z.discriminatedUnion("factType", [
  z.object({
    factType: z.literal("merchant_category_default"),
    merchantName: z.string().max(160),
    categoryName: z.string().max(120).nullable().optional(),
    categorySlug: z.string().max(120).nullable().optional(),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("merchant_alias"),
    merchantName: z.string().max(160),
    aliasText: z.string().max(160),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("merchant_recurring_hint"),
    merchantName: z.string().max(160),
    obligationType: z.string().max(120).nullable().optional(),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("merchant_preferred_processor"),
    merchantName: z.string().max(160),
    processorName: z.string().max(160),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("merchant_preferred_event_type"),
    merchantName: z.string().max(160),
    eventType: z.enum([
      "purchase",
      "income",
      "subscription_charge",
      "emi_payment",
      "bill_payment",
      "refund",
      "transfer",
    ]),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("sender_institution_alias"),
    institutionName: z.string().max(160),
    aliasText: z.string().max(160),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("instrument_type_preference"),
    instrumentLast4: z.string().max(32),
    instrumentType: z.enum([
      "bank_account",
      "credit_card",
      "debit_card",
      "upi",
      "wallet",
      "loan_account",
      "other",
    ]),
    instrumentDisplayName: z.string().max(200).nullable().optional(),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("instrument_backing_account_link"),
    instrumentLast4: z.string().max(32),
    backingInstrumentLast4: z.string().max(32),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    factType: z.literal("income_timing_expectation"),
    incomeStreamName: z.string().max(160),
    cadence: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]),
    intervalCount: z.number().int().min(1).max(12),
    expectedDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    secondaryDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    summaryText: z.string().max(220),
    detailText: z.string().max(320).nullable().optional(),
    confidence: z.number().min(0).max(1),
  }),
])

export const memoryAuthoringResultSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  needsClarification: z.boolean().default(false),
  clarificationMessage: z.string().max(240).nullable().optional(),
  memories: z.array(authoredCandidateSchema).min(1).max(3),
})

export const memorySummaryInputSchema = z.object({
  id: z.string().min(1),
  factType: memoryFactTypeSchema,
  key: z.string().min(1),
  valueJson: z.record(z.string(), z.unknown()),
})

export const memorySummaryResultSchema = z.object({
  summaries: z.array(
    z.object({
      id: z.string().min(1),
      summaryText: z.string().max(220),
      detailText: z.string().max(320).nullable().optional(),
    }),
  ).max(12),
})

export type MemoryAuthoringCandidate = z.infer<typeof authoredCandidateSchema>
export type MemoryAuthoringResult = z.infer<typeof memoryAuthoringResultSchema>
export type MemorySummaryInput = z.infer<typeof memorySummaryInputSchema>
export type MemorySummaryResult = z.infer<typeof memorySummaryResultSchema>
export type MemoryAiMetadata = GeneratedObjectMetadata

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function truncate(input: string | null | undefined, max = 4000) {
  if (!input) {
    return "none"
  }

  return input.length > max ? `${input.slice(0, max)}…` : input
}

function stringifyCatalog(name: string, values: string[]) {
  return `${name}: ${values.length > 0 ? values.join(", ") : "none"}`
}

export async function interpretMemoryAuthoringWithAi(input: {
  authoredText: string
  merchants: string[]
  categories: Array<{ name: string; slug: string }>
  processors: string[]
  institutions: string[]
  instruments: Array<{ displayName: string; maskedIdentifier: string | null }>
  incomeStreams: string[]
}) {
  const gateway = getGatewayProvider()
  const categoryCatalog = input.categories.map(
    (category) => `${category.name} (${category.slug})`,
  )
  const instrumentCatalog = input.instruments.map((instrument) =>
    instrument.maskedIdentifier
      ? `${instrument.displayName} • ${instrument.maskedIdentifier}`
      : instrument.displayName,
  )
  const prompt = [
    "You are translating a user's plain-language memory note into structured product memory for a personal finance app.",
    "Create between 1 and 3 memory facts.",
    "Only output facts that are clearly supported by the user's note.",
    "If the note bundles too many ideas or is ambiguous, set needsClarification=true and explain briefly.",
    "Use existing merchant, processor, institution, category, instrument, and income stream names whenever possible.",
    "summaryText must be calm, plain English, and understandable to a non-technical user.",
    "detailText is optional and should add one quiet supporting sentence only when useful.",
    "Do not expose JSON, ids, or schema terms in summaryText or detailText.",
    "",
    stringifyCatalog("Merchants", input.merchants),
    stringifyCatalog("Categories", categoryCatalog),
    stringifyCatalog("Processors", input.processors),
    stringifyCatalog("Institutions", input.institutions),
    stringifyCatalog("Instruments", instrumentCatalog),
    stringifyCatalog("Income streams", input.incomeStreams),
    "",
    `User note:\n${truncate(input.authoredText, 1200)}`,
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeMemoryAuthoring),
    schema: memoryAuthoringResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeMemoryAuthoring,
    promptVersion: aiPromptVersions.financeMemoryAuthoring,
  })

  return {
    result: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}

export async function summarizeMemoryFactsWithAi(input: {
  facts: MemorySummaryInput[]
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You are writing calm, user-facing summaries for personal finance memory facts.",
    "For each fact, write one short summary sentence and an optional second sentence for detail.",
    "Do not mention JSON, ids, keys, schemas, or internal system concepts.",
    "Keep the tone quiet, product-facing, and specific.",
    "",
    JSON.stringify({ facts: input.facts }, null, 2),
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeMemorySummarizer),
    schema: memorySummaryResultSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeMemorySummarizer,
    promptVersion: aiPromptVersions.financeMemorySummarizer,
  })

  return {
    result: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}
