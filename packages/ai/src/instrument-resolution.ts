import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"
import { createLogger } from "@workspace/observability"

import { aiModels, aiPromptVersions } from "./config"

const logger = createLogger("ai.instrument-resolution")
const providerName = "ai-gateway"

export const instrumentResolutionDecisionSchema = z.enum([
  "link_to_existing_instrument",
  "create_new_instrument",
  "update_existing_instrument",
  "merge_instruments",
  "needs_review",
  "ignore",
])

export const canonicalInstrumentTypeSchema = z.enum([
  "credit_card",
  "debit_card",
  "bank_account",
  "upi",
  "wallet",
  "unknown",
])

export const instrumentResolutionResultSchema = z.object({
  decision: instrumentResolutionDecisionSchema,
  confidence: z.number().min(0).max(1),
  canonicalInstitutionName: z.string().max(160).nullable().optional(),
  canonicalInstrumentType: canonicalInstrumentTypeSchema,
  targetPaymentInstrumentId: z.string().uuid().nullable().optional(),
  instrumentDisplayName: z.string().max(200).nullable().optional(),
  reason: z.string().max(320),
  ignoredHints: z.array(z.string().max(160)).max(8).default([]),
  supportingObservationIds: z.array(z.string().uuid()).min(1).max(50),
})

export type InstrumentResolutionResult = z.infer<typeof instrumentResolutionResultSchema>

type InstrumentObservationSummary = {
  id: string
  observationSourceKind: string
  maskedIdentifier: string | null
  instrumentTypeHint: string | null
  issuerHint: string | null
  issuerAliasHint: string | null
  counterpartyHint: string | null
  networkHint: string | null
  confidence: number
  evidenceSummary: string[]
}

type CandidateInstrumentSummary = {
  id: string
  displayName: string
  providerName: string | null
  canonicalInstitutionName: string | null
  instrumentType: string
  maskedIdentifier: string | null
  linkedEventCount: number
}

type CandidateInstitutionSummary = {
  id: string
  displayName: string
  aliases: string[]
}

export type InstrumentResolutionInput = {
  userId: string
  maskedIdentifier: string
  sourceReliability: {
    bankOriginCount: number
    statementOriginCount: number
    merchantOriginCount: number
  }
  observations: InstrumentObservationSummary[]
  candidateInstruments: CandidateInstrumentSummary[]
  candidateInstitutions: CandidateInstitutionSummary[]
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

export async function resolvePaymentInstrumentWithAi(input: InstrumentResolutionInput) {
  const gateway = getGatewayProvider()
  const startedAt = Date.now()

  const prompt = [
    "You resolve canonical payment instrument identity from structured evidence.",
    "You must separate issuer institution from merchant or counterparty.",
    "Merchant names like Spotify, Amazon, Uber, Google Play, or Apple are not issuer evidence when any bank-origin or statement-origin evidence exists.",
    "Bank-origin sender aliases outrank merchant receipts.",
    "Exact same masked identifier is necessary but not sufficient for merge decisions.",
    "If evidence is insufficient or conflicting, prefer needs_review or ignore over a confident but wrong canonical decision.",
    "If debit-vs-credit is unclear, use unknown.",
    "If multiple aliases like cards@icicibank.com and credit_cards@icicibank.com clearly point to the same issuer, normalize them under one canonical institution.",
    "",
    `Masked identifier cluster: ${input.maskedIdentifier}`,
    `Source reliability summary: bank=${input.sourceReliability.bankOriginCount}, statement=${input.sourceReliability.statementOriginCount}, merchant=${input.sourceReliability.merchantOriginCount}`,
    "",
    "Observations:",
    JSON.stringify(input.observations, null, 2),
    "",
    "Existing candidate instruments:",
    JSON.stringify(input.candidateInstruments, null, 2),
    "",
    "Existing candidate institutions:",
    JSON.stringify(input.candidateInstitutions, null, 2),
  ].join("\n")

  const result = await generateObject({
    model: gateway(aiModels.financeInstrumentResolver),
    schema: instrumentResolutionResultSchema,
    prompt,
  })

  const metadata = {
    provider: providerName,
    modelName: aiModels.financeInstrumentResolver,
    promptVersion: aiPromptVersions.financeInstrumentResolver,
    latencyMs: Date.now() - startedAt,
    requestId: getRequestId(result),
    ...getUsage(result),
  } satisfies ModelRunMetadata

  logger.info("Resolved payment instrument cluster", {
    maskedIdentifier: input.maskedIdentifier,
    decision: result.object.decision,
    confidence: result.object.confidence,
    ...metadata,
  })

  return {
    resolution: result.object,
    metadata,
  }
}
