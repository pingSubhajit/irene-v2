import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"

const logger = createLogger("ai.merchant-resolution")
const providerName = "ai-gateway"

export const merchantResolutionDecisionSchema = z.enum([
  "link_to_existing_merchant",
  "create_new_merchant",
  "update_existing_merchant",
  "merge_merchants",
  "link_to_existing_processor",
  "create_new_processor",
  "merge_processors",
  "needs_review",
  "ignore",
])

export const categorySlugSchema = z.enum([
  "income",
  "salary",
  "shopping",
  "food",
  "transport",
  "subscriptions",
  "bills",
  "debt",
  "transfers",
  "refunds",
  "gaming",
  "software",
  "digital_goods",
  "entertainment",
  "travel",
  "utilities",
  "uncategorized",
])

export const merchantResolutionResultSchema = z.object({
  decision: merchantResolutionDecisionSchema,
  confidence: z.number().min(0).max(1),
  canonicalMerchantName: z.string().max(160).nullable().optional(),
  canonicalProcessorName: z.string().max(160).nullable().optional(),
  targetMerchantId: z.string().uuid().nullable().optional(),
  targetProcessorId: z.string().uuid().nullable().optional(),
  displayMerchantName: z.string().max(200).nullable().optional(),
  reason: z.string().max(320),
  ignoredHints: z.array(z.string().max(160)).max(8).default([]),
  supportingObservationIds: z.array(z.string().uuid()).min(1).max(50),
  categorySlug: categorySlugSchema.nullable().optional(),
  categoryConfidence: z.number().min(0).max(1).nullable().optional(),
  categoryReason: z.string().max(240).nullable().optional(),
})

export const categoryResolutionResultSchema = z.object({
  categorySlug: categorySlugSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240),
})

export type MerchantResolutionResult = z.infer<typeof merchantResolutionResultSchema>
export type CategoryResolutionResult = z.infer<typeof categoryResolutionResultSchema>

export type MerchantObservationSummary = {
  id: string
  observationSourceKind: string
  issuerHint: string | null
  merchantDescriptorRaw: string | null
  merchantNameHint: string | null
  processorNameHint: string | null
  senderAliasHint: string | null
  channelHint: string | null
  confidence: number
  evidenceSummary: string[]
}

export type CandidateMerchantSummary = {
  id: string
  displayName: string
  normalizedName: string
  aliases: string[]
  linkedEventCount: number
}

export type CandidateProcessorSummary = {
  id: string
  displayName: string
  aliases: string[]
}

export type MerchantResolutionInput = {
  userId: string
  sourceReliability: {
    bankOriginCount: number
    merchantOriginCount: number
    processorOriginCount: number
    statementOriginCount: number
  }
  observations: MerchantObservationSummary[]
  candidateMerchants: CandidateMerchantSummary[]
  candidateProcessors: CandidateProcessorSummary[]
}

type ModelRunMetadata = {
  provider: string
  modelName: string
  promptVersion: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  requestId: string | null
}

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function getUsage(result: unknown) {
  const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage

  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  }
}

function getRequestId(result: unknown) {
  const response = (result as { response?: { id?: string } }).response
  return response?.id ?? null
}

export async function resolveMerchantAndProcessorWithAi(input: MerchantResolutionInput) {
  const gateway = getGatewayProvider()
  const startedAt = Date.now()

  const prompt = [
    "You resolve canonical merchant and payment processor identity from structured transaction evidence.",
    "Separate issuer institution, payment processor, and merchant.",
    "Issuer sender/domain evidence is not merchant evidence.",
    "Processor prefixes like PAYPAL *, RAZORPAY*, GOOGLE *, APPLE.COM/BILL, and AMAZON PAY are intermediary evidence, not final merchant truth.",
    "If the descriptor suggests both a processor and a merchant, prefer separate processor + merchant outputs.",
    "If evidence is insufficient, prefer needs_review or ignore over a wrong merchant.",
    "Also choose the best category slug for the user-visible event after merchant resolution.",
    "",
    `Source reliability summary: bank=${input.sourceReliability.bankOriginCount}, merchant=${input.sourceReliability.merchantOriginCount}, processor=${input.sourceReliability.processorOriginCount}, statement=${input.sourceReliability.statementOriginCount}`,
    "",
    "Observations:",
    JSON.stringify(input.observations, null, 2),
    "",
    "Existing candidate merchants:",
    JSON.stringify(input.candidateMerchants, null, 2),
    "",
    "Existing candidate processors:",
    JSON.stringify(input.candidateProcessors, null, 2),
  ].join("\n")

  const result = await generateObject({
    model: gateway(aiModels.financeMerchantResolver),
    schema: merchantResolutionResultSchema,
    prompt,
  })

  const metadata = {
    provider: providerName,
    modelName: aiModels.financeMerchantResolver,
    promptVersion: aiPromptVersions.financeMerchantResolver,
    latencyMs: Date.now() - startedAt,
    requestId: getRequestId(result),
    ...getUsage(result),
  } satisfies ModelRunMetadata

  logger.info("Resolved merchant cluster", {
    decision: result.object.decision,
    confidence: result.object.confidence,
    ...metadata,
  })

  return {
    resolution: result.object,
    metadata,
  }
}

export async function resolveCategoryWithAi(input: {
  merchantName: string | null
  processorName: string | null
  eventType: string
  description: string | null
  notes: string | null
  evidenceSnippets: string[]
}) {
  const gateway = getGatewayProvider()
  const startedAt = Date.now()

  const prompt = [
    "You choose the best category slug for a canonical financial event.",
    "Prefer the most specific supported slug when there is strong evidence.",
    "Do not infer category from issuer sender text alone.",
    "Supported slugs: income, salary, shopping, food, transport, subscriptions, bills, debt, transfers, refunds, gaming, software, digital_goods, entertainment, travel, utilities, uncategorized.",
    "",
    `Merchant: ${input.merchantName ?? "unknown"}`,
    `Processor: ${input.processorName ?? "unknown"}`,
    `Event type: ${input.eventType}`,
    `Description: ${input.description ?? "none"}`,
    `Notes: ${input.notes ?? "none"}`,
    `Evidence snippets: ${JSON.stringify(input.evidenceSnippets)}`,
  ].join("\n")

  const result = await generateObject({
    model: gateway(aiModels.financeCategoryResolver),
    schema: categoryResolutionResultSchema,
    prompt,
  })

  const metadata = {
    provider: providerName,
    modelName: aiModels.financeCategoryResolver,
    promptVersion: aiPromptVersions.financeCategoryResolver,
    latencyMs: Date.now() - startedAt,
    requestId: getRequestId(result),
    ...getUsage(result),
  } satisfies ModelRunMetadata

  logger.info("Resolved merchant category", {
    categorySlug: result.object.categorySlug,
    confidence: result.object.confidence,
    ...metadata,
  })

  return {
    category: result.object,
    metadata,
  }
}
