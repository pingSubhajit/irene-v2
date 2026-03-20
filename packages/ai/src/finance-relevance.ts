import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"

const logger = createLogger("ai.finance-relevance")

const providerName = "ai-gateway"

export const financeRelevanceClassificationSchema = z.enum([
  "transactional_finance",
  "obligation_finance",
  "marketing_finance",
  "non_finance",
])

export const financeRelevanceReasonCodeSchema = z.enum([
  "transaction_signal",
  "obligation_signal",
  "marketing_promo",
  "reward_or_loyalty_promo",
  "shipping_update",
  "insufficient_finance_signal",
])

export const financeRelevanceResultSchema = z.object({
  classification: financeRelevanceClassificationSchema,
  confidence: z.number().min(0).max(1),
  reasonCode: financeRelevanceReasonCodeSchema,
})

export type FinanceRelevanceClassification = z.infer<
  typeof financeRelevanceClassificationSchema
>

export type FinanceRelevanceInput = {
  sender: string | null
  subject: string | null
  snippet: string | null
  labelIds: string[]
  timestamp: string | null
  attachmentNames: string[]
}

export type FinanceRelevanceModelMetadata = {
  provider: string
  modelName: string
  promptVersion: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  requestId: string | null
}

export type FinanceRelevanceDecision = {
  decision: "accept" | "skip"
  classification: FinanceRelevanceClassification
  stage: "model"
  score: number
  reasons: string[]
  modelResult: z.infer<typeof financeRelevanceResultSchema>
  metadata: FinanceRelevanceModelMetadata
}

type GenerateFinanceRelevanceObject = (input: {
  model: unknown
  schema: typeof financeRelevanceResultSchema
  prompt: string
}) => Promise<{
  object: z.infer<typeof financeRelevanceResultSchema>
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
  response?: {
    id?: string
  }
}>

type ClassifyFinanceRelevanceDeps = {
  generateObjectImpl?: GenerateFinanceRelevanceObject
  modelOverride?: unknown
  now?: () => number
}

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function getUsage(result: {
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}) {
  return {
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
  }
}

function getRequestId(result: {
  response?: {
    id?: string
  }
}) {
  return result.response?.id ?? null
}

export function buildFinanceRelevancePrompt(input: FinanceRelevanceInput) {
  return [
    "You classify Gmail message metadata for a personal finance ingestion pipeline.",
    "Use only the provided metadata. Classify strictly and prefer skipping over accepting when uncertain.",
    "transactional_finance: completed money movement or purchase proof such as debit, credit, receipt, invoice, refund, payment confirmation, or order confirmation.",
    "obligation_finance: upcoming or ongoing money obligation such as EMI, installment, bill due, statement, mandate, or subscription renewal/reminder.",
    "marketing_finance: finance-branded marketing, shopping offers, cashback campaigns, rewards promotions, loyalty credits, card campaigns, financing offers, and merchant upsell emails.",
    "non_finance: everything else, including shipping-only emails and generic newsletters.",
    "Treat rewards, loyalty currencies, diamonds, points, coins, cashback offers, threshold offers like 'spend above Rs 499', and 'credited' language tied to rewards or discounts as marketing_finance, not transactional_finance.",
    "Do not treat an amount threshold, advertised savings, or future discount eligibility as proof that money moved.",
    "Shipping-only updates should be non_finance unless they also prove payment, refund, or an active financial obligation.",
    "",
    `Sender: ${input.sender ?? "unknown"}`,
    `Subject: ${input.subject ?? "unknown"}`,
    `Snippet: ${input.snippet ?? "unknown"}`,
    `Labels: ${input.labelIds.join(", ") || "none"}`,
    `Timestamp: ${input.timestamp ?? "unknown"}`,
    `Attachment names: ${input.attachmentNames.join(", ") || "none"}`,
  ].join("\n")
}

export async function classifyFinanceRelevance(
  input: FinanceRelevanceInput,
  deps: ClassifyFinanceRelevanceDeps = {},
): Promise<FinanceRelevanceDecision> {
  const prompt = buildFinanceRelevancePrompt(input)
  const now = deps.now ?? Date.now
  const startedAt = now()
  const generate =
    deps.generateObjectImpl ?? (generateObject as unknown as GenerateFinanceRelevanceObject)
  const model =
    deps.modelOverride ?? getGatewayProvider()(aiModels.financeRelevanceClassifier)

  const result = await generate({
    model,
    schema: financeRelevanceResultSchema,
    prompt,
  })

  const metadata = {
    provider: providerName,
    modelName: aiModels.financeRelevanceClassifier,
    promptVersion: aiPromptVersions.financeRelevanceClassifier,
    latencyMs: now() - startedAt,
    requestId: getRequestId(result),
    ...getUsage(result),
  } satisfies FinanceRelevanceModelMetadata

  logger.info("Finance relevance classified", {
    classification: result.object.classification,
    confidence: result.object.confidence,
    reasonCode: result.object.reasonCode,
    ...metadata,
  })

  const score = Math.round(result.object.confidence * 100)
  const classification = result.object.classification

  return {
    decision:
      classification === "transactional_finance" ||
      classification === "obligation_finance"
        ? "accept"
        : "skip",
    classification,
    stage: "model",
    score,
    reasons: [result.object.reasonCode],
    modelResult: result.object,
    metadata,
  }
}
